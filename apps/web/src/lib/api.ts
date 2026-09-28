import {
  CreateTasksReportSchema,
  ExtractResultSchema,
  ScheduleResponseSchema,
  SubjectSchema,
  TaskSchema,
  type TaskBulkUpdateInput,
  type TaskCreateInput,
  type TaskUpdateInput,
} from '@nakanune/shared';

/** Адрес API-сервера. Переменные NEXT_PUBLIC_* Next.js подставляет в код при сборке. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Ответ API с кодом 4xx/5xx. message — текст ошибки от сервера ({ error: '…' }). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** Что угодно с методом parse — zod-схема из @nakanune/shared. */
type Schema<T> = { parse: (data: unknown) => T };

async function request<T>(path: string, schema: Schema<T>, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  // fetch не бросает исключение на 4xx/5xx — проверяем сами. В StudyPlan об этом забыли,
  // и откат оптимистичных обновлений не срабатывал, когда сервер отвечал ошибкой.
  if (!res.ok) {
    const message = errorText(body) ?? `Сервер ответил ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  // Ответ проверяем той же схемой, по которой его собрал сервер
  return schema.parse(body);
}

function errorText(body: unknown): string | null {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof body.error === 'string'
  ) {
    return body.error;
  }
  return null;
}

const nothing: Schema<void> = { parse: () => undefined };
const withJson = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
const taskPath = (id: string) => `/api/tasks/${encodeURIComponent(id)}`;

export const api = {
  getSubjects: () => request('/api/subjects', SubjectSchema.array()),
  getTasks: () => request('/api/tasks', TaskSchema.array()),
  createTasks: (tasks: TaskCreateInput[]) =>
    request('/api/tasks', CreateTasksReportSchema, withJson('POST', tasks)),
  updateTask: (id: string, patch: TaskUpdateInput) =>
    request(taskPath(id), TaskSchema, withJson('PUT', patch)),
  updateTasks: (input: TaskBulkUpdateInput) =>
    request('/api/tasks', TaskSchema.array(), withJson('PATCH', input)),
  deleteTask: (id: string) => request(taskPath(id), nothing, { method: 'DELETE' }),
  extract: (text: string) =>
    request('/api/extract', ExtractResultSchema, withJson('POST', { text })),
  getSchedule: () => request('/api/schedule', ScheduleResponseSchema),
  syncSchedule: () => request('/api/schedule/sync', ScheduleResponseSchema, { method: 'POST' }),
};

/** Текст ошибки для тоста. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Сервер не отвечает — проверь, запущен ли он';
}
