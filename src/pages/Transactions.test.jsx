import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, useLocation } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Transactions from './Transactions';
import { request } from '../api';
import { renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const TX1 = {
  id: 't1', createdAt: '2026-11-10T15:30:00Z', amount: 104, currency: 'USD', recipientName: 'Maria Silva',
  data: { complianceStatus: 'Approved', payoutStatus: 'Completed', recipient: { name: 'Maria Silva' }, receivingAmount: { amount: 520.5, currency: 'BRL' }, fee: { amount: 4, currency: 'USD' } },
};
const TX2 = {
  id: 't2', createdAt: '2026-11-11T09:00:00Z', amount: 50, currency: 'USD',
  data: { complianceStatus: 'Pending', payoutStatus: 'Pending', totalAmount: { amount: 50, currency: 'USD' } },
};
const user = { userId: 'u1' };

function ReceiptProbe() {
  const { state } = useLocation();
  return <div data-testid="receipt">{state?.transaction?.id}:{String(state?.fromHistory)}</div>;
}

describe('Transactions', () => {
  beforeEach(() => { request.mockReset(); });

  it('lists transactions with recipient, amounts, summary badge and sub-statuses', async () => {
    request.mockResolvedValue([TX1, TX2]);
    renderWithProviders(<Transactions />, { session: { user: user } });
    expect(screen.getByText(/loading transactions/i)).toBeInTheDocument();
    const rows = await screen.findAllByRole('row');
    expect(request).toHaveBeenCalledWith('get', '/transactions');
    // header + 2 rows
    expect(rows).toHaveLength(3);
    const first = rows[1];
    expect(within(first).getByText('Maria Silva')).toBeInTheDocument();
    expect(within(first).getByText('receives 520.50 BRL')).toBeInTheDocument();
    expect(within(first).getByText('$104.00')).toBeInTheDocument();
    expect(within(first).getByText('incl. $4.00 fee')).toBeInTheDocument();
    expect(within(first).getAllByText('Completed').length).toBeGreaterThan(0);
    expect(within(first).getByText('Approved')).toBeInTheDocument();
    const second = rows[2];
    expect(within(second).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(second).getByText('Bank deposit')).toBeInTheDocument();
    expect(within(second).getAllByText('Compliance review').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /new transfer/i })).toHaveAttribute('href', '/dashboard');
  });

  it('shows the empty state', async () => {
    request.mockResolvedValue([]);
    renderWithProviders(<Transactions />, { session: { user: user } });
    expect(await screen.findByText('No transfers yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start a transfer/i })).toHaveAttribute('href', '/dashboard');
  });

  it('shows the API error', async () => {
    request.mockImplementation(() => Promise.reject({ error: 'boom' }));
    renderWithProviders(<Transactions />, { session: { user: user } });
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });

  it('opens the receipt with the row and fromHistory on click', async () => {
    const u = userEvent.setup();
    request.mockResolvedValue([TX1]);
    renderWithProviders(<Transactions />, { session: { user: user },  route: '/transactions', extraRoutes: <Route path="/transaction/receipt" element={<ReceiptProbe />} /> });
    await u.click(await screen.findByText('Maria Silva'));
    expect(await screen.findByTestId('receipt')).toHaveTextContent('t1:true');
  });

  it('refreshes one row from Inyo and toasts the new statuses without navigating', async () => {
    const u = userEvent.setup();
    const updated = { ...TX2, data: { ...TX2.data, complianceStatus: 'Approved', payoutStatus: 'Processing' } };
    request.mockImplementation((method, url) => {
      if (url === '/transactions') return Promise.resolve([TX1, TX2]);
      if (url === '/transactions/t2/sync') return Promise.resolve(updated);
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    });
    renderWithProviders(<Transactions />, { session: { user: user },  route: '/transactions', extraRoutes: <Route path="/transaction/receipt" element={<ReceiptProbe />} /> });
    const rows = await screen.findAllByRole('row');
    await u.click(within(rows[2]).getByRole('button', { name: /refresh status/i }));
    expect(await screen.findByText('Status refreshed')).toBeInTheDocument();
    expect(screen.getByText('Approved / Processing')).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getAllByRole('row')[2]).getAllByText('Processing').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('receipt')).not.toBeInTheDocument();
  });

  it('toasts when the refresh fails', async () => {
    const u = userEvent.setup();
    request.mockImplementation((method, url) => (url === '/transactions' ? Promise.resolve([TX1]) : Promise.reject({ error: 'Inyo down' })));
    renderWithProviders(<Transactions />, { session: { user: user } });
    await u.click(await screen.findByRole('button', { name: /refresh status/i }));
    expect(await screen.findByText('Could not refresh status')).toBeInTheDocument();
    expect(screen.getByText('Inyo down')).toBeInTheDocument();
  });
});
