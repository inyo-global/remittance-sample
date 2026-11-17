import { createContext, useContext } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
    /** Milliseconds before the toast closes itself; 0 keeps it until dismissed. */
    duration?: number;
}

export interface ToastItem {
    id: string;
    tone: ToastTone;
    title: string;
    description?: string;
}

type ToastFn = (title: string, description?: string, options?: ToastOptions) => string;

export interface ToastApi {
    info: ToastFn;
    success: ToastFn;
    warning: ToastFn;
    error: ToastFn;
    dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
    return ctx;
}
