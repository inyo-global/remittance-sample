import { describe, expect, it } from 'vitest';
import { getPath, schemaDefaults, setPath } from './schema';

describe('setPath', () => {
  it('sets a top-level key without mutating the input', () => {
    const src = { a: 1 };
    const out = setPath(src, ['b'], 2);
    expect(out).toEqual({ a: 1, b: 2 });
    expect(src).toEqual({ a: 1 });
  });

  it('creates nested objects and arrays based on the next key', () => {
    expect(setPath({}, ['address', 'city'], 'LA')).toEqual({ address: { city: 'LA' } });
    expect(setPath({}, ['documents', '0', 'type'], 'PASSPORT')).toEqual({ documents: [{ type: 'PASSPORT' }] });
  });

  it('copies existing branches instead of mutating them', () => {
    const src = { address: { city: 'LA', state: 'CA' }, docs: [{ type: 'A' }] };
    const out = setPath(src, ['address', 'city'], 'SF');
    expect(out.address).toEqual({ city: 'SF', state: 'CA' });
    expect(src.address.city).toBe('LA');
    const out2 = setPath(src, ['docs', '0', 'type'], 'B');
    expect(out2.docs).toEqual([{ type: 'B' }]);
    expect(Array.isArray(out2.docs)).toBe(true);
    expect(src.docs[0].type).toBe('A');
  });

  it('tolerates a null root', () => {
    expect(setPath(null, ['x'], 1)).toEqual({ x: 1 });
  });
});

describe('getPath', () => {
  it('walks nested objects and arrays', () => {
    const obj = { a: { b: [{ c: 'deep' }] } };
    expect(getPath(obj, ['a', 'b', '0', 'c'])).toBe('deep');
    expect(getPath(obj, ['a', 'b', 0, 'c'])).toBe('deep');
  });

  it('returns undefined on missing branches', () => {
    expect(getPath({ a: null }, ['a', 'b'])).toBeUndefined();
    expect(getPath({}, ['x', 'y'])).toBeUndefined();
    expect(getPath(undefined, ['x'])).toBeUndefined();
  });
});

describe('schemaDefaults', () => {
  it('pre-fills const and single-value enums, including nested objects and arrays', () => {
    const schema = {
      properties: {
        countryCode: { const: 'BR' },
        currency: { type: 'string', enum: ['BRL'] },
        kind: { type: 'string', enum: ['A', 'B'] },
        address: { type: 'object', properties: { countryCode: { enum: ['BR'] }, city: { type: 'string' } } },
        documents: { type: 'array', items: { properties: { type: { const: 'CPF' }, number: { type: 'string' } } } },
        empty: { type: 'object' },
      },
    };
    expect(schemaDefaults(schema)).toEqual({
      countryCode: 'BR',
      currency: 'BRL',
      address: { countryCode: 'BR' },
      documents: [{ type: 'CPF' }],
    });
  });

  it('returns an empty object for missing schemas', () => {
    expect(schemaDefaults(null)).toEqual({});
    expect(schemaDefaults({})).toEqual({});
  });
});
