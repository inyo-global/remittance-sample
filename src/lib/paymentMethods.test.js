import { describe, expect, it } from 'vitest';
import { challengeUrl, isUsable, methodStatus, methodSubtitle, methodTitle, needsChallenge } from './paymentMethods';

describe('methodStatus', () => {
  it('prefers apiResponse.status, then data.status, then Unknown', () => {
    expect(methodStatus({ data: { apiResponse: { status: 'Actionrequired' }, status: 'Pending' } })).toBe('ActionRequired');
    expect(methodStatus({ data: { status: 'verified' } })).toBe('Verified');
    expect(methodStatus({ data: {} })).toBe('Unknown');
    expect(methodStatus({})).toBe('Unknown');
  });
});

describe('isUsable / needsChallenge', () => {
  it('only Verified is usable', () => {
    expect(isUsable({ data: { apiResponse: { status: 'Verified' } } })).toBe(true);
    expect(isUsable({ data: { apiResponse: { status: 'Pending' } } })).toBe(false);
  });

  it('ActionRequired needs a challenge', () => {
    expect(needsChallenge({ data: { apiResponse: { status: 'ActionRequired' } } })).toBe(true);
    expect(needsChallenge({ data: { apiResponse: { status: 'Actionrequired' } } })).toBe(true);
    expect(needsChallenge({ data: { apiResponse: { status: 'Verified' } } })).toBe(false);
  });
});

describe('challengeUrl', () => {
  it('reads the ACS url from apiResponse or data, else null', () => {
    expect(challengeUrl({ data: { apiResponse: { redirectAcsUrl: 'https://acs/1' } } })).toBe('https://acs/1');
    expect(challengeUrl({ data: { redirectAcsUrl: 'https://acs/2' } })).toBe('https://acs/2');
    expect(challengeUrl({ data: {} })).toBeNull();
    expect(challengeUrl({})).toBeNull();
  });
});

describe('methodTitle', () => {
  it('names ACH accounts by bank, nickname or default', () => {
    expect(methodTitle({ type: 'ACH', data: { apiResponse: { bankName: 'Chase' } }, token: { nickname: 'Main' } })).toBe('Chase');
    expect(methodTitle({ type: 'ACH', token: { nickname: 'Main' } })).toBe('Main');
    expect(methodTitle({ type: 'ACH' })).toBe('Bank account');
  });

  it('names cards by scheme from the token or the API, else Card', () => {
    expect(methodTitle({ type: 'CARD', token: { schemeId: 'VISA' } })).toBe('VISA');
    expect(methodTitle({ type: 'CARD', data: { apiResponse: { schemeId: 'MASTERCARD' } } })).toBe('MASTERCARD');
    expect(methodTitle({ type: 'CARD' })).toBe('Card');
  });
});

describe('methodSubtitle', () => {
  it('masks the ACH account number', () => {
    expect(methodSubtitle({ type: 'ACH', data: { apiResponse: { accountNumber: '000123456789' } } })).toBe('ACH ···· 6789');
    expect(methodSubtitle({ type: 'ACH' })).toBe('ACH ···· ····');
  });

  it('describes the card type and last four', () => {
    expect(methodSubtitle({ type: 'CARD', token: { cardType: 'DEBIT', lastFourDigits: '4242' } })).toBe('debit card ···· 4242');
    expect(methodSubtitle({ type: 'CARD', data: { apiResponse: { lastFourDigits: '1111' } } })).toBe('Card ···· 1111');
    expect(methodSubtitle({ type: 'CARD' })).toBe('Card ···· ····');
  });
});
