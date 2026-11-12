export const money = (value, currency = 'USD', opts = {}) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, ...opts }).format(num);
    } catch {
        return `${num.toFixed(2)} ${currency}`;
    }
};

/** Amount + currency code, for non-USD payouts where the code matters more than the symbol. */
export const amount = (value, currency) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)} ${currency || ''}`.trim();
};

export const rate = (value, from = 'USD', to = '') => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const digits = num >= 100 ? 2 : 4;
    return `1 ${from} = ${num.toFixed(digits)} ${to}`.trim();
};

export const dateTime = (iso, { timeZone } = {}) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone });
};

export const dateOnly = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-US', { dateStyle: 'medium' });
};

export const timeOnly = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

export const initials = (name = '') =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('') || '?';

export const maskAccount = (value) => {
    if (!value) return '····';
    const s = String(value);
    return `···· ${s.slice(-4)}`;
};

/** Turns API field names like "residentialAddress" or "documents.0.type" into readable labels. */
export const humanize = (key = '') =>
    String(key)
        .replace(/\[.*?\]|\.\d+/g, '')
        .replace(/[._]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();

/** Extracts a readable message from the error shapes the BFF forwards. */
export const errorMessage = (err, fallback = 'Something went wrong') => {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    const e = err.error ?? err;
    if (typeof e === 'string') return e;
    // Structured upstream error from the BFF (see upstreamError in server.js)
    if (e?.source === 'inyo') {
        const head = `Inyo ${e.status ?? 'no response'} on ${e.method} ${e.path}`;
        const detail = e.body && typeof e.body === 'object' ? JSON.stringify(e.body) : e.body || e.message;
        return [head, detail && detail !== e.hint ? detail : null, e.hint].filter(Boolean).join(' — ');
    }
    if (e?.source === 'local') return e.message || fallback;
    if (Array.isArray(e?.errors)) return e.errors.map((x) => `${humanize(x.fieldName)}: ${x.error}`).join('; ');
    if (e?.errors && typeof e.errors === 'object') return Object.entries(e.errors).map(([k, v]) => `${humanize(k)}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ');
    return e?.message || e?.details?.message || err.message || err.details || fallback;
};
