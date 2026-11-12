import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cx } from '../../lib/cx';

const TONES = {
    info: { cls: 'border-info-100 bg-info-50 text-info-700', Icon: Info },
    success: { cls: 'border-success-100 bg-success-50 text-success-700', Icon: CheckCircle2 },
    warning: { cls: 'border-warning-100 bg-warning-50 text-warning-700', Icon: AlertTriangle },
    danger: { cls: 'border-danger-100 bg-danger-50 text-danger-700', Icon: XCircle },
};

export default function Alert({ tone = 'info', title, children, action, className }) {
    const { cls, Icon } = TONES[tone];
    return (
        <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex flex-wrap items-start gap-3 rounded-control border px-4 py-3 text-sm', cls, className)}>
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 basis-56">
                {title && <p className="font-semibold">{title}</p>}
                {children && <div className={cx(title && 'mt-0.5', 'break-words opacity-90')}>{children}</div>}
            </div>
            {action && <div className="ml-auto shrink-0">{action}</div>}
        </div>
    );
}
