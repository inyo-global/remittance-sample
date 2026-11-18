import type { ReactNode } from 'react';
import { SessionContext } from '../session';
import { useSessionState } from './model';

export const SessionProvider = ({ children }: { children: ReactNode }) => {
    const value = useSessionState();
    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};
