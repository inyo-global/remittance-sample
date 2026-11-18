import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MainLayout from './MainLayout';
import { request } from '../api';
import { renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const user = { userId: 'u1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' };
const layout = (route, transaction = {}) =>
  renderWithProviders(
    <MainLayout>
      <p>page content</p>
    </MainLayout>,
    { route, path: '*', session: { user }, transaction },
  );

describe('MainLayout', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ oneDayLimit: { limit: 0, used: 0 } });
  });

  it('renders the sidebar, header logo and the page without transfer chrome outside the flow', () => {
    layout('/overview');
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.getAllByText('Jane Doe')).toHaveLength(1);
    expect(screen.queryByRole('list', { name: 'Transfer progress' })).not.toBeInTheDocument();
    expect(screen.queryByText('Transfer summary')).not.toBeInTheDocument();
  });

  it('shows the stepper and summary on the amount step', () => {
    layout('/dashboard');
    expect(screen.getByRole('list', { name: 'Transfer progress' })).toBeInTheDocument();
    expect(screen.getByText('Transfer summary')).toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('hides the chrome on middle steps until a quote exists', () => {
    const { unmount } = layout('/beneficiaries');
    expect(screen.queryByRole('list', { name: 'Transfer progress' })).not.toBeInTheDocument();
    unmount();
    layout('/beneficiaries', { quote: { id: 'q' } });
    expect(screen.getByRole('list', { name: 'Transfer progress' })).toBeInTheDocument();
  });

  it('opens and closes the mobile drawer', async () => {
    const u = userEvent.setup();
    layout('/overview');
    expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();
    expect(screen.getAllByText('Jane Doe')).toHaveLength(2);
    await u.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument();
  });

  it('closes the drawer from the backdrop', async () => {
    const u = userEvent.setup();
    const { container } = layout('/overview');
    await u.click(screen.getByRole('button', { name: 'Open menu' }));
    await u.click(container.querySelector('.fixed.inset-0.z-40 > .absolute'));
    expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument();
  });
});
