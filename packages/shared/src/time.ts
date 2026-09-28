import { TZDate, tz } from '@date-fns/tz';
import { format } from 'date-fns';

/**
 * Все «дни» в приложении считаем по Минску, а не по UTC: дедлайн в 00:30 по Минску —
 * это уже следующий день, хотя в UTC ещё предыдущий (в StudyPlan даты сравнивались в UTC).
 */
export const TIMEZONE = 'Europe/Minsk';

/** Контекст для функций date-fns: `format(date, 'HH:mm', { in: inMinsk })` считает по Минску. */
export const inMinsk = tz(TIMEZONE);

/** День по Минску в виде `YYYY-MM-DD` — ключ для группировки и поиска дублей. */
export function toMinskDateKey(date: Date | string): string {
  return format(date, 'yyyy-MM-dd', { in: inMinsk });
}

/** `YYYY-MM-DD` → начало этого дня по Минску (обычный Date — один момент времени). */
export function fromMinskDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(new TZDate(year!, month! - 1, day!, TIMEZONE).getTime());
}

/** Дата и время по Минску в виде `YYYY-MM-DD HH:mm` — для экспорта. */
export function formatMinskDateTime(date: Date | string): string {
  return format(date, 'yyyy-MM-dd HH:mm', { in: inMinsk });
}

/**
 * Значение для `<input type="datetime-local">`: время по Минску без зоны — «2026-10-05T23:59».
 * В StudyPlan здесь был toISOString().substring(0, 16) — это UTC, и в Минске поле
 * показывало время на 3 часа раньше настоящего (баг №8).
 */
export function toMinskInputValue(date: Date | string): string {
  return format(date, "yyyy-MM-dd'T'HH:mm", { in: inMinsk });
}

/** Обратно: «2026-10-05T23:59» (время по Минску) → ISO-строка с зоной для API. */
export function fromMinskInputValue(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) throw new Error(`Не похоже на дату и время: ${value}`);
  const [year, month, day, hours, minutes] = match.slice(1).map(Number);
  return new TZDate(year!, month! - 1, day!, hours!, minutes!, TIMEZONE).toISOString();
}
