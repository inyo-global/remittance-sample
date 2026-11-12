import React from 'react';
import { cx } from '../../lib/cx';

export default function EmptyState({ icon: Icon, title, description, action, className }) {
    return (
        <div className={cx('flex flex-col items-center justify-center rounded-card border border-dashed border-ink-300 bg-white/60 px-6 py-14 text-center', className)}>
            {Icon && (
                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <Icon className="size-6" aria-hidden />
                </div>
            )}
            <h3 className="text-base font-semibold text-ink-900">{title}</h3>
            {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
