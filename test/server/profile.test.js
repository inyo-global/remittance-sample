import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, mockUpstream, registerUser, request } from './helpers.js';

let app;
let db;
const upstream = mockUpstream();

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

beforeEach(() => upstream.reset());

const FORM = {
  firstName: 'Jane', lastName: 'Doe', gender: 'male', occupation: 'Engineer', docType: 'passport', docNumber: '999000001',
  issuingCountry: 'BR', expirationDate: '2030-01-01', state: 'CA', phoneNumber: '(555) 123-4567', ssn: '078-05-1120',
};

describe('POST /api/complete-profile', () => {
  it('creates the sender through POST /v2/senders with the documented payload and stores the profile', async () => {
    const { auth, user } = await registerUser(app);
    upstream.on('POST', '/v2/senders', { status: 201, data: { id: 'sender-1' } });

    const res = await request(app).post('/api/complete-profile').set(auth).send(FORM);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, externalId: 'sender-1' });

    const payload = upstream.calls[0].body;
    expect(payload).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
      email: user.email,
      birthDate: '1990-05-01',
      phoneNumber: '+15551234567',
      address: { countryCode: 'US', stateCode: 'CA', city: 'LAKEWOOD', line1: '4429 CANDLEWOOD ST', zipcode: '90712' },
      documents: [
        { type: 'passport', document: '999000001', countryCode: 'BR', expireDate: '2030-01-01' },
        { type: 'ssn', document: '078051120', countryCode: 'US' },
      ],
      occupation: 'Engineer',
      gender: 'Male',
      externalId: user.id,
    });

    const profile = db.prepare('SELECT * FROM profiles WHERE userId = ?').get(user.id);
    expect(profile).toMatchObject({ gender: 'male', occupation: 'Engineer', docType: 'passport', docNumber: '999000001', issuingCountry: 'BR', expirationDate: '2030-01-01', externalId: 'sender-1', ssn: '078051120' });
    expect(JSON.parse(profile.data)).toEqual({ state: 'CA', originalIssuingCountry: 'BR', phoneNumber: '(555) 123-4567' });
    expect(db.prepare('SELECT phoneNumber FROM users WHERE id = ?').get(user.id).phoneNumber).toBe('(555) 123-4567');

    const me = await request(app).get('/api/profile').set(auth);
    expect(me.body.profile.ssnLast4).toBe('1120');
    expect(me.body.profile.ssn).toBeUndefined();
  });

  it("maps a driver's license to drivers_license with the state code and keeps the state as issuer", async () => {
    const { auth, user } = await registerUser(app);
    upstream.on('POST', '/v2/senders', { status: 201, data: { id: 'sender-2' } });

    const res = await request(app).post('/api/complete-profile').set(auth).send({ ...FORM, docType: 'driver_license', docNumber: '99900001', state: 'PA', issuingCountry: 'US', ssn: '' });
    expect(res.status).toBe(200);
    const payload = upstream.calls[0].body;
    expect(payload.documents).toEqual([{ type: 'drivers_license', document: '99900001', countryCode: 'US', expireDate: '2030-01-01', stateCode: 'PA' }]);
    expect(payload.address.stateCode).toBe('PA');

    const profile = db.prepare('SELECT * FROM profiles WHERE userId = ?').get(user.id);
    expect(profile.issuingCountry).toBe('PA');
    expect(profile.ssn).toBeNull();
    expect(JSON.parse(profile.data).originalIssuingCountry).toBe('US');
  });

  it('normalises phone numbers to E.164', async () => {
    const cases = [
      ['+44 20 7946 0958', '+442079460958'],
      ['15551234567', '+15551234567'],
      ['555-123-4567', '+15551234567'],
      ['', ''],
    ];
    for (const [input, expected] of cases) {
      const { auth } = await registerUser(app);
      upstream.reset();
      upstream.on('POST', '/v2/senders', { status: 201, data: { id: 'sender-phone' } });
      const res = await request(app).post('/api/complete-profile').set(auth).send({ ...FORM, phoneNumber: input, ssn: '' });
      expect(res.status).toBe(200);
      expect(upstream.calls[0].body.phoneNumber).toBe(expected);
    }
  });

  it('sends no documents without a number and no gender when omitted', async () => {
    const { auth } = await registerUser(app);
    upstream.on('POST', '/v2/senders', { status: 201, data: { id: 'sender-3' } });
    const res = await request(app).post('/api/complete-profile').set(auth).send({ occupation: 'x', docType: 'passport', docNumber: '', ssn: '' });
    expect(res.status).toBe(200);
    const payload = upstream.calls[0].body;
    expect(payload.documents).toEqual([]);
    expect(payload).not.toHaveProperty('gender');
    expect(payload.firstName).toBe('Jane');
  });

  it('PATCHes the existing sender on the second save', async () => {
    const { auth, user } = await registerUser(app);
    upstream.on('POST', '/v2/senders', { status: 201, data: { id: 'sender-4' } });
    await request(app).post('/api/complete-profile').set(auth).send(FORM);

    upstream.reset();
    upstream.on('PATCH', '/v2/senders/sender-4', { status: 200, data: { id: 'sender-4' } });
    const res = await request(app).post('/api/complete-profile').set(auth).send({ ...FORM, occupation: 'Designer', ssn: '' });
    expect(res.status).toBe(200);
    expect(upstream.calls).toHaveLength(1);
    expect(upstream.calls[0].method).toBe('PATCH');
    expect(upstream.calls[0].body.occupation).toBe('Designer');
    expect(db.prepare('SELECT occupation, ssn FROM profiles WHERE userId = ?').get(user.id)).toEqual({ occupation: 'Designer', ssn: null });
  });

  it('forwards a 422 validation error from Inyo and stores nothing', async () => {
    const { auth, user } = await registerUser(app);
    upstream.on('POST', '/v2/senders', { status: 422, data: { message: 'Validation failed', errors: [{ fieldName: 'documents.0.document', error: 'invalid' }] } });
    const res = await request(app).post('/api/complete-profile').set(auth).send(FORM);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ source: 'inyo', status: 422, method: 'POST', path: '/organizations/sample/v2/senders', message: 'Validation failed' });
    expect(res.body.error.body.errors[0].fieldName).toBe('documents.0.document');
    expect(db.prepare('SELECT * FROM profiles WHERE userId = ?').get(user.id)).toBeUndefined();
  });
});
