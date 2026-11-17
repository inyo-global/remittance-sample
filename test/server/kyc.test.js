import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, mockUpstream, registerUser, request, setProfile } from './helpers.js';

let app;
let db;
const upstream = mockUpstream();

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

beforeEach(() => upstream.reset());
afterEach(() => { process.env.APP_URL = ''; });

const sender = async () => {
  const u = await registerUser(app);
  const ext = setProfile(db, u.user.id);
  return { ...u, ext };
};

const SESSION = { sessionId: 'kyc-1', status: 'PENDING', widgetUrl: 'https://widget.test/s/kyc-1', createdAt: '2026-01-01T00:00:00.000Z' };

describe('POST /api/kyc/session', () => {
  it('answers 404 without a sender profile', async () => {
    const { auth } = await registerUser(app);
    const res = await request(app).post('/api/kyc/session').set(auth).send({ language: 'en' });
    expect(res.status).toBe(404);
    expect(upstream.calls).toHaveLength(0);
  });

  it('refuses a loopback redirect origin and points at APP_URL', async () => {
    const { auth } = await sender();
    const local = await request(app).post('/api/kyc/session').set(auth).set('Origin', 'http://localhost:3000').send({ language: 'en' });
    expect(local.status).toBe(400);
    expect(local.body.error.source).toBe('local');
    expect(local.body.error.message).toMatch(/APP_URL/);
    expect(local.body.error.message).toMatch(/http:\/\/localhost:3000/);

    const none = await request(app).post('/api/kyc/session').set(auth).send({ language: 'en' });
    expect(none.status).toBe(400);
    expect(none.body.error.message).toMatch(/\(empty\)/);
    expect(upstream.calls).toHaveLength(0);
  });

  it('creates the session with the caller’s origin as redirectUrl and stores it', async () => {
    const { auth, user, ext } = await sender();
    upstream.on('POST', `/v2/senders/${ext}/kycSession`, { status: 201, data: SESSION });
    const res = await request(app).post('/api/kyc/session').set(auth).set('Origin', 'http://lvh.me:3000/').send({ language: 'pt' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ sessionId: 'kyc-1', userId: user.id, status: 'PENDING', widgetUrl: SESSION.widgetUrl, createdAt: SESSION.createdAt, data: SESSION });
    expect(upstream.calls[0].body).toEqual({ language: 'pt', redirectUrl: 'http://lvh.me:3000/compliance?kyc=done' });
    expect(db.prepare('SELECT * FROM kyc_sessions WHERE sessionId = ?').get('kyc-1')).toMatchObject({ userId: user.id, status: 'PENDING' });
  });

  it('prefers APP_URL over the request origin and falls back to the Referer', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/v2/senders/${ext}/kycSession`, { status: 201, data: { ...SESSION, sessionId: 'kyc-2' } });
    process.env.APP_URL = 'https://app.example.com/';
    await request(app).post('/api/kyc/session').set(auth).set('Origin', 'http://localhost:3000').send({});
    expect(upstream.calls[0].body).toEqual({ language: 'en', redirectUrl: 'https://app.example.com/compliance?kyc=done' });

    process.env.APP_URL = '';
    upstream.reset();
    upstream.on('POST', `/v2/senders/${ext}/kycSession`, { status: 201, data: { ...SESSION, sessionId: 'kyc-3' } });
    await request(app).post('/api/kyc/session').set(auth).set('Referer', 'http://remittance.local:3000/compliance').send({});
    expect(upstream.calls[0].body.redirectUrl).toBe('http://remittance.local:3000/compliance?kyc=done');
  });

  it('forwards an upstream error', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/v2/senders/${ext}/kycSession`, { status: 422, data: { message: 'no verifiable document' } });
    const res = await request(app).post('/api/kyc/session').set(auth).set('Origin', 'http://lvh.me:3000').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('no verifiable document');
  });
});

describe('GET /api/kyc/session', () => {
  it('answers null when the user has no session', async () => {
    const { auth } = await sender();
    const res = await request(app).get('/api/kyc/session').set(auth);
    expect(res.status).toBe(200);
    expect(res.text).toBe('null');
  });

  it('returns the stored row with ?refresh=false without calling Inyo', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/v2/senders/${ext}/kycSession`, { status: 201, data: { ...SESSION, sessionId: 'kyc-r' } });
    await request(app).post('/api/kyc/session').set(auth).set('Origin', 'http://lvh.me:3000').send({});
    upstream.reset();
    const res = await request(app).get('/api/kyc/session?refresh=false').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sessionId: 'kyc-r', status: 'PENDING', data: { sessionId: 'kyc-r' } });
    expect(upstream.calls).toHaveLength(0);
  });

  it('re-reads the latest session from Inyo, keeping the sessionId and createdAt when the API omits them', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/v2/senders/${ext}/kycSession`, { status: 201, data: { ...SESSION, sessionId: 'kyc-g' } });
    await request(app).post('/api/kyc/session').set(auth).set('Origin', 'http://lvh.me:3000').send({});
    upstream.reset();
    upstream.on('GET', `/v2/senders/${ext}/kycSession/kyc-g`, { status: 200, data: { status: 'VERIFIED', result: { decision: 'approved' } } });
    const res = await request(app).get('/api/kyc/session').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sessionId: 'kyc-g', status: 'VERIFIED', createdAt: SESSION.createdAt, data: { status: 'VERIFIED', sessionId: 'kyc-g', result: { decision: 'approved' } } });
    expect(upstream.calls[0].url).toBe(`https://api.example.test/organizations/sample/v2/senders/${ext}/kycSession/kyc-g`);
    expect(db.prepare('SELECT status FROM kyc_sessions WHERE sessionId = ?').get('kyc-g').status).toBe('VERIFIED');
  });

  it('keeps the stored widgetUrl when the API omits it on refresh', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/v2/senders/${ext}/kycSession`, { status: 201, data: { ...SESSION, sessionId: 'kyc-w' } });
    await request(app).post('/api/kyc/session').set(auth).set('Origin', 'http://lvh.me:3000').send({});
    upstream.reset();
    upstream.on('GET', `/v2/senders/${ext}/kycSession/kyc-w`, { status: 200, data: { status: 'PENDING' } });
    const res = await request(app).get('/api/kyc/session').set(auth);
    expect(res.body.widgetUrl).toBe(SESSION.widgetUrl);
  });

  it('forwards an upstream failure', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/v2/senders/${ext}/kycSession`, { status: 201, data: { ...SESSION, sessionId: 'kyc-e' } });
    await request(app).post('/api/kyc/session').set(auth).set('Origin', 'http://lvh.me:3000').send({});
    upstream.reset();
    upstream.on('GET', `/v2/senders/${ext}/kycSession/kyc-e`, { status: 404, data: { message: 'gone' } });
    expect((await request(app).get('/api/kyc/session').set(auth)).status).toBe(404);
  });
});

describe('POST /api/kyc/session/:sessionId/resolve', () => {
  it('answers 404 for an unknown or foreign session', async () => {
    const { auth } = await sender();
    const other = await sender();
    db.prepare('INSERT INTO kyc_sessions (sessionId, userId, status, widgetUrl, createdAt, data) VALUES (?, ?, ?, ?, ?, ?)').run('kyc-theirs', other.user.id, 'PENDING_REVIEW', null, '2026-01-01', '{}');
    expect((await request(app).post('/api/kyc/session/nope/resolve').set(auth).send({})).status).toBe(404);
    expect((await request(app).post('/api/kyc/session/kyc-theirs/resolve').set(auth).send({})).status).toBe(404);
  });

  it('resolves the session, defaults the outcome to verified, caps the reason and invalidates the limits cache', async () => {
    const { auth, user, ext } = await sender();
    db.prepare('INSERT INTO kyc_sessions (sessionId, userId, status, widgetUrl, createdAt, data) VALUES (?, ?, ?, ?, ?, ?)').run('kyc-res', user.id, 'PENDING_REVIEW', null, '2026-01-01T00:00:00.000Z', '{}');
    upstream.on('GET', `/fx/participants/${ext}/limits`, { status: 200, data: { oneDayLimit: { limit: 1, used: 0 } } });
    await request(app).get('/api/limits').set(auth);

    upstream.on('POST', `/v2/senders/${ext}/kycSession/kyc-res/resolve`, { status: 200, data: { status: 'VERIFIED' } });
    const res = await request(app).post('/api/kyc/session/kyc-res/resolve').set(auth).send({ outcome: 'weird', reason: 'x'.repeat(300) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sessionId: 'kyc-res', status: 'VERIFIED', createdAt: '2026-01-01T00:00:00.000Z' });
    const call = upstream.callsTo('POST', `/v2/senders/${ext}/kycSession/kyc-res/resolve`)[0];
    expect(call.body.outcome).toBe('verified');
    expect(call.body.reason).toHaveLength(255);

    await request(app).get('/api/limits').set(auth);
    expect(upstream.callsTo('GET', `/fx/participants/${ext}/limits`)).toHaveLength(2);
  });

  it('sends rejected with the given reason and forwards a 409', async () => {
    const { auth, user, ext } = await sender();
    db.prepare('INSERT INTO kyc_sessions (sessionId, userId, status, widgetUrl, createdAt, data) VALUES (?, ?, ?, ?, ?, ?)').run('kyc-rej', user.id, 'PENDING', null, '2026-01-01', '{}');
    upstream.on('POST', `/v2/senders/${ext}/kycSession/kyc-rej/resolve`, { status: 409, data: { message: 'NOT_HELD', status: 'PENDING' } });
    const res = await request(app).post('/api/kyc/session/kyc-rej/resolve').set(auth).send({ outcome: 'rejected', reason: 'bad selfie' });
    expect(res.status).toBe(409);
    expect(upstream.calls[0].body).toEqual({ outcome: 'rejected', reason: 'bad selfie' });
    expect(res.body.error.body.status).toBe('PENDING');
  });
});
