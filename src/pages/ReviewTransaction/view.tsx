import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, CreditCard, Landmark, Lock, Pencil, UserRound, type LucideProps } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, CardBody, CardFooter } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { amount, humanize, maskAccount, money, rate } from '../../lib/format';
import { methodSubtitle, methodTitle } from '../../lib/paymentMethods';
import { cx } from '../../lib/cx';
import type { ReviewTransactionViewProps } from './model';

interface SectionProps {
    icon: ComponentType<LucideProps>;
    label: string;
    title: ReactNode;
    subtitle?: ReactNode;
    onEdit: () => void;
}

function Section({ icon: Icon, label, title, subtitle, onEdit }: SectionProps) {
    return (
        <div className="flex items-center gap-4 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
                <Icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="kicker">{label}</p>
                <p className="truncate font-semibold text-ink-900">{title}</p>
                {subtitle && <p className="truncate text-sm text-ink-500">{subtitle}</p>}
            </div>
            <button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                <Pencil className="size-3" /> Change
            </button>
        </div>
    );
}

export default function ReviewTransactionView({ quote, beneficiary, account, paymentMethod, countdown, loading, error, missing, pm, beneficiaryName, handleConfirm, goTo }: ReviewTransactionViewProps) {
    if (missing.length || !quote || !beneficiary || !account || !paymentMethod) {
        return (
            <div>
                <PageHeader kicker="Step 5 of 5" title="Review" />
                <Alert
                    tone="warning"
                    title="This transfer is incomplete"
                    action={<Button as={Link} to={!quote ? '/dashboard' : !beneficiary ? '/beneficiaries' : !account ? `/beneficiaries/${beneficiary.id}/account` : '/payment'} size="sm" variant="secondary">{!quote ? 'Lock a quote' : 'Complete step'}</Button>}
                >
                    Missing {missing.join(', ')}. {!quote ? 'Lock a quote on the Amount step; your beneficiary and payment selections are kept.' : 'Go back through the steps to complete it.'}
                </Alert>
            </div>
        );
    }

    return (
        <div>
            <PageHeader kicker="Step 5 of 5" title="Review your transfer" description="Check everything before we submit it to Inyo. The locked rate and fee below are exactly what will be charged." />

            <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                <Card>
                    <CardBody className="divide-y divide-ink-100 py-1">
                        <Section icon={UserRound} label="Beneficiary" title={beneficiaryName} subtitle={beneficiary.data?.address?.countryCode || beneficiary.data?.documents?.[0]?.countryCode} onEdit={() => goTo('/beneficiaries')} />
                        <Section
                            icon={Landmark}
                            label="Delivery"
                            title={pm.type === 'PIX' ? `PIX · ${pm.keyType || ''}` : `${humanize(pm.type || 'BANK_DEPOSIT')}${pm.bankCode ? ` · ${pm.bankCode}` : ''}`}
                            subtitle={pm.type === 'PIX' ? pm.key : `${pm.accountType || ''} ${maskAccount(pm.accountNumber || pm.walletId)} · ${account.data?.asset || ''}`}
                            onEdit={() => goTo(`/beneficiaries/${beneficiary.id}/account`)}
                        />
                        <Section icon={CreditCard} label="Pay with" title={methodTitle(paymentMethod)} subtitle={methodSubtitle(paymentMethod)} onEdit={() => goTo('/payment')} />
                    </CardBody>
                </Card>

                <Card className="overflow-hidden">
                    <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white">
                        <p className="kicker text-brand-100">Beneficiary receives</p>
                        <p className="mt-1 text-3xl font-bold tabular-nums">{amount(quote.destinationAmount?.amount, quote.destinationAmount?.currency)}</p>
                        <p className="mt-1 text-sm text-brand-100">{rate(quote.effectiveRate, quote.sourceAmount?.currency, quote.destinationAmount?.currency)}</p>
                    </div>
                    <CardBody>
                        <dl className="divide-y divide-ink-100 text-sm">
                            <div className="flex justify-between py-2.5"><dt className="text-ink-500">You send</dt><dd className="font-semibold tabular-nums">{money(quote.sourceAmount?.amount, quote.sourceAmount?.currency)}</dd></div>
                            <div className="flex justify-between py-2.5"><dt className="text-ink-500">Transfer fee</dt><dd className="font-semibold tabular-nums">{money(quote.fee?.amount, quote.fee?.currency)}</dd></div>
                            <div className="flex justify-between py-2.5"><dt className="text-ink-500">Amount type</dt><dd className="font-mono text-xs font-semibold text-ink-700">{quote.amountType || 'NET'}</dd></div>
                            <div className="flex justify-between py-3"><dt className="text-base font-bold text-ink-900">Total to pay</dt><dd className="text-xl font-bold tabular-nums text-ink-900">{money(quote.totalCost?.amount, quote.totalCost?.currency)}</dd></div>
                        </dl>
                        <div className={cx('mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium', countdown.expired ? 'bg-danger-50 text-danger-700' : countdown.warning ? 'bg-warning-50 text-warning-700' : 'bg-ink-100 text-ink-600')}>
                            <Clock className="size-3.5" />
                            {countdown.expired ? 'This quote expired. Get a new one.' : `Rate locked for ${countdown.remainingLabel}`}
                        </div>
                        {error && <Alert tone="danger" className="mt-4" title="Transaction not created">{error}</Alert>}
                    </CardBody>
                    <CardFooter>
                        <Button variant="ghost" icon={ArrowLeft} onClick={() => goTo('/payment')}>Back</Button>
                        {countdown.expired ? (
                            <Button as={Link} to="/dashboard" variant="secondary">Refresh quote</Button>
                        ) : (
                            <Button variant="success" icon={Lock} loading={loading} onClick={handleConfirm}>Confirm and send</Button>
                        )}
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
