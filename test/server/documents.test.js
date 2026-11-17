import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, mockUpstream, registerUser, request, setProfile } from './helpers.js';

let app;
let db;
const upstream = mockUpstream();

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

beforeEach(() => upstream.reset());

const sender = async () => {
  const u = await registerUser(app);
  const ext = setProfile(db, u.user.id);
  return { ...u, ext };
};

const contentTypeOf = (call) => String(call.headers?.['content-type'] ?? call.config.headers?.get?.('content-type') ?? '');

describe('POST /api/documents/source-of-funds', () => {
  it('answers 404 without a profile', async () => {
    const { auth } = await registerUser(app);
    const res = await request(app).post('/api/documents/source-of-funds').set(auth).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF-1.4'));
    expect(res.status).toBe(404);
  });

  it('rejects unsupported types, empty bodies and files over 10 MB', async () => {
    const { auth } = await sender();
    const wrongType = await request(app).post('/api/documents/source-of-funds').set(auth).set('Content-Type', 'text/plain').send('hello');
    expect(wrongType.status).toBe(415);
    expect(wrongType.body.error.message).toMatch(/text\/plain/);

    const empty = await request(app).post('/api/documents/source-of-funds').set(auth).set('Content-Type', 'image/png').send();
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toBe('Empty upload.');

    const big = await request(app).post('/api/documents/source-of-funds').set(auth).set('Content-Type', 'image/jpeg').send(Buffer.alloc(10 * 1024 * 1024 + 1));
    expect(big.status).toBe(413);
    expect(big.body.error.message).toMatch(/10 MB/);
    expect(upstream.calls).toHaveLength(0);
  });

  it('re-wraps the bytes as multipart for Inyo with a sanitised file name', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/people/${ext}/documents/sourceOfFunds/upload`, { status: 201, data: { id: 'doc-1', type: 'PROOF_OF_FUNDS', verificationStatus: 'PENDING' } });
    const res = await request(app).post('/api/documents/source-of-funds').set(auth).set('Content-Type', 'application/pdf').set('X-File-Name', 'my statement (1).pdf').send(Buffer.from('%PDF-1.4 statement'));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'doc-1', type: 'PROOF_OF_FUNDS', verificationStatus: 'PENDING' });

    const call = upstream.calls[0];
    expect(call.config.data).toBeInstanceOf(FormData);
    expect(contentTypeOf(call)).not.toBe('application/json');
    expect(call.headers['x-api-key']).toBe('test-api-key');
    const file = call.config.data.get('file');
    expect(file.name).toBe('my_statement_1_.pdf');
    expect(file.type).toBe('application/pdf');
    expect(await file.text()).toBe('%PDF-1.4 statement');
  });

  it('defaults the file name from the content type and forwards upstream errors', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/people/${ext}/documents/sourceOfFunds/upload`, { status: 400, data: { message: 'unreadable' } });
    const res = await request(app).post('/api/documents/source-of-funds').set(auth).set('Content-Type', 'image/png').send(Buffer.from('png-bytes'));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('unreadable');
    expect(upstream.calls[0].config.data.get('file').name).toBe('source-of-funds.png');
  });
});

describe('GET /api/documents', () => {
  it('answers an empty list without a profile, and unwraps either shape from Inyo', async () => {
    const { auth: noProfile } = await registerUser(app);
    expect((await request(app).get('/api/documents').set(noProfile)).body).toEqual([]);
    expect(upstream.calls).toHaveLength(0);

    const a = await sender();
    upstream.on('GET', `/people/${a.ext}/documents`, { status: 200, data: [{ id: 'd1' }] });
    expect((await request(app).get('/api/documents').set(a.auth)).body).toEqual([{ id: 'd1' }]);

    const b = await sender();
    upstream.on('GET', `/people/${b.ext}/documents`, { status: 200, data: { documents: [{ id: 'd2' }] } });
    expect((await request(app).get('/api/documents').set(b.auth)).body).toEqual([{ id: 'd2' }]);

    const c = await sender();
    upstream.on('GET', `/people/${c.ext}/documents`, { status: 200, data: { other: true } });
    expect((await request(app).get('/api/documents').set(c.auth)).body).toEqual([]);
  });

  it('forwards an upstream failure', async () => {
    const { auth, ext } = await sender();
    upstream.on('GET', `/people/${ext}/documents`, { status: 500, data: 'oops' });
    expect((await request(app).get('/api/documents').set(auth)).status).toBe(502);
  });
});

describe('GET /api/documents/:id/status', () => {
  it('passes the verification history through', async () => {
    const { auth } = await sender();
    const history = [{ status: 'verified', reason: 'ok', verifiedBy: 'sandbox', createdAt: '2026-01-01' }];
    upstream.on('GET', '/documents/doc-9/verificationStatus', { status: 200, data: history });
    const res = await request(app).get('/api/documents/doc-9/status').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(history);
  });
});

describe('POST /api/documents/:id/resolve', () => {
  it('answers 404 without a profile', async () => {
    const { auth } = await registerUser(app);
    expect((await request(app).post('/api/documents/doc-1/resolve').set(auth).send({ outcome: 'verified' })).status).toBe(404);
  });

  it('resolves the document with the outcome and reason and invalidates the limits cache', async () => {
    const { auth, ext } = await sender();
    upstream.on('GET', `/fx/participants/${ext}/limits`, { status: 200, data: { oneDayLimit: { limit: 1, used: 0 } } });
    await request(app).get('/api/limits').set(auth);
    upstream.on('POST', `/v2/senders/${ext}/documents/doc-1/resolve`, { status: 200, data: { status: 'rejected', reason: 'blurry', verifiedBy: 'sandbox' } });

    const res = await request(app).post('/api/documents/doc-1/resolve').set(auth).send({ outcome: 'rejected', reason: 'blurry' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'rejected', reason: 'blurry', verifiedBy: 'sandbox' });
    expect(upstream.callsTo('POST', `/v2/senders/${ext}/documents/doc-1/resolve`)[0].body).toEqual({ outcome: 'rejected', reason: 'blurry' });

    await request(app).get('/api/limits').set(auth);
    expect(upstream.callsTo('GET', `/fx/participants/${ext}/limits`)).toHaveLength(2);
  });

  it('defaults to verified with the walkthrough reason', async () => {
    const { auth, ext } = await sender();
    upstream.on('POST', `/v2/senders/${ext}/documents/doc-2/resolve`, { status: 200, data: { status: 'verified' } });
    await request(app).post('/api/documents/doc-2/resolve').set(auth).send({});
    expect(upstream.calls[0].body).toEqual({ outcome: 'verified', reason: 'Cleared for the integration walkthrough' });
  });
});
