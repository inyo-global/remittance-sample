import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Card, { CardBody, CardFooter, CardHeader } from './Card';

describe('Card', () => {
  it('renders a div with the card class and passes props through', () => {
    render(<Card className="extra" data-testid="card">body</Card>);
    const el = screen.getByTestId('card');
    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('card extra');
    expect(el).toHaveTextContent('body');
  });

  it('can render as another element', () => {
    render(<Card as="section" data-testid="card">x</Card>);
    expect(screen.getByTestId('card').tagName).toBe('SECTION');
  });

  it('CardHeader renders title, description and action', () => {
    render(<CardHeader title="Title" description="Desc" action={<button type="button">Act</button>} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('Desc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Act' })).toBeInTheDocument();
  });

  it('CardHeader omits the description when absent', () => {
    const { container } = render(<CardHeader title="Only" />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('CardBody and CardFooter wrap children with padding classes', () => {
    render(
      <>
        <CardBody className="b">body</CardBody>
        <CardFooter className="f">footer</CardFooter>
      </>,
    );
    expect(screen.getByText('body').className).toContain('px-6');
    expect(screen.getByText('body').className).toContain('b');
    expect(screen.getByText('footer').className).toContain('border-t');
    expect(screen.getByText('footer').className).toContain('f');
  });
});
