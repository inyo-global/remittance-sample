import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { request } from './api';

vi.mock('./api', () => ({ request: vi.fn() }));

// Pages are covered by their own tests; here they are stubs that expose their props.
const { stub } = vi.hoisted(() => ({
  stub: (name) => ({ default: (props) => <div data-testid={`page-${name}`}>{name} hasProfile={String(props.hasProfile)} user={props.user?.email}</div> }),
}));
vi.mock('./pages/Signup', () => ({ default: ({ onLogin }) => <button onClick={() => onLogin({ id: 'u2', email: 'new@example.com' })}>Signup</button> }));
vi.mock('./pages/Login', () => ({ default: ({ onLogin }) => <button onClick={() => onLogin({ id: 'u1', email: 'jane@example.com' })}>Login</button> }));
vi.mock('./pages/Profile', () => ({ default: ({ onSaved, hasProfile, user }) => <div data-testid="page-Profile">Profile hasProfile={String(hasProfile)} user={user?.email} <button onClick={() => onSaved({ firstName: 'Patched' })}>save</button></div> }));
vi.mock('./pages/Overview', () => stub('Overview'));
vi.mock('./pages/Dashboard', () => stub('Dashboard'));
vi.mock('./pages/Beneficiaries', () => stub('Beneficiaries'));
vi.mock('./pages/AddBeneficiary', () => stub('AddBeneficiary'));
vi.mock('./pages/AddAccount', () => stub('AddAccount'));
vi.mock('./pages/AddPayment', () => stub('AddPayment'));
vi.mock('./pages/PaymentMethods', () => stub('PaymentMethods'));
vi.mock('./pages/ReviewTransaction', () => stub('ReviewTransaction'));
vi.mock('./pages/Receipt', () => stub('Receipt'));
vi.mock('./pages/Compliance', () => stub('Compliance'));
vi.mock('./pages/Transactions', () => stub('Transactions'));
vi.mock('./components/MainLayout', () => ({ default: ({ children, user, onLogout }) => <div data-testid="layout">layout:{user.email}<button onClick={onLogout}>logout</button>{children}</div> }));

const go = (path) => window.history.pushState({}, '', path);
const SAVED = { id: 'u1', userId: 'u1', email: 'jane@example.com' };
const login = (hasExternalId = true) => {
  localStorage.setItem('remittance_user', JSON.stringify(SAVED));
  localStorage.setItem('authToken', 'jwt');
  request.mockResolvedValue({ profile: hasExternalId ? { externalId: 'sender-1' } : null });
};

describe('App', () => {
  beforeEach(() => { request.mockReset(); go('/'); });

  it('sends an anonymous visitor to the login page without calling the API', async () => {
    const { container } = render(<App />);
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(request).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="layout"]')).toBeNull();
  });

  it('redirects protected routes to login when logged out', async () => {
    go('/transactions');
    render(<App />);
    await screen.findByRole('button', { name: 'Login' });
    expect(window.location.pathname).toBe('/login');
  });

  it('restores the session, checks the profile and lands on the overview', async () => {
    login(true);
    render(<App />);
    expect(screen.getByText('Starting…')).toBeInTheDocument();
    expect(await screen.findByTestId('page-Overview')).toHaveTextContent('hasProfile=true user=jane@example.com');
    expect(request).toHaveBeenCalledWith('get', '/profile');
    expect(window.location.pathname).toBe('/overview');
    expect(screen.getByTestId('layout')).toHaveTextContent('layout:jane@example.com');
  });

  it('sends a logged-in user without a sender profile to /profile, and /login bounces to home', async () => {
    login(false);
    go('/login');
    render(<App />);
    expect(await screen.findByTestId('page-Profile')).toHaveTextContent('hasProfile=false');
    expect(window.location.pathname).toBe('/profile');
  });

  it('treats a failed profile check as "no profile"', async () => {
    localStorage.setItem('remittance_user', JSON.stringify(SAVED));
    localStorage.setItem('authToken', 'jwt');
    request.mockImplementation(() => Promise.reject(new Error('401')));
    render(<App />);
    expect(await screen.findByTestId('page-Profile')).toHaveTextContent('hasProfile=false');
  });

  it('ignores a saved user without a token', async () => {
    localStorage.setItem('remittance_user', JSON.stringify(SAVED));
    render(<App />);
    await screen.findByRole('button', { name: 'Login' });
    expect(request).not.toHaveBeenCalled();
  });

  it('renders the routed page inside the layout and redirects unknown paths home', async () => {
    login(true);
    go('/beneficiaries/b1/account');
    render(<App />);
    expect(await screen.findByTestId('page-AddAccount')).toBeInTheDocument();
    go('/nope');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/overview'));
  });

  it('logs in, stores the user, then logs out and clears the session', async () => {
    const u = userEvent.setup();
    request.mockResolvedValue({ profile: { externalId: 'sender-1' } });
    render(<App />);
    await u.click(await screen.findByRole('button', { name: 'Login' }));
    // setUser renders before the profile check resolves, so the redirect from /login is computed
    // with hasProfile=false and lands on /profile even for a fully onboarded sender.
    const profilePage = await screen.findByTestId('page-Profile');
    await waitFor(() => expect(profilePage).toHaveTextContent('hasProfile=true'));
    expect(window.location.pathname).toBe('/profile');
    expect(JSON.parse(localStorage.getItem('remittance_user'))).toEqual({ id: 'u1', email: 'jane@example.com' });

    localStorage.setItem('authToken', 'jwt');
    await u.click(screen.getByRole('button', { name: 'logout' }));
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(localStorage.getItem('remittance_user')).toBeNull();
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  it('marks the profile as complete and patches the stored user after Profile saves', async () => {
    const u = userEvent.setup();
    login(false);
    render(<App />);
    await u.click(await screen.findByRole('button', { name: 'save' }));
    await waitFor(() => expect(screen.getByTestId('page-Profile')).toHaveTextContent('hasProfile=true'));
    expect(JSON.parse(localStorage.getItem('remittance_user'))).toEqual({ ...SAVED, firstName: 'Patched' });
  });
});
