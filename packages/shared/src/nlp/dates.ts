// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: server.js — nlpExtractDate, nlpExtractTime. Словари переписаны на русский,
// дни считаются по Минску (в StudyPlan — в часовом поясе сервера), а «+7 дней, если
// дату не нашли» (nlpFallbackDate, баг №5) убрано: нет даты — значит нет.
import { addDays, endOfMonth, format, getISODay, startOfWeek } from 'date-fns';
import { inMinsk, toMinskDateKey } from '../time';
import { WORD_END, WORD_START } from './regex';

/** Что удалось понять о сроке. Точное время подставит resolveDue (с учётом расписания). */
// atLecture — в тексте прямо сказано «к лекции»; иначе срок — практика (см. resolveDue)
export type DueHint =
  | { type: 'date'; date: string; time: string | null; isGuess: boolean; atLecture?: boolean } // date — YYYY-MM-DD по Минску
  | { type: 'next-class'; isGuess?: boolean; atLecture?: boolean }; // «к следующей паре» — срок знает только расписание

export type DateMatch = {
  hint: DueHint;
  /** Найденные фразы («к пятнице», «до 23:59») — их уберёт cleanTitle. */
  phrases: string[];
};

const PREP = '(?:(?:до|к|ко|в|во|на)\\s+)?';
// «следующей», «след.», «след» — в чатах пишут и так: «на след паре»
const NEXT = '(?:следующ\\p{L}*|след(?:\\.|(?!\\p{L})))';
const CLASS_WORD = '(?:\\s+(?:пар|заняти|семинар|практик|лекци|лаб)\\p{L}*)?';

const NEXT_CLASS = new RegExp(
  `${WORD_START}(?:к|на|до)\\s+${NEXT}\\s*(пар|заняти|семинар|практик|лекци|лаб)\\p{L}*`,
  'iu',
);
const DAY_AFTER_TOMORROW = new RegExp(`${WORD_START}${PREP}послезавтра${WORD_END}`, 'iu');
const TOMORROW = new RegExp(
  `${WORD_START}${PREP}(?:завтра${WORD_END}|завтрашн\\p{L}*${CLASS_WORD})`,
  'iu',
);
const TODAY = new RegExp(
  `${WORD_START}${PREP}(?:сегодня${WORD_END}|сегодняшн\\p{L}*${CLASS_WORD})`,
  'iu',
);
const IN_N = new RegExp(
  `${WORD_START}через\\s+(?:(\\d+|один|одну|два|две|три|четыре|пять|шесть|семь|десять)\\s+)?(дн\\p{L}*|день|недел\\p{L}*)`,
  'iu',
);
// «5 октября», «5-го окт.», «5 октября 2026», в чатах и слитно: «до 29сент».
// «март» стоит раньше «ма[йя]», иначе «марта» станет маем
const DAY_MONTH = new RegExp(
  `${WORD_START}${PREP}(\\d{1,2})(?:-?го)?\\s*(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр|янв|фев|мар|апр|авг|сен|окт|ноя|дек)\\p{L}*\\.?(?:\\s+(\\d{4}))?`,
  'iu',
);
// «на 29.09-06.10», «с 29.09 по 06.10» — срок по последней дате
const NUMERIC_RANGE = new RegExp(
  `${WORD_START}(?:(?:с|на)\\s+)?(?<![\\d.,])(\\d{1,2})\\.(\\d{1,2})\\s*(?:[-–—]|по)\\s*(\\d{1,2})\\.(\\d{1,2})(?![.\\d])`,
  'iu',
);
// «5.10», «05.10.26» — не часть длинного числа (1.2.3) и не дробь
const NUMERIC = new RegExp(
  `${WORD_START}${PREP}(?<![\\d.,])(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{4}|\\d{2}))?(?![.\\d])`,
  'giu',
);
// Перед числом стоит номер упражнения, страницы или пункта — значит это не дата: «упр. 3.12»
const EXERCISE_BEFORE = new RegExp(
  `${WORD_START}(?:№|номер\\p{L}*|упр\\p{L}*|стр|с|задач\\p{L}*|задани\\p{L}*|пункт\\p{L}*|п|§|параграф\\p{L}*|вариант\\p{L}*)\\.?\\s*$`,
  'iu',
);
// Все падежи: «в пятницу», «к пятнице», «до пятницы». Для среды — только формы дня недели,
// чтобы не поймать «среди»
const WEEKDAY = new RegExp(
  `${WORD_START}${PREP}(?:(${NEXT})\\s+)?(понедельник\\p{L}*|вторник\\p{L}*|сред(?:а|у|ы|е|ой)|четверг\\p{L}*|пятниц\\p{L}*|суббот\\p{L}*|воскресень\\p{L}*)${WORD_END}`,
  'iu',
);
// В чатах пишут «до пт» — но только с предлогом, иначе «ср» и «вт» ловятся где попало
const WEEKDAY_SHORT = new RegExp(
  `${WORD_START}(?:до|к|ко|в|во|на)\\s+(пн|вт|ср|чт|пт|сб|вс)\\.?${WORD_END}`,
  'iu',
);
const NEXT_WEEK = new RegExp(`${WORD_START}на\\s+${NEXT}\\s*недел\\p{L}*`, 'iu');
const END_OF_WEEK = new RegExp(`${WORD_START}(?:до|к)\\s+конц\\p{L}*\\s+недел\\p{L}*`, 'iu');
const END_OF_MONTH = new RegExp(`${WORD_START}(?:до|к)\\s+конц\\p{L}*\\s+месяц\\p{L}*`, 'iu');
const TIME = new RegExp(
  `(?:${WORD_START}(?:в|к|до)\\s+)?(?<![\\d:])([01]?\\d|2[0-3]):([0-5]\\d)(?![\\d:])`,
  'iu',
);

const NUMBER_WORDS: Record<string, number> = {
  один: 1,
  одну: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  десять: 10,
};
/** Месяц по первым трём буквам: «окт», «октября», «окт.» → 9. Нужен и для заголовков Telegram. */
export const MONTH_BY_PREFIX: Record<string, number> = {
  янв: 0,
  фев: 1,
  мар: 2,
  апр: 3,
  май: 4,
  мая: 4,
  июн: 5,
  июл: 6,
  авг: 7,
  сен: 8,
  окт: 9,
  ноя: 10,
  дек: 11,
};
const WEEKDAY_BY_PREFIX: Record<string, number> = {
  пон: 1,
  вто: 2,
  сре: 3,
  чет: 4,
  пят: 5,
  суб: 6,
  вос: 7,
};
const WEEKDAY_BY_SHORT: Record<string, number> = {
  пн: 1,
  вт: 2,
  ср: 3,
  чт: 4,
  пт: 5,
  сб: 6,
  вс: 7,
};

/**
 * Ищет срок в тексте. Относительные даты («завтра», «к пятнице») считаются от sentAt —
 * момента отправки сообщения, а не от «сейчас».
 */
export function extractDate(text: string, sentAt: Date): DateMatch | null {
  const dayAfter = (days: number) => toMinskDateKey(addDays(sentAt, days, { in: inMinsk }));
  const today = getISODay(sentAt, { in: inMinsk }); // 1 — понедельник
  const time = TIME.exec(text);
  const found = (match: RegExpExecArray, date: string, isGuess = false): DateMatch => ({
    hint: { type: 'date', date, time: time ? formatTime(time[1]!, time[2]!) : null, isGuess },
    phrases: time ? [match[0], time[0]] : [match[0]],
  });

  let match = NEXT_CLASS.exec(text);
  if (match) {
    const atLecture = match[1]!.toLowerCase() === 'лекци';
    return { hint: { type: 'next-class', ...(atLecture && { atLecture }) }, phrases: [match[0]] };
  }

  if ((match = DAY_AFTER_TOMORROW.exec(text))) return found(match, dayAfter(2));
  if ((match = TOMORROW.exec(text))) return found(match, dayAfter(1));
  if ((match = TODAY.exec(text))) return found(match, dayAfter(0));

  if ((match = IN_N.exec(text))) {
    const count = match[1] ? Number(match[1]) || NUMBER_WORDS[match[1].toLowerCase()] || 1 : 1;
    const weeks = match[2]!.toLowerCase().startsWith('недел');
    return found(match, dayAfter(weeks ? count * 7 : count));
  }

  if ((match = DAY_MONTH.exec(text))) {
    const month = MONTH_BY_PREFIX[match[2]!.toLowerCase().slice(0, 3)];
    const date =
      month === undefined ? null : resolveYear(Number(match[1]), month, match[3], sentAt);
    if (date) return found(match, date);
  }

  const isExerciseNumber = (index: number) =>
    EXERCISE_BEFORE.test(text.slice(Math.max(0, index - 12), index));

  if ((match = NUMERIC_RANGE.exec(text)) && !isExerciseNumber(match.index)) {
    const date = resolveYear(Number(match[3]), Number(match[4]) - 1, undefined, sentAt);
    if (date) return found(match, date);
  }

  for (const numeric of text.matchAll(NUMERIC)) {
    if (isExerciseNumber(numeric.index)) continue;
    const date = resolveYear(Number(numeric[1]), Number(numeric[2]) - 1, numeric[3], sentAt);
    if (date) return found(numeric, date);
  }

  if ((match = WEEKDAY.exec(text))) {
    const target = WEEKDAY_BY_PREFIX[match[2]!.toLowerCase().slice(0, 3)]!;
    return found(match, dayAfter(daysUntil(target, today, Boolean(match[1]))), Boolean(match[1]));
  }
  if ((match = WEEKDAY_SHORT.exec(text))) {
    const target = WEEKDAY_BY_SHORT[match[1]!.toLowerCase()]!;
    return found(match, dayAfter(daysUntil(target, today, false)));
  }

  if ((match = NEXT_WEEK.exec(text))) {
    const monday = startOfWeek(addDays(sentAt, 7, { in: inMinsk }), {
      weekStartsOn: 1,
      in: inMinsk,
    });
    return found(match, toMinskDateKey(monday), true);
  }
  if ((match = END_OF_WEEK.exec(text))) return found(match, dayAfter(7 - today));
  if ((match = END_OF_MONTH.exec(text))) {
    return found(match, toMinskDateKey(endOfMonth(sentAt, { in: inMinsk })));
  }

  // Только время: «сдать до 23:59» — сегодня, а если это время уже прошло — завтра
  if (time) {
    const at = formatTime(time[1]!, time[2]!);
    const now = format(sentAt, 'HH:mm', { in: inMinsk });
    return {
      hint: { type: 'date', date: dayAfter(at > now ? 0 : 1), time: at, isGuess: false },
      phrases: [time[0]],
    };
  }
  return null;
}

/** Сколько дней до ближайшего такого дня недели. «В пятницу», сказанное в пятницу, — через неделю. */
function daysUntil(target: number, today: number, next: boolean): number {
  let days = target - today;
  if (days <= 0) days += 7;
  // «в следующую пятницу», сказанное в понедельник, — скорее пятница следующей недели
  if (next && target > today) days += 7;
  return days;
}

/**
 * Год для «5 октября» без года. В StudyPlan прошедшая дата всегда уезжала на следующий год;
 * здесь — только если она больше чем на 60 дней в прошлом (иначе это просто просрочка).
 */
function resolveYear(
  day: number,
  month: number,
  explicitYear: string | undefined,
  sentAt: Date,
): string | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  let year = Number(toMinskDateKey(sentAt).slice(0, 4));
  if (explicitYear) {
    year = explicitYear.length === 2 ? 2000 + Number(explicitYear) : Number(explicitYear);
  }

  const key = (y: number) =>
    `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const sixtyDaysAgo = toMinskDateKey(addDays(sentAt, -60, { in: inMinsk }));
  if (!explicitYear && key(year) < sixtyDaysAgo) year += 1;

  // 31.02 и подобного не бывает
  if (new Date(Date.UTC(year, month, day)).getUTCMonth() !== month) return null;
  return key(year);
}

function formatTime(hours: string, minutes: string): string {
  return `${hours.padStart(2, '0')}:${minutes}`;
}
