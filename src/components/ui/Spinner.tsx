import { Loader2 } from 'lucide-react';
import { cx } from '../../lib/cx';

export interface SpinnerProps {
    label?: string;
    className?: string;
    size?: 'sm' | 'md';
}

export default function Spinner({ label = 'Loading…', className, size = 'md' }: SpinnerProps) {
    return (
        <div role="status" className={cx('flex items-center justify-center gap-3 py-12 text-sm text-ink-500', className)}>
            <Loader2 className={cx('animate-spin text-brand-500', size === 'sm' ? 'size-4' : 'size-6')} aria-hidden />
            <span>{label}</span>
        </div>
    );
}
