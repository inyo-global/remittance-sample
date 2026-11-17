import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('renders icon, title, description and action', () => {
    const { container } = render(<EmptyState icon={Users} title="Nothing" description="Add one" action={<button type="button">Add</button>} className="x" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Nothing' })).toBeInTheDocument();
    expect(screen.getByText('Add one')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(container.querySelector('.lucide-users')).not.toBeNull();
    expect(container.firstChild.className).toContain('x');
  });

  it('renders only the title when the rest is omitted', () => {
    const { container } = render(<EmptyState title="Bare" />);
    expect(screen.getByText('Bare')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('p')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });
});
