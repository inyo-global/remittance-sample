import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, useLocation } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from './Dashboard';
import { request } from '../api';
import { renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const NOW = new Date('2026-11-16T12:00:00Z');
const DESTINATIONS = [
  { country: 'BR', countryName: 'Brazil', currency: 'BRL', emoji: '🇧🇷' },
  { country: 'MX', countryName: 'Mexico', currency: 'MXN' },
];
const QUOTE = {
  id: 'q1', amountType: 'NET', effectiveRate: 5.1234, createdAt: '2026-11-16T11:50:00Z', expireAt: '2026-11-16T12:20:00Z',
  sourceAmount: { amount: 100, currency: 'USD' }, fee: { amount: 4, currency: 'USD' }, totalCost: { amount: 104, currency: 'USD' }, destinationAmount: { amount: 512.34, currency: 'BRL' },
};
const user = { userId: 'u1', firstName: 'Jane' };

function Probe() {
  const { pathname, state } = useLocation();
  return <div data-testid="location">{pathname}:{state?.countryCode}</div>;
}
const probes = (
  <>
    <Route path="/beneficiaries" element={<Probe />} />
    <Route path="/beneficiaries/:id/account" element={<Probe />} />
    <Route path="/payment" element={<Probe />} />
    <Route path="/transaction/review" element={<Probe />} />
  </>
);

const mockApi = ({ destinations = { countryDestinations: DESTINATIONS }, quote = QUOTE } = {}) =>
  request.mockImplementation((method, url) => {
    if (url === '/destinations') return typeof destinations === 'function' ? destinations() : Promise.resolve(destinations);
    if (url === '/quotes') return typeof quote === 'function' ? quote() : Promise.resolve(quote);
    return Promise.reject(new Error(`unexpected ${method} ${url}`));
  });

describe('Dashboard', () => {
  beforeEach(() => {
    request.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('loads destinations, selects the first country and defaults to 100 USD NET', async () => {
    mockApi();
    renderWithProviders(<Dashboard user={user} hasProfile />);
    expect(screen.getByText('Hi Jane')).toBeInTheDocument();
    const select = screen.getByLabelText(/destination country/i);
    expect(select).toBeDisabled();
    await waitFor(() => expect(select).toHaveValue('BR'));
    expect(select).toBeEnabled();
    expect(screen.getByRole('option', { name: '🇧🇷 Brazil (BRL)' })).toBeInTheDocument();
    expect(screen.getByLabelText(/you send/i)).toHaveValue(100);
    expect(screen.getByRole('radio', { name: /net/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: /get quote/i })).toBeEnabled();
    expect(screen.queryByText(/sender profile is incomplete/i)).not.toBeInTheDocument();
  });

  it('keeps the context country when it exists in the list and accepts a plain array', async () => {
    mockApi({ destinations: DESTINATIONS });
    renderWithProviders(<Dashboard user={user} hasProfile />, { transaction: { countryCode: 'MX' } });
    await waitFor(() => expect(screen.getByLabelText(/destination country/i)).toHaveValue('MX'));
  });

  it('warns when the profile is incomplete', async () => {
    mockApi();
    renderWithProviders(<Dashboard user={user} hasProfile={false} />);
    expect(screen.getByText('Your sender profile is incomplete')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /complete profile/i })).toHaveAttribute('href', '/profile');
  });

  it('shows the destinations error and retries', async () => {
    const u = userEvent.setup();
    let fail = true;
    mockApi({ destinations: () => (fail ? Promise.reject({ error: 'Inyo 503' }) : Promise.resolve(DESTINATIONS)) });
    renderWithProviders(<Dashboard user={user} hasProfile />);
    expect(await screen.findByText('Destinations unavailable')).toBeInTheDocument();
    expect(screen.getByText('Inyo 503')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get quote/i })).toBeDisabled();
    fail = false;
    await u.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(screen.getByLabelText(/destination country/i)).toHaveValue('BR'));
    expect(screen.queryByText('Destinations unavailable')).not.toBeInTheDocument();
  });

  it('requests a quote for the corridor and stores it with the country', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    mockApi();
    renderWithProviders(<Dashboard user={user} hasProfile />, { setTransactionData });
    await waitFor(() => expect(screen.getByLabelText(/destination country/i)).toHaveValue('BR'));
    await u.click(screen.getByRole('radio', { name: /gross/i }));
    await u.clear(screen.getByLabelText(/you send/i));
    await u.type(screen.getByLabelText(/you send/i), '250');
    await u.click(screen.getByRole('button', { name: /get quote/i }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('post', '/quotes', { fromCurrency: 'USD', toCurrency: 'BRL', amount: '250', amountType: 'GROSS' }));
    const last = setTransactionData.mock.calls.at(-1)[0]({ beneficiary: 'kept' });
    expect(last).toEqual({ beneficiary: 'kept', quote: QUOTE, countryCode: 'BR' });
  });

  it('accepts the {quotes:[...]} response shape and errors when nothing comes back', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    mockApi({ quote: { quotes: [{ ...QUOTE, id: 'from-list' }] } });
    renderWithProviders(<Dashboard user={user} hasProfile />, { setTransactionData });
    await waitFor(() => expect(screen.getByLabelText(/destination country/i)).toHaveValue('BR'));
    await u.click(screen.getByRole('button', { name: /get quote/i }));
    await waitFor(() => expect(setTransactionData).toHaveBeenCalled());
    expect(setTransactionData.mock.calls.at(-1)[0]({}).quote.id).toBe('from-list');

    request.mockReset();
    mockApi({ quote: { quotes: [] } });
    await u.click(screen.getByRole('button', { name: /get quote/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No quote returned for this corridor.');

    request.mockReset();
    mockApi({ quote: () => Promise.reject({ error: { source: 'inyo', status: 422, method: 'POST', path: '/payout/quotes', message: 'amount too low', hint: 'Validation error' } }) });
    await u.click(screen.getByRole('button', { name: /get quote/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Inyo 422 on POST \/payout\/quotes/);
  });

  it('renders the locked quote from context and continues to the next missing step', async () => {
    const u = userEvent.setup();
    mockApi();
    renderWithProviders(<Dashboard user={user} hasProfile />, { route: '/dashboard', transaction: { quote: QUOTE, countryCode: 'BR' }, extraRoutes: probes });
    await waitFor(() => expect(screen.getByLabelText(/destination country/i)).toHaveValue('BR'));
    expect(screen.getByLabelText(/you send/i)).toHaveValue(100);
    expect(screen.getByText('512.34 BRL')).toBeInTheDocument();
    expect(screen.getByText('1 USD = 5.1234 BRL')).toBeInTheDocument();
    expect(screen.getByText('$104.00')).toBeInTheDocument();
    expect(screen.getByText('Rate locked for 20:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh quote/i })).toBeInTheDocument();
    const next = screen.getByRole('button', { name: /choose beneficiary/i });
    expect(next).toBeEnabled();
    await u.click(next);
    expect(await screen.findByTestId('location')).toHaveTextContent('/beneficiaries:BR');
  });

  it.each([
    [{ beneficiary: { id: 'b1' } }, '/beneficiaries/b1/account'],
    [{ beneficiary: { id: 'b1' }, account: { id: 'a1' } }, '/payment'],
    [{ beneficiary: { id: 'b1' }, account: { id: 'a1' }, paymentMethod: { id: 'pm1' } }, '/transaction/review'],
  ])('resumes at the first step without data (%o)', async (filled, target) => {
    const u = userEvent.setup();
    mockApi();
    renderWithProviders(<Dashboard user={user} hasProfile />, { route: '/dashboard', transaction: { quote: QUOTE, countryCode: 'BR', ...filled }, extraRoutes: probes });
    await waitFor(() => expect(screen.getByLabelText(/destination country/i)).toHaveValue('BR'));
    await u.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(await screen.findByTestId('location')).toHaveTextContent(target);
  });

  it('blocks Continue once the quote expired', async () => {
    vi.setSystemTime(new Date('2026-11-16T12:30:00Z'));
    mockApi();
    renderWithProviders(<Dashboard user={user} hasProfile />, { transaction: { quote: QUOTE, countryCode: 'BR' } });
    await waitFor(() => expect(screen.getByLabelText(/destination country/i)).toHaveValue('BR'));
    expect(screen.getByText('Quote expired')).toBeInTheDocument();
    expect(screen.getByText('This quote expired. Refresh it to continue.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose beneficiary/i })).toBeDisabled();
  });

  it('invalidates the quote when the amount or fee type changes, and also the beneficiary when the country changes', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    mockApi();
    renderWithProviders(<Dashboard user={user} hasProfile />, { transaction: { quote: QUOTE, countryCode: 'BR' }, setTransactionData });
    await waitFor(() => expect(screen.getByLabelText(/destination country/i)).toHaveValue('BR'));
    const prev = { quote: QUOTE, countryCode: 'BR', beneficiary: { id: 'b1' }, account: { id: 'a1' }, paymentMethod: { id: 'pm1' } };

    await u.type(screen.getByLabelText(/you send/i), '5');
    expect(setTransactionData.mock.calls.at(-1)[0](prev)).toEqual({ ...prev, quote: null });

    await u.click(screen.getByRole('radio', { name: /gross/i }));
    expect(setTransactionData.mock.calls.at(-1)[0](prev)).toEqual({ ...prev, quote: null });

    await u.selectOptions(screen.getByLabelText(/destination country/i), 'MX');
    expect(setTransactionData.mock.calls.at(-1)[0](prev)).toEqual({ ...prev, quote: null, beneficiary: null, account: null });
  });
});
