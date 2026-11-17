import express, { Router, type Request, type RequestHandler } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { AppContext } from '../app.ts';
import { mergeSyncedCard } from '../services/fundingAccounts.ts';
import type { PaymentMethodRow, ProfileRow, UpstreamJson, UserRow } from '../types.ts';

// ---------------------------------------------------------------------------
// 3DS redirect landing pages (docs: tokenizing-cards threeDSData.successUrl / failUrl)
// ---------------------------------------------------------------------------
// In redirect mode the token carries successUrl/failUrl pointing here, and the issuer sends the
// browser to one of them at the end of the challenge. The page relays the payload to the app window
// (opener or parent) and the app re-reads the card from Inyo, which is the status that counts.
const threeDsLanding = (ctx: AppContext, outcome: 'success' | 'fail'): RequestHandler => (req, res) => {
    const payload = { ...(req.query || {}), ...(req.body && typeof req.body === 'object' ? req.body : {}) };
    ctx.log.info(`3DS ${outcome} landing (${req.method}): ${JSON.stringify(payload).slice(0, 400)}`);
    const message = JSON.stringify({ source: 'remittance-sample-3ds', outcome, payload }).replace(/</g, '\\u003c');
    res.type('html').send(`<!doctype html><meta charset="utf-8"><title>3D Secure ${outcome}</title>
<body style="font-family:system-ui;padding:24px;color:#1f2937">
<p>3D Secure authentication <strong>${outcome === 'success' ? 'completed' : 'failed'}</strong>. Returning to the app…</p>
<script>
  var msg = ${message};
  if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*");
  else if (window.opener) { window.opener.postMessage(msg, "*"); window.close(); }
  else window.location.replace(${JSON.stringify(`/payment?3ds=${outcome}`)});
</script></body>`);
};

// Tokenizer returns dtCreated like "2025-12-31 21:51:51", API wants ISO8601 (yyyy-MM-dd'T'HH:mm:ss.SSS'Z)
const formatTime = (t: string | undefined | null): string => {
    if (!t) return new Date().toISOString();
    // Ensure we have T separator and append milliseconds/Z if missing
    let iso = t.replace(' ', 'T');
    if (!iso.includes('.')) iso += '.000';
    if (!iso.endsWith('Z')) iso += 'Z';
    return iso;
};

export function fundingAccountsRoutes(ctx: AppContext): Router {
    const router = Router();
    const { db, inyo, log } = ctx;
    const userId = (req: Request): string => req.user!.id;
    const profileOf = (id: string) => db.prepare('SELECT * FROM profiles WHERE userId = ?').get(id) as ProfileRow | undefined;

    const formBody = express.urlencoded({ extended: false });
    router.all('/3ds/success', formBody, threeDsLanding(ctx, 'success'));
    router.all('/3ds/fail', formBody, threeDsLanding(ctx, 'fail'));

    router.post('/payment-methods/cards', ctx.auth, async (req, res) => {
        const uid = userId(req);
        const { token, billingAddress, threeDsMode } = req.body as { token: UpstreamJson; billingAddress: UpstreamJson; threeDsMode?: string }; // token is the object from tokenizer
        const id = uuidv4();
        // Which threeDSData the page tokenized with (off | redirect | postmessage); only for the log, the
        // card-token request itself goes from the browser straight to the gateway.
        log.info(`card registration: tokenizer 3DS mode = ${threeDsMode || 'unknown'}, bin ${token?.bin || '?'} ···· ${token?.lastFourDigits || '?'}`);

        try {
            // 1. Get User and Profile to get address details and externalId (participantId)
            const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as UserRow | undefined;
            const profile = profileOf(uid);

            if (!user || !profile || !profile.externalId) {
                return res.status(400).json({
                    error: 'User profile or external ID missing. Please complete profile first.',
                });
            }

            // 2. Construct External API Payload
            const payload = {
                externalId: id,
                asset: 'USD',
                nickname: `My ${token.cardNetwork || 'USD'} Card`,
                paymentMethod: {
                    type: 'CARD',
                    ipAddress: '127.0.0.1',
                    token: token.token,
                    bin: token.bin,
                    schemeId: token.schemeId,
                    lastFourDigits: token.lastFourDigits,
                    firstUseTokenExpiration: formatTime(token.dtExpiration),
                    cardCreatedAt: formatTime(token.dtCreated),
                    billingAddress: {
                        countryCode: 'US',
                        stateCode: billingAddress.state,
                        city: billingAddress.city,
                        line1: billingAddress.address1,
                        line2: billingAddress.address2,
                        zipcode: billingAddress.zipcode,
                    },
                },
            };

            // 3. Call External API
            const url = inyo.url(`/payout/participants/${profile.externalId}/fundingAccounts`);

            console.log(url);
            console.log('Payload:', payload);

            const apiRes = await inyo.http.post<UpstreamJson>(url, payload, { headers: inyo.headers });

            console.log('API Response:', apiRes.data);

            // 201 = created (Verified / Rejected); 202 = accepted, pending the 3DS challenge (ActionRequired + redirectAcsUrl)
            if (apiRes.status < 200 || apiRes.status >= 300) {
                throw new Error(`API Error: Received status ${apiRes.status}`);
            }

            const responseData = apiRes.data;
            const { status, redirectAcsUrl, statusMessage } = responseData;

            // Docs: the complete set is Pending | ActionRequired | Verified | Rejected ("Declined" was an older value)
            if (status === 'Rejected' || status === 'Declined') {
                return res.status(400).json({
                    success: false,
                    error: statusMessage || 'Card was rejected by the gateway',
                    status,
                });
            }

            const { id: externalId } = responseData;

            // 4. Save to Database
            const tokenStr = typeof token === 'object' ? JSON.stringify(token) : token;

            db.prepare(
                'INSERT INTO payment_methods (id, userId, token, data, type, externalId) VALUES (?, ?, ?, ?, ?, ?)',
            ).run(
                id,
                uid,
                tokenStr,
                JSON.stringify({ billingAddress, apiResponse: responseData }),
                'CARD',
                externalId,
            );

            res.json({ success: true, id, externalId, status, redirectAcsUrl, gatewayPaymentId: responseData.gateway?.paymentId || null });
        } catch (error) {
            const body: UpstreamJson | undefined = axios.isAxiosError(error) ? error.response?.data : undefined;
            // Inyo answers 422 with the funding account itself when the gateway rejects the card.
            if (axios.isAxiosError(error) && error.response?.status === 422 && body?.status === 'Rejected') {
                const info = inyo.describeUpstream(error);
                log.error(`card rejected by gateway: ${body.statusMessage} ${JSON.stringify(body.gateway || {})}`);
                return res.status(400).json({
                    error: {
                        ...info,
                        message: `Card rejected: ${body.statusMessage || 'no reason given'}`,
                        body: { status: body.status, statusMessage: body.statusMessage, gateway: body.gateway },
                        hint: 'The gateway could not validate the token. "Card information is required" (PAY_185/PAY_255) usually means the token was minted under a different merchant or gateway environment than this tenant\'s gateway credentials.',
                    },
                });
            }
            console.error('Payment Method Error:', error instanceof Error ? error.message : error, body);
            ctx.fail(res, error);
        }
    });

    router.post('/payment-methods/ach/link-token', ctx.auth, async (req, res) => {
        const uid = userId(req);
        try {
            const profile = profileOf(uid);
            if (!profile || !profile.externalId) {
                return res.status(400).json({ error: 'User profile or external ID missing.' });
            }
            const url = inyo.url(`/payout/participants/${profile.externalId}/fundingAccounts/linkTokens`);
            console.log(`Requesting Plaid link token: ${url}`);
            const apiRes = await inyo.http.post<UpstreamJson>(url, { provider: 'PLAID' }, { headers: inyo.headers });
            res.json(apiRes.data);
        } catch (error) {
            console.error('Plaid link token error:', error instanceof Error ? error.message : error, axios.isAxiosError(error) ? error.response?.data : undefined);
            ctx.fail(res, error);
        }
    });

    router.post('/payment-methods/ach', ctx.auth, async (req, res) => {
        const uid = userId(req);
        const { bankData } = req.body as { bankData: UpstreamJson };
        const id = uuidv4();

        try {
            const profile = profileOf(uid);
            if (!profile || !profile.externalId) {
                return res.status(400).json({ error: 'User profile or external ID missing.' });
            }

            const payload = {
                externalId: id,
                asset: 'USD',
                nickname: bankData.nickname || 'My Bank Account',
                paymentMethod: {
                    type: 'ACH',
                    countryCode: 'US',
                    accountCheckId: bankData.accountCheckId,
                    accountCheckToken: bankData.accountCheckToken,
                },
            };

            const url = inyo.url(`/payout/participants/${profile.externalId}/fundingAccounts`);
            console.log(`Creating ACH via Plaid: ${url}`);
            const apiRes = await inyo.http.post<UpstreamJson>(url, payload, { headers: inyo.headers });

            const { id: externalId, status } = apiRes.data;

            const tokenStr = JSON.stringify({ nickname: bankData.nickname || 'Bank Account' });

            db.prepare(
                'INSERT INTO payment_methods (id, userId, token, data, type, externalId) VALUES (?, ?, ?, ?, ?, ?)',
            ).run(
                id,
                uid,
                tokenStr,
                JSON.stringify({ status, apiResponse: apiRes.data }),
                'ACH',
                externalId,
            );

            res.json({ success: true, id, externalId, status });
        } catch (error) {
            console.error('ACH Payment Method Error:', error instanceof Error ? error.message : error, axios.isAxiosError(error) ? error.response?.data : undefined);
            ctx.fail(res, error);
        }
    });

    router.get('/payment-methods', ctx.auth, (req, res) => {
        const uid = userId(req);
        try {
            const rows = db.prepare('SELECT * FROM payment_methods WHERE userId = ?').all(uid) as PaymentMethodRow[];
            // Parse the JSON data fields
            const paymentMethods = rows
                .map((r) => ({
                    ...r,
                    token: JSON.parse(r.token) as UpstreamJson,
                    data: JSON.parse(r.data) as UpstreamJson,
                }))
                // Docs: every funding account carries isActive; hide deactivated ones. ActionRequired cards stay
                // listed so the sender can resume the 3DS challenge (the UI refuses them for transactions).
                .filter((pm) => pm.data?.apiResponse?.isActive !== false);
            res.json(paymentMethods);
        } catch (error) {
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    });

    // Docs (sender-funding-account, "Deactivating a Funding Account"): DELETE is a soft, one-way deactivation.
    // Inyo keeps the row with isActive=false; this sample drops its local copy once Inyo confirms.
    router.delete('/payment-methods/:id', ctx.auth, async (req, res) => {
        const uid = userId(req);
        const { id } = req.params;
        try {
            const row = db.prepare('SELECT * FROM payment_methods WHERE id = ? AND userId = ?').get(id, uid) as PaymentMethodRow | undefined;
            if (!row) return res.status(404).json({ error: 'Payment method not found' });
            const profile = db.prepare('SELECT externalId FROM profiles WHERE userId = ?').get(uid) as Pick<ProfileRow, 'externalId'> | undefined;

            let upstream: UpstreamJson | null = null;
            if (row.externalId && profile?.externalId) {
                const url = inyo.url(`/payout/participants/${profile.externalId}/fundingAccounts/${row.externalId}`);
                const apiRes = await inyo.http.delete<UpstreamJson>(url, { headers: inyo.headers });
                upstream = apiRes.data;
                if (upstream && upstream.isActive !== false) {
                    log.error(`fundingAccount ${row.externalId} still active after DELETE: ${JSON.stringify(upstream).slice(0, 200)}`);
                    return res.status(502).json({ error: { source: 'inyo', status: apiRes.status, method: 'DELETE', path: new URL(url).pathname, message: 'Inyo did not deactivate the funding account', body: { isActive: upstream.isActive, status: upstream.status } } });
                }
            }

            db.prepare('DELETE FROM payment_methods WHERE id = ? AND userId = ?').run(id, uid);
            res.json({ success: true, id, externalId: row.externalId, isActive: false, upstream });
        } catch (error) {
            ctx.fail(res, error);
        }
    });

    router.get('/payment-methods/:id/sync', ctx.auth, async (req, res) => {
        const uid = userId(req);
        const { id } = req.params;

        try {
            const card = db.prepare('SELECT * FROM payment_methods WHERE id = ? AND userId = ?').get(id, uid) as PaymentMethodRow | undefined;
            if (!card) return res.status(404).json({ error: 'Payment method not found' });

            const currentData: UpstreamJson = JSON.parse(card.data);
            const profile = db.prepare('SELECT externalId FROM profiles WHERE userId = ?').get(uid) as Pick<ProfileRow, 'externalId'> | undefined;

            if (!profile || !profile.externalId) {
                return res.status(400).json({ error: 'Profile not found' });
            }

            const url = inyo.url(`/payout/fundingAccounts/${card.externalId}`);
            console.log(`Syncing card status: ${url}`);

            const apiRes = await inyo.http.get<UpstreamJson>(url, { headers: inyo.headers });
            const { newData, stillPending } = mergeSyncedCard(currentData, apiRes.data);
            if (stillPending) log.warn(`card ${id}: gateway webhook said ${currentData.gatewayEvent.status} but Inyo still answers ${apiRes.data.status}`);

            db.prepare('UPDATE payment_methods SET data = ? WHERE id = ?').run(JSON.stringify(newData), id);

            res.json({
                success: true,
                status: newData.apiResponse.status,
                coreStatus: newData.apiResponse.coreStatus,
                data: newData.apiResponse,
            });
        } catch (error) {
            console.error('Sync Error:', error instanceof Error ? error.message : error);
            ctx.fail(res, error);
        }
    });

    return router;
}
