import { ArrowLeft, ArrowRight, ChevronRight, Landmark, Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, CardBody, CardFooter } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import SchemaForm from '../../components/SchemaForm';
import { cx } from '../../lib/cx';
import { accountSubtitle, accountTitle, type AddAccountViewProps } from './model';

export default function AddAccountView({ countryCode, schema, formData, setFormData, banks, accounts, view, loading, saving, error, inFlow, name, selectAccount, handleSubmit, optionsFor, showAdd, goBack }: AddAccountViewProps) {
    return (
        <div>
            <PageHeader
                kicker={inFlow ? 'Step 3 of 5' : 'Account'}
                title="Delivery options"
                description={inFlow ? `How should ${name} receive the money?` : `Payout accounts registered for ${name}.`}
                actions={view === 'list' && schema ? <Button variant="secondary" icon={Plus} onClick={showAdd}>Add account</Button> : null}
            />

            {error && !loading && <Alert tone="danger" className="mb-6">{error}</Alert>}

            {loading ? (
                <Spinner label="Loading delivery options…" />
            ) : view === 'list' ? (
                accounts.length === 0 ? (
                    <EmptyState icon={Landmark} title="No payout account yet" description="Add a bank account, PIX key or wallet for this beneficiary." action={<Button icon={Plus} onClick={showAdd}>Add account</Button>} />
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {accounts.map((acc) => (
                            <li key={acc.id}>
                                <button
                                    type="button"
                                    disabled={!inFlow}
                                    onClick={() => selectAccount(acc)}
                                    className={cx('card flex w-full items-center gap-4 p-4 text-left', inFlow && 'group transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20')}
                                >
                                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
                                        <Landmark className="size-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-ink-900">{accountTitle(acc, banks)}</p>
                                        <p className="mt-0.5 truncate text-sm text-ink-500">{accountSubtitle(acc)}</p>
                                        <div className="mt-1.5 flex gap-1.5">
                                            <Badge tone="brand">{acc.data?.payoutMethod?.type || 'BANK_DEPOSIT'}</Badge>
                                            {acc.data?.asset && <Badge>{acc.data.asset}</Badge>}
                                        </div>
                                    </div>
                                    {inFlow && <ChevronRight className="size-5 text-ink-300 transition-colors group-hover:text-brand-600" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )
            ) : (
                <form onSubmit={handleSubmit} noValidate>
                    <Card>
                        <CardBody>
                            {schema ? (
                                <SchemaForm schema={schema} value={formData} onChange={setFormData as (next: Record<string, unknown>) => void} optionsFor={optionsFor} hiddenKeys={['externalId']} />
                            ) : (
                                <p className="text-sm text-ink-500">The account schema for {countryCode || 'this country'} is unavailable.</p>
                            )}
                        </CardBody>
                        <CardFooter>
                            <Button variant="ghost" icon={ArrowLeft} onClick={goBack}>Back</Button>
                            <Button type="submit" loading={saving} disabled={!schema} iconRight={ArrowRight}>{inFlow ? 'Save and continue' : 'Save account'}</Button>
                        </CardFooter>
                    </Card>
                </form>
            )}
        </div>
    );
}
