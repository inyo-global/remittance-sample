import type { JsonSchema, JsonSchemaProperty } from '../types';

type PathKey = string | number;
type Container = Record<string, unknown> | unknown[];

/** Immutable deep set/get on nested objects/arrays, keyed by path segments. */
export const setPath = <T extends Container = Record<string, unknown>>(obj: T | null | undefined, keys: PathKey[], value: unknown): T => {
    const [head, ...rest] = keys;
    const isIndex = /^\d+$/.test(String(rest[0] ?? ''));
    const copy = (Array.isArray(obj) ? [...obj] : { ...(obj || {}) }) as Record<PathKey, unknown>;
    if (rest.length === 0) {
        copy[head] = value;
        return copy as T;
    }
    copy[head] = setPath((copy[head] ?? (isIndex ? [] : {})) as Container, rest, value);
    return copy as T;
};

export const getPath = (obj: unknown, keys: PathKey[]): unknown =>
    keys.reduce<unknown>((cur, k) => (cur == null ? undefined : (cur as Record<PathKey, unknown>)[k]), obj);

/** Pre-fills fields the schema fixes (single enum / const). */
export function schemaDefaults(schema: JsonSchema | null | undefined): Record<string, unknown> {
    let out: Record<string, unknown> = {};
    const walk = (props: Record<string, JsonSchemaProperty> | undefined, path: PathKey[]) => {
        Object.entries(props || {}).forEach(([key, prop]) => {
            const keys = [...path, key];
            if (prop.const !== undefined) out = setPath(out, keys, prop.const);
            else if (Array.isArray(prop.enum) && prop.enum.length === 1) out = setPath(out, keys, prop.enum[0]);
            if (prop.type === 'object' && prop.properties) walk(prop.properties, keys);
            if (prop.type === 'array' && prop.items?.properties) walk(prop.items.properties, [...keys, '0']);
        });
    };
    walk(schema?.properties, []);
    return out;
}
