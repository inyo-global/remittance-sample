import { describe, expect, it } from 'vitest';
import { amount, dateOnly, dateTime, errorMessage, humanize, initials, maskAccount, money, rate, timeOnly } from './format';

describe('money', () => {
  it('formats USD by default', () => {
    expect(money(1234.5)).toBe('$1,234.50');
    expect(money('10')).toBe('$10.00');
  });

  it('formats other currencies and honours Intl options', () => {
    expect(money(5, 'EUR')).toBe('€5.00');
    expect(money(1234.56, 'USD', { maximumFractionDigits: 0 })).toBe('$1,235');
  });

  it('returns a dash for non-numeric input', () => {
    expect(money(undefined)).toBe('—');
    expect(money('abc')).toBe('—');
    // Number(null) is 0, so null is formatted as zero rather than dashed
    expect(money(null)).toBe('$0.00');
  });

  it('falls back to "<n> <code>" when Intl rejects the currency', () => {
    expect(money(12, 'NOPE')).toBe('12.00 NOPE');
  });
});

describe('amount', () => {
  it('formats with two decimals and the currency code', () => {
    expect(amount(1234.5, 'BRL')).toBe('1,234.50 BRL');
    expect(amount('7', 'MXN')).toBe('7.00 MXN');
  });

  it('omits the code when missing and dashes bad input', () => {
    expect(amount(3)).toBe('3.00');
    expect(amount('x', 'BRL')).toBe('—');
  });
});

describe('rate', () => {
  it('uses four decimals under 100 and two above', () => {
    expect(rate(5.12345, 'USD', 'BRL')).toBe('1 USD = 5.1235 BRL');
    expect(rate(1234.5678, 'USD', 'COP')).toBe('1 USD = 1234.57 COP');
  });

  it('defaults from USD and trims when `to` is empty', () => {
    expect(rate(2)).toBe('1 USD = 2.0000');
    expect(rate('nope')).toBe('—');
  });
});

describe('dates', () => {
  const iso = '2026-03-04T15:06:00Z';

  it('dateTime formats with Intl and respects timeZone', () => {
    const expected = new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
    expect(dateTime(iso, { timeZone: 'UTC' })).toBe(expected);
    expect(dateTime(iso, { timeZone: 'UTC' })).toMatch(/Mar 4, 2026, 3:06 PM/);
  });

  it('dateTime handles empty and invalid input', () => {
    expect(dateTime('')).toBe('—');
    expect(dateTime(null)).toBe('—');
    expect(dateTime('not a date')).toBe('not a date');
  });

  it('dateOnly and timeOnly format or fall back', () => {
    expect(dateOnly(iso)).toBe(new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' }));
    expect(dateOnly('')).toBe('—');
    expect(dateOnly('garbage')).toBe('garbage');
    expect(timeOnly(iso)).toBe(new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    expect(timeOnly('')).toBe('');
    expect(timeOnly('garbage')).toBe('');
  });
});

describe('initials', () => {
  it('takes the first letter of the first two words, upper-cased', () => {
    expect(initials('jane  marie doe')).toBe('JM');
    expect(initials('Ana')).toBe('A');
  });

  it('returns ? for empty names', () => {
    expect(initials('')).toBe('?');
    expect(initials()).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});

describe('maskAccount', () => {
  it('shows only the last four characters', () => {
    expect(maskAccount('123456789')).toBe('···· 6789');
    expect(maskAccount(42)).toBe('···· 42');
  });

  it('masks everything when empty', () => {
    expect(maskAccount('')).toBe('····');
    expect(maskAccount(undefined)).toBe('····');
  });
});

describe('humanize', () => {
  it('turns API keys into labels', () => {
    expect(humanize('residentialAddress')).toBe('Residential Address');
    expect(humanize('documents.0.type')).toBe('Documents Type');
    expect(humanize('bank_code')).toBe('Bank Code');
    expect(humanize('items[0].name')).toBe('Items Name');
    expect(humanize()).toBe('');
  });
});

describe('errorMessage', () => {
  it('returns the fallback for empty errors and strings as-is', () => {
    expect(errorMessage(null)).toBe('Something went wrong');
    expect(errorMessage(undefined, 'custom')).toBe('custom');
    expect(errorMessage('boom')).toBe('boom');
    expect(errorMessage({ error: 'nested string' })).toBe('nested string');
  });

  it('describes structured Inyo errors with head, detail and hint', () => {
    const err = { error: { source: 'inyo', status: 422, method: 'POST', path: '/x', body: { message: 'bad' }, hint: 'Check it' } };
    expect(errorMessage(err)).toBe('Inyo 422 on POST /x — {"message":"bad"} — Check it');
  });

  it('skips the detail when it equals the hint or is missing, and says "no response" without a status', () => {
    expect(errorMessage({ source: 'inyo', status: null, method: 'GET', path: '/y', body: 'same', hint: 'same' })).toBe('Inyo no response on GET /y — same');
    expect(errorMessage({ source: 'inyo', status: 500, method: 'GET', path: '/z', message: 'msg' })).toBe('Inyo 500 on GET /z — msg');
  });

  it('uses the message of local errors', () => {
    expect(errorMessage({ error: { source: 'local', message: 'db down' } })).toBe('db down');
    expect(errorMessage({ source: 'local' }, 'fb')).toBe('fb');
  });

  it('flattens field error arrays and objects', () => {
    expect(errorMessage({ errors: [{ fieldName: 'firstName', error: 'required' }, { fieldName: 'documents.0.type', error: 'invalid' }] })).toBe('First Name: required; Documents Type: invalid');
    expect(errorMessage({ errors: { zipcode: ['bad', 'short'], city: 'missing' } })).toBe('Zipcode: bad, short; City: missing');
  });

  it('falls through message, details.message, err.message, err.details, then fallback', () => {
    expect(errorMessage({ message: 'top' })).toBe('top');
    expect(errorMessage({ details: { message: 'deep' } })).toBe('deep');
    expect(errorMessage({ error: {}, message: 'outer' })).toBe('outer');
    expect(errorMessage({ error: {}, details: 'plain details' })).toBe('plain details');
    expect(errorMessage({}, 'last resort')).toBe('last resort');
    expect(errorMessage(new Error('thrown'))).toBe('thrown');
  });
});
