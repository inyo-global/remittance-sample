import { Router } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { AppContext } from '../app.ts';
import { buildTransactionPayload, storeTransaction } from '../services/transactions.ts';
import type { TransactionRow, UpstreamJson } from '../types.ts';

export function transactionsRoutes(ctx: AppContext): Router {
    const router = Router();
    const { db, inyo, log, limitCache, auth, fail } = ctx;

    router.post('/transactions', auth, async (req, res) => {
        const userId = req.user!.id;
        const { beneficiaryId, accountId, paymentMethodId, quoteId } = req.body;
        const transactionId = uuidv4();

        try {
            const payload = buildTransactionPayload(db, req, userId, transactionId, { beneficiaryId, accountId, paymentMethodId, quoteId });

            console.log('Transaction Payload:', JSON.stringify(payload, null, 2));

            // 3. Call External API
            const url = inyo.url('/fx/transactions');
            // Note: The user mentioned expecting 202.
            const apiRes = await inyo.http.post(url, payload, { headers: inyo.headers });

            if (![200, 201, 202].includes(apiRes.status)) {
                throw new Error(`API Error: Status ${apiRes.status}`);
            }

            // 4. Store Transaction
            const data: UpstreamJson = apiRes.data;
            const createdAt = new Date().toISOString();
            storeTransaction(db, transactionId, userId, data, createdAt);

            // Invalidate Limit Cache
            limitCache.del(userId);

            res.json({
                id: transactionId,
                externalId: data.id,
                status: data.status,
                ...data,
            });
        } catch (error) {
            console.error('Transaction Error:', axios.isAxiosError(error) ? error.response?.data || error.message : error instanceof Error ? error.message : error);
            fail(res, error);
        }
    });

    // Re-reads one transaction from Inyo (GET /fx/transactions/{id}) and updates the local copy.
    // The docs recommend webhooks (TransactionStatusChanged) in production; polling is fine for a sample.
    router.get('/transactions/:id/sync', auth, async (req, res) => {
        const userId = req.user!.id;
        try {
            const row = db
                .prepare('SELECT * FROM transactions WHERE id = ? AND userId = ?')
                .get(req.params.id, userId) as TransactionRow | undefined;
            if (!row) return res.status(404).json({ error: 'Transaction not found' });

            const url = inyo.url(`/fx/transactions/${row.externalId}`);
            const apiRes = await inyo.http.get(url, { headers: inyo.headers });
            const data: UpstreamJson = { ...JSON.parse(row.data), ...apiRes.data };
            const status = data.payoutStatus || data.status?.payoutStatus || row.status;

            db.prepare('UPDATE transactions SET status = ?, data = ? WHERE id = ?').run(status, JSON.stringify(data), row.id);
            limitCache.del(userId);
            res.json({ ...row, status, data });
        } catch (error) {
            fail(res, error);
        }
    });

    // Status history (docs: transaction > "Get Transaction Status History"): the full audit trail,
    // most recent first. Each row carries the summary pair (complianceStatus / payoutStatus) and
    // the system messages that explain the change.
    router.get('/transactions/:id/status', auth, async (req, res) => {
        const userId = req.user!.id;
        try {
            const row = db
                .prepare('SELECT externalId FROM transactions WHERE id = ? AND userId = ?')
                .get(req.params.id, userId) as Pick<TransactionRow, 'externalId'> | undefined;
            if (!row) return res.status(404).json({ error: 'Transaction not found' });

            const url = inyo.url(`/fx/transactions/${row.externalId}/status`);
            const apiRes = await inyo.http.get(url, { headers: inyo.headers });
            res.json(Array.isArray(apiRes.data) ? apiRes.data : apiRes.data?.history || []);
        } catch (error) {
            fail(res, error);
        }
    });

    // Cancel / reverse (docs: transaction > "Cancelling / Reversing a Transaction").
    // One endpoint: Inyo voids a pre-authorised payment or refunds a captured one. Asynchronous:
    // 204 = reversal queued (CancelRequested -> Cancelled/Refunded); 422 = not reversible any more.
    router.post('/transactions/:id/cancel', auth, async (req, res) => {
        const userId = req.user!.id;
        try {
            const row = db
                .prepare('SELECT * FROM transactions WHERE id = ? AND userId = ?')
                .get(req.params.id, userId) as TransactionRow | undefined;
            if (!row) return res.status(404).json({ error: 'Transaction not found' });

            const url = inyo.url(`/fx/transactions/${row.externalId}/status/cancel`);
            const apiRes = await inyo.http.put(url, null, { headers: inyo.headers });
            if (apiRes.status < 200 || apiRes.status >= 300) {
                throw new Error(`API Error: Status ${apiRes.status}`);
            }

            // The status only changes once Inyo processes the reversal; re-read it so the UI is current.
            let data: UpstreamJson = JSON.parse(row.data);
            try {
                const fresh = await inyo.http.get(inyo.url(`/fx/transactions/${row.externalId}`), { headers: inyo.headers });
                data = { ...data, ...fresh.data };
            } catch (e) {
                log.warn(`cancel accepted but re-read failed: ${(e as Error).message}`);
            }
            const status = data.payoutStatus || data.status?.payoutStatus || row.status;
            db.prepare('UPDATE transactions SET status = ?, data = ? WHERE id = ?').run(status, JSON.stringify(data), row.id);
            limitCache.del(userId);
            res.json({ success: true, accepted: apiRes.status, ...row, status, data });
        } catch (error) {
            fail(res, error);
        }
    });

    router.get('/transactions', auth, (req, res) => {
        const userId = req.user!.id;
        try {
            const rows = db
                .prepare('SELECT * FROM transactions WHERE userId = ? ORDER BY createdAt DESC')
                .all(userId) as TransactionRow[];
            const transactions = rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
            res.json(transactions);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    return router;
}
