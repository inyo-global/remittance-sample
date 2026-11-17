import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, mockUpstream, registerUser, request, setProfile } from './helpers.js';

let app;
let db;
const upstream = mockUpstream();

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

beforeEach(() => upstream.reset());

let seq = 0;
/** A sender with a beneficiary, a recipient account, a funding account and a quote, all known to Inyo. */
const seed = async () => {
  seq += 1;
  const u = await registerUser(app);
  const ext = setProfile(db, u.user.id, `sender-${seq}`);
  const ids = { beneficiaryId: `ben-${seq}`, accountId: `acct-${seq}`, paymentMethodId: `pm-${seq}`, quoteLocalId: `ql-${seq}`, quoteId: `q-${seq}` };
  db.prepare('INSERT INTO beneficiaries VALUES (?, ?, ?, ?, ?)').run(ids.beneficiaryId, u.user.id, 'Maria', `recipient-${seq}`, '{}');
  db.prepare('INSERT INTO beneficiary_accounts VALUES (?, ?, ?, ?)').run(ids.accountId, ids.beneficiaryId, `racct-${seq}`, '{}');
  db.prepare('INSERT INTO payment_methods (id, userId, token, data, type, externalId) VALUES (?, ?, ?, ?, ?, ?)').run(ids.paymentMethodId, u.user.id, '{}', '{}', 'CARD', `fa-${seq}`);
  db.prepare('INSERT INTO quotes VALUES (?, ?, ?, ?, ?, ?, ?)').run(ids.quoteLocalId, u.user.id, ids.quoteId, 'USD', 'BRL', 100, '{}');
  return { ...u, ext, ids, seq };
};

const insertTransaction = (id, userId, externalId, { status = 'Pending', createdAt = '2026-01-01T00:00:00.000Z', data = {} } = {}) => {
  db.prepare('INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, userId, externalId, status, 104, 'USD', 'Maria', createdAt, JSON.stringify({ id: externalId, payoutStatus: status, ...data }));
};

const CREATED = { id: 'tx-ext', complianceStatus: 'Pending', payoutStatus: 'Pending', totalAmount: { amount: 104, currency: 'USD' }, fee: { amount: 4, currency: 'USD' }, receivingAmount: { amount: 500, currency: 'BRL' }, recipient: { name: 'Maria Silva' } };

describe('POST /api/transactions', () => {
  it('lists the missing references as a local error without calling Inyo', async () => {
    const { auth } = await seed();
    const res = await request(app).post('/api/transactions').set(auth).send({ beneficiaryId: 'x', accountId: 'y', paymentMethodId: 'z', quoteId: 'w' });
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ source: 'local', message: 'Missing required references: Beneficiary, Account, Payment Method, Quote' });
    expect(upstream.calls).toHaveLength(0);
  });

  it('names the profile when the sender was never created', async () => {
    const { auth } = await registerUser(app);
    const res = await request(app).post('/api/transactions').set(auth).send({});
    expect(res.body.error.message).toMatch(/^Missing required references: User Profile/);
  });

  it('refuses references that belong to another user', async () => {
    const mine = await seed();
    const theirs = await seed();
    const res = await request(app).post('/api/transactions').set(mine.auth).send({ ...theirs.ids, quoteId: theirs.ids.quoteId });
    expect(res.status).toBe(500);
    expect(res.body.error.message).toMatch(/Beneficiary, Payment Method, Quote/);
  });

  it('creates the transaction with the resolved Inyo ids and stores the row', async () => {
    const { auth, user, ext, ids, seq: n } = await seed();
    upstream.on('POST', '/fx/transactions', { status: 201, data: CREATED });

    const res = await request(app).post('/api/transactions').set(auth).set('X-Forwarded-For', '203.0.113.5, 10.0.0.1').send({ beneficiaryId: ids.beneficiaryId, accountId: ids.accountId, paymentMethodId: ids.paymentMethodId, quoteId: ids.quoteId });
    expect(res.status).toBe(200);
    // The Inyo transaction is spread last, so `id` in the response is Inyo's id (the receipt page
    // matches local rows by externalId for that reason); the local id is the row's primary key.
    expect(res.body).toMatchObject({ id: 'tx-ext', externalId: 'tx-ext', payoutStatus: 'Pending', totalAmount: { amount: 104, currency: 'USD' }, recipient: { name: 'Maria Silva' } });
    const row = db.prepare('SELECT * FROM transactions WHERE externalId = ?').get('tx-ext');
    expect(row).toBeDefined();

    expect(upstream.calls[0].body).toEqual({
      externalId: row.id,
      senderId: ext,
      recipientId: `recipient-${n}`,
      fundingAccountId: `fa-${n}`,
      recipientAccountId: `racct-${n}`,
      quoteId: ids.quoteId,
      deviceData: { userIpAddress: '203.0.113.5' },
    });

    expect(row).toMatchObject({ userId: user.id, externalId: 'tx-ext', status: 'Pending', amount: 104, currency: 'USD', recipientName: 'Maria Silva' });
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.parse(row.data)).toEqual(CREATED);
  });

  it('accepts the local quote id, falls back to the socket address for the IP and invalidates the limits cache', async () => {
    const { auth, ext, ids } = await seed();
    upstream.on('GET', `/fx/participants/${ext}/limits`, { status: 200, data: { oneDayLimit: { limit: 1, used: 0 } } });
    await request(app).get('/api/limits').set(auth);
    await request(app).get('/api/limits').set(auth);
    expect(upstream.callsTo('GET', `/fx/participants/${ext}/limits`)).toHaveLength(1);

    upstream.on('POST', '/fx/transactions', { status: 202, data: { ...CREATED, status: { payoutStatus: 'Processing' }, payoutStatus: undefined } });
    const res = await request(app).post('/api/transactions').set(auth).send({ beneficiaryId: ids.beneficiaryId, accountId: ids.accountId, paymentMethodId: ids.paymentMethodId, quoteId: ids.quoteLocalId });
    expect(res.status).toBe(200);
    const call = upstream.callsTo('POST', '/fx/transactions')[0];
    expect(call.body.quoteId).toBe(ids.quoteId);
    expect(call.body.deviceData.userIpAddress).toBe('127.0.0.1');
    expect(db.prepare('SELECT status FROM transactions WHERE id = ?').get(call.body.externalId).status).toBe('Processing');

    await request(app).get('/api/limits').set(auth);
    expect(upstream.callsTo('GET', `/fx/participants/${ext}/limits`)).toHaveLength(2);
  });

  it('forwards an Inyo rejection and stores nothing', async () => {
    const { auth, user, ids } = await seed();
    upstream.on('POST', '/fx/transactions', { status: 422, data: { message: 'Funding account is not verified' } });
    const res = await request(app).post('/api/transactions').set(auth).send({ beneficiaryId: ids.beneficiaryId, accountId: ids.accountId, paymentMethodId: ids.paymentMethodId, quoteId: ids.quoteId });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Funding account is not verified');
    expect(db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE userId = ?').get(user.id).n).toBe(0);
  });
});

describe('GET /api/transactions', () => {
  it('lists the caller’s transactions newest first with parsed data', async () => {
    const { auth, user } = await registerUser(app);
    const other = await registerUser(app);
    insertTransaction('t-old', user.id, 'ext-old', { createdAt: '2026-01-01T00:00:00.000Z' });
    insertTransaction('t-new', user.id, 'ext-new', { createdAt: '2026-02-01T00:00:00.000Z', status: 'Completed' });
    insertTransaction('t-other', other.user.id, 'ext-other');
    const res = await request(app).get('/api/transactions').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.id)).toEqual(['t-new', 't-old']);
    expect(res.body[0].data).toEqual({ id: 'ext-new', payoutStatus: 'Completed' });
    expect(res.body[0]).toMatchObject({ status: 'Completed', amount: 104, currency: 'USD', recipientName: 'Maria' });
  });
});

describe('GET /api/transactions/:id/sync', () => {
  it('answers 404 for an unknown or foreign transaction', async () => {
    const { auth } = await registerUser(app);
    const other = await registerUser(app);
    insertTransaction('t-foreign', other.user.id, 'ext-foreign');
    expect((await request(app).get('/api/transactions/nope/sync').set(auth)).status).toBe(404);
    expect((await request(app).get('/api/transactions/t-foreign/sync').set(auth)).status).toBe(404);
  });

  it('merges the fresh copy from Inyo and updates the stored status', async () => {
    const { auth, user } = await registerUser(app);
    insertTransaction('t-sync', user.id, 'ext-sync', { data: { receipt: { license: 'L-1' } } });
    upstream.on('GET', '/fx/transactions/ext-sync', { status: 200, data: { id: 'ext-sync', payoutStatus: 'Completed', complianceStatus: 'Approved' } });
    const res = await request(app).get('/api/transactions/t-sync/sync').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 't-sync', externalId: 'ext-sync', status: 'Completed', data: { payoutStatus: 'Completed', complianceStatus: 'Approved', receipt: { license: 'L-1' } } });
    expect(db.prepare('SELECT status FROM transactions WHERE id = ?').get('t-sync').status).toBe('Completed');
  });

  it('reads the status from the nested status object when the flat one is absent', async () => {
    const { auth, user } = await registerUser(app);
    insertTransaction('t-nested', user.id, 'ext-nested');
    upstream.on('GET', '/fx/transactions/ext-nested', { status: 200, data: { id: 'ext-nested', payoutStatus: null, status: { payoutStatus: 'Processing', complianceStatus: 'Pending' } } });
    const res = await request(app).get('/api/transactions/t-nested/sync').set(auth);
    expect(res.body.status).toBe('Processing');
  });

  it('forwards an upstream failure', async () => {
    const { auth, user } = await registerUser(app);
    insertTransaction('t-err', user.id, 'ext-err');
    upstream.on('GET', '/fx/transactions/ext-err', { status: 500, data: 'oops' });
    expect((await request(app).get('/api/transactions/t-err/sync').set(auth)).status).toBe(502);
  });
});

describe('GET /api/transactions/:id/status', () => {
  it('returns the history array, or the .history field, most recent first as Inyo sends it', async () => {
    const { auth, user } = await registerUser(app);
    insertTransaction('t-h1', user.id, 'ext-h1');
    insertTransaction('t-h2', user.id, 'ext-h2');
    const rows = [{ id: 2, payoutStatus: 'Processing', complianceStatus: 'Approved' }, { id: 1, payoutStatus: 'Pending', complianceStatus: 'Pending' }];
    upstream.on('GET', '/fx/transactions/ext-h1/status', { status: 200, data: rows });
    upstream.on('GET', '/fx/transactions/ext-h2/status', { status: 200, data: { history: rows } });
    expect((await request(app).get('/api/transactions/t-h1/status').set(auth)).body).toEqual(rows);
    expect((await request(app).get('/api/transactions/t-h2/status').set(auth)).body).toEqual(rows);
    expect((await request(app).get('/api/transactions/nope/status').set(auth)).status).toBe(404);
  });

  it('returns an empty list for an unknown body shape', async () => {
    const { auth, user } = await registerUser(app);
    insertTransaction('t-h3', user.id, 'ext-h3');
    upstream.on('GET', '/fx/transactions/ext-h3/status', { status: 200, data: { something: 1 } });
    expect((await request(app).get('/api/transactions/t-h3/status').set(auth)).body).toEqual([]);
  });
});

describe('POST /api/transactions/:id/cancel', () => {
  it('PUTs the cancel, re-reads the transaction and returns the accepted status', async () => {
    const { auth, user } = await registerUser(app);
    insertTransaction('t-cancel', user.id, 'ext-cancel');
    upstream.on('PUT', '/fx/transactions/ext-cancel/status/cancel', { status: 204 });
    upstream.on('GET', '/fx/transactions/ext-cancel', { status: 200, data: { id: 'ext-cancel', payoutStatus: 'Cancelled' } });
    const res = await request(app).post('/api/transactions/t-cancel/cancel').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, accepted: 204, id: 't-cancel', status: 'Cancelled', data: { payoutStatus: 'Cancelled' } });
    expect(upstream.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['PUT /fx/transactions/ext-cancel/status/cancel', 'GET /fx/transactions/ext-cancel']);
    expect(db.prepare('SELECT status FROM transactions WHERE id = ?').get('t-cancel').status).toBe('Cancelled');
  });

  it('still succeeds when the re-read fails', async () => {
    const { auth, user } = await registerUser(app);
    insertTransaction('t-cancel2', user.id, 'ext-cancel2');
    upstream.on('PUT', '/fx/transactions/ext-cancel2/status/cancel', { status: 204 });
    upstream.on('GET', '/fx/transactions/ext-cancel2', { status: 500, data: 'oops' });
    const res = await request(app).post('/api/transactions/t-cancel2/cancel').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Pending');
  });

  it('forwards a 422 when the transaction is no longer reversible and 404 when unknown', async () => {
    const { auth, user } = await registerUser(app);
    insertTransaction('t-done', user.id, 'ext-done', { status: 'Completed' });
    upstream.on('PUT', '/fx/transactions/ext-done/status/cancel', { status: 422, data: { message: 'not reversible' } });
    const res = await request(app).post('/api/transactions/t-done/cancel').set(auth);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('not reversible');
    expect((await request(app).post('/api/transactions/nope/cancel').set(auth)).status).toBe(404);
  });
});
