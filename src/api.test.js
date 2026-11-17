import { beforeEach, describe, expect, it, vi } from 'vitest';

const instance = vi.fn();
vi.mock('axios', () => ({ default: { create: vi.fn(() => instance) } }));

const { request } = await import('./api');

const axiosError = (status, data) => Object.assign(new Error(`status ${status}`), { response: { status, data } });

describe('request', () => {
  let assign;
  beforeEach(() => {
    instance.mockReset();
    assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sends method, url, data and returns response.data', async () => {
    instance.mockResolvedValueOnce({ data: { ok: true } });
    const out = await request('post', '/quotes', { amount: 1 }, { headers: { 'X-Test': '1' } });
    expect(out).toEqual({ ok: true });
    expect(instance).toHaveBeenCalledWith({ method: 'post', url: '/quotes', data: { amount: 1 }, headers: { 'X-Test': '1' } });
  });

  it('adds the bearer token from localStorage', async () => {
    localStorage.setItem('authToken', 'tok-1');
    instance.mockResolvedValueOnce({ data: [] });
    await request('get', '/profile');
    expect(instance.mock.calls[0][0].headers.Authorization).toBe('Bearer tok-1');
  });

  it('does not add an Authorization header without a token', async () => {
    instance.mockResolvedValueOnce({ data: [] });
    await request('get', '/destinations');
    expect(instance.mock.calls[0][0].headers.Authorization).toBeUndefined();
  });

  it('throws the response body when the server answered', async () => {
    instance.mockRejectedValueOnce(axiosError(422, { error: 'bad' }));
    await expect(request('post', '/beneficiaries', {})).rejects.toEqual({ error: 'bad' });
    expect(assign).not.toHaveBeenCalled();
  });

  it('throws the raw error when there is no response', async () => {
    const err = new Error('Network Error');
    instance.mockRejectedValueOnce(err);
    await expect(request('get', '/profile')).rejects.toBe(err);
  });

  it('drops the session and redirects to /login on 401 with a stored token', async () => {
    localStorage.setItem('authToken', 'tok');
    localStorage.setItem('remittance_user', '{}');
    instance.mockRejectedValueOnce(axiosError(401, { error: 'expired' }));
    await expect(request('get', '/profile')).rejects.toEqual({ error: 'expired' });
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('remittance_user')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('also redirects on 403', async () => {
    localStorage.setItem('authToken', 'tok');
    instance.mockRejectedValueOnce(axiosError(403, {}));
    await expect(request('get', '/limits')).rejects.toEqual({});
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('does not redirect without a stored token', async () => {
    instance.mockRejectedValueOnce(axiosError(401, {}));
    await expect(request('get', '/profile')).rejects.toEqual({});
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(['/login', '/register', '/beneficiaries/abc/accounts', '/transactions', '/transactions/1/sync'])('keeps the session on %s', async (url) => {
    localStorage.setItem('authToken', 'tok');
    instance.mockRejectedValueOnce(axiosError(403, { error: 'denied' }));
    await expect(request('get', url)).rejects.toEqual({ error: 'denied' });
    expect(localStorage.getItem('authToken')).toBe('tok');
    expect(assign).not.toHaveBeenCalled();
  });
});
