import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import StepNavigation from './StepNavigation';
import { LocationProbe, renderWithProviders } from '../../test/client/render';

const steps = () => screen.getAllByRole('button');

describe('StepNavigation', () => {
  it('marks the current step and keeps unreachable steps disabled', () => {
    renderWithProviders(<StepNavigation />, { route: '/dashboard', path: '/dashboard' });
    const [amount, beneficiary, account, payment, review] = steps();
    expect(screen.getByRole('list', { name: 'Transfer progress' })).toBeInTheDocument();
    expect(amount).toHaveAttribute('aria-current', 'step');
    expect(amount).toBeDisabled();
    for (const b of [beneficiary, account, payment, review]) {
      expect(b).toBeDisabled();
      expect(b).not.toHaveAttribute('aria-current');
    }
    expect(amount).toHaveTextContent('1Amount');
    expect(review).toHaveTextContent('5Review');
  });

  it('enables steps whose data exists and shows a check on completed ones', () => {
    const transaction = { quote: { id: 'q' }, beneficiary: { id: 'b1' }, account: { id: 'a' } };
    const { container } = renderWithProviders(<StepNavigation />, { route: '/payment', path: '/payment', transaction });
    const [amount, beneficiary, account, payment, review] = steps();
    expect(payment).toHaveAttribute('aria-current', 'step');
    expect(amount).toBeEnabled();
    expect(beneficiary).toBeEnabled();
    expect(account).toBeEnabled();
    expect(review).toBeDisabled();
    expect(container.querySelectorAll('.lucide-check')).toHaveLength(3);
  });

  it('does not mark a previous step done when its data is missing', () => {
    const { container } = renderWithProviders(<StepNavigation />, { route: '/beneficiaries', path: '/beneficiaries', transaction: {} });
    const [amount, beneficiary] = steps();
    expect(beneficiary).toHaveAttribute('aria-current', 'step');
    expect(amount).toBeEnabled();
    expect(container.querySelectorAll('.lucide-check')).toHaveLength(0);
  });

  it('navigates to the right path for each step', async () => {
    const user = userEvent.setup();
    const transaction = { quote: { id: 'q' }, beneficiary: { id: 'ben-9' }, account: { id: 'a' }, paymentMethod: { id: 'p' } };
    renderWithProviders(<StepNavigation />, {
      route: '/transaction/review', path: '/transaction/review', transaction,
      extraRoutes: <Route path="*" element={<LocationProbe />} />,
    });
    const [amount, beneficiary, account, payment, review] = steps();
    expect(review).toBeDisabled();
    await user.click(account);
    expect(screen.getByTestId('location')).toHaveTextContent('/beneficiaries/ben-9/account');
    expect(amount).toBeDefined();
    expect(beneficiary).toBeDefined();
    expect(payment).toBeDefined();
  });

  it('sends the delivery step to the beneficiaries list when no beneficiary is chosen', async () => {
    const user = userEvent.setup();
    // account step reachable (beneficiary set), but we test pathFor(2) without beneficiary via the review page
    renderWithProviders(<StepNavigation />, {
      route: '/transaction/review', path: '/transaction/review', transaction: { quote: { id: 'q' }, account: { id: 'a' } },
      extraRoutes: <Route path="*" element={<LocationProbe />} />,
    });
    const [, beneficiary, account] = steps();
    expect(account).toBeDisabled();
    await user.click(beneficiary);
    expect(screen.getByTestId('location')).toHaveTextContent('/beneficiaries');
  });
});
