import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';
import { request } from '../api';
import { renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const fill = async (user) => {
  await user.type(screen.getByLabelText(/email address/i), 'jane@example.com');
  await user.type(screen.getByLabelText(/password/i), 'secret123');
};

describe('Login', () => {
  beforeEach(() => { request.mockReset(); });

  it('posts the form, stores the token, normalises userId and calls onLogin', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue();
    request.mockResolvedValue({ user: { id: 'u1', email: 'jane@example.com' }, token: 'jwt-1' });
    renderWithProviders(<Login onLogin={onLogin} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith({ id: 'u1', userId: 'u1', email: 'jane@example.com' }));
    expect(request).toHaveBeenCalledWith('post', '/login', { email: 'jane@example.com', password: 'secret123' });
    expect(localStorage.getItem('authToken')).toBe('jwt-1');
  });

  it('accepts a flat user response and keeps an existing userId', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    request.mockResolvedValue({ id: 'u2', userId: 'keep-me' });
    renderWithProviders(<Login onLogin={onLogin} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith({ id: 'u2', userId: 'keep-me' }));
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  it('shows the API error and does not call onLogin', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    request.mockImplementation(() => Promise.reject({ error: 'Invalid password' }));
    renderWithProviders(<Login onLogin={onLogin} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid password');
    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /log in/i })).toBeEnabled();
  });

  it('disables the submit button while the request is pending', async () => {
    const user = userEvent.setup();
    let resolve;
    request.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderWithProviders(<Login onLogin={vi.fn()} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /log in/i }));
    const button = screen.getByRole('button', { name: /log in/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    resolve({ user: { id: 'u1' } });
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('links to the signup page', () => {
    renderWithProviders(<Login onLogin={vi.fn()} />);
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute('href', '/signup');
  });
});
