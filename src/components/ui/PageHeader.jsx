import React from 'react';
import { cx } from '../../lib/cx';

export default function PageHeader({ kicker, title, description, actions, className }) {
    return (
        <div className={cx('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
            <div className="min-w-0">
                {kicker && <p className="kicker mb-1.5">{kicker}</p>}
                <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-[28px]">{title}</h1>
                {description && <p className="mt-1 max-w-2xl text-[15px] text-ink-500">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
    );
}
