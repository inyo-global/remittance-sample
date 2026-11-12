import React from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '../../lib/cx';

const VARIANTS = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500/40 shadow-sm',
    secondary: 'bg-white text-ink-800 border border-ink-200 hover:border-ink-300 hover:bg-ink-50 focus-visible:ring-brand-500/30',
    ghost: 'bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-brand-500/30',
    success: 'bg-success-600 text-white hover:bg-success-700 focus-visible:ring-success-500/40 shadow-sm',
    danger: 'bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-500/40 shadow-sm',
    dark: 'bg-ink-900 text-white hover:bg-ink-800 focus-visible:ring-ink-500/40 shadow-sm',
};

const SIZES = {
    sm: 'h-9 px-3.5 text-sm gap-1.5',
    md: 'h-11 px-5 text-[15px] gap-2',
    lg: 'h-12 px-6 text-base gap-2',
};

/**
 * Button primitive. Pass `as={Link}` + `to` to render a router link with the same look.
 */
const Button = React.forwardRef(function Button(
    { as: Comp = 'button', variant = 'primary', size = 'md', loading = false, icon: Icon, iconRight: IconRight, className, children, disabled, type, ...props },
    ref,
) {
    const isDisabled = disabled || loading;
    return (
        <Comp
            ref={ref}
            type={Comp === 'button' ? type || 'button' : undefined}
            aria-busy={loading || undefined}
            disabled={Comp === 'button' ? isDisabled : undefined}
            aria-disabled={Comp !== 'button' && isDisabled ? true : undefined}
            className={cx(
                'inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition-all',
                'focus:outline-none focus-visible:ring-4 active:scale-[0.98]',
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
                VARIANTS[variant],
                SIZES[size],
                className,
            )}
            {...props}
        >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
            {children}
            {IconRight && !loading ? <IconRight className="size-4" aria-hidden /> : null}
        </Comp>
    );
});

export default Button;
