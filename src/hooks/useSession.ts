import { useContext } from 'react';
import { SessionContext, type SessionContextValue } from '../context/session';

/** The signed-in user, profile flag and login/logout. Throws outside <SessionProvider>. */
export function useSession(): SessionContextValue {
    const ctx = useContext(SessionContext);
    if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
    return ctx;
}
