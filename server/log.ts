const stamp = () => `[${new Date().toISOString()}]`;

/** Console logger with a timestamp and level tag; silenced by the test setup. */
export const log = {
    info: (...args: unknown[]) => console.log(`${stamp()} [INFO] `, ...args),
    error: (...args: unknown[]) => console.error(`${stamp()} [ERROR]`, ...args),
    warn: (...args: unknown[]) => console.warn(`${stamp()} [WARN] `, ...args),
    http: (...args: unknown[]) => console.log(`${stamp()} [HTTP] `, ...args),
};

export type Log = typeof log;
