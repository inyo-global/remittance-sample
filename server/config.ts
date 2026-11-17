import dotenv from 'dotenv';

export interface Config {
    port: number;
    isTest: boolean;
    dbPath: string;
    apiBaseUrl: string;
    tenant: string;
    /** Headers every Inyo call carries (agent credentials). */
    apiHeaders: Record<string, string>;
    jwtSecret: string;
    /** Public origin of the app for redirects the API must be able to reach (see kycRedirectUrl). */
    appUrl: string;
    mtls: { cert: string; key: string } | null;
    webhook: { user: string; pass: string } | null;
}

/**
 * Reads the environment once. Called when the app is created, not at import time, so the test
 * setup can set the variables first. Missing credentials are not fatal here: the debug routes
 * and the upstream error hints exist precisely to show what is wrong.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    dotenv.config({ quiet: env.DOTENV_CONFIG_QUIET === 'true' || env.NODE_ENV === 'test' });
    const cert = env.MTLS_CERT || '';
    const key = env.MTLS_KEY || '';
    return {
        port: Number(env.PORT) || 3001,
        isTest: env.NODE_ENV === 'test',
        dbPath: env.DB_PATH || 'remittance.db',
        apiBaseUrl: env.EXTERNAL_API_URL || '',
        tenant: env.TENANT || '',
        apiHeaders: {
            'x-api-key': env.API_KEY || '',
            'x-agent-id': env.AGENT_ID || '',
            'x-agent-api-key': env.AGENT_KEY || '',
            'content-type': 'application/json',
        },
        jwtSecret: env.JWT_SECRET || 'inyo-super-secret-key-123',
        appUrl: env.APP_URL || '',
        mtls: cert && key ? { cert, key } : null,
        // Read on every access: the gateway credentials may be set while the server is running.
        get webhook() {
            const user = env.WEBHOOK_BASIC_USER || '';
            const pass = env.WEBHOOK_BASIC_PASS || '';
            return user || pass ? { user, pass } : null;
        },
    };
}
