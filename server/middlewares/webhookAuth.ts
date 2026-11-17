import type { RequestHandler } from 'express';
import type { Config } from '../config.ts';
import type { Log } from '../log.ts';

/**
 * Optional Basic Auth for the gateway webhook: set WEBHOOK_BASIC_USER / WEBHOOK_BASIC_PASS (the
 * gateway's notification agent supports BASIC); when unset, every caller is accepted and a
 * warning is logged once.
 */
export function webhookAuth(config: Config, log: Log): RequestHandler {
    let warned = false;
    return (req, res, next) => {
        if (!config.webhook) {
            if (!warned) { log.warn('webhook route accepts unauthenticated calls (WEBHOOK_BASIC_USER/PASS not set)'); warned = true; }
            return next();
        }
        const header = req.headers.authorization || '';
        const [scheme, encoded] = header.split(' ');
        const expected = Buffer.from(`${config.webhook.user}:${config.webhook.pass}`).toString('base64');
        if (scheme !== 'Basic' || encoded !== expected) {
            log.warn(`webhook rejected: bad or missing Basic Auth from ${req.ip}`);
            return res.status(401).set('WWW-Authenticate', 'Basic realm="webhook"').json({ error: 'Unauthorized' });
        }
        return next();
    };
}
