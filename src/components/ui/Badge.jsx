import React from 'react';
import { cx } from '../../lib/cx';

const TONES = {
    neutral: 'bg-ink-100 text-ink-600 ring-ink-200',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    success: 'bg-success-50 text-success-700 ring-success-100',
    warning: 'bg-warning-50 text-warning-700 ring-warning-100',
    danger: 'bg-danger-50 text-danger-700 ring-danger-100',
    info: 'bg-info-50 text-info-700 ring-info-100',
};

export default function Badge({ tone = 'neutral', dot = false, className, title, children }) {
    return (
        <span title={title} className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', TONES[tone], className)}>
            {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
            {children}
        </span>
    );
}
