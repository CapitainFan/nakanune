import { readFileSync } from 'node:fs';
import { vi } from 'vitest';

export const SCHEDULE_URL =
  'https://mmf.bsu.by/ru/raspisanie-zanyatij/dnevnoe-otdelenie/1-kurs/2-gruppa/';

/** Настоящая таблица со страницы 1 курса, 2 группы (content.rendered из REST API WordPress). */
export const scheduleFixture = readFileSync(
  new URL('./fixtures/mmf-1-kurs-2-gruppa.html', import.meta.url),
  'utf8',
);

/**
 * Подменяет fetch: REST API сайта факультета «отдаёт» две страницы со slug 2-gruppa —
 * чужого курса и нашу с указанным HTML. Тесты не ходят в интернет.
 */
export function mockScheduleSite(html: string = scheduleFixture) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    Response.json([
      {
        link: 'https://mmf.bsu.by/ru/raspisanie-zanyatij/dnevnoe-otdelenie/2-kurs/2-gruppa/',
        content: { rendered: '<table></table>' },
      },
      { link: SCHEDULE_URL, content: { rendered: html } },
    ]),
  );
}
