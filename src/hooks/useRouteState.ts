import { useLocation } from 'react-router-dom';

/**
 * The `state` handed over by `navigate(to, { state })`, typed by the caller.
 * React Router types it as `any`; this is the one place that cast lives.
 */
export function useRouteState<T extends object>(): T | null {
    const { state } = useLocation();
    return (state || null) as T | null;
}
