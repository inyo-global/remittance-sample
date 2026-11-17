import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthShell from './AuthShell';

describe('AuthShell', () => {
  it('renders the title, subtitle, children and footer', () => {
    render(
      <AuthShell title="Welcome back" subtitle="Log in" footer={<span>foot</span>}>
        <form aria-label="login" />
      </AuthShell>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Log in')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'login' })).toBeInTheDocument();
    expect(screen.getByText('foot')).toBeInTheDocument();
    expect(screen.getAllByAltText('Inyo')).toHaveLength(2);
  });

  it('lists the marketing points in the aside', () => {
    render(<AuthShell title="t">x</AuthShell>);
    expect(screen.getByText('Pay out to 165+ countries')).toBeInTheDocument();
    expect(screen.getByText('Compliance built in')).toBeInTheDocument();
    expect(screen.getByText('Locked FX quotes')).toBeInTheDocument();
    expect(screen.getByText(/Sandbox only/)).toBeInTheDocument();
  });

  it('widens the content column with wide', () => {
    const { rerender } = render(<AuthShell title="t"><div data-testid="c" /></AuthShell>);
    expect(screen.getByTestId('c').closest('.max-w-sm')).not.toBeNull();
    rerender(<AuthShell title="t" wide><div data-testid="c" /></AuthShell>);
    expect(screen.getByTestId('c').closest('.max-w-xl')).not.toBeNull();
    expect(screen.queryByText('foot')).not.toBeInTheDocument();
  });
});
