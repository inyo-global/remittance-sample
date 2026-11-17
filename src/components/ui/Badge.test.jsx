import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from './Badge';

describe('Badge', () => {
  it('renders children with the neutral tone by default', () => {
    render(<Badge>Pending</Badge>);
    const el = screen.getByText('Pending');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('bg-ink-100');
    expect(el.querySelector('[aria-hidden]')).toBeNull();
  });

  it.each(['brand', 'success', 'warning', 'danger', 'info'])('applies the %s tone', (tone) => {
    render(<Badge tone={tone}>{tone}</Badge>);
    expect(screen.getByText(tone).className).toContain(`bg-${tone}-50`);
  });

  it('renders a dot, a title and extra classes', () => {
    render(<Badge dot title="tooltip" className="font-mono">Verified</Badge>);
    const el = screen.getByText('Verified');
    expect(el).toHaveAttribute('title', 'tooltip');
    expect(el.className).toContain('font-mono');
    expect(el.querySelector('[aria-hidden]')).not.toBeNull();
  });
});
