import { beforeAll, describe, expect, it } from 'vitest';
import { loadApp, request } from './helpers.js';

let app;

beforeAll(async () => {
  ({ app } = await loadApp());
});

const messageOf = (html) => {
  const match = html.match(/var msg = (\{.*?\});\n/s);
  if (!match) throw new Error('no message in landing page');
  return match[1];
};

describe('3DS redirect landing pages', () => {
  it('answers the success page with the query payload relayed to the opener/parent', async () => {
    const res = await request(app).get('/api/3ds/success?paymentId=pay-1&approved=true');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toMatch(/authentication <strong>completed<\/strong>/);
    const msg = JSON.parse(messageOf(res.text));
    expect(msg).toEqual({ source: 'remittance-sample-3ds', outcome: 'success', payload: { paymentId: 'pay-1', approved: 'true' } });
    expect(res.text).toContain('window.parent.postMessage(msg, "*")');
    expect(res.text).toContain('window.opener.postMessage(msg, "*"); window.close();');
    expect(res.text).toContain('window.location.replace("/payment?3ds=success")');
  });

  it('merges a form-POSTed `response` field with the query and escapes markup inside the script', async () => {
    const response = JSON.stringify({ status: 'AUTHORIZED', approved: true, paymentId: 'pay-2', note: '<script>alert(1)</script>' });
    const res = await request(app).post('/api/3ds/fail?from=issuer').type('form').send({ response });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/authentication <strong>failed<\/strong>/);
    expect(res.text).toContain('window.location.replace("/payment?3ds=fail")');
    const raw = messageOf(res.text);
    expect(raw).not.toContain('<');
    expect(raw).toContain('\\u003c');
    const msg = JSON.parse(raw);
    expect(msg.outcome).toBe('fail');
    expect(msg.payload.from).toBe('issuer');
    expect(JSON.parse(msg.payload.response)).toMatchObject({ status: 'AUTHORIZED', paymentId: 'pay-2' });
  });

  it('accepts a JSON body too', async () => {
    const res = await request(app).post('/api/3ds/success').send({ paymentId: 'pay-3', approved: true });
    const msg = JSON.parse(messageOf(res.text));
    expect(msg.payload).toEqual({ paymentId: 'pay-3', approved: true });
  });
});
