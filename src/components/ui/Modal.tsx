import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '../../lib/cx';

export interface ModalProps {
    open: boolean;
    onClose?: () => void;
    title?: string;
    description?: ReactNode;
    children?: ReactNode;
    size?: 'md' | 'lg';
}

export default function Modal({ open, onClose, title, description, children, size = 'md' }: ModalProps) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={onClose} />
            <div className={cx('relative w-full overflow-hidden rounded-card bg-white shadow-pop animate-fade-up', size === 'lg' ? 'max-w-3xl' : 'max-w-lg')}>
                <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
                        {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
                    </div>
                    <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Close">
                        <X className="size-4" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
