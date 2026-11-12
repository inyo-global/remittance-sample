import React from 'react';
import Field from './ui/Field';
import { humanize } from '../lib/format';
import { setPath, getPath } from '../lib/schema';

/**
 * Renders a form from the JSON Schema (draft-07) returned by the Inyo
 * data-population endpoints (recipient schema / recipient account schema).
 *
 * - objects become grouped sections
 * - arrays render a single item (enough for `documents[0]` in the sandbox)
 * - enums become selects; single-value enums and `const` are pre-filled by `schemaDefaults`
 * - `optionsFor(key, prop)` lets the caller inject dynamic options (e.g. bank list for `bankCode`)
 */

function Primitive({ keys, prop, label, required, value, onChange, optionsFor, hidden }) {
    const key = keys[keys.length - 1];
    if (hidden) return null;
    let options = Array.isArray(prop.enum) ? prop.enum.map((v) => ({ value: v, label: v })) : null;
    const injected = optionsFor?.(key, prop);
    if (injected?.length) options = injected;
    const fixed = options?.length === 1;

    const inputType = prop.format === 'date' || /^\^?\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(prop.pattern || '') ? 'date' : prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text';

    return (
        <Field
            name={keys.join('.')}
            label={label}
            required={required}
            value={value ?? ''}
            onChange={(e) => onChange(keys, e.target.value)}
            options={options}
            type={options ? undefined : inputType}
            placeholder={options ? undefined : prop.description || prop.examples?.[0]}
            hint={options && prop.description ? prop.description : undefined}
            pattern={!options && inputType === 'text' ? prop.pattern : undefined}
            minLength={prop.minLength}
            maxLength={prop.maxLength}
            disabled={fixed}
        />
    );
}

function Group({ title, description, children }) {
    return (
        <fieldset className="rounded-xl border border-ink-200 bg-ink-50/50 p-4 sm:p-5">
            <legend className="px-1 text-sm font-semibold text-ink-800">{title}</legend>
            {description && <p className="mb-3 text-xs text-ink-500">{description}</p>}
            <div className="grid gap-4 sm:grid-cols-2">{children}</div>
        </fieldset>
    );
}

export default function SchemaForm({ schema, value, onChange, optionsFor, hiddenKeys = [] }) {
    if (!schema?.properties) return null;

    const change = (keys, v) => onChange(setPath(value, keys, v));

    const render = (key, prop, path, requiredList = []) => {
        const keys = [...path, key];
        const label = prop.title && prop.title.length < 40 ? prop.title : humanize(key);
        const required = requiredList.includes(key);

        if (prop.type === 'object' && prop.properties) {
            return (
                <Group key={keys.join('.')} title={label} description={prop.description}>
                    {Object.entries(prop.properties).map(([k, p]) => render(k, p, keys, prop.required))}
                </Group>
            );
        }
        if (prop.type === 'array' && prop.items?.properties) {
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
    const primitives = entries.filter(([, p]) => !(p.type === 'object' && p.properties) && !(p.type === 'array' && p.items?.properties));
    const groups = entries.filter(([, p]) => (p.type === 'object' && p.properties) || (p.type === 'array' && p.items?.properties));

    return (
        <div className="space-y-5">
            {primitives.length > 0 && <div className="grid gap-4 sm:grid-cols-2">{primitives.map(([k, p]) => render(k, p, [], schema.required))}</div>}
            {groups.map(([k, p]) => render(k, p, [], schema.required))}
        </div>
    );
}
