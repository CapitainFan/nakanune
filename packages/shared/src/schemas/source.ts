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
  /** Когда данные в последний раз реально обновились (у расписания — с сайта или из снимка). */
  lastSyncedAt: z.iso.datetime({ offset: true }).nullable(),
  lastError: z.string().nullable(),
  /** Сколько заданий пришло из источника. */
  taskCount: z.number().int(),
});

export type SourceDto = z.infer<typeof SourceSchema>;

/**
 * Новый источник:
 * - календарь Moodle: «Календарь → Экспорт календаря → Получить URL календаря». В ссылке
 *   личный токен: сервер хранит её зашифрованной и назад не отдаёт;
 * - чат Telegram: chatId из GET /api/telegram/chats. Название и accessHash сервер берёт
 *   у Telegram сам, клиенту не доверяет.
 */
export const SourceCreateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('MOODLE_ICS'),
    title: z.string().trim().min(1).max(100).default('Moodle'),
    url: z
      .url({ protocol: /^https$/, error: 'Нужна ссылка https://…' })
      .refine((url) => !/\s/.test(url), 'В ссылке не должно быть пробелов'),
  }),
  z.object({
    type: z.literal('TELEGRAM'),
    chatId: z.string().regex(/^\d+$/, 'Неверный id чата'),
  }),
]);

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

/** Состояние подключения Telegram — GET /api/telegram/status. */
export const TelegramStatusSchema = z.object({
  /** В .env заданы TG_API_ID и TG_API_HASH. */
  configured: z.boolean(),
  /** Вход выполнен (pnpm tg:login) и сессия действует. */
  loggedIn: z.boolean(),
  me: z.object({ name: z.string(), username: z.string().nullable() }).nullable(),
  /** Почему не подключено — что сделать. */
  error: z.string().nullable(),
});

export type TelegramStatus = z.infer<typeof TelegramStatusSchema>;

/** Группа или канал, из которых можно читать задания — GET /api/telegram/chats. */
export const TelegramChatSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Группа (в том числе супергруппа) или канал (например, канал преподавателя). */
  isGroup: z.boolean(),
  /** Уже добавлен как источник. */
  added: z.boolean(),
});

export type TelegramChatDto = z.infer<typeof TelegramChatSchema>;
