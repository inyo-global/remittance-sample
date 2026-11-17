import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../server/config.ts';

const base = { NODE_ENV: 'test', EXTERNAL_API_URL: 'https://api.example.test', TENANT: 'sample', API_KEY: 'k', AGENT_ID: 'a', AGENT_KEY: 'ak' };

describe('loadConfig', () => {
  it('reads the Inyo settings and applies the defaults', () => {
    const cfg = loadConfig({ ...base });
    expect(cfg).toMatchObject({ port: 3001, isTest: true, dbPath: 'remittance.db', apiBaseUrl: 'https://api.example.test', tenant: 'sample', appUrl: '', mtls: null, webhook: null });
    expect(cfg.apiHeaders).toEqual({ 'x-api-key': 'k', 'x-agent-id': 'a', 'x-agent-api-key': 'ak', 'content-type': 'application/json' });
    expect(cfg.jwtSecret).toEqual(expect.any(String));
  });

  it('honours PORT, DB_PATH, JWT_SECRET and APP_URL', () => {
    const cfg = loadConfig({ ...base, PORT: '4000', DB_PATH: ':memory:', JWT_SECRET: 's', APP_URL: 'http://lvh.me:3000' });
    expect(cfg).toMatchObject({ port: 4000, dbPath: ':memory:', jwtSecret: 's', appUrl: 'http://lvh.me:3000' });
  });

  it('only enables mTLS when both the certificate and the key are present', () => {
    expect(loadConfig({ ...base, MTLS_CERT: 'c' }).mtls).toBeNull();
    expect(loadConfig({ ...base, MTLS_CERT: 'c', MTLS_KEY: 'k' }).mtls).toEqual({ cert: 'c', key: 'k' });
  });

  it('enables webhook Basic Auth when either credential is set', () => {
    expect(loadConfig({ ...base, WEBHOOK_BASIC_USER: 'u' }).webhook).toEqual({ user: 'u', pass: '' });
    expect(loadConfig({ ...base, WEBHOOK_BASIC_PASS: 'p' }).webhook).toEqual({ user: '', pass: 'p' });
  });
});
