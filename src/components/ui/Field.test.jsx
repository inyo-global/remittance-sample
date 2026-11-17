import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Field from './Field';

describe('Field', () => {
  it('renders a labelled input with hint and required marker', () => {
    render(<Field name="email" label="Email" hint="We never share it" required placeholder="you@x.com" value="" onChange={() => {}} />);
    const input = screen.getByLabelText(/Email/);
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('id', 'email');
    expect(input).toHaveAttribute('name', 'email');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('placeholder', 'you@x.com');
    expect(input).toHaveAttribute('aria-describedby', 'email-hint');
    expect(screen.getByText('We never share it')).toHaveAttribute('id', 'email-hint');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden');
  });

  it('shows the error instead of the hint and marks the control invalid', () => {
    render(<Field name="zip" label="ZIP" hint="hint" error="Required" />);
    const input = screen.getByLabelText('ZIP');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'zip-error');
    expect(screen.getByText('Required')).toHaveAttribute('id', 'zip-error');
    expect(screen.queryByText('hint')).not.toBeInTheDocument();
  });

  it('prefers an explicit id and falls back to an auto id', () => {
    render(
      <>
        <Field id="custom" name="n" label="Custom" />
        <Field label="Auto" />
      </>,
    );
    expect(screen.getByLabelText('Custom')).toHaveAttribute('id', 'custom');
    expect(screen.getByLabelText('Auto').id).not.toBe('');
  });

  it('fires onChange and forwards extra props and refs', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const ref = React.createRef();
    render(<Field ref={ref} name="city" label="City" type="text" maxLength={3} onChange={onChange} />);
    const input = screen.getByLabelText('City');
    expect(input).toHaveAttribute('maxlength', '3');
    expect(ref.current).toBe(input);
    await user.type(input, 'LA');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('renders prefix and suffix adornments with padding', () => {
    render(<Field name="amt" label="Amount" prefix="$" suffix="USD" />);
    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    const input = screen.getByLabelText('Amount');
    expect(input.className).toContain('pl-9');
    expect(input.className).toContain('pr-16');
  });

  it('renders a select with a disabled placeholder option when options are given', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const options = [{ value: 'CA', label: 'California' }, { value: 'NY', label: 'New York' }];
    render(<Field name="state" label="State" options={options} value="" onChange={onChange} />);
    const select = screen.getByLabelText('State');
    expect(select.tagName).toBe('SELECT');
    const placeholder = screen.getByRole('option', { name: 'Select state' });
    expect(placeholder).toBeDisabled();
    expect(placeholder).toHaveValue('');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(select.className).toContain('text-ink-400');
    await user.selectOptions(select, 'NY');
    expect(onChange).toHaveBeenCalled();
  });

  it('uses a custom placeholder and normal text colour once a value is set', () => {
    render(<Field name="s" options={[{ value: 'a', label: 'A' }]} value="a" placeholder="Pick" onChange={() => {}} />);
    expect(screen.getByRole('option', { name: 'Pick' })).toBeDisabled();
    expect(screen.getByRole('combobox').className).not.toContain('text-ink-400');
    expect(screen.queryByRole('option', { name: 'Select an option' })).not.toBeInTheDocument();
  });

  it('defaults the select placeholder when there is no label', () => {
    render(<Field name="s" options={[{ value: 'a', label: 'A' }]} value="" onChange={() => {}} />);
    expect(screen.getByRole('option', { name: 'Select an option' })).toBeInTheDocument();
  });

  it('renders custom children in place of the control', () => {
    render(
      <Field name="cc" label="Card" error="Bad card">
        <input id="cc" data-field="pan" />
      </Field>,
    );
    expect(screen.getByLabelText('Card')).toHaveAttribute('data-field', 'pan');
    expect(screen.getByText('Bad card')).toBeInTheDocument();
  });
});
