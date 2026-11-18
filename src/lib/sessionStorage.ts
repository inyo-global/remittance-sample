import type { User } from '../types';

const TOKEN_KEY = 'authToken';
const USER_KEY = 'remittance_user';

/** The only place that touches localStorage for the session; every read is guarded. */
export const sessionStorage = {
    token(): string | null {
        try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
    },
    /** The cached user, only while a token is also present; a corrupt entry counts as absent. */
    user(): User | null {
        try {
            const saved = localStorage.getItem(USER_KEY);
            if (!saved || !localStorage.getItem(TOKEN_KEY)) return null;
            const parsed: unknown = JSON.parse(saved);
            return parsed && typeof parsed === 'object' && typeof (parsed as User).id === 'string' ? (parsed as User) : null;
        } catch {
            return null;
        }
    },
    saveToken(token: string) {
        try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
    },
    saveUser(user: User) {
        try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* storage unavailable */ }
    },
    clear() {
        try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
        } catch { /* storage unavailable */ }
    },
};
