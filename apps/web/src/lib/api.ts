import {
  CalendarFeedSchema,
  CreateTasksReportSchema,
  ExtractResultSchema,
  ScheduleResponseSchema,
  ScheduleSyncResponseSchema,
  SourceSchema,
  SourceSyncResponseSchema,
  SubjectSchema,
  TelegramChatSchema,
  TelegramStatusSchema,
  TaskSchema,
  type SourceCreateInput,
  type SourceSyncResponse,
  type TaskBulkUpdateInput,
  type TaskCreateInput,
  type TaskUpdateInput,
} from '@nakanune/shared';
import { useAuthStore } from '@/store/auth';

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

/**
 * Заголовки для любого запроса к API: ключ доступа (если сервер его требует) и пропуск
 * страницы-предупреждения бесплатного ngrok — без этого заголовка ngrok отдаёт браузеру
 * HTML-страницу вместо ответа API.
 */
export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = useAuthStore.getState().token;
  return {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(API_URL.includes('ngrok') && { 'ngrok-skip-browser-warning': '1' }),
    ...extra,
  };
}

async function request<T>(path: string, schema: Schema<T>, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // JSON по умолчанию; фото доски шлётся как есть, со своим Content-Type
    headers: apiHeaders(
      (init.headers as Record<string, string> | undefined) ??
        (init.body ? { 'Content-Type': 'application/json' } : {}),
    ),
  });
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  // Сервер требует ключ доступа, а его нет или он неверный — показываем форму ключа
  if (res.status === 401) useAuthStore.getState().markUnauthorized();

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
const sourcePath = (id: string, suffix = '') => `/api/sources/${encodeURIComponent(id)}${suffix}`;

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
  extractImage: (file: File) =>
    request('/api/extract/image', ExtractResultSchema, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type },
    }),
  getSchedule: () => request('/api/schedule', ScheduleResponseSchema),
  getCalendarFeed: () => request('/api/export/feed', CalendarFeedSchema),
  syncSchedule: () => request('/api/schedule/sync', ScheduleSyncResponseSchema, { method: 'POST' }),
  getSources: () => request('/api/sources', SourceSchema.array()),
  addSource: (input: SourceCreateInput) =>
    request('/api/sources', SourceSyncResponseSchema, withJson('POST', input)),
  /** 502 (Moodle не ответил) — тоже ответ: в нём источник с lastError и итог синхронизации. */
  syncSource: async (id: string): Promise<SourceSyncResponse> => {
    try {
      return await request(sourcePath(id, '/sync'), SourceSyncResponseSchema, { method: 'POST' });
    } catch (error) {
      const parsed = error instanceof ApiError && SourceSyncResponseSchema.safeParse(error.body);
      if (parsed && parsed.success) return parsed.data;
      throw error;
    }
  },
  deleteSource: (id: string) => request(sourcePath(id), nothing, { method: 'DELETE' }),
  getTelegramStatus: () => request('/api/telegram/status', TelegramStatusSchema),
  getTelegramChats: () => request('/api/telegram/chats', TelegramChatSchema.array()),
};

/** Ответ «нужен ключ доступа» — тост не нужен, вместо интерфейса уже форма ключа. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** Текст ошибки для тоста. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Сервер не отвечает — проверь, запущен ли он';
}
