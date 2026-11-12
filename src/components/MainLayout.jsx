import React, { useContext, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar, { SidebarContent } from './Sidebar';
import TransferPanel from './TransferPanel';
import StepNavigation from './StepNavigation';
import { showsTransferChrome } from '../lib/steps';
import { TransactionContext } from '../context/transaction';
import logo from '../assets/inyo-logo.png';

const MainLayout = ({ children, user, onLogout }) => {
    const location = useLocation();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const { transactionData } = useContext(TransactionContext);
    const inSendFlow = showsTransferChrome(location.pathname, transactionData);

    return (
        <div className="min-h-screen bg-ink-50">
            <Sidebar user={user} onLogout={onLogout} />

            {/* Mobile drawer */}
            {drawerOpen && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div className="absolute inset-0 bg-ink-950/60" onClick={() => setDrawerOpen(false)} />
                    <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-pop animate-fade-up">
                        <SidebarContent user={user} onLogout={onLogout} onNavigate={() => setDrawerOpen(false)} />
                    </div>
                </div>
            )}

            <div className="lg:pl-64">
                <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur lg:hidden">
                    <button type="button" onClick={() => setDrawerOpen(true)} className="rounded-full p-2 text-ink-600 hover:bg-ink-100" aria-label="Open menu">
                        <Menu className="size-5" />
                    </button>
                    <img src={logo} alt="Inyo" className="h-5" />
                </header>

                <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
                    {inSendFlow ? (
                        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
                            <div className="min-w-0 animate-fade-up">
                                <StepNavigation />
                                {children}
                            </div>
                            <div className="hidden xl:block">
                                <TransferPanel />
                            </div>
                        </div>
                    ) : (
                        <div className="animate-fade-up">{children}</div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
