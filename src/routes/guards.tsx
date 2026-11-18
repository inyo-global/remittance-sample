import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '../hooks';

/** Renders `children` for a signed-in user, otherwise sends the visitor to the login page. */
export function RequireAuth({ children }: { children: ReactNode }) {
    const { user } = useSession();
    return user ? children : <Navigate to="/login" replace />;
}

/** Login/Signup are only for anonymous visitors; a signed-in user goes home. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
    const { user, home } = useSession();
    return user ? <Navigate to={home} replace /> : children;
}
