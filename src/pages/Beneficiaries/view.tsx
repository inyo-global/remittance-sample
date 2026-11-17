import { ChevronRight, Plus, Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import { initials } from '../../lib/format';
import { countryOf, displayName, type BeneficiariesViewProps } from './model';

export default function BeneficiariesView({ inFlow, targetCountry, loading, error, list, onSelect, onAdd }: BeneficiariesViewProps) {
    return (
        <div>
            <PageHeader
                kicker={inFlow ? 'Step 2 of 5' : 'Account'}
                title={inFlow ? 'Who are you sending to?' : 'Beneficiaries'}
                description={inFlow && targetCountry ? `Showing beneficiaries in ${targetCountry}. Recipients are created per country schema.` : 'People you can send money to.'}
                actions={<Button icon={Plus} onClick={onAdd}>Add beneficiary</Button>}
            />

            {error && <Alert tone="danger" className="mb-6">{error}</Alert>}

            {loading ? (
                <Spinner label="Loading beneficiaries…" />
            ) : list.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title={targetCountry && inFlow ? `No beneficiaries in ${targetCountry} yet` : 'No beneficiaries yet'}
                    description="Add a recipient. The form adapts to the destination country's required fields."
                    action={<Button icon={Plus} onClick={onAdd}>Add beneficiary</Button>}
                />
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                    {list.map((ben) => (
                        <li key={ben.id}>
                            <button
                                type="button"
                                onClick={() => onSelect(ben)}
                                className="card group flex w-full items-center gap-4 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20"
                            >
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                                    {initials(displayName(ben))}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold text-ink-900">{displayName(ben)}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        {countryOf(ben) && <Badge tone="neutral">{countryOf(ben)}</Badge>}
                                        {ben.data?.documents?.[0]?.type && (
                                            <span className="text-xs text-ink-400">
                                                {ben.data.documents[0].type}{ben.data.documents[0].document && !/MASK/i.test(ben.data.documents[0].document) ? ` · ${ben.data.documents[0].document}` : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <ChevronRight className="size-5 text-ink-300 transition-colors group-hover:text-brand-600" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
