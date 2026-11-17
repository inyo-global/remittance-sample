import type { Request } from 'express';

/** Best-effort client IP for deviceData.userIpAddress (behind a proxy, trust x-forwarded-for). */
export const clientIp = (req: Request): string => {
    const fwd = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]) || req.socket?.remoteAddress || '';
    return ip.replace(/^::ffff:/, '') || '127.0.0.1';
};
