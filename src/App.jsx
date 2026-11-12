import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { TransactionProvider } from './context/TransactionContext';
import { ToastProvider } from './components/ui/Toast';
import Spinner from './components/ui/Spinner';
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
import Login from './pages/Login';
import MainLayout from './components/MainLayout';
import { request } from './api';

function App() {
  const [user, setUser] = useState(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  // A "profile" exists once the sender was created in Inyo (profiles.externalId).
  const checkProfileStatus = useCallback(async () => {
    try {
      const res = await request('get', '/profile');
      return !!res.profile?.externalId;
    } catch (e) {
      console.error('Profile check failed', e);
      return false;
    }
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const saved = localStorage.getItem('remittance_user');
      if (saved && localStorage.getItem('authToken')) {
        const u = JSON.parse(saved);
        setUser(u);
        setHasProfile(await checkProfileStatus());
      }
      setLoading(false);
    };
    checkUser();
  }, [checkProfileStatus]);

  const handleLogin = async (userData) => {
    setUser(userData);
    localStorage.setItem('remittance_user', JSON.stringify(userData));
    setHasProfile(await checkProfileStatus());
  };

  const handleLogout = () => {
    setUser(null);
    setHasProfile(false);
    localStorage.removeItem('remittance_user');
    localStorage.removeItem('authToken');
  };

  const handleProfileSaved = (patch) => {
    setHasProfile(true);
    if (patch) {
      const next = { ...user, ...patch };
      setUser(next);
      localStorage.setItem('remittance_user', JSON.stringify(next));
    }
  };

  if (loading) return <Spinner label="Starting…" className="min-h-screen" />;

  const home = hasProfile ? '/overview' : '/profile';

  return (
    <Router>
      <ToastProvider>
        <TransactionProvider>
          <Routes>
            <Route path="/" element={<Navigate to={user ? home : '/login'} replace />} />
            <Route path="/login" element={!user ? <Login onLogin={handleLogin} /> : <Navigate to={home} replace />} />
            <Route path="/signup" element={!user ? <Signup onLogin={handleLogin} /> : <Navigate to={home} replace />} />

            <Route
              path="*"
              element={
                user ? (
                  <MainLayout user={user} onLogout={handleLogout}>
                    <Routes>
                      <Route path="/profile" element={<Profile user={user} hasProfile={hasProfile} onSaved={handleProfileSaved} />} />
                      <Route path="/overview" element={<Overview user={user} hasProfile={hasProfile} />} />
                      <Route path="/dashboard" element={<Dashboard user={user} hasProfile={hasProfile} />} />
                      <Route path="/beneficiaries" element={<Beneficiaries user={user} />} />
                      <Route path="/beneficiaries/new" element={<AddBeneficiary user={user} />} />
                      <Route path="/beneficiaries/:id/account" element={<AddAccount user={user} />} />
                      <Route path="/payment" element={<AddPayment user={user} />} />
                      <Route path="/payment-methods" element={<PaymentMethods user={user} />} />
                      <Route path="/compliance" element={<Compliance user={user} />} />
                      <Route path="/transaction/review" element={<ReviewTransaction user={user} />} />
                      <Route path="/transaction/receipt" element={<Receipt user={user} />} />
                      <Route path="/transactions" element={<Transactions user={user} />} />
                      <Route path="*" element={<Navigate to={home} replace />} />
                    </Routes>
                  </MainLayout>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
          </Routes>
        </TransactionProvider>
      </ToastProvider>
    </Router>
  );
}

export default App;
