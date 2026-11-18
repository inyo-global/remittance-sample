import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Beneficiaries from './Beneficiaries';
import { request } from '../api';
import { LocationProbe, renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const BR = { id: 'b1', nickname: 'Maria Silva', data: { firstName: 'Maria', lastName: 'Silva', address: { countryCode: 'BR' }, documents: [{ type: 'CPF', document: '123' }] } };
const MX = { id: 'b2', nickname: '', data: { firstName: 'Juan', lastName: 'Perez', documents: [{ type: 'CURP', countryCode: 'MX', document: '***MASK***' }] } };
const NONE = { id: 'b3', nickname: 'No country', data: {} };
const QUOTE = { id: 'q1', expireAt: new Date(Date.now() + 60_000).toISOString() };
const user = { userId: 'u1' };

const probe = <Route path="/beneficiaries/:id/account" element={<LocationProbe />} />;

describe('Beneficiaries', () => {
  beforeEach(() => { request.mockReset(); });

  it('loads and lists beneficiaries with name, country and document', async () => {
    request.mockResolvedValue([BR, MX]);
    renderWithProviders(<Beneficiaries />, { session: { user: user } });
    expect(screen.getByText(/loading beneficiaries/i)).toBeInTheDocument();
    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('get', '/beneficiaries');
    expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    expect(screen.getByText('BR')).toBeInTheDocument();
    expect(screen.getByText('MX')).toBeInTheDocument();
    expect(screen.getByText('CPF · 123')).toBeInTheDocument();
    // masked documents are not echoed
    expect(screen.getByText('CURP')).toBeInTheDocument();
    expect(screen.queryByText(/MASK/)).not.toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Beneficiaries' })).toBeInTheDocument();
  });

  it('shows the empty state outside the flow', async () => {
    request.mockResolvedValue([]);
    renderWithProviders(<Beneficiaries />, { session: { user: user } });
    expect(await screen.findByText('No beneficiaries yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /add beneficiary/i })).toHaveLength(2);
  });

  it('shows the API error', async () => {
    request.mockImplementation(() => Promise.reject({ error: { source: 'local', message: 'db down' } }));
    renderWithProviders(<Beneficiaries />, { session: { user: user } });
    expect(await screen.findByRole('alert')).toHaveTextContent('db down');
  });

  it('in the flow, filters by the quote country and keeps beneficiaries without a country', async () => {
    request.mockResolvedValue([BR, MX, NONE]);
    renderWithProviders(<Beneficiaries />, { session: { user: user },  transaction: { quote: QUOTE, countryCode: 'br' } });
    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('No country')).toBeInTheDocument();
    expect(screen.queryByText('Juan Perez')).not.toBeInTheDocument();
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /who are you sending to/i })).toBeInTheDocument();
    expect(screen.getByText(/showing beneficiaries in BR/i)).toBeInTheDocument();
  });

  it('uses location.state.countryCode over the context country and shows the country empty state', async () => {
    request.mockResolvedValue([BR]);
    renderWithProviders(<Beneficiaries />, { session: { user: user },  route: '/beneficiaries', state: { countryCode: 'MX' }, transaction: { quote: QUOTE, countryCode: 'BR' } });
    expect(await screen.findByText('No beneficiaries in MX yet')).toBeInTheDocument();
  });

  it('selecting in the flow stores the beneficiary, clears the account and navigates with state', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    request.mockResolvedValue([BR]);
    renderWithProviders(<Beneficiaries />, { session: { user: user },  route: '/beneficiaries', transaction: { quote: QUOTE, countryCode: 'BR', account: { id: 'old' } }, setTransactionData, extraRoutes: probe });
    await u.click(await screen.findByRole('button', { name: /maria silva/i }));
    expect(setTransactionData).toHaveBeenCalledTimes(1);
    const next = setTransactionData.mock.calls[0][0]({ quote: QUOTE, account: { id: 'old' } });
    expect(next).toEqual({ quote: QUOTE, beneficiary: BR, account: null });
    expect(await screen.findByTestId('location')).toHaveTextContent('/beneficiaries/b1/account');
  });

  it('selecting outside the flow only navigates', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    request.mockResolvedValue([MX]);
    renderWithProviders(<Beneficiaries />, { session: { user: user },  route: '/beneficiaries', setTransactionData, extraRoutes: probe });
    await u.click(await screen.findByRole('button', { name: /juan perez/i }));
    expect(setTransactionData).not.toHaveBeenCalled();
    expect(await screen.findByTestId('location')).toHaveTextContent('/beneficiaries/b2/account');
  });

  it('"Add beneficiary" goes to the new-beneficiary form', async () => {
    const u = userEvent.setup();
    request.mockResolvedValue([BR]);
    renderWithProviders(<Beneficiaries />, { session: { user: user },  route: '/beneficiaries', extraRoutes: <Route path="/beneficiaries/new" element={<LocationProbe />} /> });
    await screen.findByText('Maria Silva');
    await u.click(screen.getByRole('button', { name: /add beneficiary/i }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/beneficiaries/new'));
  });
});
