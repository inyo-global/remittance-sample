import { describe, expect, it } from 'vitest';
import {
  TONE_DOT, TONE_TEXT, canonicalFundingStatus, complianceTone, fundingStatus, historyTone, isReversible, payoutTone, prettyStatus, transactionSummary,
} from './status';

describe('complianceTone', () => {
  it.each([
    ['Approved', 'success'], ['Pending', 'warning'], ['Rejected', 'danger'], ['Failed', 'danger'],
    ['Cancelled', 'neutral'], ['Refunded', 'neutral'], ['Whatever', 'neutral'], [undefined, 'neutral'],
  ])('%s -> %s', (status, tone) => expect(complianceTone(status)).toBe(tone));
});

describe('payoutTone', () => {
  it.each([
    ['Completed', 'success'], ['Processing', 'info'], ['Pending', 'warning'], ['Failed', 'danger'],
    ['Cancelled', 'neutral'], ['Voided', 'neutral'], ['Refunded', 'neutral'], ['Other', 'neutral'],
  ])('%s -> %s', (status, tone) => expect(payoutTone(status)).toBe(tone));
});

describe('canonicalFundingStatus', () => {
  it('normalises casing variants from GET and POST', () => {
    expect(canonicalFundingStatus('Actionrequired')).toBe('ActionRequired');
    expect(canonicalFundingStatus('ACTIONREQUIRED')).toBe('ActionRequired');
    expect(canonicalFundingStatus('verified')).toBe('Verified');
    expect(canonicalFundingStatus('Rejected')).toBe('Rejected');
    expect(canonicalFundingStatus('declined')).toBe('Declined');
    expect(canonicalFundingStatus('pending')).toBe('Pending');
  });

  it('passes unknown values through', () => {
    expect(canonicalFundingStatus('Weird')).toBe('Weird');
    expect(canonicalFundingStatus(undefined)).toBeUndefined();
    expect(canonicalFundingStatus('')).toBe('');
  });
});

describe('fundingStatus', () => {
  it.each([
    ['Verified', 'Verified', 'success'],
    ['Actionrequired', '3DS required', 'warning'],
    ['Pending', 'Pending', 'warning'],
    ['Rejected', 'Rejected', 'danger'],
    ['Declined', 'Declined', 'danger'],
  ])('%s -> %s / %s', (status, label, tone) => expect(fundingStatus(status)).toEqual({ label, tone }));

  it('titles unknown statuses and labels empty ones Unknown', () => {
    expect(fundingStatus('waiting_review')).toEqual({ label: 'waiting review', tone: 'neutral' });
    expect(fundingStatus('SomethingElse')).toEqual({ label: 'Something Else', tone: 'neutral' });
    expect(fundingStatus(undefined)).toEqual({ label: 'Unknown', tone: 'neutral' });
  });
});

describe('transactionSummary', () => {
  it('reads from tx.data when present and from the row otherwise', () => {
    expect(transactionSummary({ data: { payoutStatus: 'Completed' } })).toEqual({ label: 'Completed', tone: 'success' });
    expect(transactionSummary({ payoutStatus: 'Completed' })).toEqual({ label: 'Completed', tone: 'success' });
    expect(transactionSummary({ status: 'Processing' })).toEqual({ label: 'Processing', tone: 'info' });
    expect(transactionSummary({ data: { status: { payoutStatus: 'Failed' } } })).toEqual({ label: 'Payout failed', tone: 'danger' });
  });

  it('prioritises 3DS, compliance blocks, then payout states', () => {
    expect(transactionSummary({ data: { paymentStatus: 'ActionRequired', payoutStatus: 'Completed' } })).toEqual({ label: '3DS pending', tone: 'warning' });
    expect(transactionSummary({ data: { complianceStatus: 'Rejected', payoutStatus: 'Completed' } })).toEqual({ label: 'Compliance rejected', tone: 'danger' });
    expect(transactionSummary({ data: { complianceStatus: 'Failed' } })).toEqual({ label: 'Compliance failed', tone: 'danger' });
    expect(transactionSummary({ data: { payoutStatus: 'Cancelled' } })).toEqual({ label: 'Cancelled', tone: 'neutral' });
    expect(transactionSummary({ data: { payoutStatus: 'Voided' } })).toEqual({ label: 'Voided', tone: 'neutral' });
    expect(transactionSummary({ data: { payoutStatus: 'Refunded' } })).toEqual({ label: 'Refunded', tone: 'neutral' });
    expect(transactionSummary({ data: { complianceStatus: 'Pending', payoutStatus: 'Pending' } })).toEqual({ label: 'Compliance review', tone: 'warning' });
  });

  it('falls back to a titled payout status or Pending', () => {
    expect(transactionSummary({ data: { payoutStatus: 'WaitingPayout' } })).toEqual({ label: 'Waiting Payout', tone: 'warning' });
    expect(transactionSummary({})).toEqual({ label: 'Pending', tone: 'warning' });
    expect(transactionSummary(undefined)).toEqual({ label: 'Pending', tone: 'warning' });
  });
});

describe('isReversible', () => {
  it('is true while nothing terminal happened', () => {
    expect(isReversible({ data: { complianceStatus: 'Pending', payoutStatus: 'Pending' } })).toBe(true);
    expect(isReversible({ data: { payoutStatus: 'Processing' } })).toBe(true);
    expect(isReversible({})).toBe(true);
    expect(isReversible(undefined)).toBe(true);
  });

  it('is false for terminal compliance or payout states', () => {
    for (const c of ['Rejected', 'Cancelled', 'Refunded', 'Failed']) expect(isReversible({ data: { complianceStatus: c } })).toBe(false);
    for (const p of ['Completed', 'Cancelled', 'Failed', 'Voided', 'Refunded']) expect(isReversible({ data: { payoutStatus: p } })).toBe(false);
    expect(isReversible({ status: 'Completed' })).toBe(false);
    expect(isReversible({ data: { status: { complianceStatus: 'Rejected' } } })).toBe(false);
  });
});

describe('historyTone', () => {
  it.each([
    [{ complianceStatus: 'Rejected', payoutStatus: 'Pending' }, 'danger'],
    [{ complianceStatus: 'Failed' }, 'danger'],
    [{ payoutStatus: 'Failed' }, 'danger'],
    [{ payoutStatus: 'Completed' }, 'success'],
    [{ payoutStatus: 'Cancelled' }, 'neutral'],
    [{ payoutStatus: 'Voided' }, 'neutral'],
    [{ payoutStatus: 'Refunded' }, 'neutral'],
    [{ payoutStatus: 'Processing' }, 'info'],
    [{ payoutStatus: 'Pending' }, 'warning'],
    [undefined, 'warning'],
  ])('%o -> %s', (row, tone) => expect(historyTone(row)).toBe(tone));
});

describe('prettyStatus and tone maps', () => {
  it('splits camel case and separators', () => {
    expect(prettyStatus('WaitingChallenge3ds')).toBe('Waiting Challenge3ds');
    expect(prettyStatus('action_required')).toBe('action required');
    expect(prettyStatus('')).toBe('');
    expect(prettyStatus(null)).toBe('');
  });

  it('exposes a class for every tone', () => {
    for (const tone of ['success', 'warning', 'danger', 'info', 'neutral']) {
      expect(TONE_TEXT[tone]).toMatch(/^text-/);
      expect(TONE_DOT[tone]).toMatch(/^bg-/);
    }
  });
});
