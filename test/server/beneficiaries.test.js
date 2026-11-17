import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, mockUpstream, registerUser, request } from './helpers.js';

let app;
let db;
const upstream = mockUpstream();

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

beforeEach(() => upstream.reset());

const insertBeneficiary = (id, userId, externalId = `ext-${id}`, data = { firstName: 'Maria' }) => {
  db.prepare('INSERT INTO beneficiaries VALUES (?, ?, ?, ?, ?)').run(id, userId, 'Maria', externalId, JSON.stringify(data));
};

describe('POST /api/beneficiaries', () => {
  it('creates the recipient through POST /v2/beneficiaries with normalised documents', async () => {
    const { auth, user } = await registerUser(app);
    upstream.on('POST', '/v2/beneficiaries', { status: 201, data: { id: 'ben-ext-1', firstName: null, lastName: null, phoneNumber: null } });
    const formData = {
      firstName: 'Maria', lastName: 'Silva', phoneNumber: '+5511999999999',
      address: { countryCode: 'BR', city: 'Sao Paulo' },
      documents: [
        { type: 'DRIVER_LICENSE', document: '123', issuer: 'PA', countryCode: 'US' },
        { type: 'CPF', document: '', countryCode: 'BR' },
        { type: 'PASSPORT', document: 'AB1', countryCode: 'BR', stateCode: 'SP', issuer: 'ignored' },
      ],
    };
    const res = await request(app).post('/api/beneficiaries').set(auth).send({ nickname: 'Maria Silva', countryCode: 'BR', formData });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: expect.any(String), externalId: 'ben-ext-1' });

    const payload = upstream.calls[0].body;
    expect(payload.externalId).toBe(res.body.id);
    expect(payload.documents).toEqual([
      { type: 'drivers_license', document: '123', countryCode: 'US', stateCode: 'PA' },
      { type: 'passport', document: 'AB1', countryCode: 'BR', stateCode: 'SP' },
    ]);
    expect(payload.firstName).toBe('Maria');
    expect(payload.address).toEqual({ countryCode: 'BR', city: 'Sao Paulo' });

    const row = db.prepare('SELECT * FROM beneficiaries WHERE id = ?').get(res.body.id);
    expect(row).toMatchObject({ userId: user.id, nickname: 'Maria Silva', externalId: 'ben-ext-1' });
    // what the user typed wins over the nulls echoed by the API
    expect(JSON.parse(row.data)).toMatchObject({ id: 'ben-ext-1', firstName: 'Maria', lastName: 'Silva', phoneNumber: '+5511999999999' });
  });

  it('accepts a 200 (recipient already existed for this externalId)', async () => {
    const { auth } = await registerUser(app);
    upstream.on('POST', '/v2/beneficiaries', { status: 200, data: { id: 'ben-ext-2' } });
    const res = await request(app).post('/api/beneficiaries').set(auth).send({ nickname: 'X', countryCode: 'BR', formData: { firstName: 'X' } });
    expect(res.status).toBe(200);
    expect(res.body.externalId).toBe('ben-ext-2');
  });

  it('rejects an unexpected 2xx as a local error and forwards 4xx', async () => {
    const { auth } = await registerUser(app);
    upstream.on('POST', '/v2/beneficiaries', { status: 202, data: {} });
    const odd = await request(app).post('/api/beneficiaries').set(auth).send({ nickname: 'X', countryCode: 'BR', formData: {} });
    expect(odd.status).toBe(500);
    expect(odd.body.error).toEqual({ source: 'local', message: 'API Error: Received status 202' });

    upstream.reset();
    upstream.on('POST', '/v2/beneficiaries', { status: 422, data: { message: 'firstName is required' } });
    const bad = await request(app).post('/api/beneficiaries').set(auth).send({ nickname: 'X', countryCode: 'BR', formData: {} });
    expect(bad.status).toBe(422);
    expect(bad.body.error.message).toBe('firstName is required');
  });
});

describe('GET /api/beneficiaries', () => {
  it('lists only the caller’s beneficiaries with parsed data', async () => {
    const { auth, user } = await registerUser(app);
    const other = await registerUser(app);
    insertBeneficiary('b-mine', user.id, 'ext-mine', { firstName: 'Maria', address: { countryCode: 'BR' } });
    insertBeneficiary('b-theirs', other.user.id);
    const res = await request(app).get('/api/beneficiaries').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: 'b-mine', nickname: 'Maria', externalId: 'ext-mine', data: { firstName: 'Maria', address: { countryCode: 'BR' } } });
  });
});

describe('beneficiary accounts', () => {
  it('refuses to list or create accounts for another user’s beneficiary', async () => {
    const { auth } = await registerUser(app);
    const other = await registerUser(app);
    insertBeneficiary('b-foreign', other.user.id);
    const list = await request(app).get('/api/beneficiaries/b-foreign/accounts').set(auth);
    expect(list.status).toBe(403);
    const create = await request(app).post('/api/beneficiaries/account').set(auth).send({ beneficiaryId: 'b-foreign', externalPersonId: 'ext-b-foreign', formData: {} });
    expect(create.status).toBe(403);
    expect(upstream.calls).toHaveLength(0);
  });

  it('creates the recipient account through the gateway endpoint and lists it', async () => {
    const { auth, user } = await registerUser(app);
    insertBeneficiary('b-1', user.id, 'person-1');
    const formData = { asset: 'BRL', payoutMethod: { type: 'PIX', keyType: 'CPF', key: '12345678901' } };
    upstream.on('POST', '/payout/participants/person-1/recipientAccounts/gateway', { status: 201, data: { id: 'acct-ext-1' } });

    const res = await request(app).post('/api/beneficiaries/account').set(auth).send({ beneficiaryId: 'b-1', externalPersonId: 'person-1', formData });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: expect.any(String), externalAccountId: 'acct-ext-1' });
    expect(upstream.calls[0].body).toEqual(formData);

    const row = db.prepare('SELECT * FROM beneficiary_accounts WHERE id = ?').get(res.body.id);
    expect(row).toMatchObject({ beneficiaryId: 'b-1', externalId: 'acct-ext-1' });
    expect(JSON.parse(row.data)).toEqual(formData);

    const list = await request(app).get('/api/beneficiaries/b-1/accounts').set(auth);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ id: res.body.id, beneficiaryId: 'b-1', externalId: 'acct-ext-1', data: formData }]);
  });

  it('forwards an upstream validation error', async () => {
    const { auth, user } = await registerUser(app);
    insertBeneficiary('b-2', user.id, 'person-2');
    upstream.on('POST', '/payout/participants/person-2/recipientAccounts/gateway', { status: 400, data: { message: 'bankCode invalid' } });
    const res = await request(app).post('/api/beneficiaries/account').set(auth).send({ beneficiaryId: 'b-2', externalPersonId: 'person-2', formData: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('bankCode invalid');
    expect(db.prepare("SELECT COUNT(*) AS n FROM beneficiary_accounts WHERE beneficiaryId = 'b-2'").get().n).toBe(0);
  });
});
