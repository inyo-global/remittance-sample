import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../lib/cx';

export interface FieldOption {
    value: string | number;
    label: ReactNode;
}

/** Native input attributes minus the ones Field redefines (`prefix` is an HTML attribute too). */
type ControlProps = Omit<ComponentPropsWithoutRef<'input'>, 'prefix' | 'children'>;

export interface FieldProps extends ControlProps {
    label?: string;
    hint?: ReactNode;
    error?: ReactNode;
    /** When provided, renders a <select> with these options instead of an <input>. */
    options?: FieldOption[] | null;
    prefix?: ReactNode;
    suffix?: ReactNode;
    /** A custom control; the label/hint/error chrome wraps it. */
    children?: ReactNode;
}

/**
 * Form field: label + control + hint/error.
 * Renders a <select> when `options` is provided, otherwise an <input>.
 * Keeps the same prop surface the old Input component had so pages stay simple.
 */
const Field = forwardRef<HTMLInputElement | HTMLSelectElement, FieldProps>(function Field(
    { label, hint, error, options = null, placeholder, className, name, id, required, prefix, suffix, children, ...props },
    ref,
) {
    const autoId = useId();
    const controlId = id || name || autoId;
    const describedBy = error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined;

    const control = options ? (
        <div className="relative">
            <select
                ref={ref as React.Ref<HTMLSelectElement>}
                id={controlId}
                name={name}
                required={required}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                className={cx('field-control appearance-none pr-10', !props.value && 'text-ink-400')}
                {...(props as ComponentPropsWithoutRef<'select'>)}
            >
                <option value="" disabled>
                    {placeholder || `Select ${label ? label.toLowerCase() : 'an option'}`}
                </option>
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value} className="text-ink-900">
                        {opt.label}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
        </div>
    ) : children ? (
        children
    ) : (
        <div className="relative">
            {prefix && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-400">{prefix}</span>}
            <input
                ref={ref as React.Ref<HTMLInputElement>}
                id={controlId}
                name={name}
                required={required}
                placeholder={placeholder}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                className={cx('field-control', !!prefix && 'pl-9', !!suffix && 'pr-16')}
                {...props}
            />
            {suffix && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-500">{suffix}</span>}
        </div>
    );

    return (
        <div className={cx('min-w-0', className)}>
            {label && (
                <label htmlFor={controlId} className="mb-1.5 block text-sm font-medium text-ink-700">
                    {label}
                    {required && <span className="ml-0.5 text-danger-500" aria-hidden>*</span>}
                </label>
            )}
            {control}
            {error ? (
                <p id={`${controlId}-error`} className="mt-1.5 text-xs font-medium text-danger-600">{error}</p>
            ) : hint ? (
                <p id={`${controlId}-hint`} className="mt-1.5 text-xs text-ink-400">{hint}</p>
            ) : null}
        </div>
    );
});

export default Field;
