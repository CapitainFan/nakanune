import { fromMinskDateTime } from '@nakanune/shared';
import ical, { type ParameterValue, type VEvent } from 'node-ical';
import { httpsGetText, missingIntermediate } from '../lib/tlsChain';

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
// Отметки модуля «Посещаемость» — это занятия, а не задания (в календаре edummf их больше
// трети событий)
const ATTENDANCE = /^\s*(?:посещаемость|attendance)/iu;
// Служебные слова Moodle вокруг названия: «Лабораторная №2 — срок сдачи», «Quiz 1 closes»
const MOODLE_WORDS =
  /\s*(?:[-—–:(]\s*)?(?:срок\s+сдачи|должно\s+быть\s+выполнено|закрыва\p{L}*|закрыти\p{L}*|is\s+due|closes|due)\s*\)?\s*/giu;

/**
 * Скачивает календарь по ссылке экспорта Moodle. В ссылке личный токен, поэтому в тексте
 * ошибок её нет — только причина.
 */
export async function fetchIcs(url: string): Promise<string> {
  let response: { status: number; text: string };
  try {
    response = await download(url);
  } catch (error) {
    throw new Error(`Moodle недоступен: ${networkReason(error)}`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Moodle ответил ошибкой ${response.status}`);
  }

  const { text } = response;
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
    if (!summary || OPENS.test(summary) || ATTENDANCE.test(summary) || !event.start) continue;

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

async function download(url: string): Promise<{ status: number; text: string }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return { status: response.status, text: await response.text() };
  } catch (error) {
    // Сервер не прислал промежуточный сертификат (так у edummf.bsu.by) — докачиваем его,
    // как браузер, и повторяем запрос
    if (causeCode(error) !== 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') throw error;
    let intermediate: string;
    try {
      intermediate = await missingIntermediate(new URL(url).host);
    } catch (chainError) {
      const reason = chainError instanceof Error ? chainError.message : String(chainError);
      throw new Error(
        `сервер не прислал сертификат издателя, а дозагрузить его не вышло: ${reason}`,
        {
          cause: { code: 'INCOMPLETE_CHAIN' },
        },
      );
    }
    return httpsGetText(url, {
      intermediate,
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_ICS_BYTES + 1,
    });
  }
}

function causeCode(error: unknown): string {
  if (!(error instanceof Error)) return '';
  const own = (error as { code?: unknown }).code;
  const cause = (error.cause as { code?: unknown } | undefined)?.code;
  return String(cause ?? own ?? '');
}

/**
 * Почему не удалось соединиться — по коду причины (fetch прячет её в error.cause).
 * Код и текст причины не содержат адреса, так что токен в сообщение не попадёт.
 */
function networkReason(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'не ответил за 20 секунд';
  const code = causeCode(error);
  if (code === 'INCOMPLETE_CHAIN' && error instanceof Error) return error.message;
  // Вместо TLS пришёл обычный текст — так отвечает VPN или прокси, который сам не достучался
  // до сайта (сайты БГУ бывают закрыты для зарубежных адресов)
  if (code === 'ERR_SSL_WRONG_VERSION_NUMBER' || code === 'EPROTO') {
    return 'защищённое соединение не установилось — похоже, мешает VPN или прокси. Выключи VPN или исключи edummf.bsu.by из него';
  }
  if (code.startsWith('ERR_TLS_CERT') || code.includes('CERT') || code.includes('VERIFY')) {
    return 'сертификат сайта не прошёл проверку';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return 'адрес не найден — нет интернета или DNS';
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return 'соединение сброшено';
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'сайт не отвечает';
  return code ? `ошибка сети (${code})` : 'ошибка сети';
}

function valueOf(value: ParameterValue | undefined): string | null {
  if (value === undefined) return null;
  return typeof value === 'string' ? value : value.val;
}

/** «Лабораторная работа №2 — срок сдачи» → «Лабораторная работа №2». Кавычки Moodle — тоже прочь. */
function cleanTitle(summary: string): string {
  const title = summary
    .replace(MOODLE_WORDS, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Кавычки снимаем, только если они обрамляют всё название: в «Задания по теме «Оператор
  // switch»» закрывающая кавычка — часть названия
  const quoted = /^«([^«»]*)»$/u.exec(title) ?? /^"([^"]*)"$/u.exec(title);
  return (quoted ? quoted[1]!.trim() : title).slice(0, 200);
}
