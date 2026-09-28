import { z } from 'zod';
import { SourceTypeSchema } from './task';

/** Источник заданий в списке. Секретов (ссылки с токеном, сессии) здесь нет. */
export const SourceSchema = z.object({
  id: z.string(),
  type: SourceTypeSchema,
  title: z.string(),
  enabled: z.boolean(),
  /** Без секретов: для Moodle — адрес сайта («edummf.bsu.by»). */
  detail: z.string().nullable(),
  lastCheckedAt: z.iso.datetime({ offset: true }).nullable(),
  lastError: z.string().nullable(),
  /** Сколько заданий пришло из источника. */
  taskCount: z.number().int(),
});

export type SourceDto = z.infer<typeof SourceSchema>;

/**
 * Новый источник. Пока — календарь Moodle: «Календарь → Экспорт календаря → Получить URL
 * календаря». В ссылке личный токен: сервер хранит её зашифрованной и назад не отдаёт.
 */
export const SourceCreateSchema = z.object({
  type: z.literal('MOODLE_ICS'),
  title: z.string().trim().min(1).max(100).default('Moodle'),
  url: z
    .url({ protocol: /^https$/, error: 'Нужна ссылка https://…' })
    .refine((url) => !/\s/.test(url), 'В ссылке не должно быть пробелов'),
});

export type SourceCreateInput = z.input<typeof SourceCreateSchema>;

/** Итог синхронизации источника. */
export const SourceSyncResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('updated'),
    /** Новых заданий и заданий, у которых в Moodle поменялся срок или название. */
    created: z.number().int(),
    updated: z.number().int(),
  }),
  z.object({ status: z.literal('unchanged') }),
  z.object({ status: z.literal('failed'), error: z.string() }),
]);

export type SourceSyncResult = z.infer<typeof SourceSyncResultSchema>;

/** Ответ POST /api/sources/:id/sync. */
export const SourceSyncResponseSchema = z.object({
  source: SourceSchema,
  sync: SourceSyncResultSchema,
});

export type SourceSyncResponse = z.infer<typeof SourceSyncResponseSchema>;
