import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, BookOpen, CreditCard, History, LayoutDashboard, ShieldCheck, UserRound, Users, type LucideIcon } from 'lucide-react';
import { request } from '../../api';
import { errorMessage } from '../../lib/format';
import type { User } from '../../types';

interface NavItem {
    label: string;
    icon: LucideIcon;
    to?: string;
    href?: string;
}

interface NavGroup {
    title: string;
    items: NavItem[];
}

export const NAV: NavGroup[] = [
    {
        title: 'Send money',
        items: [
            { to: '/overview', label: 'Overview', icon: LayoutDashboard },
            { to: '/dashboard', label: 'New transfer', icon: ArrowLeftRight },
            { to: '/transactions', label: 'Transactions', icon: History },
        ],
    },
    {
        title: 'Account',
        items: [
            { to: '/beneficiaries', label: 'Beneficiaries', icon: Users },
            { to: '/payment-methods', label: 'Payment methods', icon: CreditCard },
            { to: '/compliance', label: 'Compliance level', icon: ShieldCheck },
            { to: '/profile', label: 'Personal information', icon: UserRound },
        ],
    },
    {
        title: 'Resources',
        items: [
            { href: 'https://dev.inyoglobal.com/api-references/remittances/', label: 'Inyo API docs', icon: BookOpen },
        ],
    },
];

/** Either limit shape seen in the sandbox: `{ limit: { amount, currency } }` or `{ limit: number }`. */
type MoneyLike = { amount?: number | string; currency?: string } | number | string | null | undefined;
export interface LimitWindowLike {
    limit?: MoneyLike;
    used?: MoneyLike;
}
export interface LimitsLike {
    oneDayLimit?: LimitWindowLike;
    thirtyDaysLimit?: LimitWindowLike;
    oneHundredAndEightyDaysLimit?: LimitWindowLike;
}

interface Window_ {
    limit: number;
    used: number;
    currency: string;
    pct: number;
}

const part = (m: MoneyLike): { amount?: number | string; currency?: string } | undefined => (typeof m === 'object' && m !== null ? m : undefined);

/** Normalises both limit shapes seen in the sandbox: {limit:{amount}} and {limit: number}. */
export const readWindow = (w: LimitWindowLike | null | undefined): Window_ | null => {
    if (!w) return null;
    const limit = Number(part(w.limit)?.amount ?? w.limit ?? 0);
    const used = Number(part(w.used)?.amount ?? w.used ?? 0);
    const currency = part(w.limit)?.currency || part(w.used)?.currency || 'USD';
    return { limit, used, currency, pct: limit > 0 ? Math.min(100, (used / limit) * 100) : 0 };
};

export interface SidebarProps {
    user: User | null | undefined;
    onLogout: () => void;
    onNavigate?: () => void;
}

export function useSidebar({ user, onLogout, onNavigate }: SidebarProps) {
    const navigate = useNavigate();
    const [limits, setLimits] = useState<LimitsLike | null>(null);
    const [limitsError, setLimitsError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        request<LimitsLike>('get', '/limits')
            .then((data) => !cancelled && setLimits(data))
            .catch((err) => !cancelled && setLimitsError(errorMessage(err, 'Limits unavailable')));
        return () => { cancelled = true; };
    }, [user?.userId]);

    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'User';
    const hasLimits = !!limits && (readWindow(limits.oneDayLimit)?.limit ?? 0) > 0;

    const onDetails = () => { navigate('/compliance'); onNavigate?.(); };

    return { user, onLogout, onNavigate, limits, limitsError, fullName, hasLimits, onDetails };
}

export type SidebarViewProps = ReturnType<typeof useSidebar>;
