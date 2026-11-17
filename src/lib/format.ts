import type { FieldError, LocalError, UpstreamError } from '../types';

export const money = (value: unknown, currency = 'USD', opts: Intl.NumberFormatOptions = {}): string => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, ...opts }).format(num);
    } catch {
        return `${num.toFixed(2)} ${currency}`;
    }
};

/** Amount + currency code, for non-USD payouts where the code matters more than the symbol. */
export const amount = (value: unknown, currency?: string | null): string => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)} ${currency || ''}`.trim();
};

export const rate = (value: unknown, from = 'USD', to = ''): string => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const digits = num >= 100 ? 2 : 4;
    return `1 ${from} = ${num.toFixed(digits)} ${to}`.trim();
};

export const dateTime = (iso: string | number | Date | null | undefined, { timeZone }: { timeZone?: string } = {}): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone });
};

export const dateOnly = (iso: string | number | Date | null | undefined): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-US', { dateStyle: 'medium' });
};

export const timeOnly = (iso: string | number | Date | null | undefined): string => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

export const initials = (name = ''): string =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('') || '?';

export const maskAccount = (value: unknown): string => {
    if (!value) return '····';
    const s = String(value);
    return `···· ${s.slice(-4)}`;
};

/** Turns API field names like "residentialAddress" or "documents.0.type" into readable labels. */
export const humanize = (key = ''): string =>
    String(key)
        .replace(/\[.*?\]|\.\d+/g, '')
        .replace(/[._]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null;
const isUpstream = (e: Loose): e is Loose & UpstreamError => e.source === 'inyo';
const isLocal = (e: Loose): e is Loose & LocalError => e.source === 'local';
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Extracts a readable message from the error shapes the BFF forwards. */
export const errorMessage = (err: unknown, fallback = 'Something went wrong'): string => {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (!isObject(err)) return fallback;
    const e: unknown = err.error ?? err;
    if (typeof e === 'string') return e;
    if (!isObject(e)) return fallback;
    // Structured upstream error from the BFF (see server/middlewares/errorHandler.ts)
    if (isUpstream(e)) {
        const head = `Inyo ${e.status ?? 'no response'} on ${e.method} ${e.path}`;
        const detail = e.body && typeof e.body === 'object' ? JSON.stringify(e.body) : str(e.body) || e.message;
        return [head, detail && detail !== e.hint ? detail : null, e.hint].filter(Boolean).join(' — ');
    }
    if (isLocal(e)) return e.message || fallback;
    if (Array.isArray(e.errors)) return (e.errors as FieldError[]).map((x) => `${humanize(x.fieldName)}: ${x.error}`).join('; ');
    if (isObject(e.errors)) return Object.entries(e.errors).map(([k, v]) => `${humanize(k)}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join('; ');
    const details = e.details;
    return str(e.message) || (isObject(details) ? str(details.message) : null) || str(err.message) || str(err.details) || fallback;
};
