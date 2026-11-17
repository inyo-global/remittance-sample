import { useCallback, useEffect, useState } from 'react';
import { request } from '../../api';
import { errorMessage } from '../../lib/format';
import { useLoad, useToast } from '../../hooks';
import { challengeUrl as challengeUrlOf } from '../../lib/paymentMethods';
import type { PaymentMethod, SyncResponse, User } from '../../types';

export interface PaymentMethodsProps {
    user: User;
}

interface Challenge {
    method: PaymentMethod;
    url: string | null;
    tab?: Window | null;
}

export const GROUPS: Array<{ type: PaymentMethod['type']; title: string }> = [
    { type: 'ACH', title: 'Bank accounts (ACH)' },
    { type: 'CARD', title: 'Debit cards' },
];

export function usePaymentMethods({ user }: PaymentMethodsProps) {
    const toast = useToast();
    const load = useCallback(() => request<PaymentMethod[]>('get', '/payment-methods'), []);
    const { data: methods, setData: setMethods, loading, error } = useLoad(load, [], [user?.userId, load]);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [removing, setRemoving] = useState<string | null>(null);
    const [challenge, setChallenge] = useState<Challenge | null>(null);

    const reload = useCallback(() => { load().then(setMethods).catch(() => {}); }, [load, setMethods]);

    // GET /fundingAccounts/{id} through the BFF: Inyo is the source of truth for the status.
    const sync = useCallback(async (method: PaymentMethod) => {
        setSyncing(method.id);
        try {
            const res = await request<SyncResponse>('get', `/payment-methods/${method.id}/sync`);
            const status = res.status || res.data?.status;
            setMethods(await load());
            if (/^verified$/i.test(String(status))) toast.success('Card verified', 'The card can now fund transfers.');
            else if (/^rejected$/i.test(String(status))) toast.error('Card rejected', res.data?.statusMessage || 'The issuer declined the verification.');
            else toast.warning(`Status: ${status}`, 'Inyo has not confirmed the challenge result yet; try again in a moment.');
        } catch (err) {
            toast.error('Could not refresh status', errorMessage(err));
        } finally {
            setSyncing(null);
        }
    }, [load, setMethods, toast]);

    // DELETE /fundingAccounts/{id} through the BFF: soft, one-way deactivation on Inyo (isActive=false).
    const remove = useCallback(async (method: PaymentMethod) => {
        const label = method.type === 'ACH' ? 'this bank account' : `the card ending in ${method.token?.lastFourDigits || method.data?.apiResponse?.lastFourDigits || '····'}`;
        if (!window.confirm(`Remove ${label}? Inyo deactivates it permanently; there is no reactivation.`)) return;
        setRemoving(method.id);
        try {
            await request('delete', `/payment-methods/${method.id}`);
            setMethods(await load());
            toast.success('Payment method removed', 'Deactivated on Inyo (isActive: false).');
        } catch (err) {
            toast.error('Could not remove it', errorMessage(err));
        } finally {
            setRemoving(null);
        }
    }, [load, setMethods, toast]);

    // Result of the ACS page (docs: {paymentId, externalPaymentId, amount, approved}); any result triggers a sync.
    useEffect(() => {
        if (!challenge) return undefined;
        const onMessage = (event: MessageEvent) => {
            let data: unknown = event.data;
            if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
            const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
            // Redirect mode: the landing page (/api/3ds/success|fail, same origin) reports from the new tab.
            const relayed = obj?.source === 'remittance-sample-3ds' && event.origin === window.location.origin;
            if (!relayed && !/inyo\.global|simpleps\.com|inyoplatform\.com/.test(event.origin || '')) return;
            const payload = relayed ? obj?.payload : (obj?.response || data);
            const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
            if (!relayed && (!p || (!('approved' in p) && !p.paymentId && !p.id && !p.status))) return;
            const m = challenge.method;
            if (challenge.tab && !challenge.tab.closed) challenge.tab.close();
            setChallenge(null);
            sync(m);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [challenge, sync]);

    /** Resume the 3DS challenge in the modal iframe. */
    const resumeChallenge = (m: PaymentMethod) => setChallenge({ method: m, url: challengeUrlOf(m) });
    /** Redirect mode: the issuer sends the whole tab to the app's successUrl/failUrl at the end, which only works outside an iframe. */
    const resumeChallengeInTab = (m: PaymentMethod) => {
        const tab = window.open(challengeUrlOf(m) ?? undefined, '_blank');
        setChallenge({ method: m, url: challengeUrlOf(m), tab });
    };
    const closeChallenge = () => {
        if (challenge?.tab && !challenge.tab.closed) challenge.tab.close();
        setChallenge(null);
    };
    const checkChallenge = () => {
        const m = challenge!.method;
        setChallenge(null);
        sync(m);
    };

    return { methods, loading, error, syncing, removing, challenge, sync, remove, reload, resumeChallenge, resumeChallengeInTab, closeChallenge, checkChallenge };
}

export type PaymentMethodsViewProps = ReturnType<typeof usePaymentMethods>;
