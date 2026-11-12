import React from 'react';
import { ArrowLeftRight, Globe2, ShieldCheck } from 'lucide-react';
import logo from '../assets/inyo-logo.png';

const POINTS = [
    { icon: Globe2, title: 'Pay out to 165+ countries', text: 'Bank deposit, PIX, wallets and cards, with country schemas fetched from the API.' },
    { icon: ShieldCheck, title: 'Compliance built in', text: 'KYC, trust levels and rolling limits are handled by the Inyo platform.' },
    { icon: ArrowLeftRight, title: 'Locked FX quotes', text: 'Quote once, send with a guaranteed rate inside the validity window.' },
];

/** Split-screen frame for the unauthenticated pages (login / signup). */
export default function AuthShell({ title, subtitle, children, footer, wide = false }) {
    return (
        <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <aside className="relative hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
                <div className="pointer-events-none absolute -left-24 -top-24 size-[480px] rounded-full bg-brand-600/30 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-32 -right-10 size-[420px] rounded-full bg-brand-400/20 blur-3xl" />
                <div className="relative inline-flex items-center gap-3 self-start rounded-2xl bg-white px-4 py-2.5">
                    <img src={logo} alt="Inyo" className="h-6" />
                    <span className="border-l border-ink-200 pl-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">Remittance sample</span>
                </div>
                <div className="relative max-w-md">
                    <h2 className="text-3xl font-bold leading-tight">A reference integration of the Inyo Remittances API.</h2>
                    <p className="mt-3 text-ink-300">Sender onboarding, beneficiaries, funding accounts, FX quotes, transactions and regulated receipts, end to end.</p>
                    <ul className="mt-10 space-y-6">
                        {POINTS.map(({ icon: Icon, title: t, text }) => (
                            <li key={t} className="flex gap-4">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-300">
                                    <Icon className="size-5" />
                                </div>
                                <div>
                                    <p className="font-semibold">{t}</p>
                                    <p className="mt-0.5 text-sm text-ink-400">{text}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="relative text-xs text-ink-500">Sandbox only. Not for production use. See dev.inyoglobal.com for the official integration manual.</p>
            </aside>

            <main className="flex items-center justify-center px-6 py-10 sm:px-10">
                <div className={wide ? 'w-full max-w-xl' : 'w-full max-w-sm'}>
                    <div className="mb-8 lg:hidden">
                        <img src={logo} alt="Inyo" className="h-7" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
                    {subtitle && <p className="mt-1.5 text-ink-500">{subtitle}</p>}
                    <div className="mt-8">{children}</div>
                    {footer && <p className="mt-6 text-center text-sm text-ink-500">{footer}</p>}
                </div>
            </main>
        </div>
    );
}
