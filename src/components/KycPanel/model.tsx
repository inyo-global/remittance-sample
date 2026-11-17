import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { request } from '../../api';
import { errorMessage } from '../../lib/format';
import { useToast } from '../../lib/toast';
import type { KycSession, Tone } from '../../types';

// Session states (docs: "KYC Verification Sessions"): PENDING -> VERIFIED | REJECTED | PENDING_REVIEW
// | SUPERSEDED | FAILED | ERRORED | EXPIRED. In sandbox every verdict lands in PENDING_REVIEW.
export const KYC_TONE: Record<string, Tone> = { VERIFIED: 'success', REJECTED: 'danger', PENDING_REVIEW: 'warning', PENDING: 'info' };
export const kycTone = (status: unknown): Tone => KYC_TONE[String(status || '').toUpperCase()] || 'neutral';
export const kycTerminal = (status: unknown) => ['VERIFIED', 'REJECTED', 'SUPERSEDED', 'FAILED', 'ERRORED', 'EXPIRED', 'ORPHANED'].includes(String(status || '').toUpperCase());

export type KycBusy = 'create' | 'check' | 'verified' | 'rejected' | null;
export type Outcome = 'verified' | 'rejected';

/**
 * Identity verification through the hosted Inyo360 widget.
 * POST /v2/senders/{id}/kycSession -> widgetUrl (opened in a new tab: the widget needs the camera and
 * has no iframe API) -> GET the session until it settles -> in sandbox, /resolve plays the reviewer.
 */
export interface KycPanelProps {
    onVerified?: () => void;
}

export function useKycPanel({ onVerified }: KycPanelProps) {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const [session, setSession] = useState<KycSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<KycBusy>(null);
    const [error, setError] = useState<string | null>(null);

    const status = String(session?.status || session?.data?.status || '').toUpperCase();
    const widgetUrl = session?.widgetUrl || session?.data?.widgetUrl;

    const check = useCallback(async (silent = false) => {
        setBusy('check');
        setError(null);
        try {
            const next = await request<KycSession | null>('get', '/kyc/session');
            setSession(next);
            const st = String(next?.status || '').toUpperCase();
            if (!silent) toast.info(`Session ${st || 'unknown'}`, st === 'PENDING_REVIEW' ? 'Held for review. In sandbox nobody reviews it: resolve it below.' : undefined);
            if (st === 'VERIFIED') onVerified?.();
            return next;
        } catch (err) {
            setError(errorMessage(err, 'Could not read the session'));
            return null;
        } finally {
            setBusy(null);
            setLoading(false);
        }
    }, [toast, onVerified]);

    useEffect(() => {
        // Returning from the widget (?kyc=done): the redirect says the user finished, not the verdict.
        const fromWidget = params.get('kyc') === 'done';
        request<KycSession | null>('get', `/kyc/session${fromWidget ? '' : '?refresh=false'}`)
            .then((s) => {
                setSession(s);
                if (fromWidget) {
                    const st = String(s?.status || '').toUpperCase();
                    toast.info('Back from the widget', st ? `Session is ${st}.` : 'No session found.');
                    if (st === 'VERIFIED') onVerified?.();
                    setParams({}, { replace: true });
                }
            })
            .catch((err: unknown) => setError(errorMessage(err, 'Could not read the session')))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const create = async () => {
        setBusy('create');
        setError(null);
        try {
            const created = await request<KycSession>('post', '/kyc/session', { language: navigator.language?.split('-')[0] || 'en' });
            setSession(created);
            const url = created.widgetUrl || created.data?.widgetUrl;
            if (url) window.open(url, '_blank', 'noopener');
            toast.success('Verification session created', url ? 'The widget opened in a new tab. Come back here and check the status when you finish.' : 'Inyo returned no widget URL: the session may have been decided at creation (simulated document number).');
            if (String(created.status || '').toUpperCase() !== 'PENDING') check(true);
        } catch (err) {
            setError(errorMessage(err, 'Could not create the session'));
        } finally {
            setBusy(null);
        }
    };

    const resolve = async (outcome: Outcome) => {
        const reason = window.prompt(`Reason recorded with the ${outcome} resolution (sandbox only):`, outcome === 'verified' ? 'Cleared for the integration walkthrough' : 'Rejected during the integration walkthrough');
        if (reason === null) return;
        setBusy(outcome);
        setError(null);
        try {
            const next = await request<KycSession>('post', `/kyc/session/${session!.sessionId}/resolve`, { outcome, reason });
            setSession(next);
            toast.success(`Session resolved as ${outcome}`, 'Same code path as an Inyo reviewer: the document verdict and the compliance level are the real ones.');
            if (outcome === 'verified') onVerified?.();
        } catch (err) {
            setError(errorMessage(err, 'Could not resolve the session'));
        } finally {
            setBusy(null);
        }
    };

    return { session, loading, busy, error, status, widgetUrl, check, create, resolve };
}

export type KycPanelViewProps = ReturnType<typeof useKycPanel>;
