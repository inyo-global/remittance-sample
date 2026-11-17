import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentMethodCard from './PaymentMethodCard';

const card = (status, extra = {}) => ({ id: 'c1', type: 'CARD', token: { schemeId: 'VISA', cardType: 'DEBIT', lastFourDigits: '4242' }, data: { apiResponse: { status }, ...extra } });

describe('PaymentMethodCard', () => {
  it('renders a static card without onSelect', () => {
    render(<PaymentMethodCard method={card('Verified')}><span>child</span></PaymentMethodCard>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('VISA')).toBeInTheDocument();
    expect(screen.getByText('debit card ···· 4242')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('is a clickable button when usable and selected', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const method = card('Verified');
    const { container } = render(<PaymentMethodCard method={method} onSelect={onSelect} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toBeEnabled();
    expect(container.querySelector('.lucide-chevron-right')).not.toBeNull();
    await user.click(btn);
    expect(onSelect).toHaveBeenCalledWith(method);
  });

  it('is disabled while the card is not Verified', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(<PaymentMethodCard method={card('ActionRequired')} onSelect={onSelect} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('cursor-not-allowed');
    expect(container.querySelector('.lucide-chevron-right')).toBeNull();
    expect(screen.getByText('3DS required')).toBeInTheDocument();
    await user.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders ACH accounts with the bank icon and Plaid badge', () => {
    const { container } = render(<PaymentMethodCard method={{ id: 'a1', type: 'ACH', token: { nickname: 'Main' }, data: { apiResponse: { status: 'Pending', bankName: 'Chase', accountNumber: '000111' } } }} />);
    expect(screen.getByText('Chase')).toBeInTheDocument();
    expect(screen.getByText('ACH ···· 0111')).toBeInTheDocument();
    expect(screen.getByText('Plaid')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(container.querySelector('.lucide-landmark')).not.toBeNull();
  });

  it('shows the webhook and Inyo badges when present', () => {
    const method = card('Verified', { gatewayEvent: { status: 'AUTHORIZED', receivedAt: '2026-01-01T00:00:00Z', eventDate: '2026-01-01T00:00:01Z', paymentId: 'pay-1' } });
    method.data.apiResponse.coreStatus = 'Actionrequired';
    render(<PaymentMethodCard method={method} />);
    const webhook = screen.getByText('webhook AUTHORIZED');
    expect(webhook.className).toContain('bg-success-50');
    expect(webhook).toHaveAttribute('title', expect.stringContaining('pay-1'));
    expect(screen.getByText('Inyo: 3DS required')).toHaveAttribute('title', expect.stringContaining('GET /fundingAccounts'));
  });

  it('uses the danger tone for a DECLINED webhook', () => {
    render(<PaymentMethodCard method={card('Rejected', { gatewayEvent: { status: 'DECLINED' } })} />);
    expect(screen.getByText('webhook DECLINED').className).toContain('bg-danger-50');
    expect(screen.getByText('webhook DECLINED')).toHaveAttribute('title', expect.stringContaining('paymentId ?'));
    expect(screen.queryByText(/^Inyo:/)).not.toBeInTheDocument();
  });
});
