import { useCallback, useEffect, useMemo, useState } from 'react';
import { request } from '../../api';
import { sessionStorage } from '../../lib/sessionStorage';
import type { SessionContextValue } from '../session';
import type { ProfileResponse, User } from '../../types';

// A "profile" exists once the sender was created in Inyo (profiles.externalId).
async function checkProfileStatus(): Promise<boolean> {
    try {
        const res = await request<ProfileResponse>('get', '/profile');
        return !!res.profile?.externalId;
    } catch (e) {
        console.error('Profile check failed', e);
        return false;
    }
}

/** The signed-in user and whether the sender exists in Inyo; restored from localStorage on startup. */
export function useSessionState(): SessionContextValue {
    const [user, setUser] = useState<User | null>(null);
    const [hasProfile, setHasProfile] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const restore = async () => {
            const saved = sessionStorage.user();
            if (saved) {
                setUser(saved);
                const ok = await checkProfileStatus();
                if (cancelled) return;
                setHasProfile(ok);
            }
            if (!cancelled) setLoading(false);
        };
        restore();
        return () => { cancelled = true; };
    }, []);

    // The user is published before the profile check answers, so a returning sender briefly lands
    // on /profile; kept as is for now (see App tests), to be settled with the login flow later.
    const login = useCallback(async (userData: User) => {
        setUser(userData);
        sessionStorage.saveUser(userData);
        setHasProfile(await checkProfileStatus());
    }, []);

    const logout = useCallback(() => {
        setUser(null);
        setHasProfile(false);
        sessionStorage.clear();
    }, []);

    const profileSaved = useCallback((patch: Partial<User>) => {
        setHasProfile(true);
        setUser((current) => {
            if (!current) return current;
            const next: User = { ...current, ...patch };
            sessionStorage.saveUser(next);
            return next;
        });
    }, []);

    return useMemo(
        () => ({ user, hasProfile, loading, home: hasProfile ? '/overview' : '/profile', login, logout, profileSaved }),
        [user, hasProfile, loading, login, logout, profileSaved],
    );
}
