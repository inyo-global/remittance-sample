import { NavLink } from 'react-router-dom';
import { ExternalLink, LogOut, X } from 'lucide-react';
import { cx } from '../../lib/cx';
import { initials, money } from '../../lib/format';
import logo from '../../assets/inyo-logo.png';
import { NAV, readWindow, type LimitWindowLike, type SidebarViewProps } from './model';

const NAV_ITEM = 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors';

function LimitBar({ label, data }: { label: string; data: LimitWindowLike | undefined }) {
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

/** The sidebar body; rendered on its own inside the mobile drawer. */
export function SidebarContentView({ user, onLogout, onNavigate, limits, limitsError, fullName, hasLimits, onDetails }: SidebarViewProps) {
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
                                            to={to!}
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
                        <button type="button" onClick={onDetails} className="text-[11px] font-semibold text-brand-300 hover:text-brand-200">
                            Details
                        </button>
                    </div>
                    {limits === null && !limitsError ? (
                        <p className="text-xs text-ink-500">Loading limits…</p>
                    ) : hasLimits && limits ? (
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

/** Desktop sidebar: the body inside a fixed aside. */
export default function SidebarView(props: SidebarViewProps) {
    return (
        <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">
            <SidebarContentView {...props} />
        </aside>
    );
}
