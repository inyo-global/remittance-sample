import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import Button from './Button';

describe('Button', () => {
  it('renders a type=button by default and fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn.className).toContain('bg-brand-600');
    expect(btn.className).toContain('h-11');
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('honours an explicit type, variant, size and className', () => {
    render(<Button type="submit" variant="danger" size="lg" className="w-full">Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn.className).toContain('bg-danger-600');
    expect(btn.className).toContain('h-12');
    expect(btn.className).toContain('w-full');
  });

  it('is disabled and busy while loading, hiding the icons', () => {
    const { container } = render(<Button loading icon={Plus} iconRight={ArrowRight}>Wait</Button>);
    const btn = screen.getByRole('button', { name: 'Wait' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(container.querySelector('.lucide-plus')).toBeNull();
    expect(container.querySelector('.lucide-arrow-right')).toBeNull();
  });

  it('renders left and right icons when not loading', () => {
    const { container } = render(<Button icon={Plus} iconRight={ArrowRight}>Both</Button>);
    expect(container.querySelector('.lucide-plus')).not.toBeNull();
    expect(container.querySelector('.lucide-arrow-right')).not.toBeNull();
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
  });

  it('respects disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Nope</Button>);
    await user.click(screen.getByRole('button', { name: 'Nope' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders as a router Link with aria-disabled instead of disabled', () => {
    render(
      <MemoryRouter>
        <Button as={Link} to="/dashboard" disabled>Go home</Button>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Go home' });
    expect(link).toHaveAttribute('href', '/dashboard');
    expect(link).not.toHaveAttribute('type');
    expect(link).not.toHaveAttribute('disabled');
    expect(link).toHaveAttribute('aria-disabled', 'true');
  });

  it('forwards refs', () => {
    const ref = React.createRef();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
