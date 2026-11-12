import React from 'react';
import { cx } from '../../lib/cx';

export function Card({ className, children, as: Comp = 'div', ...props }) {
    return (
        <Comp className={cx('card', className)} {...props}>
            {children}
        </Comp>
    );
}

export function CardHeader({ title, description, action, className }) {
    return (
        <div className={cx('flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-5', className)}>
            <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink-900">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
            </div>
            {action}
        </div>
    );
}

export function CardBody({ className, children }) {
    return <div className={cx('px-6 py-5', className)}>{children}</div>;
}

export function CardFooter({ className, children }) {
    return <div className={cx('flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/60 px-6 py-4 rounded-b-card', className)}>{children}</div>;
}

export default Card;
