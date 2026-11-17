import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface CardProps extends ComponentPropsWithoutRef<'div'> {
    /** Element to render, e.g. `section` or `form`. */
    as?: ElementType;
    children?: ReactNode;
}

export function Card({ className, children, as: Comp = 'div', ...props }: CardProps) {
    return (
        <Comp className={cx('card', className)} {...props}>
            {children}
        </Comp>
    );
}

export interface CardHeaderProps {
    title?: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
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

export interface CardSectionProps {
    className?: string;
    children?: ReactNode;
}

export function CardBody({ className, children }: CardSectionProps) {
    return <div className={cx('px-6 py-5', className)}>{children}</div>;
}

export function CardFooter({ className, children }: CardSectionProps) {
    return <div className={cx('flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/60 px-6 py-4 rounded-b-card', className)}>{children}</div>;
}

export default Card;
