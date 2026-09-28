import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, createTasks, resetDb } from '../../test/helpers';

beforeEach(resetDb);

describe('GET /api/export/calendar.ics', () => {
  it('включает только подтверждённые задания со сроком', async () => {
    const tasks = await createTasks([
      { title: 'В календарь', dueAt: '2026-10-05T09:00:00Z' },
      { title: 'Без срока' },
      { title: 'Во входящих', status: 'INBOX', dueAt: '2026-10-05T09:00:00Z' },
      { title: 'В архиве', dueAt: '2026-10-05T09:00:00Z' },
    ]);
    const archived = tasks.find((task) => task.title === 'В архиве');
    await request(app).put(`/api/tasks/${archived!.id}`).send({ archived: true }).expect(200);

    const res = await request(app).get('/api/export/calendar.ics').expect(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(res.text).toContain('SUMMARY:В календарь');
  });
});

describe('GET /api/export/tasks.csv', () => {
  it('отдаёт все задания файлом с BOM', async () => {
    await createTasks([{ title: 'Решить №5, №6' }]);

    const res = await request(app).get('/api/export/tasks.csv').expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toContain('nakanune-tasks.csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain(';"Решить №5, №6";');
  });
});
