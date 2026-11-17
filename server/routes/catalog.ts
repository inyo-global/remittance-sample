import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AppContext } from '../app.ts';
import type { UpstreamJson } from '../types.ts';

const ONE_DAY = 24 * 60 * 60 * 1000;

interface Cached {
    data: UpstreamJson | null;
    timestamp: number;
}

/** Destinations, banks and quotes: read-mostly catalog data, cached per app for a day. */
export function catalogRoutes(ctx: AppContext): Router {
    const { db, inyo, auth, fail } = ctx;
    const router = Router();

    let destinationsCache: Cached = { data: null, timestamp: 0 };
    router.get('/destinations', auth, async (_req, res) => {
        if (
            destinationsCache.data &&
            Date.now() - destinationsCache.timestamp < ONE_DAY
        ) {
            return res.json(destinationsCache.data);
        }
        try {
            const apiRes = await inyo.http.get(inyo.url('/payout/us/destinations'), { headers: inyo.headers });
            destinationsCache = { data: apiRes.data, timestamp: Date.now() };
            res.json(apiRes.data);
        } catch (error) {
            fail(res, error);
        }
    });

    const banksCache: Record<string, Cached> = {};
    router.get('/banks/:countryCode', auth, async (req, res) => {
        const countryCode = String(req.params.countryCode);

        if (
            banksCache[countryCode] &&
            Date.now() - banksCache[countryCode].timestamp < ONE_DAY
        ) {
            return res.json(banksCache[countryCode].data);
        }

        try {
            const apiRes = await inyo.http.get(inyo.url(`/payout/${countryCode}/banks?size=100`), { headers: inyo.headers });
            banksCache[countryCode] = { data: apiRes.data, timestamp: Date.now() };
            res.json(apiRes.data);
        } catch (error) {
            fail(res, error);
        }
    });

    router.post('/quotes', auth, async (req, res) => {
        const userId = req.user!.id;
        const { fromCurrency, toCurrency, amount, amountType } = req.body;
        try {
            const payload: UpstreamJson = {
                fromCurrency,
                toCurrency,
                amount: parseFloat(amount),
                fee: { amount: 4, currency: 'USD' },
            };
            /*
            Defines the calculation strategy for the provided amount:
            - NET: The amount is treated as the value to be converted. All fees and taxes will be added on top of this amount (Total Cost = amount + fees).
            - GROSS: The amount is treated as the total budget (total cost). Fees and taxes will be subtracted from this amount before conversion (Source Amount = amount - fees).

              If not provided, the system defaults to NET.

              ex:
              "amountType": "GROSS"
            */

            if (amountType) {
                payload.amountType = amountType;
            }

            const apiRes = await inyo.http.post<UpstreamJson>(inyo.url('/payout/quotes'), payload, { headers: inyo.headers });

            const quotes: UpstreamJson[] = apiRes.data.quotes || [apiRes.data];

            // Store quotes in DB
            const insert = db.prepare('INSERT INTO quotes VALUES (?, ?, ?, ?, ?, ?, ?)');
            quotes.forEach((q) => {
                if (q.id) {
                    insert.run(
                        uuidv4(),
                        userId,
                        q.id,
                        fromCurrency,
                        toCurrency,
                        parseFloat(amount),
                        JSON.stringify(q),
                    );
                }
            });

            res.json(apiRes.data);
        } catch (error) {
            fail(res, error);
        }
    });

    return router;
}
