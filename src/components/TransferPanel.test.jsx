import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import TransferPanel from './TransferPanel';
import { renderWithProviders } from '../../test/client/render';

const T0 = new Date('2026-01-01T12:00:00Z').getTime();
const quote = {
  id: 'q1', effectiveRate: 5.1234, sourceAmount: { amount: 100, currency: 'USD' }, destinationAmount: { amount: 512.34, currency: 'BRL' },
  fee: { amount: 4, currency: 'USD' }, totalCost: { amount: 104, currency: 'USD' },
  createdAt: new Date(T0).toISOString(), expireAt: new Date(T0 + 10 * 60 * 1000).toISOString(),
};

describe('TransferPanel', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
  afterEach(() => vi.useRealTimers());

  it('prompts for a quote when none is locked', () => {
    renderWithProviders(<TransferPanel />);
    expect(screen.getByText(/Enter an amount and request a quote/)).toBeInTheDocument();
    expect(screen.queryByText('You send')).not.toBeInTheDocument();
  });

  it('shows the quote amounts straight from the quote object', () => {
    renderWithProviders(<TransferPanel />, { transaction: { quote } });
    expect(screen.getByText('512.34 BRL')).toBeInTheDocument();
    expect(screen.getByText('1 USD = 5.1234 BRL')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('$4.00')).toBeInTheDocument();
    expect(screen.getByText('$104.00')).toBeInTheDocument();
    expect(screen.getByText('Rate locked for 10:00')).toBeInTheDocument();
  });

  it('flags an expired quote', () => {
    vi.setSystemTime(T0 + 11 * 60 * 1000);
    renderWithProviders(<TransferPanel />, { transaction: { quote } });
    expect(screen.getByText('Rate expired. Request a new quote.').closest('div').className).toContain('bg-danger-50');
  });

  it('warns when the window is almost over', () => {
    vi.setSystemTime(T0 + 9 * 60 * 1000);
    renderWithProviders(<TransferPanel />, { transaction: { quote } });
    expect(screen.getByText('Rate locked for 1:00').closest('div').className).toContain('bg-warning-50');
  });

  it('lists the beneficiary, delivery account and payment method selections', () => {
    renderWithProviders(<TransferPanel />, {
      transaction: {
        beneficiary: { data: { firstName: 'Ana', lastName: 'Silva' } },
        account: { data: { payoutMethod: { type: 'BANK_DEPOSIT', bankCode: '001', accountNumber: '123456' } } },
        paymentMethod: { type: 'CARD', token: { schemeId: 'VISA', lastFourDigits: '4242' } },
      },
    });
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('BANK_DEPOSIT · 001 3456')).toBeInTheDocument();
    expect(screen.getByText('VISA ···· 4242')).toBeInTheDocument();
  });

  it('prefers the nickname, PIX key type and ACH bank name', () => {
    renderWithProviders(<TransferPanel />, {
      transaction: {
        beneficiary: { nickname: 'Mom', data: { firstName: 'Ana' } },
        account: { data: { payoutMethod: { type: 'PIX', keyType: 'CPF', key: '12345678901' } } },
        paymentMethod: { type: 'ACH', data: { apiResponse: { bankName: 'Chase' } } },
      },
    });
    expect(screen.getByText('Mom')).toBeInTheDocument();
    expect(screen.getByText('PIX · CPF 8901')).toBeInTheDocument();
    expect(screen.getByText('Chase')).toBeInTheDocument();
  });

  it('falls back to generic labels for sparse selections', () => {
    renderWithProviders(<TransferPanel />, { transaction: { account: { data: {} }, paymentMethod: { type: 'ACH', token: { nickname: 'Savings' } } } });
    expect(screen.getByText('Account ·')).toBeInTheDocument();
    expect(screen.getByText('Savings')).toBeInTheDocument();
  });
});
