import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { showsTransferChrome } from '../../lib/steps';
import { useTransaction } from '../../hooks';

export interface MainLayoutProps {
    children?: ReactNode;
}

export function useMainLayout({ children }: MainLayoutProps) {
    const location = useLocation();
    const [drawerOpen, setDrawerOpen] = useState(false);
    // Always rendered inside <TransactionProvider>, as the JS version assumed.
    const { transactionData } = useTransaction();
    const inSendFlow = showsTransferChrome(location.pathname, transactionData);

    const openDrawer = () => setDrawerOpen(true);
    const closeDrawer = () => setDrawerOpen(false);

    return { children, drawerOpen, openDrawer, closeDrawer, inSendFlow };
}

export type MainLayoutViewProps = ReturnType<typeof useMainLayout>;
