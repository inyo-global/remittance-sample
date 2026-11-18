import React from 'react';
import { Route } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Overview from './Overview';
import { request } from '../api';
import { LocationProbe, renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const USER = { userId: 'u1', firstName: 'Jane' };
const NOW = new Date('2026-11-16T12:00:00.000Z');

const tx = (over = {}) => ({
    id: over.id || `tx-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: '2026-11-10T10:00:00.000Z',
    amount: 104,
    currency: 'USD',
    recipientName: 'João Silva',
    data: { complianceStatus: 'Approved', payoutStatus: 'Completed', receivingAmount: { amount: 500, currency: 'BRL' }, recipient: { name: 'João Silva' } },
    ...over,
});

const verifiedCard = { id: 'c1', type: 'CARD', token: {}, data: { apiResponse: { status: 'Verified' } } };
const pendingCard = { id: 'c2', type: 'CARD', token: {}, data: { apiResponse: { status: 'ActionRequired' } } };
const compliance = (level) => ({ currentComplianceLevel: { level } });

function mockApi({ transactions = [], beneficiaries = [], paymentMethods = [], compliance: comp = null } = {}) {
    request.mockImplementation(async (method, url) => {
        const pick = (v) => (typeof v === 'function' ? v() : v);
        if (url === '/transactions') return pick(transactions);
        if (url === '/beneficiaries') return pick(beneficiaries);
        if (url === '/payment-methods') return pick(paymentMethods);
        if (url === '/compliance') return pick(comp);
        throw new Error(`unexpected ${method} ${url}`);
    });
}

const renderOverview = ({ hasProfile = true } = {}) =>
    renderWithProviders(<Overview />, {
        session: { user: USER, hasProfile },
        route: '/overview',
        path: '/overview',
        extraRoutes: <Route path="*" element={<LocationProbe />} />,
    });

beforeEach(() => {
    request.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
});

describe('Overview data loading', () => {
    it('loads transactions, beneficiaries, payment methods and compliance', async () => {
        mockApi({ compliance: compliance('LEVEL_1') });
        renderOverview();
        expect(screen.getByText('Loading your account…')).toBeInTheDocument();
        expect(await screen.findByText('Nothing sent yet')).toBeInTheDocument();
        for (const url of ['/transactions', '/beneficiaries', '/payment-methods', '/compliance']) {
            expect(request).toHaveBeenCalledWith('get', url);
        }
    });

    it('does not request the compliance level without a profile', async () => {
        mockApi();
        renderOverview({ hasProfile: false });
        await screen.findByText('Nothing sent yet');
        expect(request).not.toHaveBeenCalledWith('get', '/compliance');
        expect(screen.getByText('Personal information required')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Complete profile' })).toHaveAttribute('href', '/profile');
    });

    it('shows only the transaction error; the other calls degrade silently', async () => {
        mockApi({
            transactions: () => { throw { error: { source: 'local', message: 'tx list broke' } }; },
            beneficiaries: () => { throw new Error('ben broke'); },
            paymentMethods: () => { throw new Error('pm broke'); },
            compliance: () => { throw new Error('comp broke'); },
        });
        renderOverview();
        expect(await screen.findByText('Could not load your transactions')).toBeInTheDocument();
        expect(screen.getByText('tx list broke')).toBeInTheDocument();
        expect(screen.queryByText('ben broke')).not.toBeInTheDocument();
        // Everything degrades to "not done"
        expect(screen.getByText('The person who receives the money, with a bank account or PIX key.')).toBeInTheDocument();
        expect(screen.getByText('A card or a bank account linked with Plaid.')).toBeInTheDocument();
        expect(screen.getByText('Could not read your level yet. Open the Compliance page to retry.')).toBeInTheDocument();
    });

    it('treats non-array answers as empty lists', async () => {
        mockApi({ transactions: { items: [] }, beneficiaries: null, paymentMethods: 'oops' });
        renderOverview();
        expect(await screen.findByText('Nothing sent yet')).toBeInTheDocument();
    });
});

describe('Overview checklist', () => {
    it('describes each step while nothing is done', async () => {
        mockApi();
        renderOverview({ hasProfile: false });
        expect(await screen.findByText('Before your first transfer')).toBeInTheDocument();
        expect(screen.getByText('4 of 4 steps left. Inyo requires all of them to create a transaction.')).toBeInTheDocument();
        expect(screen.getByText('Name, address, date of birth and an identity document. Required before anything else.')).toBeInTheDocument();
        expect(screen.getByText('Assigned by Inyo once your profile is saved.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Complete your personal information/ })).toHaveAttribute('href', '/profile');
    });

    it('marks steps done with their details and keeps "Continue setup" on the first undone one', async () => {
        mockApi({ compliance: compliance('LEVEL_1'), beneficiaries: [{ id: 'b1' }, { id: 'b2' }], paymentMethods: [pendingCard] });
        renderOverview();
        expect(await screen.findByText('Sender registered with Inyo.')).toBeInTheDocument();
        expect(screen.getByText('You are at Level 1.')).toBeInTheDocument();
        expect(screen.getByText('2 saved.')).toBeInTheDocument();
        expect(screen.getByText('Added, but none is Verified yet (3DS or Plaid pending).')).toBeInTheDocument();
        expect(screen.getByText('1 of 4 steps left. Inyo requires all of them to create a transaction.')).toBeInTheDocument();
        const continueLinks = screen.getAllByRole('link', { name: 'Continue setup' });
        continueLinks.forEach((l) => expect(l).toHaveAttribute('href', '/payment-methods'));
    });

    it('explains LEVEL_0 and the missing-compliance case', async () => {
        mockApi({ compliance: compliance('LEVEL_0') });
        renderOverview();
        expect(await screen.findByText('Level 0: check the missing fields on the Compliance page.')).toBeInTheDocument();
    });

    it('shows "Account ready" and a primary New transfer link once everything is done', async () => {
        mockApi({ compliance: compliance('LEVEL_2'), beneficiaries: [{ id: 'b1' }], paymentMethods: [verifiedCard, pendingCard] });
        renderOverview();
        expect(await screen.findByText('Account ready')).toBeInTheDocument();
        expect(screen.getByText('Everything Inyo needs is in place.')).toBeInTheDocument();
        expect(screen.getByText('1 ready to use.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'New transfer' })).toHaveAttribute('href', '/dashboard');
        expect(screen.getByRole('link', { name: 'Send your first transfer' })).toHaveAttribute('href', '/dashboard');
        expect(screen.getByText(/Your account is ready\. Lock a quote/)).toBeInTheDocument();
    });

    it('links the quick actions to every section', async () => {
        mockApi();
        renderOverview();
        await screen.findByText('Nothing sent yet');
        for (const [name, href] of [['Beneficiaries', '/beneficiaries'], ['Payment methods', '/payment-methods'], ['Limits', '/compliance'], ['Transactions', '/transactions'], ['Personal info', '/profile']]) {
            expect(screen.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute('href', href);
        }
    });
});

describe('Overview with transactions', () => {
    const transactions = [
        tx({ id: 't1', createdAt: '2026-11-15T10:00:00.000Z', amount: 104 }),
        tx({ id: 't2', createdAt: '2026-11-01T10:00:00.000Z', amount: 50, data: { complianceStatus: 'Pending', payoutStatus: 'Pending', receivingAmount: { amount: 250, currency: 'BRL' }, recipient: { name: 'Maria' } } }),
        tx({ id: 't3', createdAt: '2026-09-01T10:00:00.000Z', amount: 200, data: { complianceStatus: 'Rejected', payoutStatus: 'Cancelled', receivingAmount: { amount: 3400, currency: 'MXN' }, recipient: { name: 'Pedro' } } }),
        tx({ id: 't4', createdAt: '2026-10-30T10:00:00.000Z', amount: 10, data: { payoutStatus: 'Processing', receivingAmount: { amount: 49, currency: 'BRL' }, recipient: { name: 'Ana' } } }),
        tx({ id: 't5', createdAt: '2026-10-29T10:00:00.000Z', amount: 20, data: { payoutStatus: 'Completed', receivingAmount: { amount: 98, currency: 'BRL' }, recipient: { name: 'Bia' } } }),
        tx({ id: 't6', createdAt: '2026-10-28T10:00:00.000Z', amount: 30, data: { payoutStatus: 'Completed', receivingAmount: { amount: 147, currency: 'BRL' }, recipient: { name: 'Caio' } } }),
    ];

    it('computes the stat tiles', async () => {
        mockApi({ transactions, compliance: compliance('LEVEL_1'), beneficiaries: [{ id: 'b' }], paymentMethods: [verifiedCard] });
        renderOverview();
        // Tile labels are <p>; badges reuse the same words in <span>.
        const tile = async (label) => (await screen.findByText(label, { selector: 'p' })).closest('div');
        expect(await tile('Total sent')).toHaveTextContent('$414.00');
        expect(screen.getByText('6 transfers in total')).toBeInTheDocument();
        // Last 30 days from 2026-11-16: t1 (Nov 15), t2 (Nov 1), t4 (Oct 30), t5 (Oct 29), t6 (Oct 28) = 104+50+10+20+30
        expect(await tile('Sent in the last 30 days')).toHaveTextContent('$214.00');
        expect(await tile('Completed')).toHaveTextContent('3');
        const inProgress = await tile('In progress');
        expect(inProgress).toHaveTextContent('2');
        expect(inProgress).toHaveTextContent('1 failed or rejected');
    });

    it('uses compact notation above ten thousand', async () => {
        mockApi({ transactions: [tx({ amount: 12500 })] });
        renderOverview();
        // Total and last-30-days tiles both show the compact amount
        expect(await screen.findAllByText('$12.5K')).toHaveLength(2);
    });

    it('groups volume by destination currency, largest first', async () => {
        mockApi({ transactions });
        renderOverview();
        await screen.findByText('Volume by destination');
        expect(screen.getByText('Amount charged in USD, per destination currency.')).toBeInTheDocument();
        const items = screen.getAllByTitle(/transfers?, \$/);
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveAttribute('title', 'BRL: 5 transfers, $214.00 sent');
        expect(items[0]).toHaveTextContent('→ 1,044.00 BRL');
        expect(items[1]).toHaveAttribute('title', 'MXN: 1 transfer, $200.00 sent');
    });

    it('groups the headline statuses with their counts', async () => {
        mockApi({ transactions });
        renderOverview();
        await screen.findByText('By status');
        const card = screen.getByText('By status').closest('.card');
        const rows = within(card).getAllByRole('listitem');
        expect(rows[0]).toHaveTextContent('Completed');
        expect(rows[0]).toHaveTextContent('3');
        expect(rows.map((r) => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Compliance review'), expect.stringContaining('Compliance rejected'), expect.stringContaining('Processing')]));
    });

    it('lists the latest five transfers and opens the receipt on click', async () => {
        mockApi({ transactions });
        renderOverview();
        await screen.findByText('Recent transfers');
        const card = screen.getByText('Recent transfers').closest('.card');
        const rows = within(card).getAllByRole('button');
        expect(rows).toHaveLength(5);
        expect(rows[0]).toHaveTextContent('João Silva');
        expect(rows[0]).toHaveTextContent('Nov 15, 2026');
        expect(rows[0]).toHaveTextContent('receives 500.00 BRL');
        expect(rows[0]).toHaveTextContent('$104.00');
        expect(screen.queryByText('Caio')).not.toBeInTheDocument();

        await userEvent.click(rows[1]);
        expect(await screen.findByTestId('location')).toHaveTextContent('/transaction/receipt');
    });

    it('shows the "Account setup" checklist next to the history when steps are missing', async () => {
        mockApi({ transactions });
        renderOverview();
        expect(await screen.findByText('Account setup')).toBeInTheDocument();
        expect(screen.getByText('What this account has sent through Inyo so far.')).toBeInTheDocument();
    });
});
