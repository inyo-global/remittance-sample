import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AppContext } from '../app.ts';
import { v2Documents } from '../services/senders.ts';
import type { BeneficiaryAccountRow, BeneficiaryRow, UpstreamJson } from '../types.ts';

/** Recipients (/v2/beneficiaries) and their payout accounts, with the country schemas that drive the forms. */
export function beneficiariesRoutes(ctx: AppContext): Router {
    const { db, inyo, auth, fail } = ctx;
    const router = Router();

    router.get('/beneficiaries', auth, (req, res) => {
        const userId = req.user!.id;
        const rows = db.prepare('SELECT * FROM beneficiaries WHERE userId = ?').all(userId) as BeneficiaryRow[];
        const beneficiaries = rows.map((r) => ({ ...r, data: JSON.parse(r.data) as UpstreamJson }));
        res.json(beneficiaries);
    });

    router.get('/beneficiaries/schema/:countryCode', auth, async (req, res) => {
        try {
            const { countryCode } = req.params;
            const apiRes = await inyo.http.get(inyo.url(`/payout/recipients/schema/${countryCode}`), { headers: inyo.headers });
            res.json(apiRes.data);
        } catch (error) {
            fail(res, error);
        }
    });

    router.post('/beneficiaries', auth, async (req, res) => {
        const userId = req.user!.id;
        const { nickname, formData } = req.body as { nickname?: string; formData?: UpstreamJson };
        const beneficiaryId = uuidv4();
        try {
            // POST /v2/beneficiaries (docs: recipient.md). The deprecated /people endpoint stamps the
            // SENDER role, so it cannot create a recipient. Same shape as the sender; document types
            // are normalised to the lowercase v2 vocabulary (the recipient schema still lists them uppercase).
            const payload = {
                ...formData,
                documents: v2Documents(formData?.documents),
                externalId: beneficiaryId, // Map local ID to externalId
            };

            console.log('Creating beneficiary:', payload);

            const apiRes = await inyo.http.post<UpstreamJson>(inyo.url('/v2/beneficiaries'), payload, { headers: inyo.headers });

            // 201 = created, 200 = already existed for this externalId (idempotent create)
            if (![200, 201].includes(apiRes.status)) {
                throw new Error(`API Error: Received status ${apiRes.status}`);
            }

            const externalId = apiRes.data.id;
            // Keep what the user typed on top: the API echoes null for fields it does not store
            db.prepare('INSERT INTO beneficiaries VALUES (?, ?, ?, ?, ?)').run(
                beneficiaryId,
                userId,
                nickname,
                externalId,
                JSON.stringify({ ...apiRes.data, ...formData }),
            );
            res.json({ id: beneficiaryId, externalId });
        } catch (error) {
            console.error('Beneficiary creation error:', error);
            fail(res, error);
        }
    });

    router.get('/beneficiaries/account-schema/:countryCode', auth, async (req, res) => {
        try {
            const { countryCode } = req.params;
            const apiRes = await inyo.http.get(inyo.url(`/payout/recipientAccounts/schema/${countryCode}`), { headers: inyo.headers });
            res.json(apiRes.data);
        } catch (error) {
            fail(res, error);
        }
    });

    router.get('/beneficiaries/:id/accounts', auth, (req, res) => {
        const { id } = req.params;
        const userId = req.user!.id;
        try {
            // Check ownership
            const beneficiary = db.prepare('SELECT 1 FROM beneficiaries WHERE id = ? AND userId = ?').get(id, userId);
            if (!beneficiary) return res.status(403).json({ error: 'Access denied to this beneficiary' });

            const rows = db.prepare('SELECT * FROM beneficiary_accounts WHERE beneficiaryId = ?').all(id) as BeneficiaryAccountRow[];
            const accounts = rows.map((r) => ({ ...r, data: JSON.parse(r.data) as UpstreamJson }));
            res.json(accounts);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.post('/beneficiaries/account', auth, async (req, res) => {
        const userId = req.user!.id;
        const { beneficiaryId, externalPersonId, formData } = req.body as { beneficiaryId?: string; externalPersonId?: string; formData?: UpstreamJson };

        // Check ownership
        const beneficiary = db.prepare('SELECT 1 FROM beneficiaries WHERE id = ? AND userId = ?').get(beneficiaryId, userId);
        if (!beneficiary) return res.status(403).json({ error: 'Access denied to this beneficiary' });
        const accountId = uuidv4();
        try {
            const url = inyo.url(`/payout/participants/${externalPersonId}/recipientAccounts/gateway`);
            const apiRes = await inyo.http.post<UpstreamJson>(url, formData, { headers: inyo.headers });

            const externalAccountId = apiRes.data.id;
            db.prepare('INSERT INTO beneficiary_accounts VALUES (?, ?, ?, ?)').run(
                accountId,
                beneficiaryId,
                externalAccountId,
                JSON.stringify(formData),
            );
            res.json({ id: accountId, externalAccountId });
        } catch (error) {
            fail(res, error);
        }
    });

    return router;
}
