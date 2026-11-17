import axios from 'axios';
import type { ErrorRequestHandler, Response } from 'express';
import type { InyoClient } from '../inyo/client.ts';
import type { Log } from '../log.ts';

/** An error a route throws on purpose with the HTTP status it should produce. */
export class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

/**
 * Answers an Inyo failure with the real upstream status/body plus a hint (4xx are forwarded as
 * they are, everything else becomes `fallbackStatus`), and any other error as a local 500.
 * Routes call this from their catch blocks; the error handler below covers what they throw.
 */
export function upstreamError(inyo: InyoClient, log: Log) {
    return (res: Response, error: unknown, fallbackStatus = 502): Response => {
        if (!axios.isAxiosError(error) || (!error.config && !error.response)) {
            // Local error (db, validation), not an Inyo call
            const message = error instanceof Error ? error.message : String(error);
            const status = error instanceof HttpError ? error.status : 500;
            return res.status(status).json({ error: { source: 'local', message } });
        }
        const info = inyo.describeUpstream(error);
        log.error(`upstream ${info.method} ${info.path} → ${info.status ?? 'NO_RESPONSE'} :: ${info.hint || info.message}`);
        const status = info.status && info.status >= 400 && info.status < 500 ? info.status : fallbackStatus;
        return res.status(status).json({ error: info });
    };
}

/** Last middleware: anything thrown or passed to next(err) ends up here. */
export function errorHandler(inyo: InyoClient, log: Log): ErrorRequestHandler {
    const answer = upstreamError(inyo, log);
    return (err, _req, res, _next) => {
        if (res.headersSent) return;
        answer(res, err);
    };
}
