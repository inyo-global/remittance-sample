import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, mockUpstream, registerUser, request, setProfile } from './helpers.js';

let app;
let db;
const upstream = mockUpstream();

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

beforeEach(() => upstream.reset());

const LIMITS = {
  oneDayLimit: { limit: { amount: 1000, currency: 'USD' }, used: { amount: 100, currency: 'USD' } },
  thirtyDaysLimit: { limit: { amount: 5000, currency: 'USD' }, used: { amount: 100, currency: 'USD' } },
  oneHundredAndEightyDaysLimit: { limit: { amount: 10000, currency: 'USD' }, used: { amount: 100, currency: 'USD' } },
};

describe('GET /api/limits', () => {
  it('answers zero limits without calling Inyo when the sender has no profile', async () => {
    const { auth } = await registerUser(app);
    const res = await request(app).get('/api/limits').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      oneDayLimit: { limit: 0, used: 0 },
      thirtyDaysLimit: { limit: 0, used: 0 },
      oneHundredAndEightyDaysLimit: { limit: 0, used: 0 },
    });
    expect(upstream.calls).toHaveLength(0);
  });

  it('reads the limits from Inyo and caches them per user', async () => {
    const { auth, user } = await registerUser(app);
    const ext = setProfile(db, user.id);
    upstream.on('GET', `/fx/participants/${ext}/limits`, { status: 200, data: LIMITS });

    const first = await request(app).get('/api/limits').set(auth);
    expect(first.status).toBe(200);
    expect(first.body).toEqual(LIMITS);
    const call = upstream.calls[0];
    expect(call.headers['x-api-key']).toBe('test-api-key');
    expect(call.headers['x-agent-id']).toBe('test-agent');

    const second = await request(app).get('/api/limits').set(auth);
    expect(second.body).toEqual(LIMITS);
    expect(upstream.calls).toHaveLength(1);

    // another user is not served from the first user's cache
    const other = await registerUser(app);
    const otherExt = setProfile(db, other.user.id);
    upstream.on('GET', `/fx/participants/${otherExt}/limits`, { status: 200, data: { oneDayLimit: { limit: 1, used: 0 } } });
    const third = await request(app).get('/api/limits').set(other.auth);
    expect(third.body.oneDayLimit.limit).toBe(1);
    expect(upstream.calls).toHaveLength(2);
  });
});

describe('upstream error mapping (upstreamError / describeUpstream)', () => {
  const callWith = async (reply) => {
    const { auth, user } = await registerUser(app);
    const ext = setProfile(db, user.id);
    upstream.on('GET', `/fx/participants/${ext}/limits`, reply);
    return request(app).get('/api/limits').set(auth);
  };

  it('forwards a 401 with the api-key hint and the cf-ray id', async () => {
    const res = await callWith({ status: 401, data: { message: 'Unauthorized' }, headers: { 'cf-ray': 'ray-123' } });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ source: 'inyo', status: 401, method: 'GET', message: 'Unauthorized', cfRay: 'ray-123' });
    expect(res.body.error.path).toMatch(/\/fx\/participants\/.+\/limits$/);
    expect(res.body.error.hint).toMatch(/x-api-key/);
  });

  it('distinguishes a JSON 403 (tenant/agent) from an HTML 403 (Cloudflare Access)', async () => {
    const json = await callWith({ status: 403, data: { message: 'Forbidden' } });
    expect(json.status).toBe(403);
    expect(json.body.error.hint).toMatch(/TENANT/);

    const html = await callWith({ status: 403, data: '<!doctype html><html><head><title>Access denied</title></head><body>blocked</body></html>' });
    expect(html.status).toBe(403);
    expect(html.body.error.hint).toMatch(/Cloudflare Access/);
    expect(html.body.error.body).toBe('Access denied');
    expect(html.body.error.message).toBe('Access denied');
  });

  it('explains a 404 route miss differently from a missing resource', async () => {
    const route = await callWith({ status: 404, data: { detail: 'Not Found' } });
    expect(route.status).toBe(404);
    expect(route.body.error.hint).toMatch(/Route not found/);
    expect(route.body.error.hint).toMatch(/"sample"/);

    const resource = await callWith({ status: 404, data: { message: 'participant not found' } });
    expect(resource.body.error.hint).toMatch(/Resource not found/);
  });

  it('points 400/422 at the validation body and 429 at Retry-After', async () => {
    const invalid = await callWith({ status: 422, data: { message: 'invalid', errors: [{ fieldName: 'x', error: 'bad' }] } });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.hint).toMatch(/Validation error/);
    expect(invalid.body.error.body).toEqual({ message: 'invalid', errors: [{ fieldName: 'x', error: 'bad' }] });

    const limited = await callWith({ status: 429, data: { message: 'slow down' }, headers: { 'retry-after': '30' } });
    expect(limited.status).toBe(429);
    expect(limited.body.error.hint).toMatch(/Rate limited/);
    expect(limited.body.error.hint).toMatch(/30s/);
  });

  it('answers 502 for an upstream 5xx with a retry hint', async () => {
    const res = await callWith({ status: 503, data: 'upstream unavailable' });
    expect(res.status).toBe(502);
    expect(res.body.error.status).toBe(503);
    expect(res.body.error.body).toBe('upstream unavailable');
    expect(res.body.error.hint).toMatch(/server error/);
  });

  it('answers 502 with a TLS hint when the socket is reset and a no-response hint otherwise', async () => {
    const { auth, user } = await registerUser(app);
    const ext = setProfile(db, user.id);
    upstream.down('GET', `/fx/participants/${ext}/limits`, 'ECONNRESET', 'socket hang up');
    const tls = await request(app).get('/api/limits').set(auth);
    expect(tls.status).toBe(502);
    expect(tls.body.error).toMatchObject({ source: 'inyo', status: null, message: 'socket hang up' });
    expect(tls.body.error.hint).toMatch(/TLS handshake failed/);

    const other = await registerUser(app);
    const otherExt = setProfile(db, other.user.id);
    upstream.down('GET', `/fx/participants/${otherExt}/limits`, 'ECONNREFUSED', 'connect ECONNREFUSED');
    const down = await request(app).get('/api/limits').set(other.auth);
    expect(down.status).toBe(502);
    expect(down.body.error.hint).toMatch(/No response from https:\/\/api\.example\.test/);
    expect(down.body.error.hint).toMatch(/ECONNREFUSED/);
  });
});
