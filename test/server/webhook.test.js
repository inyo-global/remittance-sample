import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, mockUpstream, registerUser, request } from './helpers.js';

let app;
let db;
const upstream = mockUpstream();

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

beforeEach(() => upstream.reset());
afterEach(() => {
  process.env.WEBHOOK_BASIC_USER = '';
  process.env.WEBHOOK_BASIC_PASS = '';
});

let n = 0;
const insertCard = (userId, apiResponse, extra = {}) => {
  n += 1;
  const id = `card-${n}`;
  db.prepare('INSERT INTO payment_methods (id, userId, token, data, type, externalId) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, '{}', JSON.stringify({ apiResponse, ...extra }), 'CARD', apiResponse.id || null);
  return id;
};
const dataOf = (id) => JSON.parse(db.prepare('SELECT data FROM payment_methods WHERE id = ?').get(id).data);

const EVENT = { agentId: 'INYO.GLOBAL.WEB', event: 'CHECK', status: 'AUTHORIZED', statusCode: '00', statusDescription: 'Approved', amount: { total: 0, currency: 'USD' }, eventDate: '2026-11-12T18:53:00Z', oldStatus: 'PENDING', newStatus: 'AUTHORIZED' };

describe('GET /api/webhooks/gateway', () => {
  it('confirms the endpoint and whether Basic Auth is enforced', async () => {
    const open = await request(app).get('/api/webhooks/gateway');
    expect(open.status).toBe(200);
    expect(open.body).toMatchObject({ ok: true, basicAuth: false });
    expect(open.body.expects).toMatch(/^POST application\/json/);

    process.env.WEBHOOK_BASIC_USER = 'hook';
    process.env.WEBHOOK_BASIC_PASS = 'pw';
    expect((await request(app).get('/api/webhooks/gateway')).body.basicAuth).toBe(true);
  });
});

describe('POST /api/webhooks/gateway auth', () => {
  it('accepts any caller when no credentials are configured', async () => {
    const res = await request(app).post('/api/webhooks/gateway').send({ ...EVENT, paymentId: 'nope' });
    expect(res.status).toBe(200);
  });

  it('enforces Basic Auth when WEBHOOK_BASIC_USER/PASS are set', async () => {
    process.env.WEBHOOK_BASIC_USER = 'hook';
    process.env.WEBHOOK_BASIC_PASS = 'pw';
    const missing = await request(app).post('/api/webhooks/gateway').send(EVENT);
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toBe('Basic realm="webhook"');
    expect(missing.body).toEqual({ error: 'Unauthorized' });

    const wrong = await request(app).post('/api/webhooks/gateway').set('Authorization', `Basic ${Buffer.from('hook:nope').toString('base64')}`).send(EVENT);
    expect(wrong.status).toBe(401);

    const bearer = await request(app).post('/api/webhooks/gateway').set('Authorization', `Bearer ${Buffer.from('hook:pw').toString('base64')}`).send(EVENT);
    expect(bearer.status).toBe(401);

    const ok = await request(app).post('/api/webhooks/gateway').set('Authorization', `Basic ${Buffer.from('hook:pw').toString('base64')}`).send(EVENT);
    expect(ok.status).toBe(200);
  });
});

describe('POST /api/webhooks/gateway matching and status', () => {
  it('matches the card by the gateway paymentId and marks it Verified on AUTHORIZED', async () => {
    const { user } = await registerUser(app);
    const id = insertCard(user.id, { id: 'fa-1', status: 'ActionRequired', gateway: { paymentId: 'pay-1' } });
    const res = await request(app).post('/api/webhooks/gateway').send({ ...EVENT, paymentId: 'pay-1', externalPaymentId: 'CHECK_ACCOUNT_fa-1' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, status: 'AUTHORIZED', paymentId: 'pay-1', externalPaymentId: 'CHECK_ACCOUNT_fa-1', matchedCard: { id, newStatus: 'Verified' } });
    expect(res.body.receivedAt).toMatch(/^\d{4}-/);

    const data = dataOf(id);
    expect(data.apiResponse).toMatchObject({ id: 'fa-1', status: 'Verified', coreStatus: null, gateway: { paymentId: 'pay-1' } });
    expect(data.gatewayEvent).toMatchObject({ status: 'AUTHORIZED', statusCode: '00', message: 'Approved', paymentId: 'pay-1', eventDate: EVENT.eventDate, appliedStatus: 'Verified' });
    expect(data.lastGatewayEvent).toEqual(data.gatewayEvent);

    const row = db.prepare('SELECT * FROM webhook_events ORDER BY id DESC LIMIT 1').get();
    expect(row).toMatchObject({ paymentId: 'pay-1', externalPaymentId: 'CHECK_ACCOUNT_fa-1', status: 'AUTHORIZED', matchedCardId: id });
    expect(JSON.parse(row.payload).event).toBe('CHECK');
  });

  it('matches by the externalPaymentId suffix when the paymentId is unknown, and marks DECLINED as Rejected', async () => {
    const { user } = await registerUser(app);
    const id = insertCard(user.id, { id: 'fa-2', status: 'ActionRequired', gateway: { paymentId: 'pay-created' } });
    const res = await request(app).post('/api/webhooks/gateway').send({ ...EVENT, status: 'DECLINED', statusCode: '05', statusDescription: 'Do not honor', paymentId: 'pay-event', externalPaymentId: 'CHECK_ACCOUNT_fa-2' });
    expect(res.body.matchedCard).toEqual({ id, newStatus: 'Rejected' });
    const data = dataOf(id);
    expect(data.apiResponse.status).toBe('Rejected');
    expect(data.apiResponse.gateway.paymentId).toBe('pay-created');
    expect(data.gatewayEvent).toMatchObject({ status: 'DECLINED', statusCode: '05', message: 'Do not honor', appliedStatus: 'Rejected' });
  });

  it('matches by the row externalId when apiResponse has no id, and accepts `externalId` as the field name', async () => {
    const { user } = await registerUser(app);
    const id = insertCard(user.id, { status: 'ActionRequired' });
    db.prepare('UPDATE payment_methods SET externalId = ? WHERE id = ?').run('fa-3', id);
    const res = await request(app).post('/api/webhooks/gateway').send({ status: 'authorized', paymentId: 'x', externalId: 'CHECK_ACCOUNT_fa-3', responseCode: '00', message: 'ok' });
    expect(res.body.matchedCard).toEqual({ id, newStatus: 'Verified' });
    expect(dataOf(id).gatewayEvent).toMatchObject({ status: 'AUTHORIZED', statusCode: '00', message: 'ok' });
  });

  it('keeps the AUTHORIZED verdict when the $0 check is VOIDED afterwards', async () => {
    const { user } = await registerUser(app);
    const id = insertCard(user.id, { id: 'fa-4', status: 'ActionRequired' });
    await request(app).post('/api/webhooks/gateway').send({ ...EVENT, paymentId: 'pay-a', externalPaymentId: 'CHECK_ACCOUNT_fa-4' });
    const voided = await request(app).post('/api/webhooks/gateway').send({ ...EVENT, status: 'VOIDED', paymentId: 'pay-b', externalPaymentId: 'CHECK_ACCOUNT_fa-4', oldStatus: 'AUTHORIZED', newStatus: 'VOIDED' });
    expect(voided.body.matchedCard).toEqual({ id, newStatus: null });
    const data = dataOf(id);
    expect(data.apiResponse.status).toBe('Verified');
    expect(data.gatewayEvent.status).toBe('AUTHORIZED');
    expect(data.gatewayEvent.paymentId).toBe('pay-a');
    expect(data.lastGatewayEvent.status).toBe('VOIDED');
    expect(data.lastGatewayEvent.paymentId).toBe('pay-b');
    expect(data.lastGatewayEvent.appliedStatus).toBeNull();
  });

  it('does not touch a card with a non-decisive status and stores unmatched events', async () => {
    const { user } = await registerUser(app);
    const id = insertCard(user.id, { id: 'fa-5', status: 'ActionRequired' });
    await request(app).post('/api/webhooks/gateway').send({ ...EVENT, status: 'PENDING', externalPaymentId: 'CHECK_ACCOUNT_fa-5' });
    const data = dataOf(id);
    expect(data.apiResponse.status).toBe('ActionRequired');
    expect(data.gatewayEvent).toBeUndefined();
    expect(data.lastGatewayEvent.status).toBe('PENDING');

    const res = await request(app).post('/api/webhooks/gateway').send({ ...EVENT, paymentId: 'ghost', externalPaymentId: 'CHECK_ACCOUNT_ghost' });
    expect(res.status).toBe(200);
    expect(res.body.matchedCard).toBeNull();
    const row = db.prepare('SELECT * FROM webhook_events ORDER BY id DESC LIMIT 1').get();
    expect(row).toMatchObject({ paymentId: 'ghost', matchedCardId: null, status: 'AUTHORIZED' });

    const empty = await request(app).post('/api/webhooks/gateway').send({});
    expect(empty.body).toMatchObject({ received: true, status: null, paymentId: null, externalPaymentId: null, matchedCard: null });
  });
});

describe('GET /api/webhooks/events', () => {
  it('requires a token', async () => {
    expect((await request(app).get('/api/webhooks/events')).status).toBe(401);
  });

  it('returns the recent events newest first with parsed payloads and the tunnel URL when ngrok answers', async () => {
    const { auth } = await registerUser(app);
    await request(app).post('/api/webhooks/gateway').send({ ...EVENT, paymentId: 'ev-1' });
    await request(app).post('/api/webhooks/gateway').send({ ...EVENT, paymentId: 'ev-2', status: 'VOIDED' });
    upstream.on('GET', 'http://127.0.0.1:4040/api/tunnels', { status: 200, data: { tunnels: [{ public_url: 'http://tunnel.example.test' }, { public_url: 'https://tunnel.example.test' }] } });

    const res = await request(app).get('/api/webhooks/events').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ publicUrl: 'https://tunnel.example.test', path: '/api/webhooks/gateway', basicAuth: false });
    const ids = res.body.events.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(res.body.events[0]).toMatchObject({ paymentId: 'ev-2', status: 'VOIDED', matchedCardId: null, payload: { event: 'CHECK', paymentId: 'ev-2' } });
    expect(res.body.events[1].paymentId).toBe('ev-1');
  });

  it('answers publicUrl null when no local tunnel is running', async () => {
    const { auth } = await registerUser(app);
    const res = await request(app).get('/api/webhooks/events').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.publicUrl).toBeNull();
    expect(Array.isArray(res.body.events)).toBe(true);
  });
});
