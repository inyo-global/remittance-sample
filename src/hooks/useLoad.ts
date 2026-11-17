import { useCallback, useEffect, useState, type DependencyList, type Dispatch, type SetStateAction } from 'react';
import { errorMessage } from '../lib/format';

export interface LoadState<T> {
    data: T;
    setData: Dispatch<SetStateAction<T>>;
    loading: boolean;
    error: string | null;
    setError: Dispatch<SetStateAction<string | null>>;
    /** Runs the loader again (shows `loading` while it runs). */
    reload: () => Promise<void>;
}

/**
 * Loads `data` once per change of `deps` and ignores results that land after the component
 * unmounted or the deps changed (the `let cancelled = false` pattern, in one place).
 */
export function useLoad<T>(load: () => Promise<T>, initial: T, deps: DependencyList, fallback?: string): LoadState<T> {
    const [data, setData] = useState<T>(initial);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        load()
            .then((res) => !cancelled && setData(res))
            .catch((err) => !cancelled && setError(errorMessage(err, fallback)))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, tick]);

    const reload = useCallback(async () => { setTick((t) => t + 1); }, []);

    return { data, setData, loading, error, setError, reload };
}
