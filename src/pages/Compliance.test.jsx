import React from 'react';
import { Route } from 'react-router-dom';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Compliance from './Compliance';
import { request } from '../api';
import { LocationProbe, renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const USER = { userId: 'u1' };

const levels = {
    currentComplianceLevel: {
        level: 'LEVEL_1',
        limits: { oneDayLimit: { amount: 1000, currency: 'USD' }, thirtyDaysLimit: { amount: 3000, currency: 'USD' }, oneHundredAndEightyDaysLimit: { amount: 10000, currency: 'USD' } },
        requiredFields: ['firstName', 'residentialAddress'],
    },
    nextComplianceLevel: {
        level: 'LEVEL_2',
        limits: { oneDayLimit: { amount: 5000, currency: 'USD' }, thirtyDaysLimit: { amount: 15000, currency: 'USD' }, oneHundredAndEightyDaysLimit: { amount: 50000, currency: 'USD' } },
        perTransactionFields: ['sourceOfFunds'],
    },
    missingFieldsForNextComplianceLevel: ['documents.0.verified', 'ssn'],
};
const usage = { oneDayLimit: { used: { amount: 900, currency: 'USD' } }, thirtyDaysLimit: { used: 500 }, oneHundredAndEightyDaysLimit: { used: { amount: 0 } } };

const session = (over = {}) => ({ sessionId: 'sess-1', status: 'PENDING', widgetUrl: 'https://widget.example.test/s/1', createdAt: '2026-11-12T10:00:00.000Z', data: {}, ...over });

/** Routes the BFF calls to the given handlers; each handler can be a value or a function of (method, url, body, options). */
function mockApi(handlers = {}) {
    request.mockImplementation(async (method, url, body, options) => {
        const key = `${method} ${url.split('?')[0]}`;
        const match = Object.entries(handlers).find(([k]) => (k.startsWith('/') ? new RegExp(k.slice(1, -1)).test(key) : k === key));
        if (!match) throw new Error(`unexpected ${method} ${url}`);
        const [, h] = match;
        return typeof h === 'function' ? h(method, url, body, options) : h;
    });
}

const baseHandlers = {
    'get /compliance': levels,
    'get /limits': usage,
    'get /kyc/session': null,
    'get /documents': [],
};

const renderCompliance = (route = '/compliance') =>
    renderWithProviders(<Compliance />, { session: { user: USER },  route, path: '/compliance', extraRoutes: <Route path="*" element={<LocationProbe />} /> });

beforeEach(() => {
    request.mockReset();
    vi.stubGlobal('prompt', vi.fn(() => 'because'));
    vi.stubGlobal('open', vi.fn(() => ({})));
});

afterEach(() => vi.unstubAllGlobals());

describe('Compliance level', () => {
    it('shows the spinner, then the level, limits, usage and required fields', async () => {
        mockApi(baseHandlers);
        renderCompliance();
        expect(screen.getByText('Loading compliance level…')).toBeInTheDocument();
        expect(await screen.findByText('Level 1')).toBeInTheDocument();
        expect(screen.getByText('next: Level 2')).toBeInTheDocument();
        expect(screen.getByText('Can transact')).toBeInTheDocument();

        const day = screen.getByText('24 hours', { selector: 'p' }).closest('div');
        expect(day).toHaveTextContent('$1,000');
        expect(day).toHaveTextContent('$900.00 used · $100.00 left');
        expect(day.querySelector('.bg-danger-500')).not.toBeNull(); // 90% used

        const month = screen.getByText('30 days', { selector: 'p' }).closest('div');
        expect(month).toHaveTextContent('$3,000');
        expect(month).toHaveTextContent('$500.00 used · $2,500.00 left');
        expect(month.querySelector('.bg-brand-500')).not.toBeNull();

        expect(screen.getByText('Verified for this level')).toBeInTheDocument();
        expect(screen.getByText('First Name')).toBeInTheDocument();
        expect(screen.getByText('Residential Address')).toBeInTheDocument();
    });

    it('omits the usage line when limits are unavailable', async () => {
        mockApi({ ...baseHandlers, 'get /limits': () => { throw new Error('nope'); } });
        renderCompliance();
        await screen.findByText('Level 1');
        expect(screen.queryByText(/used ·/)).not.toBeInTheDocument();
    });

    it('lists the next level limits, the missing fields and the per-transaction fields', async () => {
        mockApi(baseHandlers);
        renderCompliance();
        expect(await screen.findByText('Upgrade to Level 2')).toBeInTheDocument();
        expect(screen.getByText('Still missing')).toBeInTheDocument();
        expect(screen.getByText('Documents Verified')).toBeInTheDocument();
        expect(screen.getByText('Ssn')).toBeInTheDocument();
        expect(screen.getByText('$5,000')).toBeInTheDocument();
        expect(screen.getByText(/Per-transaction fields at this level: Source Of Funds\./)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Update profile' })).toHaveAttribute('href', '/profile');
    });

    it('says all requirements are met when nothing is missing', async () => {
        mockApi({ ...baseHandlers, 'get /compliance': { ...levels, missingFieldsForNextComplianceLevel: [] } });
        renderCompliance();
        expect(await screen.findByText('Requirements')).toBeInTheDocument();
        expect(screen.getByText(/All requirements are met/)).toBeInTheDocument();
    });

    it('shows the highest-level card when there is no next level', async () => {
        mockApi({ ...baseHandlers, 'get /compliance': { currentComplianceLevel: { level: 'LEVEL_3', limits: {} } } });
        renderCompliance();
        expect(await screen.findByText('You are at the highest level.')).toBeInTheDocument();
        expect(screen.getByText('Level 3')).toBeInTheDocument();
    });

    it('marks LEVEL_0 as unable to transact', async () => {
        mockApi({ ...baseHandlers, 'get /compliance': { currentComplianceLevel: { level: 'LEVEL_0', limits: {} } } });
        renderCompliance();
        expect(await screen.findByText('Cannot transact')).toBeInTheDocument();
        expect(screen.getAllByText('$0')).toHaveLength(3);
    });

    it('shows "No compliance data yet" with a profile link when the level is missing', async () => {
        mockApi({ ...baseHandlers, 'get /compliance': {} });
        renderCompliance();
        expect(await screen.findByText('No compliance data yet')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'sender profile' })).toHaveAttribute('href', '/profile');
    });

    it('shows the error and retries on demand', async () => {
        let fail = true;
        mockApi({ ...baseHandlers, 'get /compliance': () => { if (fail) throw { error: { source: 'inyo', status: 404, method: 'GET', path: '/participants/x/complianceLevels', message: 'Not found', hint: 'wrong tenant' } }; return levels; } });
        renderCompliance();
        expect(await screen.findByText('Could not load compliance data')).toBeInTheDocument();
        expect(screen.getByText(/Inyo 404 on GET \/participants\/x\/complianceLevels/)).toBeInTheDocument();
        fail = false;
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('Level 1')).toBeInTheDocument();
    });
});

describe('KycPanel', () => {
    it('reads the latest session without refreshing and offers to start one', async () => {
        mockApi(baseHandlers);
        renderCompliance();
        expect(await screen.findByRole('button', { name: 'Verify identity' })).toBeInTheDocument();
        expect(request).toHaveBeenCalledWith('get', '/kyc/session?refresh=false');
    });

    it('creates a session with the browser language, opens the widget and toasts', async () => {
        const created = session();
        mockApi({ ...baseHandlers, 'post /kyc/session': created });
        renderCompliance();
        await userEvent.click(await screen.findByRole('button', { name: 'Verify identity' }));
        expect(request).toHaveBeenCalledWith('post', '/kyc/session', { language: navigator.language.split('-')[0] || 'en' });
        expect(window.open).toHaveBeenCalledWith(created.widgetUrl, '_blank', 'noopener');
        expect(await screen.findByText('Verification session created')).toBeInTheDocument();
        expect(screen.getByText('sess-1')).toBeInTheDocument();
        expect(screen.getByText('PENDING')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open widget' })).toHaveAttribute('href', created.widgetUrl);
        // PENDING: no automatic re-check
        expect(request).not.toHaveBeenCalledWith('get', '/kyc/session');
    });

    it('re-checks right away when the session was decided at creation', async () => {
        mockApi({
            ...baseHandlers,
            'post /kyc/session': session({ status: 'PENDING_REVIEW', widgetUrl: null }),
            'get /kyc/session': (m, url) => (url.includes('refresh=false') ? null : session({ status: 'PENDING_REVIEW' })),
        });
        renderCompliance();
        await userEvent.click(await screen.findByRole('button', { name: 'Verify identity' }));
        await waitFor(() => expect(request).toHaveBeenCalledWith('get', '/kyc/session'));
        expect(await screen.findByText('Held for review')).toBeInTheDocument();
        expect(screen.getByText(/Inyo returned no widget URL/)).toBeInTheDocument();
    });

    it('shows the creation error', async () => {
        mockApi({ ...baseHandlers, 'post /kyc/session': () => { throw { error: { source: 'local', message: 'redirectUrl would be "(empty)"' } }; } });
        renderCompliance();
        await userEvent.click(await screen.findByRole('button', { name: 'Verify identity' }));
        expect(await screen.findByText(/redirectUrl would be/)).toBeInTheDocument();
    });

    it('renders the session details, decision and checks', async () => {
        mockApi({
            ...baseHandlers,
            'get /kyc/session': session({ status: 'VERIFIED', data: { completedAt: '2026-11-12T11:00:00.000Z', result: { decision: 'approve', checks: [{ name: 'faceMatch', passed: true }, { check: 'documentExpiry', result: 'failed' }] } } }),
        });
        renderCompliance();
        expect(await screen.findByText('Document verified')).toBeInTheDocument();
        expect(screen.getByText('approve')).toBeInTheDocument();
        expect(screen.getByText('Face Match')).toHaveClass('text-success-700');
        expect(screen.getByText('Document Expiry')).toHaveClass('text-danger-700');
        // terminal: no widget link, "New session" offered
        expect(screen.queryByRole('link', { name: 'Open widget' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New session' })).toBeInTheDocument();
    });

    it('explains a PENDING session without a widget link', async () => {
        mockApi({ ...baseHandlers, 'get /kyc/session': session({ widgetUrl: null }) });
        renderCompliance();
        expect(await screen.findByText(/The widget link is only returned while the session is undecided/)).toBeInTheDocument();
    });

    it('Check status re-reads the session and toasts the status', async () => {
        mockApi({ ...baseHandlers, 'get /kyc/session': (m, url) => (url.includes('refresh=false') ? session() : session({ status: 'PENDING_REVIEW' })) });
        renderCompliance();
        await userEvent.click(await screen.findByRole('button', { name: 'Check status' }));
        expect(await screen.findByText('Session PENDING_REVIEW')).toBeInTheDocument();
        expect(screen.getByText(/Held for review\. In sandbox nobody reviews it/)).toBeInTheDocument();
    });

    it('resolves a held session after a prompt and reloads the compliance level', async () => {
        const resolve = vi.fn(() => session({ status: 'VERIFIED' }));
        mockApi({ ...baseHandlers, 'get /kyc/session': session({ status: 'PENDING_REVIEW' }), 'post /kyc/session/sess-1/resolve': (m, u, body) => resolve(body) });
        renderCompliance();
        await userEvent.click(await screen.findByRole('button', { name: 'Resolve: verified' }));
        expect(window.prompt).toHaveBeenCalledWith(expect.stringContaining('verified'), 'Cleared for the integration walkthrough');
        expect(resolve).toHaveBeenCalledWith({ outcome: 'verified', reason: 'because' });
        expect(await screen.findByText('Session resolved as verified')).toBeInTheDocument();
        expect(screen.getByText('Document verified')).toBeInTheDocument();
        // onVerified reloads the compliance data
        await waitFor(() => expect(request.mock.calls.filter(([, u]) => u === '/compliance')).toHaveLength(2));
    });

    it('does nothing when the prompt is cancelled', async () => {
        vi.stubGlobal('prompt', vi.fn(() => null));
        mockApi({ ...baseHandlers, 'get /kyc/session': session({ status: 'PENDING_REVIEW' }) });
        renderCompliance();
        await userEvent.click(await screen.findByRole('button', { name: 'Resolve: rejected' }));
        expect(request).not.toHaveBeenCalledWith('post', expect.stringContaining('/resolve'), expect.anything());
    });

    it('handles ?kyc=done: reads the session, toasts and clears the parameter', async () => {
        mockApi({ ...baseHandlers, 'get /kyc/session': session({ status: 'PENDING_REVIEW' }) });
        renderCompliance('/compliance?kyc=done');
        expect(await screen.findByText('Back from the widget')).toBeInTheDocument();
        expect(screen.getByText('Session is PENDING_REVIEW.')).toBeInTheDocument();
        expect(request).toHaveBeenCalledWith('get', '/kyc/session');
        expect(request).not.toHaveBeenCalledWith('get', '/kyc/session?refresh=false');
        // The panel is still rendered on /compliance (no navigation), with the param removed.
        await waitFor(() => expect(screen.getByText('sess-1')).toBeInTheDocument());
        expect(screen.queryByTestId('location')).not.toBeInTheDocument();
    });

    it('calls onVerified when returning from the widget with a verified session', async () => {
        mockApi({ ...baseHandlers, 'get /kyc/session': session({ status: 'VERIFIED' }) });
        renderCompliance('/compliance?kyc=done');
        await screen.findByText('Back from the widget');
        await waitFor(() => expect(request.mock.calls.filter(([, u]) => u === '/compliance')).toHaveLength(2));
    });
});

describe('SourceOfFundsPanel', () => {
    const docs = [
        { id: 'doc-1', fileName: 'statement.pdf', subtype: 'PROOF_OF_FUNDS', verificationStatus: 'PENDING', createdAt: '2026-11-12T10:00:00.000Z' },
        { id: 'doc-2', fileName: 'paystub.png', status: 'verified' },
    ];

    it('lists the uploads with their status and offers resolve only for PENDING ones', async () => {
        mockApi({ ...baseHandlers, 'get /documents': docs });
        renderCompliance();
        expect(await screen.findByText('statement.pdf')).toBeInTheDocument();
        expect(screen.getByText('paystub.png')).toBeInTheDocument();
        expect(screen.getByText('PENDING')).toBeInTheDocument();
        expect(screen.getByText('VERIFIED', { selector: 'span' })).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'History' })).toHaveLength(2);
        expect(screen.getAllByRole('button', { name: 'Verified' })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'Rejected' })).toHaveLength(1);
    });

    it('shows "No uploads yet." and the list error', async () => {
        mockApi(baseHandlers);
        renderCompliance();
        expect(await screen.findByText('No uploads yet.')).toBeInTheDocument();
    });

    it('rejects unsupported types and oversized files without calling the API', async () => {
        mockApi(baseHandlers);
        renderCompliance();
        await screen.findByText('No uploads yet.');
        const input = document.querySelector('input[type="file"]');

        fireEvent.change(input, { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } });
        expect(await screen.findByText(/"notes\.txt" is text\/plain\. The docs accept pdf, jpg, jpeg or png\./)).toBeInTheDocument();

        const big = new File([new Uint8Array(1)], 'big.pdf', { type: 'application/pdf' });
        Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
        fireEvent.change(input, { target: { files: [big] } });
        expect(await screen.findByText('The docs cap uploads at 10 MB.')).toBeInTheDocument();
        expect(request).not.toHaveBeenCalledWith('post', expect.anything(), expect.anything(), expect.anything());
    });

    it('uploads the raw file with its type and name, toasts and reloads the list', async () => {
        let list = [];
        const upload = vi.fn(() => { list = docs; return { id: 'doc-1', verificationStatus: 'PENDING' }; });
        mockApi({ ...baseHandlers, 'get /documents': () => list, 'post /documents/source-of-funds': (m, u, body, options) => upload(body, options) });
        renderCompliance();
        await screen.findByText('No uploads yet.');
        const file = new File(['%PDF'], 'bank statement.pdf', { type: 'application/pdf' });
        fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
        await waitFor(() => expect(upload).toHaveBeenCalledWith(file, { headers: { 'Content-Type': 'application/pdf', 'X-File-Name': 'bank statement.pdf' } }));
        expect(await screen.findByText('Uploaded as PROOF_OF_FUNDS')).toBeInTheDocument();
        expect(screen.getByText(/Status PENDING\./)).toBeInTheDocument();
        expect(await screen.findByText('statement.pdf')).toBeInTheDocument();
    });

    it('shows the upload error', async () => {
        mockApi({ ...baseHandlers, 'post /documents/source-of-funds': () => { throw { error: { source: 'local', message: 'Empty upload.' } }; } });
        renderCompliance();
        await screen.findByText('No uploads yet.');
        fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
        expect(await screen.findByText('Empty upload.')).toBeInTheDocument();
    });

    it('resolves a pending document, shows the reason line and reloads compliance', async () => {
        const resolve = vi.fn(() => ({ status: 'verified', reason: 'because', verifiedBy: 'sandbox-user' }));
        mockApi({ ...baseHandlers, 'get /documents': docs, 'post /documents/doc-1/resolve': (m, u, body) => resolve(body) });
        renderCompliance();
        await userEvent.click(await screen.findByRole('button', { name: 'Verified' }));
        expect(resolve).toHaveBeenCalledWith({ outcome: 'verified', reason: 'because' });
        expect(await screen.findByText('Document verified')).toBeInTheDocument();
        expect(screen.getByText('verifiedBy sandbox-user. Same path as a reviewer\'s decision.')).toBeInTheDocument();
        expect(screen.getByText('VERIFIED: because · sandbox-user')).toBeInTheDocument();
        await waitFor(() => expect(request.mock.calls.filter(([, u]) => u === '/compliance')).toHaveLength(2));
    });

    it('History reads the latest status entry and toasts it', async () => {
        mockApi({ ...baseHandlers, 'get /documents': docs, 'get /documents/doc-2/status': [{ status: 'verified', reason: 'OCR ok', verifiedBy: 'ocr' }, { status: 'pending' }] });
        renderCompliance();
        const rows = await screen.findAllByRole('button', { name: 'History' });
        await userEvent.click(rows[1]);
        expect(await screen.findByText('Status VERIFIED')).toBeInTheDocument();
        expect(screen.getAllByText('OCR ok').length).toBeGreaterThan(0);
        expect(screen.getByText('VERIFIED: OCR ok · ocr')).toBeInTheDocument();
    });

    it('reloads the uploads from the header button with a count toast', async () => {
        mockApi({ ...baseHandlers, 'get /documents': docs });
        renderCompliance();
        await screen.findByText('statement.pdf');
        await userEvent.click(screen.getByRole('button', { name: 'Reload uploads' }));
        expect(await screen.findByText('2 uploads on file')).toBeInTheDocument();
    });

    it('opens the file picker from the upload button', async () => {
        mockApi(baseHandlers);
        renderCompliance();
        await screen.findByText('No uploads yet.');
        const input = document.querySelector('input[type="file"]');
        const click = vi.spyOn(input, 'click').mockImplementation(() => {});
        await userEvent.click(screen.getByRole('button', { name: 'Upload document' }));
        expect(click).toHaveBeenCalled();
        expect(within(screen.getByText('Proof of source of funds').closest('.card')).getByText(/PDF, JPG or PNG up to 10 MB/)).toBeInTheDocument();
    });
});
