import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './context/SessionProvider';
import { TransactionProvider } from './context/TransactionContext';
import { ToastProvider } from './components/ui/Toast';
import Spinner from './components/ui/Spinner';
import MainLayout from './components/MainLayout';
import { RedirectIfAuthed, RequireAuth } from './routes/guards';
import { useSession } from './hooks';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import Overview from './pages/Overview';
import Beneficiaries from './pages/Beneficiaries';
import AddBeneficiary from './pages/AddBeneficiary';
import AddAccount from './pages/AddAccount';
import AddPayment from './pages/AddPayment';
import PaymentMethods from './pages/PaymentMethods';
import ReviewTransaction from './pages/ReviewTransaction';
import Receipt from './pages/Receipt';
import Compliance from './pages/Compliance';
import Transactions from './pages/Transactions';

function AppRoutes() {
    const { user, loading, home } = useSession();

    if (loading) return <Spinner label="Starting…" className="min-h-screen" />;

    return (
        <Routes>
            <Route path="/" element={<Navigate to={user ? home : '/login'} replace />} />
            <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
            <Route path="/signup" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
            <Route
                path="*"
                element={
                    <RequireAuth>
                        <MainLayout>
                            <Routes>
                                <Route path="/profile" element={<Profile />} />
                                <Route path="/overview" element={<Overview />} />
                                <Route path="/dashboard" element={<Dashboard />} />
                                <Route path="/beneficiaries" element={<Beneficiaries />} />
                                <Route path="/beneficiaries/new" element={<AddBeneficiary />} />
                                <Route path="/beneficiaries/:id/account" element={<AddAccount />} />
                                <Route path="/payment" element={<AddPayment />} />
                                <Route path="/payment-methods" element={<PaymentMethods />} />
                                <Route path="/compliance" element={<Compliance />} />
                                <Route path="/transaction/review" element={<ReviewTransaction />} />
                                <Route path="/transaction/receipt" element={<Receipt />} />
                                <Route path="/transactions" element={<Transactions />} />
                                <Route path="*" element={<Navigate to={home} replace />} />
                            </Routes>
                        </MainLayout>
                    </RequireAuth>
                }
            />
        </Routes>
    );
}

export default function App() {
    return (
        <Router>
            <SessionProvider>
                <ToastProvider>
                    <TransactionProvider>
                        <AppRoutes />
                    </TransactionProvider>
                </ToastProvider>
            </SessionProvider>
        </Router>
    );
}
