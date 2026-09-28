import { differenceInCalendarWeeks, getISODay } from 'date-fns';
import type { ClassSessionDto } from './schemas/schedule';
import { inMinsk, toMinskDateKey } from './time';

/**
 * Номер недели для пометок «1н/2н»: первая — та, в которую попадает firstWeekDate,
 * дальше чередуются. Недели — с понедельника, дни — по Минску.
 */
export function weekParityOf(date: Date | string, firstWeekDate: string): 1 | 2 {
  const weeks = differenceInCalendarWeeks(date, firstWeekDate, { weekStartsOn: 1, in: inMinsk });
  return weeks % 2 === 0 ? 1 : 2;
}

type ScheduledClass = Pick<ClassSessionDto, 'weekday' | 'weekParity' | 'validFrom' | 'startTime'>;

/** Пары на конкретную дату: день недели, чётность недели и «с 10.10». */
export function classesOn<T extends ScheduledClass>(
  classes: T[],
  date: Date | string,
  firstWeekDate: string,
): T[] {
  const weekday = getISODay(date, { in: inMinsk });
  const parity = weekParityOf(date, firstWeekDate);
  const day = toMinskDateKey(date);

  return classes
    .filter(
      (c) =>
        c.weekday === weekday &&
        (c.weekParity === null || c.weekParity === parity) &&
        (c.validFrom === null || c.validFrom <= day),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}
