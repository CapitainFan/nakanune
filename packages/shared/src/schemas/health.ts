import { z } from 'zod';

/**
 * Ответ GET /api/health. Сервер собирает его, фронт проверяет той же схемой,
 * поэтому контракт между ними описан один раз.
 */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['up', 'down']),
  time: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Ответ GET /api/export/feed: ключ для ссылки на ленту календаря или null (ключа нет). */
export const CalendarFeedSchema = z.object({ token: z.string().nullable() });

export type CalendarFeed = z.infer<typeof CalendarFeedSchema>;
