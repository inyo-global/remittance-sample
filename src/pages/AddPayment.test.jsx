import React from 'react';
import { Route } from 'react-router-dom';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AddPayment from './AddPayment';
import { request } from '../api';
import { LocationProbe, renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const ACS_URL = 'https://acs.example.test/challenge/42';
// The page only accepts 3DS postMessages from origins under its vendor allowlist (see the page source);
// a .test subdomain keeps this one fictitious while still passing that check.
const TRUSTED_ORIGIN = 'https://acs.inyo.global.test';

const USER = { userId: 'u1', firstName: 'Jane', address: '4429 CANDLEWOOD ST', city: 'LAKEWOOD', state: 'CA', zipcode: '90712' };
const quote = { id: 'q1', expireAt: new Date(Date.now() + 600000).toISOString(), sourceAmount: { amount: 100, currency: 'USD' } };
const beneficiary = { id: 'ben-1', nickname: 'João' };

const ach = { id: 'ach-1', type: 'ACH', token: { nickname: 'Chase' }, data: { apiResponse: { status: 'Verified', bankName: 'Chase', accountNumber: '1234' } } };
const verifiedCard = { id: 'card-ok', type: 'CARD', token: { schemeId: 'VISA', cardType: 'DEBIT', lastFourDigits: '4242' }, data: { apiResponse: { status: 'Verified' } } };
const pendingCard = { id: 'card-3ds', type: 'CARD', token: { schemeId: 'VISA', lastFourDigits: '0000' }, data: { apiResponse: { status: 'ActionRequired', redirectAcsUrl: ACS_URL } } };

/** Replaces inyo.js: records the constructor options and exposes tokenizeCard / tokenData. */
function installTokenizer() {
    const state = { options: null, instance: null, tokenizeCard: vi.fn() };
    window.InyoTokenizer = vi.fn(function InyoTokenizer(options) {
        state.options = options;
        state.instance = this;
        this.tokenData = null;
        this.tokenizeCard = state.tokenizeCard;
    });
    return state;
}

function installPlaid() {
    const state = { options: null, handler: { open: vi.fn() } };
    window.Plaid = { create: vi.fn((options) => { state.options = options; return state.handler; }) };
    return state;
}

function mockApi({ methods = [], card, sync, linkToken, achCreate } = {}) {
    request.mockImplementation(async (method, url, body, options) => {
        const pick = (v) => (typeof v === 'function' ? v(body, options) : v);
        if (method === 'get' && url === '/payment-methods') return pick(methods);
        if (method === 'post' && url === '/payment-methods/cards') return card ? pick(card) : { success: true, id: 'card-new', status: 'Verified' };
        if (method === 'get' && /\/payment-methods\/.+\/sync$/.test(url)) return sync ? pick(sync) : { status: 'Verified' };
        if (method === 'post' && url === '/payment-methods/ach/link-token') return linkToken ? pick(linkToken) : { token: 'link-token-1' };
        if (method === 'post' && url === '/payment-methods/ach') return achCreate ? pick(achCreate) : { success: true, id: 'ach-new', status: 'Pending' };
        throw new Error(`unexpected ${method} ${url}`);
    });
}

const renderPage = ({ route = '/payment', state, transaction, setTransactionData } = {}) =>
    renderWithProviders(
        <>
            <AddPayment />
            <LocationProbe />
        </>,
        { route, path: '/payment', state, session: { user: USER }, transaction, setTransactionData, extraRoutes: <Route path="*" element={<LocationProbe />} /> },
    );

/** Goes to the add-card view, fills the billing address from the profile and waits for the tokenizer. */
async function openAddCard(tokenizer, { fillBilling = true } = {}) {
    await userEvent.click(await screen.findByRole('button', { name: 'Add new' }));
    await userEvent.click(screen.getByRole('button', { name: /^Debit card/ }));
    await waitFor(() => expect(tokenizer.options).not.toBeNull());
    if (fillBilling) await userEvent.click(screen.getByLabelText('Use my address on file'));
}

const postMessage = (data, origin) => {
    act(() => {
        window.dispatchEvent(new MessageEvent('message', { data, origin }));
    });
};

const syncCalls = () => request.mock.calls.filter(([m, u]) => m === 'get' && /\/sync$/.test(u));
const listCalls = () => request.mock.calls.filter(([m, u]) => m === 'get' && u === '/payment-methods');

beforeAll(() => {
    window.happyDOM.settings.disableIframePageLoading = true;
    // The page injects its vendor scripts (tokenizer, Plaid) as <script src> tags. happy-dom never fetches
    // them: each injected script fires "load" right away (or "error" when a test flips the flag below),
    // so no vendor URL is needed here and the globals come from installTokenizer / installPlaid.
    window.happyDOM.settings.disableJavaScriptFileLoading = true;
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
});

beforeEach(() => {
    request.mockReset();
    delete window.InyoTokenizer;
    delete window.Plaid;
    // Script tags live in document.body, outside the React container RTL cleans up.
    document.querySelectorAll('script[src]').forEach((s) => s.remove());
});

afterEach(() => {
    vi.unstubAllGlobals();
    window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
});

describe('AddPayment list view', () => {
    it('shows the grouped methods with the step kicker while in the send flow', async () => {
        mockApi({ methods: [ach, verifiedCard] });
        renderPage({ transaction: { quote } });
        expect(await screen.findByText('Bank accounts (ACH)')).toBeInTheDocument();
        expect(screen.getByText('Step 4 of 5')).toBeInTheDocument();
        expect(screen.getByText('Choose how to pay for this transfer.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });

    it('selecting a usable method stores it in the flow and goes to the review', async () => {
        const setTransactionData = vi.fn();
        mockApi({ methods: [verifiedCard] });
        renderPage({ transaction: { quote, beneficiary }, setTransactionData });
        await userEvent.click(await screen.findByRole('button', { name: /VISA/ }));
        const updater = setTransactionData.mock.calls[0][0];
        expect(updater({ quote })).toEqual({ quote, paymentMethod: verifiedCard });
        expect(screen.getByTestId('location')).toHaveTextContent('/transaction/review');
    });

    it('refuses methods that are not Verified', async () => {
        mockApi({ methods: [pendingCard] });
        renderPage({ transaction: { quote } });
        expect(await screen.findByRole('button', { name: /VISA/ })).toBeDisabled();
    });

    it('outside the flow a click only goes to the management page', async () => {
        const setTransactionData = vi.fn();
        mockApi({ methods: [verifiedCard] });
        renderPage({ setTransactionData });
        expect(await screen.findByText('Choose a funding account to manage.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /VISA/ }));
        expect(setTransactionData).not.toHaveBeenCalled();
        expect(screen.getByTestId('location')).toHaveTextContent('/payment-methods');
    });

    it('Back returns to the beneficiary account step', async () => {
        mockApi({ methods: [verifiedCard] });
        renderPage({ transaction: { quote, beneficiary } });
        await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/beneficiaries/ben-1/account');
    });

    it('shows the empty state and the load error', async () => {
        mockApi({ methods: [] });
        renderPage();
        expect(await screen.findByText('No payment method yet')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Add payment method' }));
        expect(screen.getByText('Add payment method', { selector: 'h1' })).toBeInTheDocument();
    });

    it('shows the load error', async () => {
        mockApi({ methods: () => { throw { error: { source: 'local', message: 'list broke' } }; } });
        renderPage();
        expect(await screen.findByText('list broke')).toBeInTheDocument();
    });

    it('opens the type selection directly with location.state.forceAdd', async () => {
        mockApi({ methods: [verifiedCard] });
        renderPage({ state: { forceAdd: true } });
        expect(await screen.findByText('Both are registered as Inyo funding accounts in USD.')).toBeInTheDocument();
        // Cancel goes back to the list because there are methods
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(await screen.findByText('Payment options')).toBeInTheDocument();
    });
});

describe('AddPayment card form', () => {
    it('creates the tokenizer with 3DS off by default and the form container target', async () => {
        const tokenizer = installTokenizer();
        mockApi();
        renderPage();
        await openAddCard(tokenizer, { fillBilling: false });
        expect(tokenizer.options).toMatchObject({ targetId: '#payment-form-container', storeLaterUse: true, threeDSData: { enable: false } });
        expect(screen.getByLabelText('3DS in tokenizer')).toHaveValue('off');
        expect(screen.getByText('Card data is tokenized in your browser by inyo.js and never touches this server.')).toBeInTheDocument();
    });

    it('re-creates the tokenizer with successUrl/failUrl in redirect mode and enablePostMessage in postmessage mode', async () => {
        const tokenizer = installTokenizer();
        mockApi();
        renderPage();
        await openAddCard(tokenizer, { fillBilling: false });
        await userEvent.selectOptions(screen.getByLabelText('3DS in tokenizer'), 'redirect');
        await waitFor(() => expect(tokenizer.options.threeDSData).toEqual({ enable: true, successUrl: `${window.location.origin}/api/3ds/success`, failUrl: `${window.location.origin}/api/3ds/fail` }));
        expect(screen.getByText(/threeDSData\.successUrl = /)).toHaveTextContent(`${window.location.origin}/api/3ds/success`);
        await userEvent.selectOptions(screen.getByLabelText('3DS in tokenizer'), 'postmessage');
        await waitFor(() => expect(tokenizer.options.threeDSData).toEqual({ enable: true, enablePostMessage: true }));
        expect(window.InyoTokenizer).toHaveBeenCalledTimes(3);
    });

    it('shows an error when the tokenizer script cannot be loaded', async () => {
        window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = false;
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mockApi();
        renderPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Add new' }));
        await userEvent.click(screen.getByRole('button', { name: /^Debit card/ }));
        expect(document.querySelector('script[src]')).not.toBeNull();
        expect(await screen.findByText(/Could not load the Inyo tokenizer script/)).toBeInTheDocument();
    });

    it('"Use my address on file" fills the billing address from the user', async () => {
        const tokenizer = installTokenizer();
        mockApi();
        renderPage();
        await openAddCard(tokenizer);
        expect(screen.getByLabelText(/^Address line 1/)).toHaveValue('4429 CANDLEWOOD ST');
        expect(screen.getByLabelText(/^City/)).toHaveValue('LAKEWOOD');
        expect(screen.getByLabelText(/^State/)).toHaveValue('CA');
        expect(screen.getByLabelText(/^ZIP code/)).toHaveValue('90712');
        await userEvent.click(screen.getByLabelText('Use my address on file'));
        expect(screen.getByLabelText(/^City/)).toHaveValue('');
    });

    it('requires the billing address before tokenizing', async () => {
        const tokenizer = installTokenizer();
        mockApi();
        renderPage();
        await openAddCard(tokenizer, { fillBilling: false });
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
        expect(await screen.findByText('Please complete the billing address.')).toBeInTheDocument();
        expect(tokenizer.tokenizeCard).not.toHaveBeenCalled();
    });

    it('reports when the tokenizer is not ready', async () => {
        mockApi();
        renderPage();
        await userEvent.click(await screen.findByRole('button', { name: 'Add new' }));
        await userEvent.click(screen.getByRole('button', { name: /^Debit card/ }));
        await userEvent.click(screen.getByLabelText('Use my address on file'));
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
        expect(await screen.findByText('Secure tokenizer is not ready yet.')).toBeInTheDocument();
    });

    it('registers the token with the billing address and 3DS mode, then returns to the list', async () => {
        const tokenizer = installTokenizer();
        let list = [];
        const create = vi.fn(() => { list = [verifiedCard]; return { success: true, id: 'card-ok', status: 'Verified' }; });
        mockApi({ methods: () => list, card: create });
        renderPage();
        await openAddCard(tokenizer);
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
        expect(tokenizer.tokenizeCard).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Adding card…' })).toBeDisabled();

        await act(async () => {
            tokenizer.options.successCallback({ reasonCode: 'WAITING_TRANSACTION', additionalData: { token: 'tok-1', lastFourDigits: '4242' } });
        });
        expect(create.mock.calls[0][0]).toEqual({
            token: { token: 'tok-1', lastFourDigits: '4242' },
            billingAddress: { address1: '4429 CANDLEWOOD ST', address2: '', city: 'LAKEWOOD', state: 'CA', zipcode: '90712' },
            threeDsMode: 'off',
        });
        expect(await screen.findByText('Card added')).toBeInTheDocument();
        expect(screen.getByText('Status: Verified')).toBeInTheDocument();
        expect(await screen.findByText('Payment options')).toBeInTheDocument();
        expect(screen.getByText('debit card ···· 4242')).toBeInTheDocument();
    });

    it('ignores tokenizer callbacks that were not started by this page', async () => {
        const tokenizer = installTokenizer();
        mockApi();
        renderPage();
        await openAddCard(tokenizer);
        await act(async () => {
            tokenizer.options.successCallback({ additionalData: { token: 'stale' } });
        });
        expect(request).not.toHaveBeenCalledWith('post', '/payment-methods/cards', expect.anything());
    });

    it('fails when the tokenizer answers without a token', async () => {
        const tokenizer = installTokenizer();
        mockApi();
        renderPage();
        await openAddCard(tokenizer);
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
        await act(async () => { tokenizer.options.successCallback({ reasonCode: 'DECLINED', additionalData: {} }); });
        expect(await screen.findByText('Tokenizer answered DECLINED without a token.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add card' })).toBeEnabled();
    });

    it('maps validation codes to the card fields', async () => {
        const tokenizer = installTokenizer();
        mockApi();
        renderPage();
        await openAddCard(tokenizer);
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
        await act(async () => { tokenizer.options.errorCallback({ code: 'INVALID_PAN', message: 'Invalid card number' }); });
        expect(await screen.findByText('Card not tokenized')).toBeInTheDocument();
        expect(screen.getByText('Invalid card number (INVALID_PAN)')).toBeInTheDocument();
        const pan = screen.getByLabelText('Debit card number');
        expect(pan).toHaveAttribute('aria-invalid', 'true');
        expect(document.getElementById('cc-number-error')).toHaveTextContent('Invalid card number');
    });

    it('GATEWAY_ERROR with a minted token continues with the registration and shows a notice', async () => {
        const tokenizer = installTokenizer();
        const create = vi.fn(() => ({ success: true, id: 'card-x', status: 'Verified' }));
        mockApi({ card: create });
        renderPage();
        await openAddCard(tokenizer);
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
        tokenizer.instance.tokenData = { additionalData: { token: 'tok-gw', lastFourDigits: '0000' } };
        await act(async () => { tokenizer.options.errorCallback({ code: 'GATEWAY_ERROR', message: 'no redirectUrl' }); });
        expect(create.mock.calls[0][0]).toMatchObject({ token: { token: 'tok-gw', lastFourDigits: '0000' } });
        expect(await screen.findByText('Card added')).toBeInTheDocument();
    });

    it('GATEWAY_ERROR before any token only shows a notice and keeps waiting', async () => {
        const tokenizer = installTokenizer();
        mockApi();
        renderPage();
        await openAddCard(tokenizer);
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
        await act(async () => { tokenizer.options.errorCallback({ code: 'GATEWAY_ERROR', message: 'unrelated message' }); });
        expect(await screen.findByText(/GATEWAY_ERROR \(unrelated message\) before any token was issued/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Adding card…' })).toBeDisabled();
        expect(request).not.toHaveBeenCalledWith('post', '/payment-methods/cards', expect.anything());
    });

    it('gives up after 45 seconds without an answer', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const tokenizer = installTokenizer();
        mockApi();
        renderPage();
        await openAddCard(tokenizer);
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
        await act(async () => { await vi.advanceTimersByTimeAsync(45000); });
        expect(await screen.findByText(/No answer from the tokenizer after 45 seconds/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add card' })).toBeEnabled();
    });

    it('reports a synchronous tokenizer failure', async () => {
        const tokenizer = installTokenizer();
        tokenizer.tokenizeCard.mockImplementation(() => { throw new Error('iframe missing'); });
        mockApi();
        renderPage();
        await openAddCard(tokenizer);
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
        expect(await screen.findByText('Tokenizer error: iframe missing')).toBeInTheDocument();
    });

    it('shows the registration error and toasts a truncated version', async () => {
        const tokenizer = installTokenizer();
        const long = 'x'.repeat(200);
        mockApi({ card: () => { throw { error: { source: 'local', message: long } }; } });
        renderPage();
        await openAddCard(tokenizer);
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
        await act(async () => { tokenizer.options.successCallback({ additionalData: { token: 't' } }); });
        expect(await screen.findByText(long)).toBeInTheDocument();
        expect(screen.getByText(`${'x'.repeat(160)}…`)).toBeInTheDocument();
        expect(screen.getAllByText('Card not added').length).toBeGreaterThan(0);
    });
});

describe('AddPayment 3DS challenge (modal)', () => {
    async function startChallenge(tokenizer, extra = {}) {
        mockApi({ card: { success: true, id: 'card-3ds', status: 'ActionRequired', redirectAcsUrl: ACS_URL, gatewayPaymentId: 'gw-1' }, ...extra });
        renderPage();
        await openAddCard(tokenizer);
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
        await act(async () => { tokenizer.options.successCallback({ additionalData: { token: 'tok' } }); });
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveAttribute('aria-label', '3D Secure verification');
        return dialog;
    }

    it('opens the ACS page in an iframe with the gateway payment id', async () => {
        const tokenizer = installTokenizer();
        const dialog = await startChallenge(tokenizer);
        expect(within(dialog).getByTitle('3D Secure challenge')).toHaveAttribute('src', ACS_URL);
        expect(within(dialog).getByText('gw-1')).toBeInTheDocument();
    });

    it('confirms with Inyo on "I completed the challenge" and returns to the list', async () => {
        const tokenizer = installTokenizer();
        const dialog = await startChallenge(tokenizer, { sync: { status: 'Verified' } });
        await userEvent.click(within(dialog).getByRole('button', { name: 'I completed the challenge, check status' }));
        expect(request).toHaveBeenCalledWith('get', '/payment-methods/card-3ds/sync');
        expect(await screen.findByText('Card verified')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(listCalls().length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText('Payment options')).toBeInTheDocument();
    });

    it('warns when Inyo has not confirmed the result yet', async () => {
        const tokenizer = installTokenizer();
        const dialog = await startChallenge(tokenizer, { sync: { status: 'ActionRequired' } });
        await userEvent.click(within(dialog).getByRole('button', { name: 'I completed the challenge, check status' }));
        expect(await screen.findByText('Card status: ActionRequired')).toBeInTheDocument();
    });

    it('closing the modal drops the pending card and re-reads the list', async () => {
        const tokenizer = installTokenizer();
        const dialog = await startChallenge(tokenizer);
        const before = listCalls().length;
        await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() => expect(listCalls().length).toBe(before + 1));
        expect(syncCalls()).toHaveLength(0);
    });

    it('accepts a relayed result from the app origin and confirms the card', async () => {
        const tokenizer = installTokenizer();
        await startChallenge(tokenizer, { sync: { status: 'Verified' } });
        postMessage({ source: 'remittance-sample-3ds', outcome: 'success', payload: { response: '{"approved":true}' } }, window.location.origin);
        expect(await screen.findByText('Card verified')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('accepts a {response} payload from an Inyo origin', async () => {
        const tokenizer = installTokenizer();
        await startChallenge(tokenizer, { sync: { status: 'Verified' } });
        postMessage({ response: { status: 'AUTHORIZED', approved: true, paymentId: 'gw-1' } }, TRUSTED_ORIGIN);
        expect(await screen.findByText('Card verified')).toBeInTheDocument();
    });

    it('ignores foreign origins, non-JSON strings and payloads without a result', async () => {
        const tokenizer = installTokenizer();
        await startChallenge(tokenizer);
        postMessage({ response: { approved: true } }, 'https://evil.example.com');
        postMessage('garbage', TRUSTED_ORIGIN);
        postMessage({ foo: 'bar' }, TRUSTED_ORIGIN);
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(syncCalls()).toHaveLength(0);
    });

    it('polls Inyo every 5 seconds and closes once the status leaves ActionRequired', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const tokenizer = installTokenizer();
        let status = 'ActionRequired';
        await startChallenge(tokenizer, { sync: () => ({ status }) });
        expect(syncCalls()).toHaveLength(0);

        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(syncCalls()).toHaveLength(1);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        status = 'Pending';
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(syncCalls()).toHaveLength(2);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        status = 'Verified';
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(await screen.findByText('Card verified')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        // polling stopped with the modal
        const after = syncCalls().length;
        await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
        expect(syncCalls().length).toBe(after);
    });
});

describe('AddPayment 3DS challenge (redirect mode, new tab)', () => {
    function fakeTab() {
        return { closed: false, close: vi.fn(), focus: vi.fn(), document: { write: vi.fn() }, location: { replace: vi.fn() } };
    }

    async function startRedirect(tokenizer, tab, extra = {}) {
        vi.stubGlobal('open', vi.fn(() => tab));
        mockApi({ card: { success: true, id: 'card-3ds', status: 'ActionRequired', redirectAcsUrl: ACS_URL }, ...extra });
        renderPage();
        await openAddCard(tokenizer);
        await userEvent.selectOptions(screen.getByLabelText('3DS in tokenizer'), 'redirect');
        await waitFor(() => expect(tokenizer.options.threeDSData.enable).toBe(true));
        await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
    }

    it('opens the tab on the click, points it at the ACS URL and shows the tab dialog', async () => {
        const tokenizer = installTokenizer();
        const tab = fakeTab();
        await startRedirect(tokenizer, tab);
        expect(window.open).toHaveBeenCalledWith('', '_blank');
        expect(tab.document.write).toHaveBeenCalledWith(expect.stringContaining('Waiting for the card issuer'));
        expect(tokenizer.tokenizeCard).toHaveBeenCalled();

        await act(async () => { tokenizer.options.successCallback({ additionalData: { token: 'tok' } }); });
        expect(request).toHaveBeenCalledWith('post', '/payment-methods/cards', expect.objectContaining({ threeDsMode: 'redirect' }));
        expect(tab.location.replace).toHaveBeenCalledWith(ACS_URL);
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveAttribute('aria-label', '3D Secure verification in a new tab');
        expect(within(dialog).queryByTitle('3D Secure challenge')).not.toBeInTheDocument();

        await userEvent.click(within(dialog).getByRole('button', { name: 'Go to the challenge tab' }));
        expect(tab.focus).toHaveBeenCalled();
    });

    it('closes the tab when the card does not need a challenge', async () => {
        const tokenizer = installTokenizer();
        const tab = fakeTab();
        await startRedirect(tokenizer, tab, { card: { success: true, id: 'c', status: 'Verified' } });
        await act(async () => { tokenizer.options.successCallback({ additionalData: { token: 'tok' } }); });
        expect(await screen.findByText('Card added')).toBeInTheDocument();
        expect(tab.close).toHaveBeenCalled();
        expect(tab.location.replace).not.toHaveBeenCalled();
    });

    it('closes the tab when the registration fails', async () => {
        const tokenizer = installTokenizer();
        const tab = fakeTab();
        await startRedirect(tokenizer, tab, { card: () => { throw 'rejected'; } });
        await act(async () => { tokenizer.options.successCallback({ additionalData: { token: 'tok' } }); });
        expect((await screen.findAllByText('rejected')).length).toBeGreaterThan(0);
        expect(tab.close).toHaveBeenCalled();
    });

    it('falls back to a manual link when the popup was blocked', async () => {
        const tokenizer = installTokenizer();
        await startRedirect(tokenizer, null);
        await act(async () => { tokenizer.options.successCallback({ additionalData: { token: 'tok' } }); });
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveAttribute('aria-label', '3D Secure verification in a new tab');
        expect(within(dialog).getByText(/The challenge tab could not be opened automatically/)).toHaveTextContent(ACS_URL);
    });

    it('a relayed result closes the tab, confirms with Inyo and closes the dialog', async () => {
        const tokenizer = installTokenizer();
        const tab = fakeTab();
        await startRedirect(tokenizer, tab, { sync: { status: 'Verified' } });
        await act(async () => { tokenizer.options.successCallback({ additionalData: { token: 'tok' } }); });
        await screen.findByRole('dialog');
        postMessage({ source: 'remittance-sample-3ds', outcome: 'success', payload: {} }, window.location.origin);
        expect(await screen.findByText('Card verified')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(tab.close).toHaveBeenCalled();
    });

    it('closing the tab dialog also closes the tab', async () => {
        const tokenizer = installTokenizer();
        const tab = fakeTab();
        await startRedirect(tokenizer, tab);
        await act(async () => { tokenizer.options.successCallback({ additionalData: { token: 'tok' } }); });
        const dialog = await screen.findByRole('dialog');
        await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
        expect(tab.close).toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});

describe('AddPayment ?3ds= return', () => {
    it('toasts success, clears the parameter and re-reads the list', async () => {
        mockApi({ methods: [verifiedCard] });
        renderPage({ route: '/payment?3ds=success' });
        expect(await screen.findByText('3DS completed')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/payment$/));
        await waitFor(() => expect(listCalls().length).toBeGreaterThanOrEqual(2));
    });

    it('toasts a warning on failure', async () => {
        mockApi({ methods: [] });
        renderPage({ route: '/payment?3ds=fail' });
        expect(await screen.findByText('3DS failed')).toBeInTheDocument();
        expect(screen.getByText('The card issuer did not authenticate the card.')).toBeInTheDocument();
    });
});

describe('AddPayment ACH (Plaid)', () => {
    async function openAch() {
        await userEvent.click(await screen.findByRole('button', { name: 'Add new' }));
        await userEvent.click(screen.getByRole('button', { name: /^Bank account \(ACH\)/ }));
        expect(screen.getByText('Connect with Plaid')).toBeInTheDocument();
    }

    it('requests a link token, creates Plaid Link and opens it', async () => {
        const plaid = installPlaid();
        mockApi();
        renderPage();
        await openAch();
        await userEvent.click(screen.getByRole('button', { name: 'Open Plaid Link' }));
        await waitFor(() => expect(window.Plaid.create).toHaveBeenCalled());
        expect(request).toHaveBeenCalledWith('post', '/payment-methods/ach/link-token');
        expect(plaid.options.token).toBe('link-token-1');
        expect(plaid.handler.open).toHaveBeenCalled();
    });

    it('onSuccess registers the account with the public token and account id, then lists it', async () => {
        const plaid = installPlaid();
        let list = [];
        const create = vi.fn(() => { list = [ach]; return { success: true, id: 'ach-1', status: 'Pending' }; });
        mockApi({ methods: () => list, achCreate: create });
        renderPage();
        await openAch();
        await userEvent.click(screen.getByRole('button', { name: 'Open Plaid Link' }));
        await waitFor(() => expect(plaid.options).not.toBeNull());
        await act(async () => {
            await plaid.options.onSuccess('public-token-1', { accounts: [{ id: 'acct-1' }], institution: { name: 'First Platypus Bank' } });
        });
        expect(create.mock.calls[0][0]).toEqual({ bankData: { accountCheckToken: 'public-token-1', accountCheckId: 'acct-1', nickname: 'First Platypus Bank' } });
        expect(await screen.findByText('Bank account linked')).toBeInTheDocument();
        expect(screen.getByText(/Status: Pending\. ACH accounts become usable once Verified\./)).toBeInTheDocument();
        expect(await screen.findByText('Chase')).toBeInTheDocument();
    });

    it('shows the registration error from onSuccess', async () => {
        const plaid = installPlaid();
        mockApi({ achCreate: () => { throw { error: { source: 'local', message: 'ach failed' } }; } });
        renderPage();
        await openAch();
        await userEvent.click(screen.getByRole('button', { name: 'Open Plaid Link' }));
        await waitFor(() => expect(plaid.options).not.toBeNull());
        await act(async () => { await plaid.options.onSuccess('pt', { accounts: [], institution: null }); });
        expect(await screen.findByText('ach failed')).toBeInTheDocument();
    });

    it('shows the Plaid exit error', async () => {
        const plaid = installPlaid();
        mockApi();
        renderPage();
        await openAch();
        await userEvent.click(screen.getByRole('button', { name: 'Open Plaid Link' }));
        await waitFor(() => expect(plaid.options).not.toBeNull());
        act(() => plaid.options.onExit({ display_message: 'User cancelled' }));
        expect(await screen.findByText('User cancelled')).toBeInTheDocument();
        act(() => plaid.options.onExit({ error_message: 'raw error' }));
        expect(await screen.findByText('raw error')).toBeInTheDocument();
        act(() => plaid.options.onExit({}));
        expect(await screen.findByText('Plaid Link was closed with an error.')).toBeInTheDocument();
    });

    it('shows the link-token error', async () => {
        installPlaid();
        mockApi({ linkToken: () => { throw { error: { source: 'local', message: 'User profile or external ID missing.' } }; } });
        renderPage();
        await openAch();
        await userEvent.click(screen.getByRole('button', { name: 'Open Plaid Link' }));
        expect(await screen.findByText('User profile or external ID missing.')).toBeInTheDocument();
        expect(window.Plaid.create).not.toHaveBeenCalled();
    });

    it('Back returns to the type selection', async () => {
        installPlaid();
        mockApi();
        renderPage();
        await openAch();
        await userEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByText('Both are registered as Inyo funding accounts in USD.')).toBeInTheDocument();
    });
});
