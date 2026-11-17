import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, mockUpstream, registerUser, request, setProfile } from './helpers.js';

let app;
let db;
const upstream = mockUpstream();

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

beforeEach(() => upstream.reset());

const TOKEN = { token: 'tok_123', bin: '446203', schemeId: 'VISA', lastFourDigits: '0000', cardNetwork: 'VISA', cardType: 'DEBIT', dtCreated: '2025-12-31 21:51:51', dtExpiration: '2026-01-31 21:51:51' };
const BILLING = { address1: '123 Market St', address2: 'Apt 4', city: 'San Francisco', state: 'CA', zipcode: '94105' };

const sender = async () => {
  const u = await registerUser(app);
  const ext = setProfile(db, u.user.id);
  return { ...u, ext };
};

const insertCard = (userId, id, data, externalId = data?.apiResponse?.id || null, type = 'CARD', token = { lastFourDigits: '0000', schemeId: 'VISA' }) => {
  db.prepare('INSERT INTO payment_methods (id, userId, token, data, type, externalId) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, JSON.stringify(token), JSON.stringify(data), type, externalId);
};

describe('POST /api/payment-methods/cards', () => {
  it('answers 400 before the profile exists', async () => {
    const { auth } = await registerUser(app);
    const res = await request(app).post('/api/payment-methods/cards').set(auth).send({ token: TOKEN, billingAddress: BILLING });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/complete profile first/);
    expect(upstream.calls).toHaveLength(0);
  });

  it('registers the funding account with the documented payload and stores the row (201 Verified)', async () => {
    const { auth, user, ext } = await sender();
    upstream.on('POST', `/payout/participants/${ext}/fundingAccounts`, { status: 201, data: { id: 'fa-1', status: 'Verified', gateway: { paymentId: 'pay-1' } } });

    const res = await request(app).post('/api/payment-methods/cards').set(auth).send({ token: TOKEN, billingAddress: BILLING, threeDsMode: 'off' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, id: expect.any(String), externalId: 'fa-1', status: 'Verified', gatewayPaymentId: 'pay-1' });

    const payload = upstream.calls[0].body;
    expect(payload).toEqual({
      externalId: res.body.id,
      asset: 'USD',
      nickname: 'My VISA Card',
      paymentMethod: {
        type: 'CARD',
        ipAddress: '127.0.0.1',
        token: 'tok_123',
        bin: '446203',
        schemeId: 'VISA',
        lastFourDigits: '0000',
        firstUseTokenExpiration: '2026-01-31T21:51:51.000Z',
        cardCreatedAt: '2025-12-31T21:51:51.000Z',
        billingAddress: { countryCode: 'US', stateCode: 'CA', city: 'San Francisco', line1: '123 Market St', line2: 'Apt 4', zipcode: '94105' },
      },
    });

    const row = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(res.body.id);
    expect(row).toMatchObject({ userId: user.id, type: 'CARD', externalId: 'fa-1' });
    expect(JSON.parse(row.token)).toEqual(TOKEN);
    expect(JSON.parse(row.data)).toEqual({ billingAddress: BILLING, apiResponse: { id: 'fa-1', status: 'Verified', gateway: { paymentId: 'pay-1' } } });
  });

  it('returns the ACS url when Inyo answers 202 ActionRequired', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/payout/participants/${ext}/fundingAccounts`, { status: 202, data: { id: 'fa-2', status: 'ActionRequired', redirectAcsUrl: 'https://challenge.test/acs', gateway: { paymentId: 'pay-2' } } });
    const res = await request(app).post('/api/payment-methods/cards').set(auth).send({ token: TOKEN, billingAddress: BILLING });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ActionRequired', redirectAcsUrl: 'https://challenge.test/acs', gatewayPaymentId: 'pay-2' });
    expect(JSON.parse(db.prepare('SELECT data FROM payment_methods WHERE id = ?').get(res.body.id).data).apiResponse.redirectAcsUrl).toBe('https://challenge.test/acs');
  });

  it('answers 400 when the body status is Rejected and stores nothing', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/payout/participants/${ext}/fundingAccounts`, { status: 201, data: { id: 'fa-3', status: 'Rejected', statusMessage: 'Do not honor' } });
    const res = await request(app).post('/api/payment-methods/cards').set(auth).send({ token: TOKEN, billingAddress: BILLING });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Do not honor', status: 'Rejected' });
    expect(db.prepare("SELECT COUNT(*) AS n FROM payment_methods WHERE externalId = 'fa-3'").get().n).toBe(0);
  });

  it('explains a 422 Rejected from the gateway', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/payout/participants/${ext}/fundingAccounts`, { status: 422, data: { id: 'fa-4', status: 'Rejected', statusMessage: 'Card information is required', gateway: { responseCode: 'PAY_185' } } });
    const res = await request(app).post('/api/payment-methods/cards').set(auth).send({ token: TOKEN, billingAddress: BILLING });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ source: 'inyo', status: 422, message: 'Card rejected: Card information is required', body: { status: 'Rejected', statusMessage: 'Card information is required', gateway: { responseCode: 'PAY_185' } } });
    expect(res.body.error.hint).toMatch(/could not validate the token/);
  });

  it('forwards other upstream errors', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/payout/participants/${ext}/fundingAccounts`, { status: 500, data: { message: 'oops' } });
    const res = await request(app).post('/api/payment-methods/cards').set(auth).send({ token: TOKEN, billingAddress: BILLING });
    expect(res.status).toBe(502);
    expect(res.body.error.source).toBe('inyo');
  });
});

describe('ACH (Plaid)', () => {
  it('requests a link token with provider PLAID', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/payout/participants/${ext}/fundingAccounts/linkTokens`, { status: 200, data: { token: 'link-sandbox-1' } });
    const res = await request(app).post('/api/payment-methods/ach/link-token').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: 'link-sandbox-1' });
    expect(upstream.calls[0].body).toEqual({ provider: 'PLAID' });
  });

  it('answers 400 for the link token and the account without a profile', async () => {
    const { auth } = await registerUser(app);
    expect((await request(app).post('/api/payment-methods/ach/link-token').set(auth)).status).toBe(400);
    expect((await request(app).post('/api/payment-methods/ach').set(auth).send({ bankData: {} })).status).toBe(400);
  });

  it('registers the bank account and stores it as ACH', async () => {
    const { auth, user, ext } = await sender();
    upstream.on('POST', `/payout/participants/${ext}/fundingAccounts`, { status: 201, data: { id: 'fa-ach', status: 'Pending', bankName: 'First Platypus Bank' } });
    const res = await request(app).post('/api/payment-methods/ach').set(auth).send({ bankData: { accountCheckToken: 'public-token', accountCheckId: 'acct-1', nickname: 'Platypus' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, id: expect.any(String), externalId: 'fa-ach', status: 'Pending' });
    expect(upstream.calls[0].body).toEqual({ externalId: res.body.id, asset: 'USD', nickname: 'Platypus', paymentMethod: { type: 'ACH', countryCode: 'US', accountCheckId: 'acct-1', accountCheckToken: 'public-token' } });
    const row = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(res.body.id);
    expect(row).toMatchObject({ userId: user.id, type: 'ACH', externalId: 'fa-ach' });
    expect(JSON.parse(row.token)).toEqual({ nickname: 'Platypus' });
    expect(JSON.parse(row.data)).toEqual({ status: 'Pending', apiResponse: { id: 'fa-ach', status: 'Pending', bankName: 'First Platypus Bank' } });
  });
});

describe('GET /api/payment-methods', () => {
  it('parses the JSON columns, hides deactivated accounts and scopes by user', async () => {
    const { auth, user } = await sender();
    insertCard(user.id, 'pm-active', { apiResponse: { id: 'fa-a', status: 'Verified', isActive: true } });
    insertCard(user.id, 'pm-pending', { apiResponse: { id: 'fa-b', status: 'ActionRequired' } });
    insertCard(user.id, 'pm-gone', { apiResponse: { id: 'fa-c', status: 'Verified', isActive: false } });
    const other = await registerUser(app);
    insertCard(other.user.id, 'pm-other', { apiResponse: { id: 'fa-d', status: 'Verified' } });

    const res = await request(app).get('/api/payment-methods').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.map((m) => m.id).sort()).toEqual(['pm-active', 'pm-pending']);
    expect(res.body[0].token).toEqual({ lastFourDigits: '0000', schemeId: 'VISA' });
    expect(res.body[0].data.apiResponse.id).toBe('fa-a');
  });
});

describe('DELETE /api/payment-methods/:id', () => {
  it('answers 404 for an unknown or foreign row', async () => {
    const { auth } = await sender();
    const other = await sender();
    insertCard(other.user.id, 'pm-foreign', { apiResponse: { id: 'fa-f' } });
    expect((await request(app).delete('/api/payment-methods/nope').set(auth)).status).toBe(404);
    expect((await request(app).delete('/api/payment-methods/pm-foreign').set(auth)).status).toBe(404);
  });

  it('deactivates on Inyo and drops the local row once isActive is false', async () => {
    const { auth, user, ext } = await sender();
    insertCard(user.id, 'pm-del', { apiResponse: { id: 'fa-del' } });
    upstream.on('DELETE', `/payout/participants/${ext}/fundingAccounts/fa-del`, { status: 200, data: { id: 'fa-del', isActive: false, status: 'Verified' } });
    const res = await request(app).delete('/api/payment-methods/pm-del').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, id: 'pm-del', externalId: 'fa-del', isActive: false, upstream: { id: 'fa-del', isActive: false, status: 'Verified' } });
    expect(db.prepare('SELECT * FROM payment_methods WHERE id = ?').get('pm-del')).toBeUndefined();
  });

  it('answers 502 and keeps the row when Inyo still reports the account active', async () => {
    const { auth, user, ext } = await sender();
    insertCard(user.id, 'pm-keep', { apiResponse: { id: 'fa-keep' } });
    upstream.on('DELETE', `/payout/participants/${ext}/fundingAccounts/fa-keep`, { status: 200, data: { id: 'fa-keep', isActive: true, status: 'Verified' } });
    const res = await request(app).delete('/api/payment-methods/pm-keep').set(auth);
    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ source: 'inyo', method: 'DELETE', message: 'Inyo did not deactivate the funding account', body: { isActive: true, status: 'Verified' } });
    expect(db.prepare('SELECT * FROM payment_methods WHERE id = ?').get('pm-keep')).toBeDefined();
  });

  it('drops a row that was never registered upstream without calling Inyo', async () => {
    const { auth, user } = await sender();
    insertCard(user.id, 'pm-local', { apiResponse: {} }, null);
    const res = await request(app).delete('/api/payment-methods/pm-local').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.upstream).toBeNull();
    expect(upstream.calls).toHaveLength(0);
  });

  it('forwards an upstream failure', async () => {
    const { auth, user, ext } = await sender();
    insertCard(user.id, 'pm-err', { apiResponse: { id: 'fa-err' } });
    upstream.on('DELETE', `/payout/participants/${ext}/fundingAccounts/fa-err`, { status: 404, data: { message: 'not found' } });
    const res = await request(app).delete('/api/payment-methods/pm-err').set(auth);
    expect(res.status).toBe(404);
    expect(db.prepare('SELECT * FROM payment_methods WHERE id = ?').get('pm-err')).toBeDefined();
  });
});

describe('GET /api/payment-methods/:id/sync', () => {
  it('answers 404 for an unknown row and 400 without a profile', async () => {
    const { auth } = await sender();
    expect((await request(app).get('/api/payment-methods/nope/sync').set(auth)).status).toBe(404);

    const noProfile = await registerUser(app);
    insertCard(noProfile.user.id, 'pm-np', { apiResponse: { id: 'fa-np' } });
    const res = await request(app).get('/api/payment-methods/pm-np/sync').set(noProfile.auth);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Profile not found');
  });

  it('re-reads the status from Inyo and keeps redirectAcsUrl and gateway from the creation response', async () => {
    const { auth, user } = await sender();
    insertCard(user.id, 'pm-sync', { billingAddress: BILLING, apiResponse: { id: 'fa-sync', status: 'ActionRequired', redirectAcsUrl: 'https://challenge.test/acs', gateway: { paymentId: 'pay-s' } } });
    upstream.on('GET', '/payout/fundingAccounts/fa-sync', { status: 200, data: { id: 'fa-sync', status: 'Actionrequired', isActive: true } });

    const res = await request(app).get('/api/payment-methods/pm-sync/sync').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      status: 'Actionrequired',
      coreStatus: null,
      data: { id: 'fa-sync', status: 'Actionrequired', isActive: true, coreStatus: null, redirectAcsUrl: 'https://challenge.test/acs', gateway: { paymentId: 'pay-s' } },
    });
    const stored = JSON.parse(db.prepare('SELECT data FROM payment_methods WHERE id = ?').get('pm-sync').data);
    expect(stored.billingAddress).toEqual(BILLING);
    expect(stored.apiResponse.redirectAcsUrl).toBe('https://challenge.test/acs');
  });

  it('prefers the fresh values when Inyo returns them', async () => {
    const { auth, user } = await sender();
    insertCard(user.id, 'pm-fresh', { apiResponse: { id: 'fa-fresh', status: 'ActionRequired', redirectAcsUrl: 'https://old', gateway: { paymentId: 'old' } } });
    upstream.on('GET', '/payout/fundingAccounts/fa-fresh', { status: 200, data: { id: 'fa-fresh', status: 'Verified', redirectAcsUrl: 'https://new', gateway: { paymentId: 'new' } } });
    const res = await request(app).get('/api/payment-methods/pm-fresh/sync').set(auth);
    expect(res.body.status).toBe('Verified');
    expect(res.body.data.redirectAcsUrl).toBe('https://new');
    expect(res.body.data.gateway.paymentId).toBe('new');
  });

  it('keeps the gateway verdict while Inyo still answers ActionRequired, and drops it once Inyo agrees', async () => {
    const { auth, user } = await sender();
    const data = { apiResponse: { id: 'fa-wh', status: 'Verified' }, gatewayEvent: { status: 'AUTHORIZED', appliedStatus: 'Verified' } };
    insertCard(user.id, 'pm-wh', data);

    upstream.on('GET', '/payout/fundingAccounts/fa-wh', { status: 200, data: { id: 'fa-wh', status: 'Actionrequired' } });
    const pending = await request(app).get('/api/payment-methods/pm-wh/sync').set(auth);
    expect(pending.body.status).toBe('Verified');
    expect(pending.body.coreStatus).toBe('Actionrequired');
    expect(pending.body.data.coreStatus).toBe('Actionrequired');
    expect(JSON.parse(db.prepare('SELECT data FROM payment_methods WHERE id = ?').get('pm-wh').data).gatewayEvent).toEqual(data.gatewayEvent);

    upstream.reset();
    upstream.on('GET', '/payout/fundingAccounts/fa-wh', { status: 200, data: { id: 'fa-wh', status: 'Verified' } });
    const agreed = await request(app).get('/api/payment-methods/pm-wh/sync').set(auth);
    expect(agreed.body.status).toBe('Verified');
    expect(agreed.body.coreStatus).toBeNull();
  });

  it('forwards an upstream failure', async () => {
    const { auth, user } = await sender();
    insertCard(user.id, 'pm-e', { apiResponse: { id: 'fa-e' } });
    upstream.on('GET', '/payout/fundingAccounts/fa-e', { status: 404, data: { message: 'gone' } });
    const res = await request(app).get('/api/payment-methods/pm-e/sync').set(auth);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('gone');
  });
});
