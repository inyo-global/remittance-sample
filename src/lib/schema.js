/** Immutable deep set/get on nested objects/arrays, keyed by path segments. */
export const setPath = (obj, keys, value) => {
    const [head, ...rest] = keys;
    const isIndex = /^\d+$/.test(rest[0] || '');
    const copy = Array.isArray(obj) ? [...obj] : { ...(obj || {}) };
    if (rest.length === 0) {
        copy[head] = value;
        return copy;
    }
    copy[head] = setPath(copy[head] ?? (isIndex ? [] : {}), rest, value);
    return copy;
};

export const getPath = (obj, keys) => keys.reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);

/** Pre-fills fields the schema fixes (single enum / const). */
export function schemaDefaults(schema) {
    let out = {};
    const walk = (props, path) => {
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
