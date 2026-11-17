import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import type { JwtUser } from '../types.ts';

/** Bearer JWT issued by /api/login and /api/register; puts the payload on `req.user`. */
export const authenticateToken = (jwtSecret: string): RequestHandler => (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user as JwtUser;
        next();
    });
};
