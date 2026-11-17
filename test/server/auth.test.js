import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, mockUpstream, registerUser, request, USER } from './helpers.js';

let app;
let db;
const upstream = mockUpstream();

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

beforeEach(() => upstream.reset());

describe('POST /api/register', () => {
  it('creates the user, hashes the password and returns a token', async () => {
    const res = await request(app).post('/api/register').send(USER);
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: USER.email, firstName: 'Jane', city: 'LAKEWOOD' });
    expect(res.body.user.password).toBeUndefined();
    const row = db.prepare('SELECT password FROM users WHERE email = ?').get(USER.email);
    expect(row.password).toMatch(/^\$2[ab]\$/);
    expect(row.password).not.toBe(USER.password);
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app).post('/api/register').send(USER);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/UNIQUE/);
  });
});

describe('POST /api/login', () => {
  it('returns the user and a token for a valid password', async () => {
    const res = await request(app).post('/api/login').send({ email: USER.email, password: USER.password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(USER.email);
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('answers 401 for a wrong password and 404 for an unknown user', async () => {
    expect((await request(app).post('/api/login').send({ email: USER.email, password: 'nope' })).status).toBe(401);
    expect((await request(app).post('/api/login').send({ email: 'ghost@example.com', password: 'x' })).status).toBe(404);
  });

  it('accepts a legacy plain-text password and upgrades it to a hash', async () => {
    db.prepare('INSERT INTO users (id, email, password, firstName, lastName) VALUES (?, ?, ?, ?, ?)').run('legacy-1', 'legacy@example.com', 'plain', 'Old', 'User');
    const res = await request(app).post('/api/login').send({ email: 'legacy@example.com', password: 'plain' });
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT password FROM users WHERE id = ?').get('legacy-1');
    expect(row.password).toMatch(/^\$2[ab]\$/);
    // and the hashed password keeps working
    expect((await request(app).post('/api/login').send({ email: 'legacy@example.com', password: 'plain' })).status).toBe(200);
  });
});

describe('authenticateToken', () => {
  it('answers 401 without a token and 403 with an invalid one', async () => {
    expect((await request(app).get('/api/profile')).status).toBe(401);
    expect((await request(app).get('/api/profile').set('Authorization', 'Bearer not-a-jwt')).status).toBe(403);
  });
});

describe('GET /api/profile', () => {
  it('returns the user without the password and the profile with only the SSN last four', async () => {
    const { auth, user } = await registerUser(app);
    db.prepare('INSERT INTO profiles (userId, gender, occupation, docType, docNumber, issuingCountry, expirationDate, externalId, data, ssn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(user.id, 'male', 'engineer', 'passport', '999000001', 'US', '2030-01-01', 'sender-1', '{}', '078051120');
    const res = await request(app).get('/api/profile').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.profile.ssn).toBeUndefined();
    expect(res.body.profile.ssnLast4).toBe('1120');
    expect(res.body.profile.externalId).toBe('sender-1');
  });

  it('returns a null profile before onboarding', async () => {
    const { auth } = await registerUser(app);
    const res = await request(app).get('/api/profile').set(auth);
    expect(res.body.profile).toBeNull();
  });
});
