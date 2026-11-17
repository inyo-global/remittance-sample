import { Router } from 'express';
import axios from 'axios';
import { X509Certificate } from 'node:crypto';
import type { AppContext } from '../app.ts';

// --- DEBUG ---
export function debugRoutes(ctx: AppContext): Router {
    const router = Router();
    const { inyo } = ctx;

    // GET /api/debug/upstream — one call per credential level, with the real status/body and a hint.
    router.get('/debug/upstream', async (_req, res) => {
        const checks = [
            { name: 'destinations (agent keys)', url: inyo.url('/payout/us/destinations') },
            { name: 'recipient schema BR (agent keys)', url: inyo.url('/payout/recipients/schema/br') },
        ];
        const results: Record<string, unknown>[] = [];
        for (const c of checks) {
            try {
                const r = await inyo.http.get(c.url, { headers: inyo.headers, timeout: 15000 });
                results.push({ ...c, ok: true, status: r.status, cfRay: r.headers?.['cf-ray'] || null, sample: JSON.stringify(r.data).slice(0, 200) });
            } catch (error) {
                if (axios.isAxiosError(error)) results.push({ ...c, ok: false, ...inyo.describeUpstream(error) });
                else results.push({ ...c, ok: false, source: 'local', message: error instanceof Error ? error.message : String(error) });
            }
        }
        res.json({
            baseUrl: inyo.baseUrl,
            tenant: inyo.tenant,
            headersSent: { 'x-api-key': !!inyo.headers['x-api-key'], 'x-agent-id': inyo.headers['x-agent-id'] || null, 'x-agent-api-key': !!inyo.headers['x-agent-api-key'] },
            mtls: inyo.mtlsConfigured,
            results,
        });
    });

    router.get('/debug/mtls', (_req, res) => {
        try {
            const cert = new X509Certificate(ctx.config.mtls?.cert as string);
            res.json({
                mtlsAgentConfigured: inyo.mtlsConfigured,
                certFile: 'remittance_sample.pem',
                keyFile: 'remittance_sample.key',
                cert: {
                    subject: cert.subject.replace(/\n/g, ', '),
                    issuer: cert.issuer.replace(/\n/g, ', '),
                    validFrom: cert.validFrom,
                    validTo: cert.validTo,
                    serialNumber: cert.serialNumber,
                },
            });
        } catch (err) {
            res.status(500).json({ error: (err as Error).message });
        }
    });

    return router;
}
