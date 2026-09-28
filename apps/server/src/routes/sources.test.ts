import { readFileSync } from 'node:fs';
import { SourceSchema, SourceSyncResponseSchema } from '@nakanune/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, resetDb } from '../../test/helpers';
import { prisma } from '../db';

const ics = readFileSync(new URL('../../test/fixtures/moodle.ics', import.meta.url), 'utf8');
const URL_WITH_TOKEN =
  'https://edummf.bsu.by/calendar/export_execute.php?userid=42&authtoken=very-secret-token';

/** Moodle «отдаёт» указанный календарь. */
const mockMoodle = (body: string = ics) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(body));

async function addMoodle() {
  const res = await request(app)
    .post('/api/sources')
    .send({ type: 'MOODLE_ICS', url: URL_WITH_TOKEN })
    .expect(201);
  return SourceSyncResponseSchema.parse(res.body);
}

beforeEach(async () => {
  await resetDb();
  // Понедельник, 28 сентября 2026, 12:00 по Минску. Подменяем только Date — таймеры
  // нужны настоящие (supertest, пул соединений с базой)
  vi.useFakeTimers({ now: new Date('2026-09-28T09:00:00Z'), toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('POST /api/sources — календарь Moodle', () => {
  it('сохраняет ссылку зашифрованной, сразу забирает сроки в задания', async () => {
    const practice = await prisma.subject.create({
      data: { name: 'Практикум по программированию' },
    });
    const analysis = await prisma.subject.create({ data: { name: 'Математический анализ' } });
    mockMoodle();

    const { source, sync } = await addMoodle();

    // Старое событие (5 сентября) и «тест открывается» пропущены
    expect(sync).toEqual({ status: 'updated', created: 4, updated: 0 });
    expect(source).toMatchObject({
      type: 'MOODLE_ICS',
      detail: 'edummf.bsu.by',
      lastError: null,
      taskCount: 4,
    });

    // Токен не лежит в базе открытым текстом и не уходит в браузер
    const stored = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(JSON.stringify(stored.config)).not.toContain('very-secret-token');
    const list = await request(app).get('/api/sources').expect(200);
    expect(JSON.stringify(list.body)).not.toContain('very-secret-token');
    expect(JSON.stringify(list.body)).not.toContain('urlEncrypted');

    const tasks = await prisma.task.findMany({ orderBy: { dueAt: 'asc' } });
    expect(
      tasks.map(({ title, subjectId, dueAt, status, priority }) => ({
        title,
        subjectId,
        dueAt: dueAt?.toISOString(),
        status,
        priority,
      })),
    ).toEqual([
      // Предмет найден по курсу — срок из Moodle точный — сразу в «Задания»
      {
        title: 'Лабораторная работа №2',
        subjectId: practice.id,
        dueAt: '2026-10-06T08:00:00.000Z',
        status: 'TODO',
        priority: 'medium',
      },
      {
        title: 'Тест 3. Пределы',
        subjectId: analysis.id,
        dueAt: '2026-10-08T20:59:00.000Z',
        status: 'TODO',
        priority: 'high',
      },
      // Геометрии в базе нет, у эссе нет курса — на проверку во «Входящие»
      {
        title: 'Сдать конспект',
        subjectId: null,
        dueAt: '2026-10-09T20:59:00.000Z',
        status: 'INBOX',
        priority: 'medium',
      },
      {
        title: 'Эссе о профессии',
        subjectId: null,
        dueAt: '2026-10-12T20:59:00.000Z',
        status: 'INBOX',
        priority: 'medium',
      },
    ]);
  });

  it('ссылка не отдаёт календарь — 400, источник не создаётся', async () => {
    mockMoodle('<html>Invalid authentication</html>');
    const res = await request(app)
      .post('/api/sources')
      .send({ type: 'MOODLE_ICS', url: URL_WITH_TOKEN })
      .expect(400);
    expect(res.body.error).toContain('ссылка устарела');
    expect(await prisma.source.count()).toBe(0);
  });

  it('не https — 400', async () => {
    await request(app)
      .post('/api/sources')
      .send({ type: 'MOODLE_ICS', url: 'http://edummf.bsu.by/calendar.ics' })
      .expect(400);
  });
});

describe('POST /api/sources/:id/sync', () => {
  it('без изменений — unchanged; срок перенесли в Moodle — переносит задание, выполненное не трогает', async () => {
    const fetchMock = mockMoodle();
    const { source } = await addMoodle();

    const again = await request(app).post(`/api/sources/${source.id}/sync`).expect(200);
    expect(SourceSyncResponseSchema.parse(again.body).sync).toEqual({ status: 'unchanged' });

    const essay = await prisma.task.findFirstOrThrow({ where: { title: 'Эссе о профессии' } });
    await prisma.task.update({ where: { id: essay.id }, data: { status: 'DONE' } });

    // Лабораторную и эссе перенесли на неделю
    fetchMock.mockImplementation(
      async () =>
        new Response(
          ics
            .replace('DTSTART:20261006T080000Z', 'DTSTART:20261013T080000Z')
            .replace('DTSTART:20261012T205900Z', 'DTSTART:20261019T205900Z'),
        ),
    );
    const moved = await request(app).post(`/api/sources/${source.id}/sync`).expect(200);
    expect(SourceSyncResponseSchema.parse(moved.body).sync).toEqual({
      status: 'updated',
      created: 0,
      updated: 1,
    });

    const lab = await prisma.task.findFirstOrThrow({ where: { title: 'Лабораторная работа №2' } });
    expect(lab.dueAt?.toISOString()).toBe('2026-10-13T08:00:00.000Z');
    const done = await prisma.task.findUniqueOrThrow({ where: { id: essay.id } });
    expect(done.dueAt?.toISOString()).toBe('2026-10-12T20:59:00.000Z');
  });

  it('Moodle недоступен — 502, ошибка в lastError, задания на месте', async () => {
    const fetchMock = mockMoodle();
    const { source } = await addMoodle();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const res = await request(app).post(`/api/sources/${source.id}/sync`).expect(502);
    const body = SourceSyncResponseSchema.parse(res.body);
    expect(body.sync).toEqual({ status: 'failed', error: 'Moodle недоступен' });
    expect(body.source.lastError).toBe('Moodle недоступен');
    expect(await prisma.task.count()).toBe(4);
  });
});

describe('POST /api/sources/sync-all', () => {
  it('ошибка одного источника не мешает остальным', async () => {
    const fetchMock = mockMoodle();
    const broken = await request(app)
      .post('/api/sources')
      .send({ type: 'MOODLE_ICS', title: 'А: сломанный', url: `${URL_WITH_TOKEN}&a=1` })
      .expect(201);
    await request(app)
      .post('/api/sources')
      .send({ type: 'MOODLE_ICS', title: 'Б: рабочий', url: `${URL_WITH_TOKEN}&b=1` })
      .expect(201);

    // Первый источник теперь отдаёт ошибку, второй — календарь с новым событием
    fetchMock.mockImplementation(async (input) =>
      String(input).includes('a=1')
        ? new Response('oops', { status: 500 })
        : new Response(ics.replace('UID:1700@', 'UID:1701@')),
    );
    const res = await request(app).post('/api/sources/sync-all').expect(200);
    expect(res.body).toEqual([
      {
        sourceId: broken.body.source.id,
        title: 'А: сломанный',
        sync: { status: 'failed', error: 'Moodle ответил ошибкой 500' },
      },
      {
        sourceId: expect.any(String),
        title: 'Б: рабочий',
        sync: { status: 'updated', created: 0, updated: 0 },
      },
    ]);
  });
});

describe('GET и DELETE /api/sources', () => {
  it('удаление оставляет задания, но отвязывает их; «вставленный текст» в списке не виден', async () => {
    mockMoodle();
    const { source } = await addMoodle();
    await prisma.source.create({
      data: { id: 'manual', type: 'MANUAL', title: 'Вставленный текст', config: {} },
    });

    const list = await request(app).get('/api/sources').expect(200);
    expect(
      SourceSchema.array()
        .parse(list.body)
        .map((item) => item.type),
    ).toEqual(['MOODLE_ICS']);

    await request(app).delete(`/api/sources/${source.id}`).expect(204);
    expect(await prisma.task.count()).toBe(4);
    expect(await prisma.task.count({ where: { sourceId: { not: null } } })).toBe(0);
    await request(app).delete('/api/sources/manual').expect(400);
  });
});
