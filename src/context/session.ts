import { createContext } from 'react';
import type { User } from '../types';

export interface SessionContextValue {
    /** The signed-in user, or null. */
    user: User | null;
    /** True once the sender exists in Inyo (profiles.externalId). */
    hasProfile: boolean;
    /** True while the cached session is being restored on startup. */
    loading: boolean;
    /** Where a signed-in user lands: the overview, or the profile until it is created. */
    home: string;
    /** Called by Login/Signup with the user the BFF answered; the token is already stored. */
    login: (user: User) => Promise<void>;
    logout: () => void;
    /** Called by Profile with the fields it changed, so the cached user stays in sync. */
    profileSaved: (patch: Partial<User>) => void;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);
