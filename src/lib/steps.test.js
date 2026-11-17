import { describe, expect, it } from 'vitest';
import { STEPS, currentStepIndex, inTransferFlow, showsTransferChrome } from './steps';

describe('STEPS / currentStepIndex', () => {
  it('lists the five steps in docs order', () => {
    expect(STEPS.map((s) => s.key)).toEqual(['amount', 'beneficiary', 'account', 'payment', 'review']);
  });

  it.each([
    ['/dashboard', 0], ['/beneficiaries', 1], ['/beneficiaries/new', 1], ['/beneficiaries/abc-123/account', 2],
    ['/payment', 3], ['/transaction/review', 4], ['/overview', -1], ['/beneficiaries/a/b/account', -1], ['/payment-methods', -1],
  ])('%s -> %i', (path, index) => expect(currentStepIndex(path)).toBe(index));
});

describe('inTransferFlow', () => {
  it('is true once a quote is locked', () => {
    expect(inTransferFlow({ quote: { id: 'q' } })).toBe(true);
    expect(inTransferFlow({ quote: null })).toBe(false);
    expect(inTransferFlow(undefined)).toBe(false);
  });
});

describe('showsTransferChrome', () => {
  it('is false outside the steps', () => {
    expect(showsTransferChrome('/overview', { quote: { id: 'q' } })).toBe(false);
  });

  it('is always true on the first and last steps', () => {
    expect(showsTransferChrome('/dashboard', {})).toBe(true);
    expect(showsTransferChrome('/transaction/review', { quote: null })).toBe(true);
  });

  it('needs a quote on the middle steps', () => {
    expect(showsTransferChrome('/beneficiaries', {})).toBe(false);
    expect(showsTransferChrome('/beneficiaries', { quote: { id: 'q' } })).toBe(true);
    expect(showsTransferChrome('/beneficiaries/x/account', undefined)).toBe(false);
    expect(showsTransferChrome('/payment', { quote: {} })).toBe(true);
  });
});
