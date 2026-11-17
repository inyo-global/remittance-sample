import { describe, expect, it } from 'vitest';
import { clientIp } from '../../../server/util.ts';
import { senderOf, toE164, v2DocType, v2Documents } from '../../../server/services/senders.ts';
import { openDatabase } from '../../../server/db.ts';

describe('clientIp', () => {
  const req = (headers, remoteAddress) => ({ headers, socket: { remoteAddress } });
  it('prefers the first x-forwarded-for entry and strips the IPv4-mapped prefix', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }, '::1'))).toBe('203.0.113.5');
    expect(clientIp(req({ 'x-forwarded-for': ['203.0.113.7'] }, '::1'))).toBe('203.0.113.7');
    expect(clientIp(req({}, '::ffff:192.0.2.1'))).toBe('192.0.2.1');
  });
  it('falls back to loopback', () => {
    expect(clientIp(req({}, undefined))).toBe('127.0.0.1');
  });
});

describe('toE164', () => {
  it('normalises US formats and keeps explicit country codes', () => {
    expect(toE164('(555) 123-4567')).toBe('+15551234567');
    expect(toE164('1 555 123 4567')).toBe('+15551234567');
    expect(toE164('+55 11 91234-5678')).toBe('+5511912345678');
    expect(toE164('')).toBe('');
    expect(toE164(null)).toBe('');
  });
});

describe('v2 documents', () => {
  it('maps the v1 singular to the canonical plural and lowercases', () => {
    expect(v2DocType('driver_license')).toBe('drivers_license');
    expect(v2DocType('PASSPORT')).toBe('passport');
  });
  it('drops entries without a document and moves issuer to stateCode', () => {
    expect(v2Documents([{ type: 'Driver_License', document: 'D1', issuer: 'CA' }, { type: 'passport' }, null])).toEqual([
      { type: 'drivers_license', document: 'D1', stateCode: 'CA' },
    ]);
    expect(v2Documents([{ type: 'drivers_license', document: 'D2', issuer: 'CA', stateCode: 'NY' }])[0].stateCode).toBe('NY');
    expect(v2Documents(undefined)).toEqual([]);
  });
});

describe('openDatabase / senderOf', () => {
  it('creates the schema and reads the sender id from profiles', () => {
    const db = openDatabase(':memory:');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['users', 'profiles', 'beneficiaries', 'beneficiary_accounts', 'quotes', 'payment_methods', 'transactions', 'webhook_events', 'kyc_sessions']));
    expect(senderOf(db, 'u1')).toBeUndefined();
    db.prepare('INSERT INTO profiles (userId, externalId) VALUES (?, ?)').run('u1', 'sender-1');
    expect(senderOf(db, 'u1')).toBe('sender-1');
    expect(db.prepare('PRAGMA table_info(profiles)').all().some((c) => c.name === 'ssn')).toBe(true);
  });
});
