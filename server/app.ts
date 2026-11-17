import express, { type Express, type RequestHandler, type Response } from 'express';
import cors from 'cors';
import NodeCache from 'node-cache';
import type { AxiosAdapter } from 'axios';
import { loadConfig, type Config } from './config.ts';
import { openDatabase, type Db } from './db.ts';
import { log as defaultLog, type Log } from './log.ts';
import { createInyoClient, type InyoClient } from './inyo/client.ts';
import { authenticateToken } from './middlewares/auth.ts';
import { requestLog } from './middlewares/requestLog.ts';
import { errorHandler, upstreamError } from './middlewares/errorHandler.ts';
import { authRoutes } from './routes/auth.ts';
import { profileRoutes } from './routes/profile.ts';
import { catalogRoutes } from './routes/catalog.ts';
import { beneficiariesRoutes } from './routes/beneficiaries.ts';
import { fundingAccountsRoutes } from './routes/fundingAccounts.ts';
import { transactionsRoutes } from './routes/transactions.ts';
import { kycRoutes } from './routes/kyc.ts';
import { documentsRoutes } from './routes/documents.ts';
import { webhooksRoutes } from './routes/webhooks.ts';
import { debugRoutes } from './routes/debug.ts';

/** Everything a router needs, built once per app. */
export interface AppContext {
    config: Config;
    db: Db;
    inyo: InyoClient;
    log: Log;
    /** Sender limits, 24 h; invalidated after anything that can change them (transactions, KYC, documents). */
    limitCache: NodeCache;
    /** `authenticateToken` bound to this app's JWT secret. */
    auth: RequestHandler;
    /** Answers a caught error: real Inyo status/body/hint, or a local 500. */
    fail: (res: Response, error: unknown, fallbackStatus?: number) => Response;
}

export interface CreateAppOptions {
    config?: Config;
    db?: Db;
    /** Test hook: axios adapter that answers Inyo calls in-process. */
    adapter?: AxiosAdapter;
    log?: Log;
}

export interface App {
    app: Express;
    ctx: AppContext;
}

/** Builds the BFF: middlewares, one router per domain, error handler. Nothing listens here. */
export function createApp(options: CreateAppOptions = {}): App {
    const config = options.config ?? loadConfig();
    const log = options.log ?? defaultLog;
    const db = options.db ?? openDatabase(config.dbPath, { verbose: !config.isTest });
    const inyo = createInyoClient(config, log, { adapter: options.adapter });

    const ctx: AppContext = {
        config,
        db,
        inyo,
        log,
        limitCache: new NodeCache({ stdTTL: 86400 }), // 24 hours
        auth: authenticateToken(config.jwtSecret),
        fail: upstreamError(inyo, log),
    };

    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use(requestLog(log));

    app.use('/api', authRoutes(ctx));
    app.use('/api', profileRoutes(ctx));
    app.use('/api', catalogRoutes(ctx));
    app.use('/api', beneficiariesRoutes(ctx));
    app.use('/api', fundingAccountsRoutes(ctx));
    app.use('/api', transactionsRoutes(ctx));
    app.use('/api', kycRoutes(ctx));
    app.use('/api', documentsRoutes(ctx));
    app.use('/api', webhooksRoutes(ctx));
    app.use('/api', debugRoutes(ctx));

    app.use(errorHandler(inyo, log));

    return { app, ctx };
}
