import { createRequire } from 'module';
import request from 'supertest';
import { vi } from 'vitest';

// AxiosError is only needed to build realistic failures; any axios build works for that.
const require = createRequire(import.meta.url);
export const axios = require('axios');

export const API_BASE = 'https://api.example.test/organizations/sample';

// The adapter of the most recent mockUpstream(); createApp() receives it through loadApp().
let currentAdapter = null;

/**
 * In-process stand-in for the Inyo API. Register handlers with `on(method, path | RegExp, reply)`;
 * `reply` receives the axios config and returns `{ status, data, headers }` (or throws). Unmatched
 * calls fail the test with an explicit message.
 */
export function mockUpstream() {
  const routes = [];
  const calls = [];
  const adapter = vi.fn(async (config) => {
    const method = String(config.method || 'get').toUpperCase();
    const url = config.url || '';
    let body = config.data;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* raw */ } }
    const call = { method, url, path: url.replace(API_BASE, ''), body, headers: config.headers, config };
    calls.push(call);
    const route = routes.find((r) => r.method === method && (r.path instanceof RegExp ? r.path.test(call.path) : r.path === call.path || r.path === url));
    if (!route) {
      const err = new axios.AxiosError(`No upstream mock for ${method} ${url}`, 'ECONNREFUSED', config);
      throw err;
    }
    const result = await route.reply(call);
    const status = result?.status ?? 200;
    const response = { status, statusText: String(status), data: result?.data, headers: result?.headers || {}, config, request: {} };
    if (status >= 400) {
      throw new axios.AxiosError(`Request failed with status code ${status}`, status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST', config, {}, response);
    }
    return response;
  });
  currentAdapter = adapter;
  return {
    calls,
    adapter,
    on(method, path, reply) {
      routes.push({ method: method.toUpperCase(), path, reply: typeof reply === 'function' ? reply : () => reply });
      return this;
    },
    /** Simulates no answer at all (network / TLS failure). */
    down(method, path, code = 'ECONNRESET', message = 'socket hang up') {
      routes.push({ method: method.toUpperCase(), path, reply: ({ config }) => { throw new axios.AxiosError(message, code, config); } });
      return this;
    },
    reset() { routes.length = 0; calls.length = 0; },
    callsTo(method, path) {
      return calls.filter((c) => c.method === method.toUpperCase() && (path instanceof RegExp ? path.test(c.path) : c.path === path));
    },
  };
}

/** A fresh BFF with its own in-memory database and this file's upstream mock (see setup.js for the env). */
export async function loadApp() {
  const { createApp } = await import('../../server/app.ts');
  const { app, ctx } = createApp({ adapter: currentAdapter ?? undefined });
  return { app, db: ctx.db, ctx };
}

let counter = 0;
export const USER = {
  email: 'jane@example.com', password: 'secret123', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-05-01',
  address: '4429 CANDLEWOOD ST', city: 'LAKEWOOD', state: 'CA', zipcode: '90712',
};

/** Registers a user through the API and returns `{ token, user, auth }` (auth = Authorization header). */
export async function registerUser(app, overrides = {}) {
  counter += 1;
  const payload = { ...USER, email: `user${counter}@example.com`, ...overrides };
  const res = await request(app).post('/api/register').send(payload);
  if (res.status !== 200) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, auth: { Authorization: `Bearer ${res.body.token}` } };
}

/** Marks the user as a sender known to Inyo (profiles.externalId), which most routes require. */
export function setProfile(db, userId, externalId = `sender-${userId.slice(0, 8)}`, extra = {}) {
  db.prepare(
    'INSERT OR REPLACE INTO profiles (userId, gender, occupation, docType, docNumber, issuingCountry, expirationDate, externalId, data, ssn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(userId, extra.gender || 'male', extra.occupation || 'engineer', extra.docType || 'passport', extra.docNumber || '999000001', extra.issuingCountry || 'US', extra.expirationDate || '2030-01-01', externalId, JSON.stringify(extra.data || {}), extra.ssn || null);
  return externalId;
}

export { request };
