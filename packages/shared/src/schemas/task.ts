import { z } from 'zod';

// Значения совпадают с enum'ами в schema.prisma.
export const TaskStatusSchema = z.enum(['INBOX', 'TODO', 'DONE']);
export const PrioritySchema = z.enum(['low', 'medium', 'high']);
export const SourceTypeSchema = z.enum(['TELEGRAM', 'MOODLE_ICS', 'MANUAL', 'MMF_SCHEDULE']);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const STATUS_LABELS: Record<TaskStatus, string> = {
  INBOX: 'Входящие',
  TODO: 'К выполнению',
  DONE: 'Сделано',
};

/**
 * Порог автопринятия (раздел 8 ТЗ): задание из источника с уверенностью от 75 и точным сроком
 * сразу идёт в работу, остальное — во «Входящие». В StudyPlan от 75 зеленела полоса уверенности.
 */
export const AUTO_ACCEPT_CONFIDENCE = 75;

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'низкий',
  medium: 'средний',
  high: 'высокий',
};

// Дата-время ISO 8601 с часовым поясом: «2026-10-05T20:59:00.000Z» или «…+03:00».
const isoDateTime = z.iso.datetime({ offset: true });

/** Откуда задание: исходное сообщение, из которого его извлекли. */
export const TaskOriginSchema = z.object({
  sourceType: SourceTypeSchema,
  sourceTitle: z.string(),
  text: z.string(), // обрезан до разумной длины
  sentAt: isoDateTime,
});

export type TaskOrigin = z.infer<typeof TaskOriginSchema>;

/** Задание в ответах API. Служебные поля (dedupeKey, rawMessageId) наружу не отдаём. */
export const TaskSchema = z.object({
  id: z.string(),
  subjectId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  summary: z.string().nullable(),
  notes: z.string().nullable(),
  dueAt: isoDateTime.nullable(),
  dueAtIsGuess: z.boolean(),
  status: TaskStatusSchema,
  priority: PrioritySchema,
  confidenceScore: z.number().int().min(0).max(100),
  labels: z.array(z.string()),
  archived: z.boolean(),
  sourceId: z.string().nullable(),
  origin: TaskOriginSchema.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export type TaskDto = z.infer<typeof TaskSchema>;

const taskFields = {
  title: z.string().trim().min(1, 'Название обязательно').max(300),
  subjectId: z.string().nullable(),
  description: z.string().trim().max(5000).nullable(),
  summary: z.string().trim().max(1000).nullable(),
  notes: z.string().trim().max(5000).nullable(),
  dueAt: isoDateTime.nullable(),
  dueAtIsGuess: z.boolean(),
  status: TaskStatusSchema,
  priority: PrioritySchema,
  confidenceScore: z.number().int().min(0).max(100),
  labels: z.array(z.string().trim().min(1).max(50)).max(20),
};

/**
 * Одно задание в теле POST /api/tasks. Обязателен только title: в StudyPlan требовались
 * ещё предмет и дедлайн, у нас их может не быть («Без предмета», срок неизвестен).
 * Незаполненные поля получат значения по умолчанию из schema.prisma.
 */
export const TaskCreateSchema = z.object(taskFields).partial().required({ title: true });

/** Тело PUT /api/tasks/:id — любые поля, но хотя бы одно. */
export const TaskUpdateSchema = z
  .object({ ...taskFields, archived: z.boolean() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Нет полей для обновления');

/**
 * Тело PATCH /api/tasks — сменить статус или архив сразу у нескольких заданий
 * («отметить все за день»). В StudyPlan это были N отдельных PUT-запросов.
 */
export const TaskBulkUpdateSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  patch: z
    .object({ status: TaskStatusSchema, archived: z.boolean() })
    .partial()
    .refine((patch) => Object.keys(patch).length > 0, 'Нет полей для обновления'),
});

export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;
export type TaskBulkUpdateInput = z.infer<typeof TaskBulkUpdateSchema>;

/** Фильтры GET /api/tasks: ?status=TODO&archived=false&from=…&to=… (срок в [from, to)). */
export const TaskListQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  archived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

/**
 * Ответ POST /api/tasks — отчёт, как в StudyPlan: что добавлено, что пропущено как дубль,
 * что не прошло проверку. index — позиция задания в присланном массиве.
 */
export const CreateTasksReportSchema = z.object({
  inserted: z.array(TaskSchema),
  duplicates: z.array(z.object({ index: z.number(), title: z.string() })),
  errors: z.array(z.object({ index: z.number(), message: z.string() })),
});

export type CreateTasksReport = z.infer<typeof CreateTasksReportSchema>;
