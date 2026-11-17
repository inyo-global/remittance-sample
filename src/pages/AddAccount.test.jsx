import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddAccount from './AddAccount';
import { request } from '../api';
import { LocationProbe, renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const BENEFICIARY = { id: 'b1', externalId: 'ext-b1', nickname: 'Maria Silva', data: { firstName: 'Maria', lastName: 'Silva', address: { countryCode: 'BR' } } };
const SCHEMA = {
  type: 'object',
  properties: {
    externalId: { type: 'string' },
    asset: { type: 'string', enum: ['BRL'] },
    payoutMethod: {
      type: 'object',
      required: ['type', 'bankCode'],
      properties: {
        type: { type: 'string', enum: ['BANK_DEPOSIT', 'PIX'] },
        bankCode: { type: 'string', title: 'Bank code' },
        accountNumber: { type: 'string', title: 'Account number' },
      },
    },
  },
};
const BANKS = [{ code: '001', name: 'Banco do Brasil' }, { code: '237', name: 'Bradesco' }];
const ACCOUNTS = [
  { id: 'a1', externalId: 'ext-a1', data: { asset: 'BRL', payoutMethod: { type: 'BANK_DEPOSIT', bankCode: '237', accountType: 'CHECKING', accountNumber: '123456789' } } },
  { id: 'a2', externalId: 'ext-a2', data: { payoutMethod: { type: 'PIX', keyType: 'CPF', key: '123.456.789-00' } } },
];
const QUOTE = { id: 'q1', expireAt: new Date(Date.now() + 60_000).toISOString() };

const mockApi = ({ accounts = [], schema = SCHEMA, banks = BANKS, create = { id: 'new-1', externalAccountId: 'ext-new' } } = {}) =>
  request.mockImplementation((method, url) => {
    if (url === '/beneficiaries/b1/accounts') return Promise.resolve(accounts);
    if (url.startsWith('/beneficiaries/account-schema/')) return Promise.resolve(schema);
    if (url.startsWith('/banks/')) return typeof banks === 'function' ? banks() : Promise.resolve(banks);
    if (method === 'post' && url === '/beneficiaries/account') return typeof create === 'function' ? create() : Promise.resolve(create);
    return Promise.reject(new Error(`unexpected ${method} ${url}`));
  });

const opts = (extra = {}) => ({ route: '/beneficiaries/b1/account', path: '/beneficiaries/:id/account', state: { beneficiary: BENEFICIARY, countryCode: 'BR' }, ...extra });

describe('AddAccount', () => {
  beforeEach(() => { request.mockReset(); });

  it('lists existing accounts with bank name, masked number and badges', async () => {
    mockApi({ accounts: ACCOUNTS });
    renderWithProviders(<AddAccount />, opts());
    expect(await screen.findByText('Bradesco')).toBeInTheDocument();
    expect(screen.getByText('CHECKING · ···· 6789')).toBeInTheDocument();
    expect(screen.getByText('PIX · CPF')).toBeInTheDocument();
    expect(screen.getByText('123.456.789-00')).toBeInTheDocument();
    expect(screen.getByText('BANK_DEPOSIT')).toBeInTheDocument();
    expect(screen.getByText('BRL')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('get', '/beneficiaries/account-schema/BR');
    expect(request).toHaveBeenCalledWith('get', '/banks/BR');
    expect(screen.getByText(/payout accounts registered for Maria Silva/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add account/i })).toBeInTheDocument();
  });

  it('opens the form directly when there is no account, with banks injected into bankCode', async () => {
    mockApi({ banks: { items: BANKS } });
    renderWithProviders(<AddAccount />, opts());
    const bankCode = await screen.findByLabelText(/bank code/i);
    expect(screen.getByRole('option', { name: 'Banco do Brasil' })).toBeInTheDocument();
    expect(bankCode.tagName).toBe('SELECT');
    // hiddenKeys: externalId is not rendered; single-enum asset is prefilled
    expect(screen.queryByLabelText(/external id/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^asset/i)).toHaveValue('BRL');
  });

  it('tolerates a failing banks call and shows a free-text bankCode', async () => {
    mockApi({ banks: () => Promise.reject(new Error('503')) });
    renderWithProviders(<AddAccount />, opts());
    const bankCode = await screen.findByLabelText(/bank code/i);
    expect(bankCode.tagName).toBe('INPUT');
  });

  it('shows the empty state list view when accounts exist but are empty after switching', async () => {
    const u = userEvent.setup();
    mockApi({ accounts: ACCOUNTS });
    renderWithProviders(<AddAccount />, opts());
    await screen.findByText('Bradesco');
    await u.click(screen.getByRole('button', { name: /add account/i }));
    expect(await screen.findByLabelText(/bank code/i)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /back/i }));
    expect(await screen.findByText('Bradesco')).toBeInTheDocument();
  });

  it('in the flow, selecting an account stores it and goes to /payment', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    mockApi({ accounts: ACCOUNTS });
    renderWithProviders(<AddAccount />, opts({ transaction: { quote: QUOTE, beneficiary: BENEFICIARY }, setTransactionData, extraRoutes: <Route path="/payment" element={<LocationProbe />} /> }));
    expect(await screen.findByText('Step 3 of 5')).toBeInTheDocument();
    expect(screen.getByText(/how should Maria Silva receive/i)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /bradesco/i }));
    expect(setTransactionData.mock.calls[0][0]({ quote: QUOTE })).toEqual({ quote: QUOTE, account: ACCOUNTS[0] });
    expect(await screen.findByTestId('location')).toHaveTextContent('/payment');
  });

  it('outside the flow the list is read-only and saving returns to the beneficiaries list', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    mockApi({ accounts: ACCOUNTS });
    renderWithProviders(<AddAccount />, opts({ setTransactionData, extraRoutes: <Route path="/beneficiaries" element={<LocationProbe />} /> }));
    await screen.findByText('Bradesco');
    expect(screen.getByRole('button', { name: /bradesco/i })).toBeDisabled();
    await u.click(screen.getByRole('button', { name: /add account/i }));
    await u.selectOptions(await screen.findByLabelText(/bank code/i), '001');
    await u.type(screen.getByLabelText(/account number/i), '999');
    await u.click(screen.getByRole('button', { name: /save account/i }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('post', '/beneficiaries/account', {
      beneficiaryId: 'b1',
      externalPersonId: 'ext-b1',
      formData: { asset: 'BRL', payoutMethod: { bankCode: '001', accountNumber: '999' } },
    }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/beneficiaries');
    expect(setTransactionData).not.toHaveBeenCalled();
  });

  it('in the flow, saving a new account selects it with the typed data', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    mockApi();
    renderWithProviders(<AddAccount />, opts({ transaction: { quote: QUOTE, beneficiary: BENEFICIARY }, setTransactionData, extraRoutes: <Route path="/payment" element={<LocationProbe />} /> }));
    await u.selectOptions(await screen.findByLabelText(/bank code/i), '237');
    await u.click(screen.getByRole('button', { name: /save and continue/i }));
    await waitFor(() => expect(setTransactionData).toHaveBeenCalled());
    const next = setTransactionData.mock.calls[0][0]({});
    expect(next.account).toEqual({ id: 'new-1', externalId: 'ext-new', data: { asset: 'BRL', payoutMethod: { bankCode: '237' } } });
    expect(await screen.findByTestId('location')).toHaveTextContent('/payment');
  });

  it('reports an unknown destination country', async () => {
    mockApi();
    renderWithProviders(<AddAccount />, { route: '/beneficiaries/b1/account', path: '/beneficiaries/:id/account', state: { beneficiary: { id: 'b1', data: {} } } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/destination country is unknown/i);
    expect(request).not.toHaveBeenCalledWith('get', expect.stringMatching(/account-schema/));
  });

  it('reports a failed save', async () => {
    const u = userEvent.setup();
    mockApi({ create: () => Promise.reject({ error: { source: 'local', message: 'Access denied to this beneficiary' } }) });
    renderWithProviders(<AddAccount />, opts());
    await u.selectOptions(await screen.findByLabelText(/bank code/i), '237');
    await u.click(screen.getByRole('button', { name: /save account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied to this beneficiary');
  });
});
