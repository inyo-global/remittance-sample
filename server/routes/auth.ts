import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import type { AppContext } from '../app.ts';
import type { UserRow } from '../types.ts';

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Local accounts: the sample keeps users in SQLite and issues its own 24 h JWT. */
export function authRoutes({ db, config }: AppContext): Router {
    const router = Router();

    router.post('/login', (req, res) => {
        const { email, password } = req.body;
        try {
            const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Check if password matches (support both plain text for legacy/demo and hashed)
            let validPassword = false;
            if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
                validPassword = bcrypt.compareSync(password, user.password);
            } else {
                // Fallback for existing plain text users in demo
                validPassword = user.password === password;
                if (validPassword) {
                    // Upgrade to hash? Optional but good practice
                    const hash = bcrypt.hashSync(password, 10);
                    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, user.id);
                }
            }

            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid password' });
            }

            // Generate JWT
            const token = jwt.sign({ id: user.id, email: user.email }, config.jwtSecret, { expiresIn: '24h' });

            // Return user info (excluding password)
            const { password: _, ...userInfo } = user;
            res.json({ user: userInfo, token });
        } catch (err) {
            res.status(500).json({ error: message(err) });
        }
    });

    router.post('/register', (req, res) => {
        const { email, password, firstName, lastName, dateOfBirth, address, city, state, zipcode } = req.body;
        const userId = uuidv4();
        const hashedPassword = bcrypt.hashSync(password, 10);

        try {
            db.prepare(
                'INSERT INTO users (id, email, password, firstName, lastName, dateOfBirth, address, city, state, zipcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ).run(userId, email, hashedPassword, firstName, lastName, dateOfBirth, address, city, state, zipcode);
            // Auto-login after register
            const token = jwt.sign({ id: userId, email: email }, config.jwtSecret, { expiresIn: '24h' });
            res.json({
                user: { id: userId, email, firstName, lastName, dateOfBirth, address, city, state, zipcode },
                token,
            });
        } catch (err) {
            res.status(500).json({ error: message(err) });
        }
    });

    return router;
}
