import { describe, expect, it } from 'vitest';
import { TEST_ADDRESS, US_STATES } from './usStates';

describe('US_STATES', () => {
  it('has the 50 states plus DC with unique two-letter codes', () => {
    expect(US_STATES).toHaveLength(51);
    const codes = US_STATES.map((s) => s.value);
    expect(new Set(codes).size).toBe(51);
    for (const s of US_STATES) {
      expect(s.value).toMatch(/^[A-Z]{2}$/);
      expect(s.label).toEqual(expect.any(String));
    }
    expect(US_STATES.find((s) => s.value === 'DC')?.label).toBe('District of Columbia');
  });
});

describe('TEST_ADDRESS', () => {
  it('is a consistent California address', () => {
    expect(TEST_ADDRESS).toEqual({ address: '4429 CANDLEWOOD ST', city: 'LAKEWOOD', state: 'CA', zipcode: '90712' });
    expect(US_STATES.some((s) => s.value === TEST_ADDRESS.state)).toBe(true);
  });
});
