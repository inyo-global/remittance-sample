import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageHeader from './PageHeader';

describe('PageHeader', () => {
  it('renders kicker, title, description and actions', () => {
    const { container } = render(<PageHeader kicker="Step 1 of 5" title="Send money" description="Pick a destination" actions={<button type="button">Act</button>} className="mb-0" />);
    expect(screen.getByText('Step 1 of 5').className).toContain('kicker');
    expect(screen.getByRole('heading', { level: 1, name: 'Send money' })).toBeInTheDocument();
    expect(screen.getByText('Pick a destination')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Act' })).toBeInTheDocument();
    expect(container.firstChild.className).toContain('mb-0');
  });

  it('renders just the title when the rest is omitted', () => {
    const { container } = render(<PageHeader title="Only" />);
    expect(screen.getByRole('heading', { name: 'Only' })).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(0);
    expect(container.querySelector('button')).toBeNull();
  });
});
