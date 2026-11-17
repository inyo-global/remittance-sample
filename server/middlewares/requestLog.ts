import type { RequestHandler } from 'express';
import type { Log } from '../log.ts';

/** One line per request once the response is finished: method, path, status, duration. */
export const requestLog = (log: Log): RequestHandler => (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        log.info(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
};
