import type { Request } from 'express';
import type { Config } from '../config.ts';
import type { Db } from '../db.ts';
import { HttpError } from '../middlewares/errorHandler.ts';
import type { KycSessionRow, UpstreamJson } from '../types.ts';

// --- KYC verification session (Inyo360 widget) ---
// Docs: remittances/sender/uploading-documents.md ("KYC Verification Sessions") and kyc/widget-delivery.md.
// The widget is a hosted page: no SDK, no iframe API. We create the session, hand the widgetUrl
// to the browser, and read the outcome back with GET (the DocumentUpdatedEvents webhook is the
// production channel). In sandbox every verdict lands in PENDING_REVIEW, which /resolve settles.
export type KycSession = Omit<KycSessionRow, 'data'> & { data: UpstreamJson | null };

export const kycRow = (row: KycSessionRow | undefined): KycSession | null =>
    row ? { ...row, data: row.data ? JSON.parse(row.data) : null } : null;

export const saveKyc = (db: Db, userId: string, session: UpstreamJson): KycSession | null => {
    const existing = db.prepare('SELECT createdAt, widgetUrl FROM kyc_sessions WHERE sessionId = ?').get(session.sessionId) as
        | Pick<KycSessionRow, 'createdAt' | 'widgetUrl'>
        | undefined;
    db.prepare(
        'INSERT OR REPLACE INTO kyc_sessions (sessionId, userId, status, widgetUrl, createdAt, data) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
        session.sessionId,
        userId,
        session.status,
        session.widgetUrl || existing?.widgetUrl || null,
        existing?.createdAt || session.createdAt || new Date().toISOString(),
        JSON.stringify(session),
    );
    return kycRow(db.prepare('SELECT * FROM kyc_sessions WHERE sessionId = ?').get(session.sessionId) as KycSessionRow | undefined);
};

// Where the widget sends the user afterwards. The redirect carries sessionId/status/sig; this sample
// only uses it as a cue to re-read the session (verifying `sig` needs the tenant's webhook secret).
// It must not point at a loopback host: the API rejects request bodies that mention
// localhost/127.0.0.1 (KYC_VALIDATION_ERROR). Set APP_URL to a non-loopback origin
// (http://lvh.me:3000 resolves to 127.0.0.1 through public DNS; a hosts-file alias or a tunnel also work).
export const LOOPBACK = /^(localhost|127(\.\d+){3}|0\.0\.0\.0|\[?::1\]?)$/i;

// Public origin of the app (APP_URL, else the caller's Origin/Referer), without a trailing slash.
// APP_URL is read per request, as before, so it can be changed on a running server (the tests do).
export const appOrigin = (config: Config, req?: Request): string =>
    ((process.env.APP_URL ?? config.appUrl) || req?.headers?.origin || String(req?.headers?.referer || '').replace(/(https?:\/\/[^/]+).*/, '$1') || '').replace(/\/$/, '');

export const isLoopbackUrl = (base: string): boolean => {
    let host = '';
    try { host = new URL(base).hostname; } catch { host = ''; }
    return !base || LOOPBACK.test(host);
};

export const kycRedirectUrl = (config: Config, req: Request): string => {
    const base = appOrigin(config, req);
    if (isLoopbackUrl(base)) {
        throw new HttpError(400, `redirectUrl would be "${base || '(empty)'}". Inyo rejects loopback hosts in the kycSession body. Set APP_URL in .env to a non-loopback origin, e.g. http://lvh.me:3000 (resolves to 127.0.0.1), and open the app from that origin.`);
    }
    return `${base}/compliance?kyc=done`;
};
