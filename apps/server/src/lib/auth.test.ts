import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app, resetDb } from '../../test/helpers';
import { env } from '../env';
import { feedToken } from './auth';

const TOKEN = 'k'.repeat(64);

beforeEach(resetDb);
afterEach(() => {
  env.API_TOKEN = undefined;
});

describe('ключ доступа (API_TOKEN)', () => {
  beforeEach(() => {
    env.API_TOKEN = TOKEN;
  });

  it('без ключа или с неверным — 401, с верным — пускает', async () => {
    await request(app).get('/api/tasks').expect(401);
    await request(app).get('/api/tasks').set('Authorization', 'Bearer wrong').expect(401);
    await request(app).get('/api/tasks').set('Authorization', `Bearer ${TOKEN}`).expect(200);
  });

  it('/api/health открыт: фронту надо понять, жив ли сервер', async () => {
    await request(app).get('/api/health').expect(200);
  });

  it('ключ ленты открывает только ленту календаря, не остальной API', async () => {
    const { body } = await request(app)
      .get('/api/export/feed')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(body.token).toBe(feedToken(TOKEN));
    expect(body.token).not.toContain(TOKEN);

    await request(app).get(`/api/export/calendar.ics?token=${body.token}`).expect(200);
    await request(app).get('/api/export/calendar.ics?token=wrong').expect(401);
    await request(app).get(`/api/tasks?token=${body.token}`).expect(401);
  });
});

describe('без ключа доступа', () => {
  it('напрямую с этого компьютера — работает', async () => {
    await request(app).get('/api/tasks').expect(200);
  });

  it('через туннель (ngrok добавляет X-Forwarded-For) — отказ: API нельзя открыть без ключа', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(503);
    expect(res.body.error).toContain('API_TOKEN');
  });
});
