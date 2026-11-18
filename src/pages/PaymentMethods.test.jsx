import React from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentMethods from './PaymentMethods';
import { request } from '../api';
import { renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const USER = { userId: 'u1', firstName: 'Jane' };

const ach = { id: 'ach-1', type: 'ACH', token: { nickname: 'Chase' }, data: { apiResponse: { status: 'Verified', bankName: 'Chase', accountNumber: '000123456789' } } };
const verifiedCard = { id: 'card-ok', type: 'CARD', token: { schemeId: 'VISA', cardType: 'DEBIT', lastFourDigits: '4242' }, data: { apiResponse: { status: 'Verified' } } };
// The page only accepts 3DS postMessages from origins under its vendor allowlist (see the page source);
// a .test subdomain keeps this one fictitious while still passing that check.
const TRUSTED_ORIGIN = 'https://acs.inyo.global.test';

const pendingCard = {
    id: 'card-3ds',
    type: 'CARD',
    token: { schemeId: 'VISA', cardType: 'DEBIT', lastFourDigits: '0000' },
    data: { apiResponse: { status: 'ActionRequired', redirectAcsUrl: 'https://acs.example.test/challenge/1' } },
};
const pendingNoUrl = { id: 'card-nourl', type: 'CARD', token: { schemeId: 'MC', lastFourDigits: '1111' }, data: { apiResponse: { status: 'ActionRequired' } } };

const emptyWebhooks = { events: [], publicUrl: null, path: '/api/webhooks/gateway', basicAuth: false };

function mockApi({ methods = [], webhooks = emptyWebhooks, sync, remove } = {}) {
    request.mockImplementation(async (method, url) => {
        if (method === 'get' && url === '/payment-methods') return typeof methods === 'function' ? methods() : methods;
        if (method === 'get' && url === '/webhooks/events') return typeof webhooks === 'function' ? webhooks() : webhooks;
        if (method === 'get' && /\/payment-methods\/.+\/sync$/.test(url)) return sync ? sync(url) : { status: 'Verified' };
        if (method === 'delete' && /\/payment-methods\//.test(url)) return remove ? remove(url) : { success: true };
        throw new Error(`unexpected ${method} ${url}`);
    });
}

const postMessage = (data, origin) => {
    act(() => {
        window.dispatchEvent(new MessageEvent('message', { data, origin }));
    });
};

beforeAll(() => {
    // The 3DS modal embeds the ACS page in an iframe; keep happy-dom from fetching it.
    window.happyDOM.settings.disableIframePageLoading = true;
});

beforeEach(() => {
    request.mockReset();
    // happy-dom ships no window.confirm; the page relies on it before deleting.
    vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => vi.unstubAllGlobals());

describe('PaymentMethods list', () => {
    it('shows a spinner then the methods grouped by type', async () => {
        mockApi({ methods: [ach, verifiedCard] });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        expect(screen.getByText('Loading payment methods…')).toBeInTheDocument();

        expect(await screen.findByText('Bank accounts (ACH)')).toBeInTheDocument();
        expect(screen.getByText('Debit cards')).toBeInTheDocument();
        expect(screen.getByText('Chase')).toBeInTheDocument();
        expect(screen.getByText('ACH ···· 6789')).toBeInTheDocument();
        expect(screen.getByText('VISA')).toBeInTheDocument();
        expect(screen.getByText('debit card ···· 4242')).toBeInTheDocument();
    });

    it('omits a group with no methods', async () => {
        mockApi({ methods: [verifiedCard] });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await screen.findByText('Debit cards');
        expect(screen.queryByText('Bank accounts (ACH)')).not.toBeInTheDocument();
    });

    it('renders the empty state with a link to add a method', async () => {
        mockApi({ methods: [] });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        expect(await screen.findByText('No payment methods yet')).toBeInTheDocument();
        const links = screen.getAllByRole('link', { name: /Add payment method/ });
        expect(links.length).toBeGreaterThan(0);
        links.forEach((l) => expect(l).toHaveAttribute('href', '/payment'));
    });

    it('shows the load error', async () => {
        request.mockImplementation(async (method, url) => {
            if (url === '/webhooks/events') return emptyWebhooks;
            throw { error: { source: 'local', message: 'db is down' } };
        });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        expect(await screen.findByText('db is down')).toBeInTheDocument();
    });

    it('offers Resume 3DS only for cards in ActionRequired with a challenge URL', async () => {
        mockApi({ methods: [verifiedCard, pendingCard, pendingNoUrl] });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await screen.findByText('Debit cards');
        expect(screen.getAllByRole('button', { name: 'Resume 3DS' })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'Resume in a new tab' })).toHaveLength(1);
        // Check status for every non-usable card (two of them), Remove for all three
        expect(screen.getAllByRole('button', { name: 'Check status' })).toHaveLength(2);
        expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(3);
    });
});

describe('3DS challenge', () => {
    it('Resume 3DS opens a modal with the ACS iframe', async () => {
        mockApi({ methods: [pendingCard] });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Resume 3DS' }));
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-label', '3D Secure verification');
        expect(within(dialog).getByTitle('3D Secure challenge')).toHaveAttribute('src', pendingCard.data.apiResponse.redirectAcsUrl);
    });

    it('Resume in a new tab opens the URL with window.open and shows the tab text instead of an iframe', async () => {
        const tab = { closed: false, close: vi.fn() };
        const open = vi.spyOn(window, 'open').mockReturnValue(tab);
        mockApi({ methods: [pendingCard] });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Resume in a new tab' }));
        expect(open).toHaveBeenCalledWith(pendingCard.data.apiResponse.redirectAcsUrl, '_blank');
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).queryByTitle('3D Secure challenge')).not.toBeInTheDocument();
        expect(within(dialog).getByText(/The challenge is running in the tab that just opened/)).toBeInTheDocument();

        // Closing the modal closes the tab too
        await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
        expect(tab.close).toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('"I completed the challenge" closes the modal and syncs the card', async () => {
        mockApi({ methods: [pendingCard], sync: () => ({ status: 'Verified' }) });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Resume 3DS' }));
        await userEvent.click(screen.getByRole('button', { name: 'I completed the challenge, check status' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(await screen.findByText('Card verified')).toBeInTheDocument();
        expect(request).toHaveBeenCalledWith('get', '/payment-methods/card-3ds/sync');
    });

    it('accepts a relayed result from the same origin, closes the tab and syncs', async () => {
        const tab = { closed: false, close: vi.fn() };
        vi.spyOn(window, 'open').mockReturnValue(tab);
        mockApi({ methods: [pendingCard], sync: () => ({ status: 'Verified' }) });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Resume in a new tab' }));

        postMessage({ source: 'remittance-sample-3ds', outcome: 'success', payload: { response: '{"approved":true}' } }, window.location.origin);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(tab.close).toHaveBeenCalled();
        expect(await screen.findByText('Card verified')).toBeInTheDocument();
    });

    it('accepts a {response:{...}} payload from an Inyo origin, also as a JSON string', async () => {
        mockApi({ methods: [pendingCard], sync: () => ({ status: 'Rejected', data: { statusMessage: 'Issuer said no' } }) });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Resume 3DS' }));

        postMessage(JSON.stringify({ response: { status: 'DECLINED', approved: false, paymentId: 'p1' } }), TRUSTED_ORIGIN);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(await screen.findByText('Card rejected')).toBeInTheDocument();
        expect(screen.getByText('Issuer said no')).toBeInTheDocument();
    });

    it('ignores messages from unknown origins, non-JSON strings and payloads without a result', async () => {
        mockApi({ methods: [pendingCard] });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Resume 3DS' }));
        const syncCalls = () => request.mock.calls.filter(([, url]) => /\/sync$/.test(url)).length;

        postMessage({ response: { approved: true } }, 'https://evil.example.com');
        postMessage('not json at all', TRUSTED_ORIGIN);
        postMessage({ hello: 'world' }, TRUSTED_ORIGIN);
        postMessage({ source: 'remittance-sample-3ds', payload: {} }, 'https://other.example.com');

        await act(async () => { await Promise.resolve(); });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(syncCalls()).toBe(0);
    });
});

describe('Check status', () => {
    it('toasts "Card verified" when Inyo reports Verified', async () => {
        mockApi({ methods: [pendingNoUrl], sync: () => ({ status: 'Verified' }) });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Check status' }));
        expect(await screen.findByText('Card verified')).toBeInTheDocument();
        expect(request).toHaveBeenCalledWith('get', '/payment-methods/card-nourl/sync');
        // the list is reloaded after the sync
        expect(request.mock.calls.filter(([m, u]) => m === 'get' && u === '/payment-methods').length).toBeGreaterThanOrEqual(2);
    });

    it('toasts the rejection message, reading the status from data when needed', async () => {
        mockApi({ methods: [pendingNoUrl], sync: () => ({ data: { status: 'rejected', statusMessage: 'Do not honour' } }) });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Check status' }));
        expect(await screen.findByText('Card rejected')).toBeInTheDocument();
        expect(screen.getByText('Do not honour')).toBeInTheDocument();
    });

    it('toasts a warning for any other status', async () => {
        mockApi({ methods: [pendingNoUrl], sync: () => ({ status: 'ActionRequired' }) });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Check status' }));
        expect(await screen.findByText('Status: ActionRequired')).toBeInTheDocument();
    });

    it('toasts the error when the sync fails', async () => {
        mockApi({ methods: [pendingNoUrl], sync: () => { throw { error: { source: 'local', message: 'sync exploded' } }; } });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Check status' }));
        expect(await screen.findByText('Could not refresh status')).toBeInTheDocument();
        expect(screen.getByText('sync exploded')).toBeInTheDocument();
    });
});

describe('Remove', () => {
    it('asks for confirmation naming the card and does nothing when declined', async () => {
        const confirm = vi.fn(() => false);
        vi.stubGlobal('confirm', confirm);
        mockApi({ methods: [verifiedCard] });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
        expect(confirm).toHaveBeenCalledWith(expect.stringContaining('the card ending in 4242'));
        expect(request).not.toHaveBeenCalledWith('delete', expect.anything());
    });

    it('deletes the method, reloads the list and toasts', async () => {
        let list = [ach];
        mockApi({ methods: () => list, remove: () => { list = []; return { success: true }; } });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
        expect(request).toHaveBeenCalledWith('delete', '/payment-methods/ach-1');
        expect(await screen.findByText('Payment method removed')).toBeInTheDocument();
        expect(await screen.findByText('No payment methods yet')).toBeInTheDocument();
    });

    it('toasts when the delete fails', async () => {
        mockApi({ methods: [ach], remove: () => { throw 'still active'; } });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
        expect(await screen.findByText('Could not remove it')).toBeInTheDocument();
        expect(screen.getByText('still active')).toBeInTheDocument();
    });
});

describe('WebhookPanel', () => {
    it('shows the public URL plus path and the Basic Auth flag', async () => {
        mockApi({ methods: [], webhooks: { events: [], publicUrl: 'https://tunnel.example.test', path: '/api/webhooks/gateway', basicAuth: true } });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        expect(await screen.findByText(/POST https:\/\/tunnel\.example\.test\/api\/webhooks\/gateway/)).toBeInTheDocument();
        expect(screen.getByText(/Basic Auth required/)).toBeInTheDocument();
        expect(screen.getByText('No events received yet.')).toBeInTheDocument();
    });

    it('falls back to the BFF origin when no tunnel is detected', async () => {
        mockApi({ methods: [] });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        const line = await screen.findByText(/no public URL detected/);
        expect(line.textContent).toContain(`${window.location.origin.replace(':3000', ':3001')}/api/webhooks/gateway`);
        expect(line.textContent).toContain('no auth');
    });

    it('lists at most the last 8 events with status, ids and whether a card matched', async () => {
        const events = Array.from({ length: 10 }, (_, i) => ({
            id: 100 - i,
            receivedAt: `2026-11-12T18:5${i % 10}:00.000Z`,
            status: i === 0 ? 'AUTHORIZED' : 'VOIDED',
            paymentId: `pay-${i}`,
            externalPaymentId: i === 1 ? null : `CHECK_ACCOUNT_${i}`,
            matchedCardId: i % 2 === 0 ? 'card-1' : null,
        }));
        mockApi({ methods: [], webhooks: { ...emptyWebhooks, events } });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        expect(await screen.findByText('AUTHORIZED')).toBeInTheDocument();
        expect(screen.getAllByText('VOIDED')).toHaveLength(7);
        expect(screen.getByText('CHECK_ACCOUNT_0')).toBeInTheDocument();
        expect(screen.getByText('pay-1')).toBeInTheDocument(); // falls back to paymentId
        expect(screen.getAllByText('matched a card')).toHaveLength(4);
        expect(screen.getAllByText('no matching card')).toHaveLength(4);
        expect(screen.getByText('2026-11-12 18:50:00')).toBeInTheDocument();
    });

    it('refreshes every 10 s and reloads the methods when a newer event arrives', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        let newest = 1;
        mockApi({ methods: [], webhooks: () => ({ ...emptyWebhooks, events: [{ id: newest, status: 'VOIDED' }] }) });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await screen.findByText('VOIDED');
        const methodCalls = () => request.mock.calls.filter(([m, u]) => m === 'get' && u === '/payment-methods').length;
        const webhookCalls = () => request.mock.calls.filter(([, u]) => u === '/webhooks/events').length;
        expect(methodCalls()).toBe(1);
        expect(webhookCalls()).toBe(1);

        // Same event id: no reload
        await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
        expect(webhookCalls()).toBe(2);
        expect(methodCalls()).toBe(1);

        // Newer event id: methods reloaded
        newest = 2;
        await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
        expect(webhookCalls()).toBe(3);
        await waitFor(() => expect(methodCalls()).toBe(2));
    });

    it('the Refresh button reloads the events', async () => {
        mockApi({ methods: [] });
        renderWithProviders(<PaymentMethods />, { session: { user: USER } });
        await screen.findByText('No events received yet.');
        await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        await waitFor(() => expect(request.mock.calls.filter(([, u]) => u === '/webhooks/events').length).toBe(2));
    });
});
