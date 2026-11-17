import { useCallback, useEffect, useState } from 'react';
import { request } from '../../api';
import { errorMessage } from '../../lib/format';
import type { ComplianceInfo, LimitKey, Limits, Money, User } from '../../types';

export const WINDOWS: Array<{ key: LimitKey; label: string }> = [
    { key: 'oneDayLimit', label: '24 hours' },
    { key: 'thirtyDaysLimit', label: '30 days' },
    { key: 'oneHundredAndEightyDaysLimit', label: '180 days' },
];

export const levelLabel = (level: unknown) => String(level || '').replace('LEVEL_', 'Level ');

/** Limits arrive either as a number or as { amount, currency }. */
export const num = (v: number | Money | null | undefined) => Number((v && typeof v === 'object' ? v.amount : v) ?? 0);

/**
 * Trust level + rolling limits, from GET /participants/{id}/complianceLevels
 * and GET /fx/participants/{id}/limits.
 */
export interface ComplianceProps {
    user: User;
}

export function useCompliance({ user }: ComplianceProps) {
    const [data, setData] = useState<ComplianceInfo | null>(null);
    const [usage, setUsage] = useState<Limits | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        Promise.all([request<ComplianceInfo>('get', '/compliance'), request<Limits>('get', '/limits').catch(() => null)])
            .then(([c, l]) => { setData(c); setUsage(l); })
            .catch((err: unknown) => setError(errorMessage(err, 'Failed to load compliance data')))
            .finally(() => setLoading(false));
    }, []);

    const retry = () => { setLoading(true); setError(null); load(); };

    useEffect(() => { load(); }, [user?.userId, load]);

    const current = data?.currentComplianceLevel;
    const next = data?.nextComplianceLevel;
    const missing = data?.missingFieldsForNextComplianceLevel ?? [];
    const canTransact = !!current && current.level !== 'LEVEL_0';

    return { loading, error, usage, current, next, missing, canTransact, retry, load };
}

export type ComplianceViewProps = ReturnType<typeof useCompliance>;
