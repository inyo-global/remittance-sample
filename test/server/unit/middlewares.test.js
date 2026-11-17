import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../../../server/middlewares/auth.ts';
import { webhookAuth } from '../../../server/middlewares/webhookAuth.ts';
import { requestLog } from '../../../server/middlewares/requestLog.ts';
import { errorHandler, HttpError, upstreamError } from '../../../server/middlewares/errorHandler.ts';
import { createInyoClient } from '../../../server/inyo/client.ts';
import { loadConfig } from '../../../server/config.ts';
import { axios, request } from '../helpers.js';

const config = loadConfig({ NODE_ENV: 'test', EXTERNAL_API_URL: 'https://api.example.test', TENANT: 'sample' });
const silent = () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), http: vi.fn() });

describe('authenticateToken', () => {
  const app = express();
  app.get('/me', authenticateToken('s3cret'), (req, res) => res.json(req.user));

  it('answers 401 without a bearer token', async () => {
    expect((await request(app).get('/me')).status).toBe(401);
  });

  it('answers 403 for a token signed with another secret', async () => {
    const token = jwt.sign({ id: 'u1', email: 'a@b.c' }, 'other');
    expect((await request(app).get('/me').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });

  it('puts the payload on req.user', async () => {
    const token = jwt.sign({ id: 'u1', email: 'a@b.c' }, 's3cret');
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'u1', email: 'a@b.c' });
  });
});

describe('webhookAuth', () => {
  const build = (webhook, log = silent()) => {
    const app = express();
    app.post('/hook', webhookAuth({ ...config, webhook }, log), (_req, res) => res.json({ ok: true }));
    return { app, log };
  };

  it('accepts everyone when no credentials are configured, warning once', async () => {
    const { app, log } = build(null);
    expect((await request(app).post('/hook')).status).toBe(200);
    expect((await request(app).post('/hook')).status).toBe(200);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('requires matching Basic credentials otherwise', async () => {
    const { app } = build({ user: 'u', pass: 'p' });
    const bad = await request(app).post('/hook').auth('u', 'wrong');
    expect(bad.status).toBe(401);
    expect(bad.headers['www-authenticate']).toMatch(/Basic/);
    expect((await request(app).post('/hook').auth('u', 'p')).status).toBe(200);
  });
});

describe('requestLog', () => {
  it('logs method, path, status and duration once the response finishes', async () => {
    const log = silent();
    const app = express();
    app.use(requestLog(log));
    app.get('/x', (_req, res) => res.status(204).end());
    await request(app).get('/x');
    expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/^GET \/x → 204 \(\d+ms\)$/));
  });
});

describe('upstreamError / errorHandler', () => {
  const log = silent();
  const inyo = createInyoClient(config, log);
  const cfg = { method: 'get', url: inyo.url('/z') };

  it('forwards Inyo 4xx with the described error and maps the rest to the fallback status', () => {
    const fail = upstreamError(inyo, log);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    fail(res, new axios.AxiosError('x', 'ERR_BAD_REQUEST', cfg, {}, { status: 422, data: { message: 'invalid' }, headers: {}, config: cfg }));
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: expect.objectContaining({ source: 'inyo', status: 422, message: 'invalid' }) });
    fail(res, new axios.AxiosError('down', 'ECONNRESET', cfg), 503);
    expect(res.status).toHaveBeenLastCalledWith(503);
  });

  it('answers local errors as 500 and HttpError with its own status', () => {
    const fail = upstreamError(inyo, log);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    fail(res, new Error('db is locked'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { source: 'local', message: 'db is locked' } });
    fail(res, new HttpError(400, 'bad redirect'));
    expect(res.status).toHaveBeenLastCalledWith(400);
  });

  it('is the catch-all for errors thrown inside routes', async () => {
    const app = express();
    app.get('/boom', () => { throw new HttpError(409, 'nope'); });
    app.use(errorHandler(inyo, log));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { source: 'local', message: 'nope' } });
  });
});
