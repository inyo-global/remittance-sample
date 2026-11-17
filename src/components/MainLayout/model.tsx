import { useContext, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { showsTransferChrome } from '../../lib/steps';
import { TransactionContext } from '../../context/transaction';
import type { User } from '../../types';

export interface MainLayoutProps {
    children?: ReactNode;
    user: User | null | undefined;
    onLogout: () => void;
}

export function useMainLayout({ children, user, onLogout }: MainLayoutProps) {
    const location = useLocation();
    const [drawerOpen, setDrawerOpen] = useState(false);
    // Always rendered inside <TransactionProvider>, as the JS version assumed.
    const { transactionData } = useContext(TransactionContext)!;
    const inSendFlow = showsTransferChrome(location.pathname, transactionData);

    const openDrawer = () => setDrawerOpen(true);
    const closeDrawer = () => setDrawerOpen(false);

    return { children, user, onLogout, drawerOpen, openDrawer, closeDrawer, inSendFlow };
}

export type MainLayoutViewProps = ReturnType<typeof useMainLayout>;
