import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Signup from './Signup';
import { request } from '../api';
import { TEST_ADDRESS } from '../lib/usStates';
import { renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const fillRequired = async (user) => {
  await user.type(screen.getByLabelText(/first name/i), 'Jane');
  await user.type(screen.getByLabelText(/last name/i), 'Doe');
  await user.type(screen.getByLabelText(/email address/i), 'jane@example.com');
  await user.type(screen.getByLabelText(/date of birth/i), '1990-05-01');
  await user.type(screen.getByLabelText(/^password/i), 'secret123');
};

describe('Signup', () => {
  beforeEach(() => { request.mockReset(); });

  it('fills the sandbox address from the checkbox and clears it when unchecked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Signup />, { session: { login: vi.fn() } });
    await user.click(screen.getByRole('checkbox', { name: /sandbox test address/i }));
    expect(screen.getByLabelText(/address line 1/i)).toHaveValue(TEST_ADDRESS.address);
    expect(screen.getByLabelText(/city/i)).toHaveValue(TEST_ADDRESS.city);
    expect(screen.getByLabelText(/^state/i)).toHaveValue(TEST_ADDRESS.state);
    expect(screen.getByLabelText(/zip code/i)).toHaveValue(TEST_ADDRESS.zipcode);

    await user.click(screen.getByRole('checkbox', { name: /sandbox test address/i }));
    expect(screen.getByLabelText(/address line 1/i)).toHaveValue('');
    expect(screen.getByLabelText(/city/i)).toHaveValue('');
    expect(screen.getByLabelText(/^state/i)).toHaveValue('');
    expect(screen.getByLabelText(/zip code/i)).toHaveValue('');
  });

  it('posts the whole form, stores the token and calls onLogin with userId', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue();
    request.mockResolvedValue({ user: { id: 'u9', email: 'jane@example.com' }, token: 'jwt-9' });
    renderWithProviders(<Signup />, { session: { login: onLogin } });
    await fillRequired(user);
    await user.click(screen.getByRole('checkbox', { name: /sandbox test address/i }));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith({ id: 'u9', userId: 'u9', email: 'jane@example.com' }));
    expect(request).toHaveBeenCalledWith('post', '/register', {
      email: 'jane@example.com', password: 'secret123', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-05-01', ...TEST_ADDRESS,
    });
    expect(localStorage.getItem('authToken')).toBe('jwt-9');
  });

  it('renders the error returned by the BFF', async () => {
    const user = userEvent.setup();
    request.mockImplementation(() => Promise.reject({ error: 'UNIQUE constraint failed: users.email' }));
    renderWithProviders(<Signup />, { session: { login: vi.fn() } });
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/UNIQUE constraint failed/);
  });

  it('disables the button while submitting', async () => {
    const user = userEvent.setup();
    request.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Signup />, { session: { login: vi.fn() } });
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  it('links back to login', () => {
    renderWithProviders(<Signup />, { session: { login: vi.fn() } });
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
  });
});
