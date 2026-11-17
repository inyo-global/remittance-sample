import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Spinner from './Spinner';

describe('Spinner', () => {
  it('renders a status region with the default label', () => {
    const { container } = render(<Spinner />);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Loading…');
    expect(container.querySelector('svg').getAttribute('class')).toContain('size-6');
  });

  it('accepts a label, a small size and extra classes', () => {
    const { container } = render(<Spinner label="Starting…" size="sm" className="min-h-screen" />);
    expect(screen.getByRole('status')).toHaveTextContent('Starting…');
    expect(screen.getByRole('status').className).toContain('min-h-screen');
    expect(container.querySelector('svg').getAttribute('class')).toContain('size-4');
  });
});
