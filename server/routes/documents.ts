import express, { Router } from 'express';
import type { AppContext } from '../app.ts';
import { senderOf } from '../services/senders.ts';

// --- Proof of source of funds (LEVEL_3) ---
// Docs: sender/uploading-documents.md "Source of Funds" + sandbox-testing.md "Resolving a Pending
// Document Review". A file upload (pdf/jpg/jpeg/png, max 10 MB) stored as PROOF_OF_FUNDS; it stays
// PENDING in sandbox until /resolve settles it, then the compliance level can move to LEVEL_3.
const UPLOAD_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

export function documentsRoutes(ctx: AppContext): Router {
    const router = Router();
    const { db, inyo, limitCache, auth, fail } = ctx;

    // The browser sends the raw file bytes (Content-Type = file type, X-File-Name = name) and the BFF
    // re-wraps them as multipart/form-data for Inyo, so no multipart parser is needed here.
    router.post(
        '/documents/source-of-funds',
        auth,
        express.raw({ type: () => true, limit: '11mb' }),
        async (req, res) => {
            const userId = req.user!.id;
            const senderId = senderOf(db, userId);
            if (!senderId) return res.status(404).json({ error: 'Profile not found' });
            const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
            const ext = UPLOAD_TYPES[contentType];
            if (!ext) return res.status(415).json({ error: { source: 'local', message: `Unsupported file type "${contentType}": the docs accept pdf, jpg, jpeg or png.` } });
            if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: { source: 'local', message: 'Empty upload.' } });
            if (req.body.length > 10 * 1024 * 1024) return res.status(413).json({ error: { source: 'local', message: 'The docs cap uploads at 10 MB.' } });
            const fileName = String(req.headers['x-file-name'] || `source-of-funds.${ext}`).replace(/[^\w.-]+/g, '_');
            try {
                const form = new FormData();
                // Node's Buffer is a Uint8Array over a possibly shared buffer; Blob wants the plain kind.
                form.append('file', new Blob([req.body as unknown as Uint8Array<ArrayBuffer>], { type: contentType }), fileName);
                const url = inyo.url(`/people/${senderId}/documents/sourceOfFunds/upload`);
                const apiRes = await inyo.http.post(url, form, { headers: { ...inyo.headers, 'content-type': undefined }, maxBodyLength: Infinity });
                res.status(201).json(apiRes.data);
            } catch (error) {
                fail(res, error);
            }
        },
    );

    // Uploads only (GET /people/{id}/documents): documents verified through a KYC session are not here.
    router.get('/documents', auth, async (req, res) => {
        const senderId = senderOf(db, req.user!.id);
        if (!senderId) return res.json([]);
        try {
            const url = inyo.url(`/people/${senderId}/documents`);
            const apiRes = await inyo.http.get(url, { headers: inyo.headers });
            res.json(Array.isArray(apiRes.data) ? apiRes.data : apiRes.data?.documents || []);
        } catch (error) {
            fail(res, error);
        }
    });

    // Verification status history: entries with status, reason, verifiedBy, createdAt.
    router.get('/documents/:id/status', auth, async (req, res) => {
        try {
            const url = inyo.url(`/documents/${req.params.id}/verificationStatus`);
            const apiRes = await inyo.http.get(url, { headers: inyo.headers });
            res.json(apiRes.data);
        } catch (error) {
            fail(res, error);
        }
    });

    // Sandbox/staging only: POST /v2/senders/{id}/documents/{documentId}/resolve { outcome, reason }.
    router.post('/documents/:id/resolve', auth, async (req, res) => {
        const userId = req.user!.id;
        const senderId = senderOf(db, userId);
        if (!senderId) return res.status(404).json({ error: 'Profile not found' });
        const outcome = req.body?.outcome === 'rejected' ? 'rejected' : 'verified';
        const reason = String(req.body?.reason || 'Cleared for the integration walkthrough').slice(0, 255);
        try {
            const url = inyo.url(`/v2/senders/${senderId}/documents/${req.params.id}/resolve`);
            const apiRes = await inyo.http.post(url, { outcome, reason }, { headers: inyo.headers });
            limitCache.del(userId);
            res.json(apiRes.data);
        } catch (error) {
            fail(res, error);
        }
    });

    return router;
}
