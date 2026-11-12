import { useEffect, useState } from 'react';

/**
 * Tracks a quote's validity window from its `createdAt`/`expireAt` fields.
 * Docs (quotes-fx): "Always check expireAt before using a quote" and warn the
 * user when ~80% of the window has elapsed, then refresh.
 */
export default function useQuoteCountdown(quote) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!quote?.expireAt) return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [quote?.expireAt]);

    if (!quote?.expireAt) return { expired: false, warning: false, remainingMs: null, remainingLabel: null, progress: 0 };

    const expireAt = new Date(quote.expireAt).getTime();
    const createdAt = quote.createdAt ? new Date(quote.createdAt).getTime() : expireAt - 30 * 60 * 1000;
    const total = Math.max(expireAt - createdAt, 1);
    const remainingMs = Math.max(expireAt - now, 0);
    const progress = Math.min(1, Math.max(0, 1 - remainingMs / total));
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);

    return {
        expired: remainingMs <= 0,
        warning: progress >= 0.8 && remainingMs > 0,
        remainingMs,
        remainingLabel: `${mins}:${String(secs).padStart(2, '0')}`,
        progress,
    };
}
