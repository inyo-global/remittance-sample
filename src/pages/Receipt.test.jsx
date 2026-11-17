import React from 'react';
import { Route } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Receipt from './Receipt';
import { request } from '../api';
import { LocationProbe, renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const txData = {
    id: 'ext-tx-1',
    createdAt: '2026-11-12T18:53:00.000Z',
    complianceStatus: 'Approved',
    payoutStatus: 'Processing',
    anchorCurrencyAmount: { amount: 100, currency: 'USD' },
    fee: { amount: 4, currency: 'USD' },
    totalAmount: { amount: 104, currency: 'USD' },
    destinationExchangeRate: { rate: 5.1234, fromCurrency: 'USD', toCurrency: 'BRL' },
    receivingAmount: { amount: 512.34, currency: 'BRL' },
    sender: { name: 'Jane Doe', phoneNumber: '+15551234567' },
    recipient: { name: 'João Silva', phoneNumber: '+5511999999999' },
    receipt: {
        license: 'LIC-123',
        contactInfo: 'Contact us at help@example.com',
        rightToRefund: 'You can ask for a refund within 30 minutes.',
        cancellationDisclosure: 'Cancellation is free before payout.',
    },
};
const transaction = { id: 'local-1', externalId: 'ext-tx-1', status: 'Processing', createdAt: '2026-11-12T18:53:00.000Z', recipientName: 'João Silva', data: txData };

const history = [
    { id: 'h2', complianceStatus: 'Approved', payoutStatus: 'Processing', createdAt: '2026-11-12T18:55:00.000Z', messages: [{ id: 'm1', message: 'Payment authorised', createdBy: 'system', type: 'INFO' }] },
    { id: 'h1', complianceStatus: 'Pending', payoutStatus: 'Pending', createdAt: '2026-11-12T18:53:00.000Z', messages: [] },
];

function mockApi({ list = [transaction], status = history, sync, cancel } = {}) {
    request.mockImplementation(async (method, url) => {
        if (method === 'get' && url === '/transactions') return typeof list === 'function' ? list() : list;
        if (method === 'get' && /\/transactions\/.+\/status$/.test(url)) return typeof status === 'function' ? status() : status;
        if (method === 'get' && /\/transactions\/.+\/sync$/.test(url)) return sync ? sync() : transaction;
        if (method === 'post' && /\/transactions\/.+\/cancel$/.test(url)) return cancel ? cancel() : { ...transaction, status: 'Cancelled' };
        throw new Error(`unexpected ${method} ${url}`);
    });
}

const renderReceipt = (state) =>
    renderWithProviders(<Receipt />, {
        route: '/transaction/receipt',
        path: '/transaction/receipt',
        state,
        extraRoutes: <Route path="/transactions" element={<LocationProbe />} />,
    });

beforeEach(() => {
    request.mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => vi.unstubAllGlobals());

describe('Receipt loading', () => {
    it('redirects to /transactions when opened without a transaction', async () => {
        mockApi();
        renderReceipt(undefined);
        expect(await screen.findByTestId('location')).toHaveTextContent('/transactions');
        expect(request).not.toHaveBeenCalled();
    });

    it('re-reads the stored copy after a fresh POST and swaps it in', async () => {
        const stored = { ...transaction, data: { ...txData, recipient: { name: 'Stored Name' } } };
        mockApi({ list: [stored] });
        renderReceipt({ transaction: { id: 'local-1', externalId: 'ext-tx-1' } });
        expect(await screen.findByText('Stored Name')).toBeInTheDocument();
        expect(request).toHaveBeenCalledWith('get', '/transactions');
        expect(screen.getByText('Transfer submitted')).toBeInTheDocument();
    });

    it('matches the stored copy by externalId as well', async () => {
        mockApi({ list: [transaction] });
        renderReceipt({ transaction: { id: 'ext-tx-1' } });
        expect(await screen.findByText('João Silva')).toBeInTheDocument();
    });

    it('skips the list re-read when opened from the history', async () => {
        mockApi();
        renderReceipt({ transaction, fromHistory: true });
        expect(await screen.findByText('Transaction receipt')).toBeInTheDocument();
        expect(request).not.toHaveBeenCalledWith('get', '/transactions');
        expect(request).toHaveBeenCalledWith('get', '/transactions/local-1/status');
    });
});

describe('Receipt content', () => {
    it('renders the financial summary exactly from the API fields', async () => {
        mockApi();
        renderReceipt({ transaction, fromHistory: true });
        await screen.findByText('Transaction receipt');
        const line = (label) => screen.getByText(label).closest('div');
        expect(line('Amount sent')).toHaveTextContent('$100.00');
        expect(line('Transfer fee')).toHaveTextContent('$4.00');
        expect(line('Total paid')).toHaveTextContent('$104.00');
        expect(line('Exchange rate')).toHaveTextContent('1 USD = 5.1234 BRL');
        expect(line('Beneficiary receives')).toHaveTextContent('512.34 BRL');
    });

    it('shows the transmission order id, parties, license and disclosures', async () => {
        mockApi();
        renderReceipt({ transaction, fromHistory: true });
        await screen.findByText('Transaction receipt');
        expect(screen.getByText('ext-tx-1')).toBeInTheDocument();
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        expect(screen.getByText('+15551234567')).toBeInTheDocument();
        expect(screen.getByText('João Silva')).toBeInTheDocument();
        expect(screen.getByText('LIC-123')).toBeInTheDocument();
        expect(screen.getByText('Contact us at help@example.com')).toBeInTheDocument();
        expect(screen.getByText(/You can ask for a refund/)).toBeInTheDocument();
        expect(screen.getByText(/Cancellation is free before payout/)).toBeInTheDocument();
        expect(screen.getByText(/\(ET\)/)).toBeInTheDocument();
    });

    it('shows the compliance and payout badges', async () => {
        mockApi();
        renderReceipt({ transaction, fromHistory: true });
        expect(await screen.findByText('Compliance: Approved')).toBeInTheDocument();
        expect(screen.getByText('Payout: Processing')).toBeInTheDocument();
    });

    it('falls back to the nested status object and the row status', async () => {
        const tx = { ...transaction, status: 'Pending', data: { ...txData, complianceStatus: undefined, payoutStatus: undefined, status: { complianceStatus: 'Pending' } } };
        mockApi();
        renderReceipt({ transaction: tx, fromHistory: true });
        expect(await screen.findByText('Compliance: Pending')).toBeInTheDocument();
        expect(screen.getByText('Payout: Pending')).toBeInTheDocument();
    });

    it('warns when the payment is waiting for a 3DS challenge', async () => {
        mockApi();
        renderReceipt({ transaction: { ...transaction, data: { ...txData, paymentStatus: 'ActionRequired' } }, fromHistory: true });
        expect(await screen.findByText('3D Secure verification required')).toBeInTheDocument();
    });

    it('falls back to "—" when the parties are unknown and hides the disclosures block', async () => {
        mockApi();
        renderReceipt({ transaction: { ...transaction, recipientName: null, data: { ...txData, sender: null, recipient: null, receipt: {} } }, fromHistory: true });
        await screen.findByText('Transaction receipt');
        expect(screen.getAllByText('—')).toHaveLength(2);
        expect(screen.queryByText('LIC-123')).not.toBeInTheDocument();
        expect(screen.queryByText(/Right to refund/)).not.toBeInTheDocument();
    });
});

describe('Status history', () => {
    it('renders one row per history entry with messages, newest first', async () => {
        mockApi();
        renderReceipt({ transaction, fromHistory: true });
        await screen.findByText('Payment authorised');
        const timeline = screen.getByText('Payment authorised').closest('ol');
        const rows = Array.from(timeline.children);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('Processing');
        expect(rows[0]).toHaveTextContent('Compliance: Approved');
        expect(rows[0]).toHaveTextContent('Payment authorised');
        expect(rows[0]).toHaveTextContent('· system · INFO');
        expect(rows[1]).toHaveTextContent('Pending');
        expect(rows[1]).toHaveTextContent('Compliance: Pending');
    });

    it('shows the empty message when no history exists', async () => {
        mockApi({ status: [] });
        renderReceipt({ transaction, fromHistory: true });
        expect(await screen.findByText('No status changes recorded yet.')).toBeInTheDocument();
    });

    it('shows the error when the history cannot be loaded and reloads on demand', async () => {
        let fail = true;
        mockApi({ status: () => { if (fail) throw 'history down'; return history; } });
        renderReceipt({ transaction, fromHistory: true });
        expect(await screen.findByText('history down')).toBeInTheDocument();
        fail = false;
        await userEvent.click(screen.getByRole('button', { name: 'Reload history' }));
        expect(await screen.findByText('Payment authorised')).toBeInTheDocument();
    });
});

describe('Receipt actions', () => {
    it('Refresh status syncs the transaction, reloads the history and toasts', async () => {
        const updated = { ...transaction, status: 'Completed', data: { ...txData, payoutStatus: 'Completed' } };
        mockApi({ sync: () => updated });
        renderReceipt({ transaction, fromHistory: true });
        await screen.findByText('Payout: Processing');
        await userEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
        expect(await screen.findByText('Status refreshed')).toBeInTheDocument();
        expect(request).toHaveBeenCalledWith('get', '/transactions/local-1/sync');
        expect(screen.getByText('Payout: Completed')).toBeInTheDocument();
        expect(request.mock.calls.filter(([, u]) => u === '/transactions/local-1/status')).toHaveLength(2);
    });

    it('toasts when the refresh fails', async () => {
        mockApi({ sync: () => { throw { error: { source: 'local', message: 'sync failed' } }; } });
        renderReceipt({ transaction, fromHistory: true });
        await screen.findByText('Payout: Processing');
        await userEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
        expect(await screen.findByText('Could not refresh status')).toBeInTheDocument();
        expect(screen.getByText('sync failed')).toBeInTheDocument();
    });

    it('Cancel asks for confirmation, posts the cancel and toasts', async () => {
        mockApi({ cancel: () => ({ ...transaction, status: 'Cancelled', data: { ...txData, payoutStatus: 'Cancelled' } }) });
        renderReceipt({ transaction, fromHistory: true });
        await screen.findByText('Payout: Processing');
        await userEvent.click(screen.getByRole('button', { name: 'Cancel transfer' }));
        expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Cancel this transfer?'));
        expect(request).toHaveBeenCalledWith('post', '/transactions/local-1/cancel');
        expect(await screen.findByText('Cancellation requested')).toBeInTheDocument();
        expect(screen.getByText('Payout: Cancelled')).toBeInTheDocument();
        // No longer reversible once cancelled
        expect(screen.queryByRole('button', { name: 'Cancel transfer' })).not.toBeInTheDocument();
    });

    it('does nothing when the cancellation is declined', async () => {
        vi.stubGlobal('confirm', vi.fn(() => false));
        mockApi();
        renderReceipt({ transaction, fromHistory: true });
        await screen.findByText('Payout: Processing');
        await userEvent.click(screen.getByRole('button', { name: 'Cancel transfer' }));
        expect(request).not.toHaveBeenCalledWith('post', expect.anything());
    });

    it('toasts when the cancel is refused', async () => {
        mockApi({ cancel: () => { throw { error: { source: 'inyo', status: 422, method: 'PUT', path: '/x', message: 'not reversible', hint: 'too late' } }; } });
        renderReceipt({ transaction, fromHistory: true });
        await screen.findByText('Payout: Processing');
        await userEvent.click(screen.getByRole('button', { name: 'Cancel transfer' }));
        expect(await screen.findByText('Could not cancel')).toBeInTheDocument();
        expect(screen.getByText(/Inyo 422 on PUT \/x/)).toBeInTheDocument();
    });

    it('hides Cancel for a completed transfer', async () => {
        mockApi();
        renderReceipt({ transaction: { ...transaction, status: 'Completed', data: { ...txData, payoutStatus: 'Completed' } }, fromHistory: true });
        await screen.findByText('Payout: Completed');
        expect(screen.queryByRole('button', { name: 'Cancel transfer' })).not.toBeInTheDocument();
    });

    it('Print calls window.print', async () => {
        const print = vi.spyOn(window, 'print').mockImplementation(() => {});
        mockApi();
        renderReceipt({ transaction, fromHistory: true });
        await screen.findByText('Payout: Processing');
        await userEvent.click(screen.getByRole('button', { name: 'Print' }));
        expect(print).toHaveBeenCalled();
    });

    it('links to the transaction list and to a new transfer', async () => {
        mockApi();
        renderReceipt({ transaction, fromHistory: true });
        await screen.findByText('Payout: Processing');
        expect(screen.getByRole('link', { name: 'View all transactions' })).toHaveAttribute('href', '/transactions');
        expect(screen.getByRole('link', { name: 'New transfer' })).toHaveAttribute('href', '/dashboard');
    });
});

describe('Receipt wait states', () => {
    it('shows the preparing spinner while re-reading the list', async () => {
        let resolve;
        request.mockImplementation((method, url) => {
            if (url === '/transactions') return new Promise((r) => { resolve = r; });
            return Promise.resolve([]);
        });
        renderReceipt({ transaction });
        expect(await screen.findByText('Preparing receipt…')).toBeInTheDocument();
        resolve([transaction]);
        await waitFor(() => expect(screen.queryByText('Preparing receipt…')).not.toBeInTheDocument());
    });
});
