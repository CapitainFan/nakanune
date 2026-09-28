import { fromMinskDateTime } from '@nakanune/shared';
import ical, { type ParameterValue, type VEvent } from 'node-ical';

/** Событие календаря Moodle, из которого получится задание. */
export type MoodleEvent = {
  uid: string;
  title: string;
  /** Курс из CATEGORIES — по нему узнаём предмет. */
  course: string | null;
  description: string | null;
  /**
   * Срок: DTSTART (у дедлайнов в Moodle начало и конец события совпадают). У события на весь
   * день — 23:59 по Минску этого дня.
   */
  dueAt: Date;
  /** Событие на весь день, без времени. */
  allDay: boolean;
  /** Когда событие меняли в Moodle — для «сырого сообщения». */
  modifiedAt: Date | null;
};

const MAX_ICS_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

// «Тест открывается», «Assignment opens» — это не срок, а начало; такие события пропускаем
const OPENS = /(?:открыва\p{L}*|открыти\p{L}*|начало|\bopens\b|\bstarts\b)/iu;
// Служебные слова Moodle вокруг названия: «Лабораторная №2 — срок сдачи», «Quiz 1 closes»
const MOODLE_WORDS =
  /\s*(?:[-—–:(]\s*)?(?:срок\s+сдачи|должно\s+быть\s+выполнено|закрыва\p{L}*|закрыти\p{L}*|is\s+due|closes|due)\s*\)?\s*/giu;

/**
 * Скачивает календарь по ссылке экспорта Moodle. В ссылке личный токен, поэтому в тексте
 * ошибок её нет — только причина.
 */
export async function fetchIcs(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'не ответил за 20 секунд'
        : 'недоступен';
    throw new Error(`Moodle ${reason}`);
  }
  if (!response.ok) throw new Error(`Moodle ответил ошибкой ${response.status}`);

  const text = await response.text();
  if (text.length > MAX_ICS_BYTES) throw new Error('Календарь слишком большой (больше 5 МБ)');
  // С устаревшим токеном Moodle отдаёт не календарь, а страницу с ошибкой
  if (!text.includes('BEGIN:VCALENDAR')) {
    throw new Error('По ссылке не календарь — возможно, ссылка устарела. Получи новую в Moodle');
  }
  return text;
}

/** Разбирает .ics из Moodle: только события-сроки, без «открывается». */
export function parseMoodleIcs(text: string): MoodleEvent[] {
  const events: MoodleEvent[] = [];
  for (const component of Object.values(ical.sync.parseICS(text))) {
    if (component?.type !== 'VEVENT') continue;
    const event = component as VEvent;
    const summary = valueOf(event.summary);
    if (!summary || OPENS.test(summary) || !event.start) continue;

    const title = cleanTitle(summary);
    const allDay = event.datetype === 'date';
    events.push({
      uid: event.uid,
      title: title || summary,
      course: event.categories?.map((category) => category.trim()).find(Boolean) ?? null,
      description: valueOf(event.description)?.trim().slice(0, 2000) || null,
      dueAt: allDay ? endOfDay(event.start) : new Date(event.start.getTime()),
      allDay,
      modifiedAt: event.lastmodified ? new Date(event.lastmodified.getTime()) : null,
    });
  }
  return events.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/**
 * День без времени node-ical отдаёт полночью в часовом поясе сервера — берём из неё
 * календарную дату и ставим 23:59 по Минску, где бы сервер ни работал.
 */
function endOfDay(date: Date): Date {
  const key = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
  return fromMinskDateTime(key, '23:59');
}

function valueOf(value: ParameterValue | undefined): string | null {
  if (value === undefined) return null;
  return typeof value === 'string' ? value : value.val;
}

/** «Лабораторная работа №2 — срок сдачи» → «Лабораторная работа №2». Кавычки Moodle — тоже прочь. */
function cleanTitle(summary: string): string {
  return summary
    .replace(MOODLE_WORDS, ' ')
    .replace(/^[\s«"„]+|[\s»"“]+$/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 200);
}
