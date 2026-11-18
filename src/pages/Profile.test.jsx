import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Profile from './Profile';
import { request } from '../api';
import { LocationProbe, renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const user = { userId: 'u1', firstName: 'Jane' };
const PROFILE_RES = {
  user: { id: 'u1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe', address: '4429 CANDLEWOOD ST', city: 'LAKEWOOD', state: 'CA', zipcode: '90712', phoneNumber: '' },
  profile: { gender: 'female', occupation: 'Engineer', docType: 'passport', docNumber: '999000001', issuingCountry: 'US', expirationDate: '2030-01-01', ssnLast4: '1120', data: JSON.stringify({ state: 'NY', originalIssuingCountry: 'BR', phoneNumber: '+15551234567' }) },
};

const mockApi = ({ profile = PROFILE_RES, save = { success: true, externalId: 'sender-1' } } = {}) =>
  request.mockImplementation((method, url) => {
    if (url === '/profile') return typeof profile === 'function' ? profile() : Promise.resolve(profile);
    if (url === '/complete-profile') return typeof save === 'function' ? save() : Promise.resolve(save);
    return Promise.reject(new Error(`unexpected ${method} ${url}`));
  });

describe('Profile', () => {
  beforeEach(() => { request.mockReset(); });

  it('loads the profile and maps user, profile and the extra JSON data into the form', async () => {
    mockApi();
    renderWithProviders(<Profile />, { session: { user: user, hasProfile: true, profileSaved: vi.fn() } });
    expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/first name/i)).toHaveValue('Jane');
    expect(screen.getByLabelText(/^email/i)).toHaveValue('jane@example.com');
    expect(screen.getByLabelText(/^email/i)).toBeDisabled();
    // extra data wins for state, phone and the original issuing country
    expect(screen.getByLabelText(/^state/i)).toHaveValue('NY');
    expect(screen.getByLabelText(/mobile number/i)).toHaveValue('+15551234567');
    expect(screen.getByLabelText(/issuing country/i)).toHaveValue('BR');
    expect(screen.getByLabelText(/gender/i)).toHaveValue('female');
    expect(screen.getByLabelText(/occupation/i)).toHaveValue('Engineer');
    expect(screen.getByLabelText(/passport number/i)).toHaveValue('999000001');
    expect(screen.getByLabelText(/expiration date/i)).toHaveValue('2030-01-01');
    const ssn = screen.getByLabelText(/social security number/i);
    expect(ssn).toHaveValue('');
    expect(ssn).toHaveAttribute('placeholder', 'On file (•••-••-1120); enter to replace');
    expect(screen.getByRole('heading', { name: 'Personal information' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('shows the onboarding copy and the sample SSN placeholder before a profile exists', async () => {
    mockApi({ profile: { user: PROFILE_RES.user, profile: null } });
    renderWithProviders(<Profile />, { session: { user: user, hasProfile: false, profileSaved: vi.fn() } });
    expect(await screen.findByRole('heading', { name: /complete your sender profile/i })).toBeInTheDocument();
    expect(screen.getByText('One step before sending money')).toBeInTheDocument();
    expect(screen.getByLabelText(/social security number/i)).toHaveAttribute('placeholder', '078-05-1120');
    expect(screen.getByLabelText(/gender/i)).toHaveValue('male');
    expect(screen.getByLabelText(/issuing country/i)).toHaveValue('US');
    expect(screen.getByRole('button', { name: /save and continue/i })).toBeInTheDocument();
  });

  it('shows the load error', async () => {
    mockApi({ profile: () => Promise.reject({ error: 'User not found' }) });
    renderWithProviders(<Profile />, { session: { user: user, hasProfile: true, profileSaved: vi.fn() } });
    expect(await screen.findByRole('alert')).toHaveTextContent('User not found');
  });

  it("switches the issuing field when the document is a driver's license", async () => {
    const u = userEvent.setup();
    mockApi();
    renderWithProviders(<Profile />, { session: { user: user, hasProfile: true, profileSaved: vi.fn() } });
    await screen.findByLabelText(/first name/i);
    await u.selectOptions(screen.getByLabelText(/identity document/i), 'driver_license');
    expect(screen.getByLabelText(/license number/i)).toBeInTheDocument();
    expect(screen.getByText('Issuing state')).toBeInTheDocument();
    expect(screen.getByText('Uses your residential state.')).toBeInTheDocument();
    // both the residential and the issuing select are bound to formData.state
    const states = document.querySelectorAll('select[name="state"]');
    expect(states).toHaveLength(2);
    expect(states[1]).toHaveValue('NY');
    expect(screen.queryByLabelText(/issuing country/i)).not.toBeInTheDocument();
  });

  it('posts the form, patches the parent user, toasts and stays on the page when a profile exists', async () => {
    const u = userEvent.setup();
    const onSaved = vi.fn();
    mockApi();
    renderWithProviders(<Profile />, { session: { user: user, hasProfile: true, profileSaved: onSaved },  route: '/profile', extraRoutes: <Route path="/dashboard" element={<LocationProbe />} /> });
    await screen.findByLabelText(/first name/i);
    await u.clear(screen.getByLabelText(/occupation/i));
    await u.type(screen.getByLabelText(/occupation/i), 'Designer');
    await u.type(screen.getByLabelText(/social security number/i), '078-05-9999');
    await u.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('post', '/complete-profile', expect.objectContaining({
      firstName: 'Jane', lastName: 'Doe', occupation: 'Designer', ssn: '078-05-9999', state: 'NY', issuingCountry: 'BR', docType: 'passport',
    })));
    expect(onSaved).toHaveBeenCalledWith({ firstName: 'Jane', lastName: 'Doe', address: '4429 CANDLEWOOD ST', city: 'LAKEWOOD', state: 'NY', zipcode: '90712', phoneNumber: '+15551234567' });
    expect(await screen.findByText('Profile updated')).toBeInTheDocument();
    // the SSN is cleared and only its last four are kept
    expect(screen.getByLabelText(/social security number/i)).toHaveValue('');
    expect(screen.getByLabelText(/social security number/i)).toHaveAttribute('placeholder', 'On file (•••-••-9999); enter to replace');
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });

  it('navigates to the dashboard after the first save', async () => {
    const u = userEvent.setup();
    mockApi({ profile: { user: PROFILE_RES.user, profile: null } });
    renderWithProviders(<Profile />, { session: { user: user, hasProfile: false, profileSaved: vi.fn() },  route: '/profile', extraRoutes: <Route path="/dashboard" element={<LocationProbe />} /> });
    await screen.findByLabelText(/first name/i);
    await u.click(screen.getByRole('button', { name: /save and continue/i }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/dashboard');
  });

  it('shows the Inyo error, preferring err.details', async () => {
    const u = userEvent.setup();
    mockApi({ save: () => Promise.reject({ details: { message: 'birthDate: sender must be 18+' } }) });
    renderWithProviders(<Profile />, { session: { user: user, hasProfile: true, profileSaved: vi.fn() } });
    await screen.findByLabelText(/first name/i);
    await u.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText('Could not sync with Inyo')).toBeInTheDocument();
    expect(screen.getByText('birthDate: sender must be 18+')).toBeInTheDocument();
    expect(screen.queryByText('Profile updated')).not.toBeInTheDocument();
  });
});
