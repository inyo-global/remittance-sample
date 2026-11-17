import { describe, expect, it, vi } from 'vitest';
import { createInyoClient } from '../../../server/inyo/client.ts';
import { loadConfig } from '../../../server/config.ts';
import { axios } from '../helpers.js';

const config = loadConfig({ NODE_ENV: 'test', EXTERNAL_API_URL: 'https://api.example.test', TENANT: 'sample', API_KEY: 'k', AGENT_ID: 'a', AGENT_KEY: 'ak' });
const silent = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), http: vi.fn() };
const client = createInyoClient(config, silent);

const errorWith = (status, data, headers = {}, cfg = { method: 'get', url: `${client.url('/x')}` }) =>
  new axios.AxiosError('failed', status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST', cfg, {}, { status, data, headers, config: cfg });

describe('createInyoClient', () => {
  it('builds tenant URLs and exposes the agent headers', () => {
    expect(client.url('/payout/quotes')).toBe('https://api.example.test/organizations/sample/payout/quotes');
    expect(client.headers['x-api-key']).toBe('k');
    expect(client.mtlsConfigured).toBe(false);
  });

  it('reports mTLS as configured when the certificate pair is present', () => {
    const withMtls = createInyoClient({ ...config, mtls: { cert: 'c', key: 'k' } }, silent);
    expect(withMtls.mtlsConfigured).toBe(true);
  });

  it('uses the adapter it is given', async () => {
    const adapter = vi.fn(async (cfg) => ({ status: 200, statusText: 'OK', data: { ok: true }, headers: {}, config: cfg }));
    const c = createInyoClient(config, silent, { adapter });
    const res = await c.http.get(c.url('/ping'));
    expect(res.data).toEqual({ ok: true });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(silent.http).toHaveBeenCalledWith(expect.stringMatching(/^→ GET/), '');
  });
});

describe('describeUpstream', () => {
  it('explains a Cloudflare HTML 403 as an IP allowlist problem', () => {
    const info = client.describeUpstream(errorWith(403, '<!doctype html><html><head><title>Access denied</title></head></html>', { 'cf-ray': 'ray-9' }));
    expect(info).toMatchObject({ source: 'inyo', status: 403, method: 'GET', path: '/organizations/sample/x', body: 'Access denied', cfRay: 'ray-9' });
    expect(info.hint).toMatch(/allowlist/);
  });

  it('maps the common statuses to the troubleshooting hints', () => {
    expect(client.describeUpstream(errorWith(401, {})).hint).toMatch(/x-api-key/);
    expect(client.describeUpstream(errorWith(403, {})).hint).toMatch(/TENANT/);
    expect(client.describeUpstream(errorWith(404, { detail: 'Not Found' })).hint).toMatch(/Route not found/);
    expect(client.describeUpstream(errorWith(404, {})).hint).toMatch(/another tenant/);
    expect(client.describeUpstream(errorWith(422, {})).hint).toMatch(/Validation/);
    expect(client.describeUpstream(errorWith(429, {}, { 'retry-after': '7' })).hint).toMatch(/Retry-After: 7s/);
    expect(client.describeUpstream(errorWith(503, {})).hint).toMatch(/server error/);
  });

  it('distinguishes TLS failures from no response at all', () => {
    const cfg = { method: 'post', url: client.url('/y') };
    expect(client.describeUpstream(new axios.AxiosError('socket hang up', 'ECONNRESET', cfg)).hint).toMatch(/TLS handshake/);
    const down = client.describeUpstream(new axios.AxiosError('getaddrinfo ENOTFOUND', 'ENOTFOUND', cfg));
    expect(down).toMatchObject({ status: null, method: 'POST', path: '/organizations/sample/y' });
    expect(down.hint).toMatch(/No response from https:\/\/api\.example\.test \(ENOTFOUND\)/);
  });

  it('picks the message from the body and truncates long text bodies', () => {
    expect(client.describeUpstream(errorWith(400, { message: 'bad input' })).message).toBe('bad input');
    expect(client.describeUpstream(errorWith(400, { error: 'oops' })).message).toBe('oops');
    const long = client.describeUpstream(errorWith(500, 'x'.repeat(600)));
    expect(long.body).toHaveLength(500);
  });
});
