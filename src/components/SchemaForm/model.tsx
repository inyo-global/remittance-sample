import { setPath } from '../../lib/schema';
import type { JsonSchema, JsonSchemaProperty } from '../../types';

/**
 * Renders a form from the JSON Schema (draft-07) returned by the Inyo
 * data-population endpoints (recipient schema / recipient account schema).
 *
 * - objects become grouped sections
 * - arrays render a single item (enough for `documents[0]` in the sandbox)
 * - enums become selects; single-value enums and `const` are pre-filled by `schemaDefaults`
 * - `optionsFor(key, prop)` lets the caller inject dynamic options (e.g. bank list for `bankCode`)
 */

export interface SchemaOption {
    value: string;
    label: string;
}

export type SchemaFormValue = Record<string, unknown>;
export type OptionsFor = (key: string, prop: JsonSchemaProperty) => SchemaOption[] | null | undefined;
export type PathKeys = string[];

export interface SchemaFormProps {
    schema: JsonSchema | null | undefined;
    value: SchemaFormValue;
    onChange: (next: SchemaFormValue) => void;
    optionsFor?: OptionsFor;
    hiddenKeys?: string[];
}

/** Enum values come straight from the schema; the select needs strings. */
export const enumOptions = (values: unknown[]): SchemaOption[] => values.map((v) => ({ value: v as string, label: v as string }));

export const isObjectGroup = (p: JsonSchemaProperty): p is JsonSchemaProperty & { properties: Record<string, JsonSchemaProperty> } => p.type === 'object' && !!p.properties;
export const isArrayGroup = (p: JsonSchemaProperty): p is JsonSchemaProperty & { items: JsonSchemaProperty & { properties: Record<string, JsonSchemaProperty> } } =>
    p.type === 'array' && !!p.items?.properties;

export function useSchemaForm({ schema, value, onChange, optionsFor, hiddenKeys = [] }: SchemaFormProps) {
    const change = (keys: PathKeys, v: string) => onChange(setPath(value, keys, v));

    return { schema, value, change, optionsFor, hiddenKeys };
}

export type SchemaFormViewProps = ReturnType<typeof useSchemaForm>;
