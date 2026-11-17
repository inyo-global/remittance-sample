import { Check } from 'lucide-react';
import { cx } from '../../lib/cx';
import { STEPS } from '../../lib/steps';
import type { StepNavigationViewProps } from './model';

export default function StepNavigationView({ current, reachable, onGo }: StepNavigationViewProps) {
    return (
        <ol className="mb-8 flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Transfer progress">
            {STEPS.map((step, i) => {
                // Completed only if this step produced its data (e.g. "Amount" needs a quote)
                const done = i < current && (i + 1 >= reachable.length || reachable[i + 1]);
                const active = i === current;
                const canGo = reachable[i] && !active;
                return (
                    <li key={step.key} className="flex items-center gap-1">
                        <button
                            type="button"
                            disabled={!canGo}
                            onClick={() => onGo(i)}
                            aria-current={active ? 'step' : undefined}
                            className={cx(
                                'flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition-colors',
                                active && 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
                                done && 'text-ink-700 hover:bg-ink-100',
                                !active && !done && 'text-ink-400',
                                !canGo && 'cursor-default',
                            )}
                        >
                            <span
                                className={cx(
                                    'flex size-6 items-center justify-center rounded-full text-[11px] font-bold',
                                    active && 'bg-brand-600 text-white',
                                    done && 'bg-success-500 text-white',
                                    !active && !done && 'bg-ink-100 text-ink-500',
                                )}
                            >
                                {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                            </span>
                            {step.label}
                        </button>
                        {i < STEPS.length - 1 && <span className={cx('h-px w-3 shrink-0 sm:w-5', done ? 'bg-success-500/40' : 'bg-ink-200')} aria-hidden />}
                    </li>
                );
            })}
        </ol>
    );
}
