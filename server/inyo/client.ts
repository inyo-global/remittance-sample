import axios, { type AxiosAdapter, type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import https from 'node:https';
import type { Config } from '../config.ts';
import type { Log } from '../log.ts';

export interface UpstreamInfo {
    source: 'inyo';
    status: number | null;
    method: string;
    path: string;
    message: string;
    body: unknown;
    cfRay: string | null;
    hint: string | undefined;
}

export interface InyoClient {
    http: AxiosInstance;
    baseUrl: string;
    tenant: string;
    headers: Record<string, string>;
    mtlsConfigured: boolean;
    /** `${baseUrl}/organizations/${tenant}${path}` */
    url: (path: string) => string;
    describeUpstream: (error: AxiosError) => UpstreamInfo;
}

interface TimedConfig extends InternalAxiosRequestConfig {
    metadata?: { startTime: number };
}

const isAxiosError = (e: unknown): e is AxiosError => axios.isAxiosError(e);

/**
 * One axios instance for every Inyo call: mTLS agent, request/response logging, and the
 * troubleshooting hints from dev.inyoglobal.com (remittances > connectivity). Tests pass an
 * `adapter` that answers in-process instead of reaching the network.
 */
export function createInyoClient(config: Config, log: Log, { adapter }: { adapter?: AxiosAdapter } = {}): InyoClient {
    const httpsAgent = config.mtls ? new https.Agent({ cert: config.mtls.cert, key: config.mtls.key }) : undefined;
    if (!httpsAgent && !config.isTest) console.warn('[mTLS] MTLS_CERT or MTLS_KEY not defined — connection without client certificate');

    const http = axios.create({ httpsAgent, ...(adapter ? { adapter } : {}) });

    http.interceptors.request.use((cfg: TimedConfig) => {
        log.http(`→ ${cfg.method?.toUpperCase()} ${cfg.url}`, cfg.data ?? '');
        cfg.metadata = { startTime: Date.now() };
        return cfg;
    });
    http.interceptors.response.use(
        (response) => {
            const ms = Date.now() - ((response.config as TimedConfig).metadata?.startTime ?? Date.now());
            log.http(`← ${response.status} ${response.config.url} (${ms}ms)`);
            return response;
        },
        (error: unknown) => {
            if (isAxiosError(error)) {
                const meta = (error.config as TimedConfig | undefined)?.metadata;
                const ms = meta ? Date.now() - meta.startTime : '?';
                const status = error.response?.status ?? 'NO_RESPONSE';
                log.error(`← ${status} ${error.config?.url} (${ms}ms)`, error.response?.data ?? error.message);
            }
            return Promise.reject(error);
        },
    );

    // Forwards the REAL Inyo response (status, body, cf-ray) to the frontend instead of a generic 500,
    // plus a hint based on the troubleshooting table in dev.inyoglobal.com (remittances > connectivity).
    const describeUpstream = (error: AxiosError): UpstreamInfo => {
        const resp = error.response;
        const cfg: Partial<InternalAxiosRequestConfig> = error.config || {};
        const method = (cfg.method || 'GET').toUpperCase();
        const url = cfg.url || '';
        const path = url.replace(/^https?:\/\/[^/]+/, '');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw: any = resp?.data;
        const isHtml = typeof raw === 'string' && /<html|<!doctype/i.test(raw);
        const body = isHtml
            ? (raw.match(/<title>([^<]*)<\/title>/i)?.[1] || 'HTML page').trim()
            : typeof raw === 'string' ? raw.slice(0, 500) : raw;
        const status = resp?.status ?? null;
        let hint: string | undefined;
        if (!resp) {
            hint = /EPROTO|SSL|CERT|ECONNRESET|socket hang up/i.test(error.code + ' ' + error.message)
                ? 'TLS handshake failed: MTLS_CERT/MTLS_KEY missing, wrong or expired.'
                : `No response from ${config.apiBaseUrl} (${error.code || error.message}). Check EXTERNAL_API_URL and network access.`;
        } else if (status === 403 && isHtml) hint = "Cloudflare Access blocked the request: egress IP not on Inyo's allowlist (mTLS passed).";
        else if (status === 401) hint = 'x-api-key missing or invalid for this tenant.';
        else if (status === 403) hint = 'Valid key but TENANT does not match it, or the agent (x-agent-id) is not approved.';
        else if (status === 404 && raw?.detail === 'Not Found') hint = `Route not found at ${config.apiBaseUrl}: base URL, path prefix or TENANT ("${config.tenant}") may be wrong for this environment.`;
        else if (status === 404) hint = 'Resource not found: the id may belong to another tenant/environment.';
        else if (status === 422 || status === 400) hint = 'Validation error: see body.errors / body.message.';
        else if (status === 429) hint = `Rate limited (200 req/min per IP). Retry-After: ${resp.headers?.['retry-after'] || '?'}s.`;
        else if (status !== null && status >= 500) hint = 'Inyo returned a server error. Retry with backoff; contact support with the cf-ray id if it persists.';
        const message = raw?.message || raw?.error || raw?.detail || (isHtml ? body : null) || error.message;
        return {
            source: 'inyo',
            status,
            method,
            path,
            message: typeof message === 'string' ? message : JSON.stringify(message),
            body,
            cfRay: (resp?.headers?.['cf-ray'] as string | undefined) || null,
            hint,
        };
    };

    return {
        http,
        baseUrl: config.apiBaseUrl,
        tenant: config.tenant,
        headers: config.apiHeaders,
        mtlsConfigured: !!httpsAgent,
        url: (path) => `${config.apiBaseUrl}/organizations/${config.tenant}${path}`,
        describeUpstream,
    };
}
