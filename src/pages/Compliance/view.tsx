import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import KycPanel from '../../components/KycPanel';
import SourceOfFundsPanel from '../../components/SourceOfFundsPanel';
import { humanize, money } from '../../lib/format';
import { cx } from '../../lib/cx';
import { WINDOWS, levelLabel, num, type ComplianceViewProps } from './model';

function UsageBar({ limit, used }: { limit: number; used: number }) {
    const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    const tone = pct >= 90 ? 'bg-danger-500' : pct >= 70 ? 'bg-warning-500' : 'bg-brand-500';
    return (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
            <div className={cx('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
        </div>
    );
}

export default function ComplianceView({ loading, error, usage, current, next, missing, canTransact, retry, load }: ComplianceViewProps) {
    if (loading) return <Spinner label="Loading compliance level…" />;

    if (error || !current) {
        return (
            <div>
                <PageHeader kicker="Account" title="Compliance level" />
                <Alert tone={error ? 'danger' : 'warning'} title={error ? 'Could not load compliance data' : 'No compliance data yet'} action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={retry}>Retry</Button>}>
                    {error || <>Complete your <Link to="/profile" className="font-semibold underline">sender profile</Link> first so Inyo can assign a level.</>}
                </Alert>
            </div>
        );
    }

    return (
        <div>
            <PageHeader kicker="Account" title="Compliance level" description="Your trust level sets rolling sending limits across 24 hours, 30 days and 180 days." />

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <Card>
                    <CardHeader
                        title={
                            <span className="flex items-center gap-2">
                                <ShieldCheck className="size-5 text-brand-600" /> Current status
                            </span>
                        }
                        action={<Badge tone={canTransact ? 'success' : 'danger'} dot>{canTransact ? 'Can transact' : 'Cannot transact'}</Badge>}
                    />
                    <CardBody>
                        <div className="flex items-end gap-3">
                            <p className="text-4xl font-bold tracking-tight text-ink-900">{levelLabel(current.level)}</p>
                            {next && <p className="pb-1 text-sm text-ink-500">next: {levelLabel(next.level)}</p>}
                        </div>

                        <div className="mt-6 grid gap-4 sm:grid-cols-3">
                            {WINDOWS.map(({ key, label }) => {
                                const limit = num(current.limits?.[key]);
                                const currency = current.limits?.[key]?.currency || 'USD';
                                const used = usage?.[key] ? num(usage[key].used) : null;
                                return (
                                    <div key={key} className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
                                        <p className="kicker">{label}</p>
                                        <p className="mt-1.5 text-xl font-bold tabular-nums text-ink-900">{money(limit, currency, { maximumFractionDigits: 0 })}</p>
                                        {used !== null && (
                                            <>
                                                <p className="mt-0.5 text-xs text-ink-500">{money(used, currency)} used · {money(Math.max(limit - used, 0), currency)} left</p>
                                                <UsageBar limit={limit} used={used} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {current.requiredFields && current.requiredFields.length > 0 && (
                            <div className="mt-6">
                                <p className="kicker mb-2">Verified for this level</p>
                                <ul className="flex flex-wrap gap-1.5">
                                    {current.requiredFields.map((f) => (
                                        <li key={f}><Badge tone="success"><CheckCircle2 className="size-3" /> {humanize(f)}</Badge></li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </CardBody>
                </Card>

                {next ? (
                    <Card className="border-brand-200 bg-gradient-to-b from-brand-50/60 to-white">
                        <CardHeader title={`Upgrade to ${levelLabel(next.level)}`} description="Higher limits after additional verification." />
                        <CardBody>
                            <dl className="divide-y divide-ink-100 text-sm">
                                {WINDOWS.map(({ key, label }) => (
                                    <div key={key} className="flex justify-between py-2">
                                        <dt className="text-ink-500">{label}</dt>
                                        <dd className="font-semibold tabular-nums text-brand-700">{money(num(next.limits?.[key]), next.limits?.[key]?.currency || 'USD', { maximumFractionDigits: 0 })}</dd>
                                    </div>
                                ))}
                            </dl>

                            <div className="mt-5">
                                <p className="kicker mb-2">{missing.length ? 'Still missing' : 'Requirements'}</p>
                                {missing.length ? (
                                    <ul className="space-y-1.5">
                                        {missing.map((f) => (
                                            <li key={f} className="flex items-center gap-2 text-sm text-ink-700">
                                                <span className="size-1.5 rounded-full bg-warning-500" /> {humanize(f)}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <Alert tone="success">All requirements are met. The upgrade is applied after Inyo's compliance review.</Alert>
                                )}
                            </div>

                            {next.perTransactionFields && next.perTransactionFields.length > 0 && (
                                <p className="mt-4 text-xs text-ink-500">Per-transaction fields at this level: {next.perTransactionFields.map((f) => humanize(f)).join(', ')}.</p>
                            )}

                            <Button as={Link} to="/profile" className="mt-5 w-full" variant="dark" iconRight={ArrowUpRight}>Update profile</Button>
                            <p className="mt-3 text-center text-[11px] text-ink-400">Identity documents are verified through the KYC session below.</p>
                        </CardBody>
                    </Card>
                ) : (
                    <Card>
                        <CardBody>
                            <p className="font-semibold text-ink-900">You are at the highest level.</p>
                            <p className="mt-1 text-sm text-ink-500">No further upgrades are available for this tenant.</p>
                        </CardBody>
                    </Card>
                )}
            </div>

            <KycPanel onVerified={load} />
            <SourceOfFundsPanel onVerified={load} />
        </div>
    );
}
