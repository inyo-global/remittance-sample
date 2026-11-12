import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, BookOpen, CreditCard, ExternalLink, History, LayoutDashboard, LogOut, ShieldCheck, UserRound, Users, X } from 'lucide-react';
import { request } from '../api';
import { cx } from '../lib/cx';
import { errorMessage, initials, money } from '../lib/format';
import logo from '../assets/inyo-logo.png';

const NAV = [
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

const NAV_ITEM = 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors';

/** Normalises both limit shapes seen in the sandbox: {limit:{amount}} and {limit: number}. */
const readWindow = (w) => {
    if (!w) return null;
    const limit = Number(w.limit?.amount ?? w.limit ?? 0);
    const used = Number(w.used?.amount ?? w.used ?? 0);
    const currency = w.limit?.currency || w.used?.currency || 'USD';
    return { limit, used, currency, pct: limit > 0 ? Math.min(100, (used / limit) * 100) : 0 };
};

function LimitBar({ label, data }) {
    const w = readWindow(data);
    if (!w) return null;
    const tone = w.pct >= 90 ? 'bg-danger-500' : w.pct >= 70 ? 'bg-warning-500' : 'bg-brand-400';
    return (
        <div>
            <div className="mb-1 flex items-baseline justify-between text-[11px]">
                <span className="font-medium text-ink-300">{label}</span>
                <span className="text-ink-400">
                    <span className="font-semibold text-white">{money(w.used, w.currency, { maximumFractionDigits: 0 })}</span> / {money(w.limit, w.currency, { maximumFractionDigits: 0 })}
                </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={cx('h-full rounded-full transition-all', tone)} style={{ width: `${w.pct}%` }} />
            </div>
        </div>
    );
}

export function SidebarContent({ user, onLogout, onNavigate }) {
    const navigate = useNavigate();
    const [limits, setLimits] = useState(null);
    const [limitsError, setLimitsError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        request('get', '/limits')
            .then((data) => !cancelled && setLimits(data))
            .catch((err) => !cancelled && setLimitsError(errorMessage(err, 'Limits unavailable')));
        return () => { cancelled = true; };
    }, [user?.userId]);

    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'User';
    const hasLimits = limits && readWindow(limits.oneDayLimit)?.limit > 0;

    return (
        <div className="flex h-full flex-col bg-ink-950 text-white">
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <div className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2">
                    <img src={logo} alt="Inyo" className="h-5" />
                    <span className="border-l border-ink-200 pl-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Sample</span>
                </div>
                {onNavigate && (
                    <button type="button" onClick={onNavigate} className="rounded-full p-2 text-ink-400 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close menu">
                        <X className="size-5" />
                    </button>
                )}
            </div>

            <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
                {NAV.map((group) => (
                    <div key={group.title}>
                        <p className="kicker mb-2 px-3 text-ink-500">{group.title}</p>
                        <ul className="space-y-0.5">
                            {group.items.map(({ to, href, label, icon: Icon }) => (
                                <li key={to || href}>
                                    {href ? (
                                        <a href={href} target="_blank" rel="noreferrer" onClick={onNavigate} className={cx(NAV_ITEM, 'text-ink-300 hover:bg-white/5 hover:text-white')}>
                                            <Icon className="size-[18px] shrink-0 opacity-80" aria-hidden />
                                            <span className="flex-1">{label}</span>
                                            <ExternalLink className="size-3.5 opacity-60" aria-label="Opens in a new tab" />
                                        </a>
                                    ) : (
                                        <NavLink
                                            to={to}
                                            onClick={onNavigate}
                                            className={({ isActive }) =>
                                                cx(NAV_ITEM, isActive ? 'bg-brand-500/20 text-white shadow-[inset_3px_0_0_0_var(--color-brand-400)]' : 'text-ink-300 hover:bg-white/5 hover:text-white')
                                            }
                                        >
                                            <Icon className="size-[18px] shrink-0 opacity-80" aria-hidden />
                                            {label}
                                        </NavLink>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <p className="kicker text-ink-400">Sending limits</p>
                        <button type="button" onClick={() => { navigate('/compliance'); onNavigate?.(); }} className="text-[11px] font-semibold text-brand-300 hover:text-brand-200">
                            Details
                        </button>
                    </div>
                    {limits === null && !limitsError ? (
                        <p className="text-xs text-ink-500">Loading limits…</p>
                    ) : hasLimits ? (
                        <div className="space-y-3">
                            <LimitBar label="24 hours" data={limits.oneDayLimit} />
                            <LimitBar label="30 days" data={limits.thirtyDaysLimit} />
                            <LimitBar label="180 days" data={limits.oneHundredAndEightyDaysLimit} />
                        </div>
                    ) : (
                        <p className="text-xs leading-relaxed text-ink-500">
                            {limitsError ? <span className="break-words text-danger-300" title={limitsError}>{limitsError.length > 140 ? `${limitsError.slice(0, 140)}…` : limitsError}</span> : 'Complete your profile to unlock sending limits.'}
                        </p>
                    )}
                </div>
            </nav>

            <div className="border-t border-white/10 p-3">
                <div className="flex items-center gap-3 rounded-xl px-2 py-2">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-500/30 text-sm font-bold text-brand-100">
                        {initials(fullName)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{fullName}</p>
                        <p className="truncate text-xs text-ink-400">{user?.email}</p>
                    </div>
                    <button type="button" onClick={onLogout} className="rounded-full p-2 text-ink-400 hover:bg-white/10 hover:text-white" title="Log out" aria-label="Log out">
                        <LogOut className="size-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function Sidebar(props) {
    return (
        <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">
            <SidebarContent {...props} />
        </aside>
    );
}
