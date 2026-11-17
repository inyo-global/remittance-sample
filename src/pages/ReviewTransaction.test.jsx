import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, useLocation } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewTransaction from './ReviewTransaction';
import { request } from '../api';
import { LocationProbe, renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const NOW = new Date('2026-11-16T12:00:00Z');
const QUOTE = {
  id: 'q1', amountType: 'GROSS', effectiveRate: 5.1234, createdAt: '2026-11-16T11:50:00Z', expireAt: '2026-11-16T12:20:00Z',
  sourceAmount: { amount: 96, currency: 'USD' }, fee: { amount: 4, currency: 'USD' }, totalCost: { amount: 100, currency: 'USD' }, destinationAmount: { amount: 491.85, currency: 'BRL' },
};
const BENEFICIARY = { id: 'b1', nickname: '', data: { firstName: 'Maria', lastName: 'Silva', address: { countryCode: 'BR' } } };
const ACCOUNT = { id: 'a1', data: { asset: 'BRL', payoutMethod: { type: 'BANK_DEPOSIT', bankCode: '237', accountType: 'CHECKING', accountNumber: '123456789' } } };
const PIX_ACCOUNT = { id: 'a2', data: { payoutMethod: { type: 'PIX', keyType: 'EMAIL', key: 'maria@example.com' } } };
const CARD = { id: 'pm1', type: 'CARD', token: { schemeId: 'VISA', cardType: 'DEBIT', lastFourDigits: '4242' }, data: { apiResponse: { status: 'Verified' } } };
const FULL = { quote: QUOTE, beneficiary: BENEFICIARY, account: ACCOUNT, paymentMethod: CARD };

function ReceiptProbe() {
  const { state } = useLocation();
  return <div data-testid="receipt">{state?.transaction?.id}</div>;
}

describe('ReviewTransaction', () => {
  beforeEach(() => {
    request.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('explains what is missing and links to the first incomplete step', () => {
    renderWithProviders(<ReviewTransaction />);
    expect(screen.getByText('This transfer is incomplete')).toBeInTheDocument();
    expect(screen.getByText(/Missing a quote, a beneficiary, a delivery account, a payment method/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lock a quote/i })).toHaveAttribute('href', '/dashboard');
  });

  it.each([
    ['beneficiary', { quote: QUOTE }, '/beneficiaries'],
    ['delivery account', { quote: QUOTE, beneficiary: BENEFICIARY }, '/beneficiaries/b1/account'],
    ['payment method', { quote: QUOTE, beneficiary: BENEFICIARY, account: ACCOUNT }, '/payment'],
  ])('links to the step that provides the missing %s', (label, transaction, href) => {
    renderWithProviders(<ReviewTransaction />, { transaction });
    expect(screen.getByText(new RegExp(`Missing a ${label}`))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /complete step/i })).toHaveAttribute('href', href);
  });

  it('renders every amount straight from the quote and the selections', () => {
    renderWithProviders(<ReviewTransaction />, { transaction: FULL });
    expect(screen.getByText('491.85 BRL')).toBeInTheDocument();
    expect(screen.getByText('1 USD = 5.1234 BRL')).toBeInTheDocument();
    expect(screen.getByText('$96.00')).toBeInTheDocument();
    expect(screen.getByText('$4.00')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('GROSS')).toBeInTheDocument();
    expect(screen.getByText('Rate locked for 20:00')).toBeInTheDocument();
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('BR')).toBeInTheDocument();
    expect(screen.getByText('BANK DEPOSIT · 237')).toBeInTheDocument();
    expect(screen.getByText('CHECKING ···· 6789 · BRL')).toBeInTheDocument();
    expect(screen.getByText('VISA')).toBeInTheDocument();
    expect(screen.getByText('debit card ···· 4242')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm and send/i })).toBeEnabled();
  });

  it('describes a PIX delivery', () => {
    renderWithProviders(<ReviewTransaction />, { transaction: { ...FULL, account: PIX_ACCOUNT } });
    expect(screen.getByText('PIX · EMAIL')).toBeInTheDocument();
    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
  });

  it('"Change" buttons navigate to the corresponding steps', async () => {
    const u = userEvent.setup();
    renderWithProviders(<ReviewTransaction />, { route: '/transaction/review', transaction: FULL, extraRoutes: <Route path="/beneficiaries/:id/account" element={<LocationProbe />} /> });
    await u.click(screen.getAllByRole('button', { name: /change/i })[1]);
    expect(await screen.findByTestId('location')).toHaveTextContent('/beneficiaries/b1/account');
  });

  it('posts the local ids, resets the flow and opens the receipt', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    request.mockResolvedValue({ id: 'local-tx', externalId: 'ext-tx', payoutStatus: 'Pending' });
    renderWithProviders(<ReviewTransaction />, { route: '/transaction/review', transaction: FULL, setTransactionData, extraRoutes: <Route path="/transaction/receipt" element={<ReceiptProbe />} /> });
    await u.click(screen.getByRole('button', { name: /confirm and send/i }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('post', '/transactions', { beneficiaryId: 'b1', accountId: 'a1', paymentMethodId: 'pm1', quoteId: 'q1' }));
    expect(await screen.findByTestId('receipt')).toHaveTextContent('local-tx');
    const next = setTransactionData.mock.calls[0][0]({ ...FULL, countryCode: 'BR' });
    expect(next).toEqual({ countryCode: 'BR', quote: null, beneficiary: null, account: null, paymentMethod: null });
  });

  it('falls back to quote.quoteId when the quote has no id', async () => {
    const u = userEvent.setup();
    request.mockResolvedValue({ id: 'x' });
    renderWithProviders(<ReviewTransaction />, { transaction: { ...FULL, quote: { ...QUOTE, id: undefined, quoteId: 'qq' } } });
    await u.click(screen.getByRole('button', { name: /confirm and send/i }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('post', '/transactions', expect.objectContaining({ quoteId: 'qq' })));
  });

  it('shows an error when the API returns no transaction id or rejects', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    request.mockResolvedValue({ status: 'weird' });
    renderWithProviders(<ReviewTransaction />, { transaction: FULL, setTransactionData });
    await u.click(screen.getByRole('button', { name: /confirm and send/i }));
    expect(await screen.findByText('Transaction not created')).toBeInTheDocument();
    expect(screen.getByText('The API did not return a transaction id.')).toBeInTheDocument();
    expect(setTransactionData).not.toHaveBeenCalled();

    request.mockImplementation(() => Promise.reject({ error: { source: 'inyo', status: 422, method: 'POST', path: '/fx/transactions', message: 'Funding account is not verified', hint: 'Validation error' } }));
    await u.click(screen.getByRole('button', { name: /confirm and send/i }));
    expect(await screen.findByText(/Inyo 422 on POST \/fx\/transactions/)).toBeInTheDocument();
  });

  it('offers a quote refresh instead of confirming once the quote expired', () => {
    vi.setSystemTime(new Date('2026-11-16T12:30:00Z'));
    renderWithProviders(<ReviewTransaction />, { transaction: FULL });
    expect(screen.getByText('This quote expired. Get a new one.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm and send/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /refresh quote/i })).toHaveAttribute('href', '/dashboard');
  });
});
