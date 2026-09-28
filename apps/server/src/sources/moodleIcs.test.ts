import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchIcs, parseMoodleIcs } from './moodleIcs';

// Экспорт календаря в формате Moodle: сроки, «открывается»/«закрывается», событие на весь день
const ics = readFileSync(new URL('../../test/fixtures/moodle.ics', import.meta.url), 'utf8');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseMoodleIcs', () => {
  it('берёт сроки, пропускает «открывается», чистит служебные слова Moodle', () => {
    const events = parseMoodleIcs(ics);
    expect(
      events.map(({ uid, title, course, dueAt, allDay }) => ({
        uid,
        title,
        course,
        dueAt: dueAt.toISOString(),
        allDay,
      })),
    ).toEqual([
      {
        uid: '1400@edummf.bsu.by',
        title: 'Входной тест',
        course: 'Алгебра и теория чисел',
        dueAt: '2026-09-05T20:59:00.000Z',
        allDay: false,
      },
      {
        uid: '1523@edummf.bsu.by',
        title: 'Лабораторная работа №2',
        course: 'Практикум по программированию (1 курс)',
        dueAt: '2026-10-06T08:00:00.000Z',
        allDay: false,
      },
      {
        uid: '1602@edummf.bsu.by',
        title: 'Тест 3. Пределы',
        course: 'Математический анализ',
        dueAt: '2026-10-08T20:59:00.000Z',
        allDay: false,
      },
      {
        uid: '1800@edummf.bsu.by',
        title: 'Сдать конспект',
        course: 'Геометрия',
        dueAt: '2026-10-09T20:59:00.000Z',
        allDay: true,
      },
      {
        uid: '1700@edummf.bsu.by',
        title: 'Эссе о профессии',
        course: null,
        dueAt: '2026-10-12T20:59:00.000Z',
        allDay: false,
      },
    ]);
  });

  it('склеивает перенесённые строки и снимает экранирование', () => {
    const lab = parseMoodleIcs(ics).find((event) => event.uid === '1523@edummf.bsu.by');
    expect(lab?.description).toBe(
      'Реализовать стек на массиве, загрузить .cpp файлы. Подробнее: https://edummf.bsu.by/mod/assign/view.php?id=77',
    );
  });
});

describe('fetchIcs', () => {
  const url = 'https://edummf.bsu.by/calendar/export_execute.php?userid=1&authtoken=secret';

  it('не календарь (устаревший токен) — понятная ошибка без ссылки', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>Invalid authentication</html>'),
    );
    const error = await fetchIcs(url).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('возможно, ссылка устарела');
    expect((error as Error).message).not.toContain('secret');
  });

  it('сеть упала — в ошибке нет токена', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError(`fetch failed: ${url}`));
    await expect(fetchIcs(url)).rejects.toThrow('Moodle недоступен');
  });
});
