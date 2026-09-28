import type { z } from 'zod';

/** Ошибка с HTTP-статусом. Бросаем её в маршруте — errorHandler в app.ts превратит её в ответ. */
export class HttpError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Список ошибок zod в виде «поле: что не так». */
export function listIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/** То же одной строкой — для отчёта о пакетной вставке. */
export function formatIssues(error: z.ZodError): string {
  return listIssues(error)
    .map(({ path, message }) => (path ? `${path}: ${message}` : message))
    .join('; ');
}

/** Проверяет данные схемой. Не подошли — 400 со списком ошибок по полям. */
export function parseOr400<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'Некорректные данные', listIssues(result.error));
  }
  return result.data;
}
