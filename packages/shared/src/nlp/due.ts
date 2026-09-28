import { addDays } from 'date-fns';
import { classesOn } from '../schedule';
import type { ClassSessionDto } from '../schemas/schedule';
import { fromMinskDateKey, fromMinskDateTime, inMinsk, toMinskDateKey } from '../time';
import type { DueHint } from './dates';

export type ScheduleContext = {
  firstWeekDate: string;
  classes: Pick<
    ClassSessionDto,
    'subjectId' | 'weekday' | 'weekParity' | 'validFrom' | 'startTime'
  >[];
};

const END_OF_DAY = '23:59';
const NEXT_CLASS_LOOKAHEAD_DAYS = 14;

/**
 * Превращает подсказку о сроке в момент времени.
 * Назван только день — срок в начало пары по этому предмету в тот день («к пятнице» =
 * к пятничной паре), а если такой пары нет — 23:59. «К следующей паре» — начало ближайшей
 * пары по предмету после отправки сообщения.
 */
export function resolveDue(
  hint: DueHint | null,
  subjectId: string | null,
  sentAt: Date,
  schedule: ScheduleContext | null,
): { dueAt: Date | null; isGuess: boolean } {
  if (!hint) return { dueAt: null, isGuess: false };
  const lessons =
    subjectId && schedule
      ? schedule.classes.filter((lesson) => lesson.subjectId === subjectId)
      : [];

  if (hint.type === 'next-class') {
    if (!schedule) return { dueAt: null, isGuess: false };
    for (let offset = 0; offset < NEXT_CLASS_LOOKAHEAD_DAYS; offset++) {
      const day = addDays(sentAt, offset, { in: inMinsk });
      for (const lesson of classesOn(lessons, day, schedule.firstWeekDate)) {
        const start = fromMinskDateTime(toMinskDateKey(day), lesson.startTime);
        if (start > sentAt) return { dueAt: start, isGuess: false };
      }
    }
    return { dueAt: null, isGuess: false };
  }

  const firstLesson = schedule
    ? classesOn(lessons, fromMinskDateKey(hint.date), schedule.firstWeekDate)[0]
    : undefined;
  const time = hint.time ?? firstLesson?.startTime ?? END_OF_DAY;
  return { dueAt: fromMinskDateTime(hint.date, time), isGuess: hint.isGuess };
}
