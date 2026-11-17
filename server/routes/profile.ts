import { Router, type Request } from 'express';
import type { AppContext } from '../app.ts';
import type { ProfileRow, UpstreamJson, UserRow } from '../types.ts';
import { completeProfile } from '../services/profile.ts';

const userId = (req: Request): string => req.user!.id;
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The local user + Inyo sender: profile, onboarding, limits and compliance level. */
export function profileRoutes(ctx: AppContext): Router {
    const { db, inyo, limitCache, auth, fail } = ctx;
    const router = Router();

    // --- LIMITS API ---
    router.get('/limits', auth, async (req, res) => {
        const id = userId(req);
        if (!id) return res.status(400).json({ error: 'Invalid user token' });

        // 1. Check Cache
        const cachedData = limitCache.get(id);
        if (cachedData) {
            return res.json(cachedData);
        }

        try {
            // 2. Get Participant ID
            const profile = db.prepare('SELECT externalId FROM profiles WHERE userId = ?').get(id) as Pick<ProfileRow, 'externalId'> | undefined;
            if (!profile || !profile.externalId) {
                return res.json({
                    oneDayLimit: { limit: 0, used: 0 },
                    thirtyDaysLimit: { limit: 0, used: 0 },
                    oneHundredAndEightyDaysLimit: { limit: 0, used: 0 },
                });
            }
            const participantId = profile.externalId;

            // 3. Fetch from External API
            const response = await inyo.http.get<UpstreamJson>(inyo.url(`/fx/participants/${participantId}/limits`), { headers: inyo.headers });
            const data = response.data;

            if (response.status === 200) {
                limitCache.set(id, data);
            }
            res.json(data);
        } catch (error) {
            // Do not fake zero limits: the UI shows "unavailable" so the integrator sees the real problem
            console.error('Error fetching limits:', message(error));
            fail(res, error);
        }
    });

    router.get('/profile', auth, (req, res) => {
        const id = userId(req);
        try {
            const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
            const profile = db.prepare('SELECT * FROM profiles WHERE userId = ?').get(id) as ProfileRow | undefined;

            if (!user) return res.status(404).json({ error: 'User not found' });

            // Never expose the password hash to the frontend
            const { password: _password, ...safeUser } = user;
            // Only the last four digits of the SSN leave the server; the full value stays local.
            const safeProfile = profile ? { ...profile, ssn: undefined, ssnLast4: profile.ssn ? String(profile.ssn).slice(-4) : null } : null;
            res.json({
                user: safeUser,
                profile: safeProfile,
            });
        } catch (err) {
            res.status(500).json({ error: message(err) });
        }
    });

    router.post('/complete-profile', auth, async (req, res) => {
        try {
            res.json(await completeProfile(ctx, userId(req), req.body ?? {}));
        } catch (error) {
            console.error('Profile update error:', error);
            fail(res, error);
        }
    });

    router.get('/compliance', auth, async (req, res) => {
        const id = userId(req);
        try {
            const profile = db.prepare('SELECT externalId FROM profiles WHERE userId = ?').get(id) as Pick<ProfileRow, 'externalId'> | undefined;

            if (!profile || !profile.externalId) {
                return res.status(404).json({ error: 'Profile not found' });
            }

            const participantId = profile?.externalId;

            try {
                const apiRes = await inyo.http.get<UpstreamJson>(inyo.url(`/participants/${participantId}/complianceLevels`), { headers: inyo.headers });
                console.log(JSON.stringify(apiRes.data));
                res.json(apiRes.data);
            } catch (apiErr) {
                console.log(apiErr);
                return fail(res, apiErr);
            }
        } catch (err) {
            return res.status(500).json({ error: message(err) });
        }
    });

    return router;
}
