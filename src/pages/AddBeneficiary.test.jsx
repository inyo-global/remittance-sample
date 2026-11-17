import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddBeneficiary from './AddBeneficiary';
import { request } from '../api';
import { LocationProbe, renderWithProviders } from '../../test/client/render';

vi.mock('../api', () => ({ request: vi.fn() }));

const DESTINATIONS = [
  { country: 'BR', countryName: 'Brazil', currency: 'BRL', emoji: '🇧🇷' },
  { country: 'MX', countryName: 'Mexico', currency: 'MXN' },
];
const SCHEMA = {
  type: 'object',
  required: ['firstName', 'lastName'],
  properties: {
    firstName: { type: 'string', title: 'First name' },
    lastName: { type: 'string', title: 'Last name' },
    documents: {
      type: 'array',
      items: { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['CPF'] }, document: { type: 'string', title: 'Document number' } } },
    },
  },
};
const QUOTE = { id: 'q1', expireAt: new Date(Date.now() + 60_000).toISOString() };

const mockApi = ({ destinations = { countryDestinations: DESTINATIONS }, schema = SCHEMA, create = { id: 'local-1', externalId: 'ext-1' } } = {}) =>
  request.mockImplementation((method, url) => {
    if (url === '/destinations') return Promise.resolve(destinations);
    if (url.startsWith('/beneficiaries/schema/')) return typeof schema === 'function' ? schema(url) : Promise.resolve(schema);
    if (method === 'post' && url === '/beneficiaries') return typeof create === 'function' ? create() : Promise.resolve(create);
    return Promise.reject(new Error(`unexpected ${method} ${url}`));
  });

describe('AddBeneficiary', () => {
  beforeEach(() => { request.mockReset(); });

  it('lists destinations (object shape) and asks for a country before loading a schema', async () => {
    mockApi();
    renderWithProviders(<AddBeneficiary />);
    const select = await screen.findByLabelText(/destination country/i);
    await waitFor(() => expect(screen.getByRole('option', { name: '🇧🇷 Brazil' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Mexico' })).toBeInTheDocument();
    expect(select).toHaveValue('');
    expect(screen.getByText(/choose a country to load/i)).toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith('get', expect.stringMatching(/schema/));
    expect(screen.getByRole('button', { name: /save and add bank account/i })).toBeDisabled();
  });

  it('accepts a plain array of destinations', async () => {
    mockApi({ destinations: DESTINATIONS });
    renderWithProviders(<AddBeneficiary />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Mexico' })).toBeInTheDocument());
  });

  it('loads the schema for the chosen country, prefills single-enum values and renders the form', async () => {
    const u = userEvent.setup();
    mockApi();
    renderWithProviders(<AddBeneficiary />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Mexico' })).toBeInTheDocument());
    await u.selectOptions(screen.getByLabelText(/destination country/i), 'BR');
    expect(await screen.findByLabelText(/first name/i)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('get', '/beneficiaries/schema/BR');
    // single-value enum prefilled by schemaDefaults and disabled
    const type = screen.getByLabelText(/^type/i);
    expect(type).toHaveValue('CPF');
    expect(type).toBeDisabled();
    expect(screen.getByRole('button', { name: /save and add bank account/i })).toBeEnabled();
  });

  it('starts from the context/state country, locks the select when a quote exists and sets the flow context on save', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    mockApi();
    renderWithProviders(<AddBeneficiary />, {
      route: '/beneficiaries/new',
      transaction: { quote: QUOTE, countryCode: 'br', account: { id: 'old' } },
      setTransactionData,
      extraRoutes: <Route path="/beneficiaries/:id/account" element={<LocationProbe />} />,
    });
    expect(await screen.findByLabelText(/first name/i)).toBeInTheDocument();
    const select = screen.getByLabelText(/destination country/i);
    expect(select).toHaveValue('BR');
    expect(select).toBeDisabled();
    expect(screen.getByText(/locked to the country of your quote/i)).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();

    await u.type(screen.getByLabelText(/first name/i), 'Maria');
    await u.type(screen.getByLabelText(/last name/i), 'Silva');
    await u.type(screen.getByLabelText(/document number/i), '12345678900');
    await u.click(screen.getByRole('button', { name: /save and add bank account/i }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('post', '/beneficiaries', {
      nickname: 'Maria Silva',
      countryCode: 'BR',
      formData: { firstName: 'Maria', lastName: 'Silva', documents: [{ type: 'CPF', document: '12345678900' }] },
    }));
    expect(setTransactionData).toHaveBeenCalledTimes(1);
    const next = setTransactionData.mock.calls[0][0]({ quote: QUOTE, account: { id: 'old' } });
    expect(next.account).toBeNull();
    expect(next.beneficiary).toMatchObject({ id: 'local-1', externalId: 'ext-1', nickname: 'Maria Silva', data: { firstName: 'Maria' } });
    expect(await screen.findByTestId('location')).toHaveTextContent('/beneficiaries/local-1/account');
  });

  it('outside the flow it saves without touching the context', async () => {
    const u = userEvent.setup();
    const setTransactionData = vi.fn();
    mockApi();
    renderWithProviders(<AddBeneficiary />, { route: '/beneficiaries/new', state: { countryCode: 'MX' }, setTransactionData, extraRoutes: <Route path="/beneficiaries/:id/account" element={<LocationProbe />} /> });
    expect(await screen.findByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/destination country/i)).toHaveValue('MX');
    expect(screen.getByLabelText(/destination country/i)).toBeEnabled();
    expect(screen.getByText('Account')).toBeInTheDocument();
    await u.type(screen.getByLabelText(/first name/i), 'Juan');
    await u.click(screen.getByRole('button', { name: /save and add bank account/i }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/beneficiaries/local-1/account');
    expect(setTransactionData).not.toHaveBeenCalled();
  });

  it('shows the schema error', async () => {
    mockApi({ schema: () => Promise.reject({ error: { source: 'inyo', status: 404, method: 'GET', path: '/x', message: 'nope', hint: 'bad country' } }) });
    renderWithProviders(<AddBeneficiary />, { state: { countryCode: 'BR' }, route: '/beneficiaries/new' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Inyo 404 on GET \/x/);
    expect(screen.getByRole('button', { name: /save and add bank account/i })).toBeDisabled();
  });

  it('shows the creation error', async () => {
    const u = userEvent.setup();
    mockApi({ create: () => Promise.reject({ error: 'Beneficiary rejected' }) });
    renderWithProviders(<AddBeneficiary />, { state: { countryCode: 'BR' }, route: '/beneficiaries/new' });
    await u.type(await screen.findByLabelText(/first name/i), 'X');
    await u.click(screen.getByRole('button', { name: /save and add bank account/i }));
    expect(await screen.findByText('Could not create the beneficiary')).toBeInTheDocument();
    expect(screen.getByText('Beneficiary rejected')).toBeInTheDocument();
  });
});
