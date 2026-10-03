import { ScheduleResponseSchema } from '@nakanune/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, resetDb, setupSchedule } from '../../test/helpers';
import { mockScheduleSite } from '../../test/schedule-site';
import { prisma } from '../db';
import { syncSchedule } from '../sources/scheduleSync';

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/schedule', () => {
  it('без источника — пустое расписание', async () => {
    const res = await request(app).get('/api/schedule').expect(200);
    expect(res.body).toEqual({ source: null, classes: [], refreshing: false });
  });

  it('при первом открытии — сразу из снимка в репозитории, сайт проверяет в фоне', async () => {
    const source = await setupSchedule();
    // Как на Render: сайт БГУ с сервера недоступен
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const res = await request(app).get('/api/schedule').expect(200);

    const body = ScheduleResponseSchema.parse(res.body);
    expect(body.classes).toHaveLength(23);
    expect(body.refreshing).toBe(true);
    expect(body.source).toMatchObject({
      firstWeekDate: '2026-09-01',
      lastSyncedAt: '2026-10-02T09:54:21.000Z', // время снимка
      lastError: null,
    });

    // Фоновая проверка не удалась — но ошибка не сохраняется, расписание на месте
    await vi.waitFor(
      async () => {
        const saved = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
        expect(saved.lastCheckedAt).not.toBeNull();
      },
      { timeout: 5000 },
    );
    const saved = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(saved.lastError).toBeNull();
    expect(await prisma.classSession.count()).toBe(23);
  });

  it('если сайт давно не проверяли — отдаёт сохранённое и проверяет в фоне', async () => {
    const source = await setupSchedule();
    mockScheduleSite();
    await syncSchedule(source.id);
    const longAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
    await prisma.source.update({ where: { id: source.id }, data: { lastCheckedAt: longAgo } });

    const res = await request(app).get('/api/schedule').expect(200);
    expect(res.body.refreshing).toBe(true);
    expect(res.body.classes).toHaveLength(23);

    // Фоновая проверка отметит новое время. Ждём до 5 с: при полном прогоне тестов
    // машина загружена, и секунды по умолчанию бывает мало
    await vi.waitFor(
      async () => {
        const saved = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
        expect(saved.lastCheckedAt!.getTime()).toBeGreaterThan(longAgo.getTime());
      },
      { timeout: 5000 },
    );
  });
});

describe('POST /api/schedule/sync', () => {
  it('перечитывает сайт по кнопке «Обновить»', async () => {
    await setupSchedule();
    mockScheduleSite();

    const res = await request(app).post('/api/schedule/sync').expect(200);
    expect(res.body.sync).toEqual({ status: 'updated', classes: 23 });
    expect(res.body.classes).toHaveLength(23);
  });

  it('сайт недоступен — 502 с текстом ошибки, расписание прежнее, ошибка не сохраняется', async () => {
    const source = await setupSchedule();
    mockScheduleSite();
    await syncSchedule(source.id);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('сеть недоступна'));

    const res = await request(app).post('/api/schedule/sync').expect(502);
    expect(res.body.sync).toEqual({
      status: 'failed',
      error: 'Сайт ММФ недоступен с сервера (сеть недоступна)',
    });
    expect(res.body.classes).toHaveLength(23);
    // Ошибку показывает только ответ на «Обновить» — в источнике её нет, на экране не висит
    expect(res.body.source.lastError).toBeNull();
  });

  it('без источника — 404', async () => {
    await request(app).post('/api/schedule/sync').expect(404);
  });
});
