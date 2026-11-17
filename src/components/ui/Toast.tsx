import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';
import { cx } from '../../lib/cx';
import { ToastContext, type ToastApi, type ToastItem, type ToastOptions, type ToastTone } from '../../lib/toast';

const TONES: Record<ToastTone, { cls: string; Icon: LucideIcon; icon: string }> = {
    info: { cls: 'border-info-100', Icon: Info, icon: 'text-info-600' },
    success: { cls: 'border-success-100', Icon: CheckCircle2, icon: 'text-success-600' },
    warning: { cls: 'border-warning-100', Icon: AlertTriangle, icon: 'text-warning-600' },
    danger: { cls: 'border-danger-100', Icon: XCircle, icon: 'text-danger-600' },
};

export interface ToastProviderProps {
    children?: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

    const push = useCallback((tone: ToastTone, title: string, description?: string, { duration = 5000 }: ToastOptions = {}) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setToasts((t) => [...t, { id, tone, title, description }]);
        if (duration > 0) setTimeout(() => dismiss(id), duration);
        return id;
    }, [dismiss]);

    const api = useMemo<ToastApi>(() => ({
        info: (t, d, o) => push('info', t, d, o),
        success: (t, d, o) => push('success', t, d, o),
        warning: (t, d, o) => push('warning', t, d, o),
        error: (t, d, o) => push('danger', t, d, { duration: 8000, ...o }),
        dismiss,
    }), [push, dismiss]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto" aria-live="polite">
                {toasts.map((t) => {
                    const { cls, Icon, icon } = TONES[t.tone];
                    return (
                        <div key={t.id} className={cx('pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-control border bg-white px-4 py-3 shadow-pop animate-fade-up', cls)}>
                            <Icon className={cx('mt-0.5 size-4 shrink-0', icon)} aria-hidden />
                            <div className="min-w-0 flex-1 text-sm">
                                <p className="font-semibold text-ink-900">{t.title}</p>
                                {t.description && <p className="mt-0.5 break-words text-ink-500">{t.description}</p>}
                            </div>
                            <button type="button" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-ink-400 hover:text-ink-700" aria-label="Dismiss">
                                <X className="size-4" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}
