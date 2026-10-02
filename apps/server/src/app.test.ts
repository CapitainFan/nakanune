import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../test/helpers';
import { env } from './env';

const allowed = env.WEB_ORIGIN[0]!;

describe('CORS и доступ публичного фронта к localhost', () => {
  it('разрешённому фронту — CORS и «можно в локальную сеть» (Chrome спрашивает перед запросом)', async () => {
    const res = await request(app)
      .options('/api/tasks')
      .set('Origin', allowed)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Private-Network', 'true')
      .expect(204);
    expect(res.headers['access-control-allow-origin']).toBe(allowed);
    expect(res.headers['access-control-allow-private-network']).toBe('true');
  });

  it('чужому сайту — ни того, ни другого', async () => {
    const res = await request(app)
      .options('/api/tasks')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Private-Network', 'true');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-private-network']).toBeUndefined();
  });
});
