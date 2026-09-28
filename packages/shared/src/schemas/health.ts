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
