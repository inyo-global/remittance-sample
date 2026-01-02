import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { TransactionProvider } from './context/TransactionContext';
import Signup from './pages/Signup';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
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
import Header from './components/Header';
import MainLayout from './components/MainLayout';

import { request } from './api';

function App() {
  const [user, setUser] = useState(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  // Helper to check profile status
  const checkProfileStatus = async (userId) => {
    try {
      const res = await request('get', `/profile?userId=${userId}`);
      return !!res.profile;
    } catch (e) {
      console.error("Profile check failed", e);
      return false;
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      const saved = localStorage.getItem('remittance_user');
      if (saved) {
        const u = JSON.parse(saved);
        setUser(u);
        const has = await checkProfileStatus(u.userId);
        setHasProfile(has);
      }
      setLoading(false);
    };
    checkUser();
  }, []);

  const handleLogin = async (userData) => {
    setUser(userData);
    localStorage.setItem('remittance_user', JSON.stringify(userData));
    // Check if they have a profile
    const has = await checkProfileStatus(userData.userId);
    setHasProfile(has);
  };

  const handleLogout = () => {
    setUser(null);
    setHasProfile(false);
    localStorage.removeItem('remittance_user');
  };

  if (loading) return <div className="loader"></div>;

  return (
    <Router>
      <TransactionProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={!user ? <Navigate to="/login" /> : <Navigate to={hasProfile ? "/dashboard" : "/profile"} />} />
          <Route path="/login" element={!user ? <Login onLogin={handleLogin} /> : <Navigate to={hasProfile ? "/dashboard" : "/profile"} />} />
          <Route path="/signup" element={!user ? <Signup onLogin={handleLogin} /> : <Navigate to={hasProfile ? "/dashboard" : "/profile"} />} />

          {/* Protected Routes wrapped in MainLayout */}
          <Route path="*" element={
            user ? (
              <MainLayout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="/profile" element={<Profile user={user} />} />
                  <Route path="/dashboard" element={<Dashboard user={user} />} />
                  <Route path="/beneficiaries" element={<Beneficiaries user={user} />} />
                  <Route path="/beneficiaries/new" element={<AddBeneficiary user={user} />} />
                  <Route path="/beneficiaries/:id/account" element={<AddAccount user={user} />} />
                  <Route path="/payment" element={<AddPayment user={user} />} />
                  <Route path="/payment-methods" element={<PaymentMethods user={user} />} />
                  <Route path="/compliance" element={<Compliance user={user} />} />
                  <Route path="/transaction/review" element={<ReviewTransaction user={user} />} />
                  <Route path="/transaction/receipt" element={<Receipt user={user} />} />
                  <Route path="/transactions" element={<Transactions user={user} />} />
                </Routes>
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          } />
        </Routes>
      </TransactionProvider>
    </Router>
  );
}

export default App;
