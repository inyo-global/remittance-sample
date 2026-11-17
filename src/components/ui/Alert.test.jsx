import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Alert from './Alert';

describe('Alert', () => {
  it('renders title, children and action with role=status by default', () => {
    render(<Alert title="Heads up" action={<button type="button">Fix</button>}>Details here</Alert>);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Heads up');
    expect(el).toHaveTextContent('Details here');
    expect(screen.getByRole('button', { name: 'Fix' })).toBeInTheDocument();
    expect(el.className).toContain('bg-info-50');
  });

  it('uses role=alert for the danger tone', () => {
    render(<Alert tone="danger">Broken</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Broken');
    expect(screen.getByRole('alert').className).toContain('bg-danger-50');
  });

  it.each(['success', 'warning'])('applies the %s tone classes', (tone) => {
    render(<Alert tone={tone} className="extra">x</Alert>);
    expect(screen.getByRole('status').className).toContain(`bg-${tone}-50`);
    expect(screen.getByRole('status').className).toContain('extra');
  });

  it('omits the title paragraph when no title is given', () => {
    const { container } = render(<Alert>only body</Alert>);
    expect(container.querySelector('p.font-semibold')).toBeNull();
  });
});
