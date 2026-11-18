import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import Sidebar, { SidebarContent } from './Sidebar';
import { request } from '../api';
import { LocationProbe, renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const user = { userId: 'u1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' };
const limits = {
  oneDayLimit: { limit: { amount: 1000, currency: 'USD' }, used: { amount: 250, currency: 'USD' } },
  thirtyDaysLimit: { limit: 5000, used: 4000 },
  oneHundredAndEightyDaysLimit: { limit: 10000, used: 9500 },
};

describe('SidebarContent', () => {
  beforeEach(() => { request.mockReset(); });

  it('renders navigation, the user and the loading state for limits', () => {
    request.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<SidebarContent />, { session: { user: user, logout: () => {} } });
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/overview');
    expect(screen.getByRole('link', { name: 'Inyo API docs Opens in a new tab' })).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('JD')).toBeInTheDocument();
    expect(screen.getByText('Loading limits…')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('get', '/limits');
    expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument();
  });

  it('renders limit bars with usage percentages and tones', async () => {
    request.mockResolvedValue(limits);
    const { container } = renderWithProviders(<SidebarContent />, { session: { user: user, logout: () => {} } });
    await screen.findByText('24 hours');
    expect(screen.getByText('$250')).toBeInTheDocument();
    expect(screen.getByText('/ $1,000')).toBeInTheDocument();
    const bars = container.querySelectorAll('.h-full.rounded-full');
    expect(bars[0].style.width).toBe('25%');
    expect(bars[0].className).toContain('bg-brand-400');
    expect(bars[1].style.width).toBe('80%');
    expect(bars[1].className).toContain('bg-warning-500');
    expect(bars[2].style.width).toBe('95%');
    expect(bars[2].className).toContain('bg-danger-500');
  });

  it('invites the user to complete the profile when limits are zero', async () => {
    request.mockResolvedValue({ oneDayLimit: { limit: 0, used: 0 } });
    renderWithProviders(<SidebarContent />, { session: { user: user, logout: () => {} } });
    expect(await screen.findByText('Complete your profile to unlock sending limits.')).toBeInTheDocument();
  });

  it('shows a truncated error when limits fail', async () => {
    const long = 'x'.repeat(200);
    request.mockRejectedValue({ error: { source: 'local', message: long } });
    renderWithProviders(<SidebarContent />, { session: { user: user, logout: () => {} } });
    const el = await screen.findByTitle(long);
    expect(el).toHaveTextContent(`${'x'.repeat(140)}…`);
  });

  it('falls back to the email, then "User", when names are missing', () => {
    request.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderWithProviders(<SidebarContent />, { session: { user: { email: 'a@b.c' }, logout: () => {} } });
    expect(screen.getAllByText('a@b.c')).toHaveLength(2);
    unmount();
    renderWithProviders(<SidebarContent />, { session: { user: {}, logout: () => {} } });
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('U')).toBeInTheDocument();
  });

  it('calls onLogout and onNavigate, and navigates to compliance from Details', async () => {
    const u = userEvent.setup();
    request.mockResolvedValue(limits);
    const onLogout = vi.fn();
    const onNavigate = vi.fn();
    renderWithProviders(<SidebarContent onNavigate={onNavigate} />, { session: { user: user, logout: onLogout }, 
      route: '/', path: '/', extraRoutes: <Route path="*" element={<LocationProbe />} />,
    });
    await u.click(screen.getByRole('button', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    await u.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    await u.click(screen.getByRole('button', { name: 'Details' }));
    expect(onNavigate).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/compliance'));
  });

  it('closes the drawer when a nav link is followed', async () => {
    const u = userEvent.setup();
    request.mockResolvedValue(limits);
    const onNavigate = vi.fn();
    renderWithProviders(<SidebarContent onNavigate={onNavigate} />, { session: { user: user, logout: () => {} }, 
      route: '/', path: '/', extraRoutes: <Route path="*" element={<LocationProbe />} />,
    });
    await u.click(screen.getByRole('link', { name: 'Transactions' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent('/transactions');
  });

  it('ignores responses that arrive after unmount', async () => {
    let resolve;
    request.mockReturnValue(new Promise((r) => { resolve = r; }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderWithProviders(<SidebarContent />, { session: { user: user, logout: () => {} } });
    unmount();
    resolve(limits);
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Sidebar', () => {
  it('wraps the content in a fixed aside', () => {
    request.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithProviders(<Sidebar />, { session: { user: user, logout: () => {} } });
    const aside = container.querySelector('aside');
    expect(aside.className).toContain('fixed');
    expect(aside).toHaveTextContent('Jane Doe');
  });
});
