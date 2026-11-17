import { Router } from 'express';
import type { AppContext } from '../app.ts';
import { senderOf } from '../services/senders.ts';
import { kycRedirectUrl, kycRow, saveKyc } from '../services/kyc.ts';
import type { KycSessionRow } from '../types.ts';

export function kycRoutes(ctx: AppContext): Router {
    const router = Router();
    const { db, inyo, log, limitCache, auth, fail } = ctx;

    // POST /v2/senders/{id}/kycSession -> { sessionId, status, widgetUrl }
    router.post('/kyc/session', auth, async (req, res) => {
        const userId = req.user!.id;
        const senderId = senderOf(db, userId);
        if (!senderId) return res.status(404).json({ error: 'Profile not found' });
        const language = String(req.body?.language || 'en');
        let redirectUrl: string;
        try {
            redirectUrl = kycRedirectUrl(ctx.config, req);
        } catch (e) {
            return res.status(400).json({ error: { source: 'local', message: (e as Error).message } });
        }
        try {
            const url = inyo.url(`/v2/senders/${senderId}/kycSession`);
            // Docs: only `language` and `redirectUrl`; the document is resolved from the sender record
            // (declared in documents[] of POST/PATCH /v2/senders).
            const payload = { language, redirectUrl };
            log.info(`kycSession payload: ${JSON.stringify(payload)}`);
            const apiRes = await inyo.http.post(url, payload, { headers: inyo.headers });
            res.status(201).json(saveKyc(db, userId, apiRes.data));
        } catch (error) {
            fail(res, error);
        }
    });

    // Latest session for this user, re-read from Inyo (GET /v2/senders/{id}/kycSession/{sessionId}).
    router.get('/kyc/session', auth, async (req, res) => {
        const userId = req.user!.id;
        const latest = db
            .prepare('SELECT * FROM kyc_sessions WHERE userId = ? ORDER BY createdAt DESC LIMIT 1')
            .get(userId) as KycSessionRow | undefined;
        if (!latest) return res.json(null);
        if (req.query.refresh === 'false') return res.json(kycRow(latest));
        const senderId = senderOf(db, userId);
        try {
            const url = inyo.url(`/v2/senders/${senderId}/kycSession/${latest.sessionId}`);
            const apiRes = await inyo.http.get(url, { headers: inyo.headers });
            res.json(saveKyc(db, userId, { ...apiRes.data, sessionId: apiRes.data.sessionId || latest.sessionId }));
        } catch (error) {
            fail(res, error);
        }
    });

    // Sandbox/staging only (docs: sandbox-testing.md "Resolving a Held KYC Session"): settles a
    // PENDING_REVIEW session as verified/rejected, running the same code as an Inyo reviewer.
    router.post('/kyc/session/:sessionId/resolve', auth, async (req, res) => {
        const userId = req.user!.id;
        const row = db.prepare('SELECT * FROM kyc_sessions WHERE sessionId = ? AND userId = ?').get(req.params.sessionId, userId) as KycSessionRow | undefined;
        if (!row) return res.status(404).json({ error: 'Session not found' });
        const outcome = req.body?.outcome === 'rejected' ? 'rejected' : 'verified';
        const reason = String(req.body?.reason || 'Cleared for the integration walkthrough').slice(0, 255);
        try {
            const url = inyo.url(`/v2/senders/${senderOf(db, userId)}/kycSession/${row.sessionId}/resolve`);
            const apiRes = await inyo.http.post(url, { outcome, reason }, { headers: inyo.headers });
            limitCache.del(userId);
            res.json(saveKyc(db, userId, { ...apiRes.data, sessionId: apiRes.data.sessionId || row.sessionId }));
        } catch (error) {
            // 409 NOT_HELD etc. carry the session's actual status in the body; pass it through.
            fail(res, error);
        }
    });

    return router;
}
