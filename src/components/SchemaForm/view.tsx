import type { ChangeEvent, ReactNode } from 'react';
import Field from '../ui/Field';
import { humanize } from '../../lib/format';
import { getPath } from '../../lib/schema';
import type { JsonSchemaProperty } from '../../types';
import { enumOptions, isArrayGroup, isObjectGroup, type OptionsFor, type PathKeys, type SchemaFormViewProps, type SchemaOption } from './model';

interface PrimitiveProps {
    keys: PathKeys;
    prop: JsonSchemaProperty;
    label: string;
    required: boolean;
    value: unknown;
    onChange: (keys: PathKeys, value: string) => void;
    optionsFor?: OptionsFor;
    hidden: boolean;
}

function Primitive({ keys, prop, label, required, value, onChange, optionsFor, hidden }: PrimitiveProps) {
    const key = keys[keys.length - 1];
    if (hidden) return null;
    let options: SchemaOption[] | null = Array.isArray(prop.enum) ? enumOptions(prop.enum) : null;
    const injected = optionsFor?.(key, prop);
    if (injected?.length) options = injected;
    const fixed = options?.length === 1;

    const inputType = prop.format === 'date' || /^\^?\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(prop.pattern || '') ? 'date' : prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text';
    const examples = prop.examples as unknown[] | undefined;

    return (
        <Field
            name={keys.join('.')}
            label={label}
            required={required}
            value={(value as string | number | undefined) ?? ''}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(keys, e.target.value)}
            options={options}
            type={options ? undefined : inputType}
            placeholder={options ? undefined : prop.description || (examples?.[0] as string | undefined)}
            hint={options && prop.description ? prop.description : undefined}
            pattern={!options && inputType === 'text' ? prop.pattern : undefined}
            minLength={prop.minLength}
            maxLength={prop.maxLength}
            disabled={fixed}
        />
    );
}

interface GroupProps {
    title: string;
    description?: string;
    children?: ReactNode;
}

function Group({ title, description, children }: GroupProps) {
    return (
        <fieldset className="rounded-xl border border-ink-200 bg-ink-50/50 p-4 sm:p-5">
            <legend className="px-1 text-sm font-semibold text-ink-800">{title}</legend>
            {description && <p className="mb-3 text-xs text-ink-500">{description}</p>}
            <div className="grid gap-4 sm:grid-cols-2">{children}</div>
        </fieldset>
    );
}

export default function SchemaFormView({ schema, value, change, optionsFor, hiddenKeys }: SchemaFormViewProps) {
    if (!schema?.properties) return null;

    const render = (key: string, prop: JsonSchemaProperty, path: PathKeys, requiredList: string[] = []): ReactNode => {
        const keys = [...path, key];
        const label = prop.title && prop.title.length < 40 ? prop.title : humanize(key);
        const required = requiredList.includes(key);

        if (isObjectGroup(prop)) {
            return (
                <Group key={keys.join('.')} title={label} description={prop.description}>
                    {Object.entries(prop.properties).map(([k, p]) => render(k, p, keys, prop.required))}
                </Group>
            );
        }
        if (isArrayGroup(prop)) {
            return (
                <Group key={keys.join('.')} title={label} description={prop.description}>
                    {Object.entries(prop.items.properties).map(([k, p]) => render(k, p, [...keys, '0'], prop.items.required))}
                </Group>
            );
        }
        return (
            <Primitive
                key={keys.join('.')}
                keys={keys}
                prop={prop}
                label={label}
                required={required}
                value={getPath(value, keys)}
                onChange={change}
                optionsFor={optionsFor}
                hidden={hiddenKeys.includes(key)}
            />
        );
    };

    const entries = Object.entries(schema.properties);
    const primitives = entries.filter(([, p]) => !isObjectGroup(p) && !isArrayGroup(p));
    const groups = entries.filter(([, p]) => isObjectGroup(p) || isArrayGroup(p));

    return (
        <div className="space-y-5">
            {primitives.length > 0 && <div className="grid gap-4 sm:grid-cols-2">{primitives.map(([k, p]) => render(k, p, [], schema.required))}</div>}
            {groups.map(([k, p]) => render(k, p, [], schema.required))}
        </div>
    );
}
