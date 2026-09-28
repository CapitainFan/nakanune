import { inMinsk } from '@nakanune/shared';
import { differenceInCalendarDays, format } from 'date-fns';
import { ru } from 'date-fns/locale';

/** Срок по-человечески: «сегодня, 23:59», «завтра, 08:15», «5 окт., 23:59». Время — минское. */
export function formatDue(dueAt: string, now: Date): string {
  const days = differenceInCalendarDays(dueAt, now, { in: inMinsk });
  const time = format(dueAt, 'HH:mm', { in: inMinsk });
  if (days === 0) return `сегодня, ${time}`;
  if (days === 1) return `завтра, ${time}`;
  if (days === -1) return `вчера, ${time}`;
  return format(dueAt, 'd MMM, HH:mm', { locale: ru, in: inMinsk });
}

/** «пт, 9 октября» */
export function formatDay(date: Date | string): string {
  return format(date, 'EEEEEE, d MMMM', { locale: ru, in: inMinsk });
}
