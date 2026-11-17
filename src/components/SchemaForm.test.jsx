import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchemaForm from './SchemaForm';

const schema = {
  required: ['firstName'],
  properties: {
    firstName: { type: 'string', title: 'First name', minLength: 2, maxLength: 40, description: 'As on the ID' },
    birthDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    issueDate: { type: 'string', format: 'date' },
    age: { type: 'integer' },
    kind: { type: 'string', enum: ['A', 'B'], description: 'Pick one' },
    fixed: { type: 'string', enum: ['ONLY'] },
    longTitle: { type: 'string', title: 'This title is far too long to be used as a label at all' },
    externalId: { type: 'string' },
    address: { type: 'object', description: 'Where they live', required: ['city'], properties: { city: { type: 'string' }, bankCode: { type: 'string' } } },
    documents: { type: 'array', items: { required: ['number'], properties: { number: { type: 'string', examples: ['123'] } } } },
  },
};

describe('SchemaForm', () => {
  it('renders nothing without properties', () => {
    const { container } = render(<SchemaForm schema={null} value={{}} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders primitives, groups and arrays from the schema', () => {
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} hiddenKeys={['externalId']} />);
    const first = screen.getByLabelText(/First name/);
    expect(first).toBeRequired();
    expect(first).toHaveAttribute('type', 'text');
    expect(first).toHaveAttribute('minlength', '2');
    expect(first).toHaveAttribute('maxlength', '40');
    expect(first).toHaveAttribute('placeholder', 'As on the ID');
    expect(screen.getByLabelText('Birth Date')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Issue Date')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Age')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('Long Title')).toBeInTheDocument();
    expect(screen.queryByLabelText('External Id')).not.toBeInTheDocument();
    // enum -> select with hint; single enum -> disabled
    const kind = screen.getByLabelText('Kind');
    expect(kind.tagName).toBe('SELECT');
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    expect(screen.getByLabelText('Fixed')).toBeDisabled();
    // groups
    expect(screen.getByRole('group', { name: 'Address' })).toBeInTheDocument();
    expect(screen.getByText('Where they live')).toBeInTheDocument();
    expect(screen.getByLabelText(/City/)).toBeRequired();
    expect(screen.getByLabelText(/City/)).toHaveAttribute('name', 'address.city');
    expect(screen.getByRole('group', { name: 'Documents' })).toBeInTheDocument();
    const number = screen.getByLabelText(/Number/);
    expect(number).toHaveAttribute('name', 'documents.0.number');
    expect(number).toBeRequired();
    expect(number).toHaveAttribute('placeholder', '123');
  });

  it('shows current values and reports changes as an immutable deep update', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value = { firstName: 'Ana', address: { city: 'Rio' }, documents: [{ number: '1' }] };
    render(<SchemaForm schema={schema} value={value} onChange={onChange} />);
    expect(screen.getByLabelText(/First name/)).toHaveValue('Ana');
    expect(screen.getByLabelText(/City/)).toHaveValue('Rio');
    expect(screen.getByLabelText(/Number/)).toHaveValue('1');
    await user.type(screen.getByLabelText(/City/), 'x');
    expect(onChange).toHaveBeenLastCalledWith({ ...value, address: { city: 'Riox' } });
    expect(value.address.city).toBe('Rio');
    await user.selectOptions(screen.getByLabelText('Kind'), 'B');
    expect(onChange).toHaveBeenLastCalledWith({ ...value, kind: 'B' });
    await user.type(screen.getByLabelText(/Number/), '2');
    expect(onChange).toHaveBeenLastCalledWith({ ...value, documents: [{ number: '12' }] });
  });

  it('lets the caller inject options for a key', () => {
    const optionsFor = (key) => (key === 'bankCode' ? [{ value: '001', label: 'Banco do Brasil' }, { value: '237', label: 'Bradesco' }] : null);
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} optionsFor={optionsFor} />);
    const bank = screen.getByLabelText('Bank Code');
    expect(bank.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Bradesco' })).toBeInTheDocument();
    expect(bank).toBeEnabled();
  });

  it('ignores empty injected option lists', () => {
    render(<SchemaForm schema={schema} value={{}} onChange={() => {}} optionsFor={() => []} />);
    expect(screen.getByLabelText('Bank Code').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Kind').tagName).toBe('SELECT');
  });
});
