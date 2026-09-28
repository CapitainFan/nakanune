import { z } from 'zod';
import { CreateTasksReportSchema, PrioritySchema } from './task';

/**
 * Элемент ответа ИИ (раздел 11.3 ТЗ). Эта же схема уходит в Gemini как responseJsonSchema.
 * Она намеренно «мягкая»: слишком длинный заголовок обрежем, дробную уверенность округлим,
 * кривую дату разберём отдельно — из-за мелочи не выбрасываем весь ответ модели.
 * (В StudyPlan ответ модели шёл в JSON.parse вообще без проверки — баг №3.)
 */
export const ExtractedItemSchema = z.object({
  messageId: z.string().describe('id сообщения из входных данных'),
  isHomework: z.boolean().describe('есть ли в сообщении домашнее задание'),
  subjectName: z.string().nullable().describe('название предмета строго из списка или null'),
  title: z
    .string()
    .transform((title) => title.trim().slice(0, 120))
    .describe('что сделать, до 120 символов, без предмета и срока'),
  summary: z.string().nullable().describe('2–4 строки: что сделать, как сдать, что нужно'),
  dueAt: z.string().nullable().describe('срок сдачи, ISO 8601 с часовым поясом'),
  dueAtIsGuess: z.boolean().describe('срок угадан, а не назван явно'),
  confidence: z
    .number()
    .transform((value) => Math.round(Math.min(100, Math.max(0, value))))
    .describe('уверенность 0–100'),
  priority: PrioritySchema,
  labels: z.array(z.string()).describe('хэштеги из текста без #'),
});

export const ExtractResponseSchema = z.object({ items: z.array(ExtractedItemSchema) });

export type ExtractedItem = z.output<typeof ExtractedItemSchema>;

/** Тело POST /api/extract: вставленный текст — сообщение из чата, письмо, фото доски словами. */
export const ExtractRequestSchema = z.object({
  text: z.string().trim().min(1, 'Вставь текст').max(20_000),
});

/** Ответ POST /api/extract. Найденные задания сохранены во «Входящие» (статус INBOX). */
export const ExtractResultSchema = z.object({
  engine: z.enum(['gemini', 'heuristic']),
  /** Почему не ИИ, если разбирала эвристика: нет ключа, Gemini ответил ошибкой… */
  notice: z.string().nullable(),
  report: CreateTasksReportSchema,
});

export type ExtractResult = z.infer<typeof ExtractResultSchema>;
