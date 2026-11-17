import { Router } from 'express';
import type { AppContext } from '../app.ts';
import { webhookAuth } from '../middlewares/webhookAuth.ts';
import { applyGatewayEvent } from '../services/fundingAccounts.ts';
import type { UpstreamJson, WebhookEventRow } from '../types.ts';

// ---------------------------------------------------------------------------
// Gateway webhook: payment status changed (card verification result)
// ---------------------------------------------------------------------------
// Inyo learns the card verification outcome from the gateway's "payment status changed" event.
// Optionally, Inyo can also deliver that notification to this BFF (exposed through a public URL,
// e.g. a tunnel) so the result is visible here. Payload:
//   { agentId, event: "CHECK", status: "AUTHORIZED" | "DECLINED" | "VOIDED" | ..., statusCode,
//     statusDescription, paymentId, externalPaymentId: "CHECK_ACCOUNT_<fundingAccountId>",
//     amount, eventDate, oldStatus, newStatus }
// See services/fundingAccounts.ts for how the event is matched and applied.
export function webhooksRoutes(ctx: AppContext): Router {
    const router = Router();
    const { db, log, inyo } = ctx;

    // A GET (someone checking the URL in a browser) just confirms the endpoint is reachable.
    router.get('/webhooks/gateway', (_req, res) => {
        res.json({ ok: true, expects: 'POST application/json { paymentId, externalPaymentId, status, approved, message, responseCode }', basicAuth: !!ctx.config.webhook });
    });

    router.post('/webhooks/gateway', webhookAuth(ctx.config, log), (req, res) => {
        const payload: UpstreamJson = req.body && typeof req.body === 'object' ? req.body : {};
        res.json(applyGatewayEvent(db, log, payload, req.path));
    });

    // Recent events plus the public URL to register with Inyo (read from a local ngrok, if one is running).
    router.get('/webhooks/events', ctx.auth, async (_req, res) => {
        const events = (db.prepare('SELECT id, receivedAt, paymentId, externalPaymentId, status, matchedCardId, payload FROM webhook_events ORDER BY id DESC LIMIT 30').all() as WebhookEventRow[])
            .map((e) => ({ ...e, payload: JSON.parse(e.payload) as UpstreamJson }));
        let publicUrl: string | null = null;
        try {
            const tunnels = await inyo.http.get<{ tunnels?: Array<{ public_url?: string }> }>('http://127.0.0.1:4040/api/tunnels', { timeout: 500 });
            publicUrl = (tunnels.data?.tunnels || []).find((t) => String(t.public_url).startsWith('https'))?.public_url || null;
        } catch { /* no local tunnel */ }
        res.json({ events, publicUrl, path: '/api/webhooks/gateway', basicAuth: !!ctx.config.webhook });
    });

    return router;
}
