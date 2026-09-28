import { fromMinskDateTime } from '../time';
import { MONTH_BY_PREFIX } from './dates';

/** Сообщение из переписки. Автора разбираем, но дальше базы его не отправляем. */
export type ChatMessage = { author: string; sentAt: Date; text: string };

// Так Telegram Desktop копирует сообщения:
//   Иван Иванов, [25 сент. 2026 г., 14:06:06]:
//   текст
// У отредактированного в скобках время правки: «[23 сент. 2026 г., 14:01:11 (…14:01:13)]».
// Несколько сообщений одного автора подряд идут под одним заголовком.
// Пробелы бывают неразрывными: macOS ставит узкий U+202F между «2026» и «г.», поэтому
// SP — любой пробел, кроме перевода строки
const SP = '[^\\S\\r\\n]';
const HEADER = new RegExp(
  `^(.+?),${SP}\\[(\\d{1,2})${SP}([а-яё]+)\\.?${SP}(\\d{4})${SP}?г\\.,${SP}(\\d{1,2}):(\\d{2})(?::(\\d{2}))?(?:${SP}\\([^)\\]]*\\))?\\]:${SP}*$`,
  'gmu',
);

/**
 * Разбирает переписку, скопированную из Telegram. Не похоже на переписку — null,
 * и тогда текст разбирается как одно сообщение.
 * Время в заголовках — время устройства, то есть минское.
 */
export function parseTelegramTranscript(text: string): ChatMessage[] | null {
  const headers = [...text.matchAll(HEADER)];
  if (headers.length === 0) return null;

  return headers.flatMap((header, index) => {
    const [, author, day, monthWord, year, hours, minutes, seconds = '00'] = header;
    const month = MONTH_BY_PREFIX[monthWord!.toLowerCase().slice(0, 3)];
    if (month === undefined) return [];

    const start = header.index + header[0].length;
    const end = headers[index + 1]?.index ?? text.length;
    const body = text
      .slice(start, end)
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!body) return [];

    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${day!.padStart(2, '0')}`;
    const time = `${hours!.padStart(2, '0')}:${minutes}:${seconds}`;
    return [{ author: author!.trim(), sentAt: fromMinskDateTime(dateKey, time), text: body }];
  });
}
