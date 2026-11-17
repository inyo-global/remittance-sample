import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApp, mockUpstream, registerUser, request } from './helpers.js';

let app;
let db;
const upstream = mockUpstream();
let auth;

beforeAll(async () => {
  ({ app, db } = await loadApp());
  ({ auth } = await registerUser(app));
});

beforeEach(() => upstream.reset());
afterEach(() => vi.useRealTimers());

const DESTINATIONS = { countryDestinations: [{ country: 'BR', countryName: 'Brazil', currency: 'BRL' }] };

describe('GET /api/destinations', () => {
  it('fetches from Inyo once and serves the cached copy for a day', async () => {
    upstream.on('GET', '/payout/us/destinations', { status: 200, data: DESTINATIONS });
    const first = await request(app).get('/api/destinations').set(auth);
    expect(first.status).toBe(200);
    expect(first.body).toEqual(DESTINATIONS);

    const second = await request(app).get('/api/destinations').set(auth);
    expect(second.body).toEqual(DESTINATIONS);
    expect(upstream.calls).toHaveLength(1);

    // 25 hours later the cache is stale and Inyo is asked again (the JWT also expires by then, so log in anew)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    const later = await registerUser(app);
    upstream.reset();
    upstream.on('GET', '/payout/us/destinations', { status: 200, data: { countryDestinations: [] } });
    const third = await request(app).get('/api/destinations').set(later.auth);
    expect(third.body).toEqual({ countryDestinations: [] });
    expect(upstream.calls).toHaveLength(1);
  });

  it('requires a token', async () => {
    expect((await request(app).get('/api/destinations')).status).toBe(401);
  });
});

describe('GET /api/banks/:countryCode', () => {
  it('asks for 100 banks and caches per country', async () => {
    upstream.on('GET', /^\/payout\/BR\/banks\?size=100$/, { status: 200, data: [{ code: '001', name: 'Banco do Brasil' }] });
    upstream.on('GET', /^\/payout\/MX\/banks\?size=100$/, { status: 200, data: { items: [{ code: '002', name: 'BBVA' }] } });

    const br = await request(app).get('/api/banks/BR').set(auth);
    expect(br.status).toBe(200);
    expect(br.body).toEqual([{ code: '001', name: 'Banco do Brasil' }]);
    expect(upstream.calls[0].url).toBe('https://api.example.test/organizations/sample/payout/BR/banks?size=100');

    const mx = await request(app).get('/api/banks/MX').set(auth);
    expect(mx.body).toEqual({ items: [{ code: '002', name: 'BBVA' }] });

    await request(app).get('/api/banks/BR').set(auth);
    await request(app).get('/api/banks/MX').set(auth);
    expect(upstream.calls).toHaveLength(2);
  });

  it('forwards upstream errors', async () => {
    upstream.on('GET', /^\/payout\/XX\/banks/, { status: 404, data: { message: 'unknown country' } });
    const res = await request(app).get('/api/banks/XX').set(auth);
    expect(res.status).toBe(404);
    expect(res.body.error.source).toBe('inyo');
  });
});

describe('schema pass-through', () => {
  it('returns the recipient schema and the recipient account schema untouched', async () => {
    const recipient = { type: 'object', properties: { firstName: { type: 'string' } }, required: ['firstName'] };
    const account = { type: 'object', properties: { payoutMethod: { type: 'object', properties: { bankCode: { type: 'string' } } } } };
    upstream.on('GET', '/payout/recipients/schema/BR', { status: 200, data: recipient });
    upstream.on('GET', '/payout/recipientAccounts/schema/BR', { status: 200, data: account });

    const r = await request(app).get('/api/beneficiaries/schema/BR').set(auth);
    expect(r.status).toBe(200);
    expect(r.body).toEqual(recipient);

    const a = await request(app).get('/api/beneficiaries/account-schema/BR').set(auth);
    expect(a.status).toBe(200);
    expect(a.body).toEqual(account);
  });

  it('maps an upstream failure through upstreamError', async () => {
    upstream.on('GET', '/payout/recipients/schema/ZZ', { status: 500, data: 'boom' });
    const res = await request(app).get('/api/beneficiaries/schema/ZZ').set(auth);
    expect(res.status).toBe(502);
    expect(res.body.error.source).toBe('inyo');
  });
});

describe('POST /api/quotes', () => {
  it('posts the quote request with the sample fee and stores every quote returned', async () => {
    const quotes = { quotes: [{ id: 'q-1', effectiveRate: 5.1 }, { id: 'q-2', effectiveRate: 5.0 }, { effectiveRate: 0 }] };
    upstream.on('POST', '/payout/quotes', { status: 200, data: quotes });
    const res = await request(app).post('/api/quotes').set(auth).send({ fromCurrency: 'USD', toCurrency: 'BRL', amount: '100.50', amountType: 'GROSS' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(quotes);
    expect(upstream.calls[0].body).toEqual({ fromCurrency: 'USD', toCurrency: 'BRL', amount: 100.5, fee: { amount: 4, currency: 'USD' }, amountType: 'GROSS' });

    const rows = db.prepare("SELECT * FROM quotes WHERE quoteId IN ('q-1', 'q-2') ORDER BY quoteId").all();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ quoteId: 'q-1', fromCurrency: 'USD', toCurrency: 'BRL', amount: 100.5 });
    expect(JSON.parse(rows[0].data)).toEqual({ id: 'q-1', effectiveRate: 5.1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM quotes').get().n).toBe(2);
  });

  it('omits amountType when not given and accepts a single quote object', async () => {
    upstream.on('POST', '/payout/quotes', { status: 200, data: { id: 'q-single', effectiveRate: 1 } });
    const res = await request(app).post('/api/quotes').set(auth).send({ fromCurrency: 'USD', toCurrency: 'MXN', amount: 20 });
    expect(res.status).toBe(200);
    expect(upstream.calls[0].body).toEqual({ fromCurrency: 'USD', toCurrency: 'MXN', amount: 20, fee: { amount: 4, currency: 'USD' } });
    expect(db.prepare('SELECT * FROM quotes WHERE quoteId = ?').get('q-single')).toMatchObject({ toCurrency: 'MXN', amount: 20 });
  });

  it('forwards a 422 from Inyo', async () => {
    upstream.on('POST', '/payout/quotes', { status: 422, data: { message: 'corridor not available' } });
    const res = await request(app).post('/api/quotes').set(auth).send({ fromCurrency: 'USD', toCurrency: 'XXX', amount: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('corridor not available');
  });
});
