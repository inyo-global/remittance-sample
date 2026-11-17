import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, mockUpstream, request } from './helpers.js';

let app;
const upstream = mockUpstream();

beforeAll(async () => {
  ({ app } = await loadApp());
});

beforeEach(() => upstream.reset());

describe('GET /api/debug/mtls', () => {
  it('answers 500 when no client certificate is configured', async () => {
    const res = await request(app).get('/api/debug/mtls');
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

describe('GET /api/debug/upstream', () => {
  it('reports each credential check with the real status or the troubleshooting hint', async () => {
    upstream.on('GET', '/payout/us/destinations', { status: 200, data: { countryDestinations: [{ country: 'BR' }] }, headers: { 'cf-ray': 'ray-1' } });
    upstream.on('GET', '/payout/recipients/schema/br', { status: 403, data: { message: 'Forbidden' } });

    const res = await request(app).get('/api/debug/upstream');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      baseUrl: 'https://api.example.test',
      tenant: 'sample',
      headersSent: { 'x-api-key': true, 'x-agent-id': 'test-agent', 'x-agent-api-key': true },
      mtls: false,
    });
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0]).toMatchObject({ name: 'destinations (agent keys)', ok: true, status: 200, cfRay: 'ray-1' });
    expect(res.body.results[0].sample).toContain('countryDestinations');
    expect(res.body.results[1]).toMatchObject({ name: 'recipient schema BR (agent keys)', ok: false, source: 'inyo', status: 403, method: 'GET', path: '/organizations/sample/payout/recipients/schema/br' });
    expect(res.body.results[1].hint).toMatch(/TENANT/);
    expect(upstream.calls[0].config.timeout).toBe(15000);
  });

  it('describes a connection failure without blowing up', async () => {
    upstream.down('GET', '/payout/us/destinations', 'ECONNRESET', 'socket hang up');
    upstream.down('GET', '/payout/recipients/schema/br', 'ENOTFOUND', 'getaddrinfo ENOTFOUND api.example.test');
    const res = await request(app).get('/api/debug/upstream');
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ ok: false, status: null });
    expect(res.body.results[0].hint).toMatch(/TLS handshake/);
    expect(res.body.results[1].hint).toMatch(/No response from https:\/\/api\.example\.test \(ENOTFOUND\)/);
  });
});
