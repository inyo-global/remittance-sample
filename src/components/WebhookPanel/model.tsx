import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../../api';
import type { WebhookInfo } from '../../types';

/**
 * Gateway notification panel (optional): the public URL where the gateway can report card verification
 * results, and the events received so far. AUTHORIZED / DECLINED update the matching card locally;
 * Inyo remains the source of truth, so "Check status" may disagree until Inyo reports the same result.
 */
export interface WebhookPanelProps {
    onEvent?: () => void;
}

export function useWebhookPanel({ onEvent }: WebhookPanelProps) {
    const [info, setInfo] = useState<WebhookInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const lastId = useRef<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await request<WebhookInfo>('get', '/webhooks/events');
            setInfo(res);
            const newest = res.events?.[0]?.id ?? null;
            if (lastId.current !== null && newest !== null && newest !== lastId.current) onEvent?.();
            lastId.current = newest;
        } catch { /* panel is informational */ } finally { setLoading(false); }
    }, [onEvent]);

    useEffect(() => {
        load();
        const timer = setInterval(load, 10000);
        return () => clearInterval(timer);
    }, [load]);

    const url = info?.publicUrl ? `${info.publicUrl}${info.path}` : null;

    return { info, loading, url, load };
}

export type WebhookPanelViewProps = ReturnType<typeof useWebhookPanel>;
