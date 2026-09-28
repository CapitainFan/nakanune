import { tz } from '@date-fns/tz';
import { format } from 'date-fns';

/**
 * Все «дни» в приложении считаем по Минску, а не по UTC: дедлайн в 00:30 по Минску —
 * это уже следующий день, хотя в UTC ещё предыдущий (в StudyPlan даты сравнивались в UTC).
 */
export const TIMEZONE = 'Europe/Minsk';

const inMinsk = tz(TIMEZONE);

/** День по Минску в виде `YYYY-MM-DD` — ключ для группировки и поиска дублей. */
export function toMinskDateKey(date: Date | string): string {
  return format(date, 'yyyy-MM-dd', { in: inMinsk });
}

/** Дата и время по Минску в виде `YYYY-MM-DD HH:mm` — для экспорта. */
export function formatMinskDateTime(date: Date | string): string {
  return format(date, 'yyyy-MM-dd HH:mm', { in: inMinsk });
}
