// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: backend/controllers/csvDownload.controller.js — buildCalendarIcs, formatIcsDate, escapeIcsText.
import type { TaskStatus } from '@nakanune/shared';

export type IcsTask = {
  id: string;
  title: string;
  dueAt: Date | null;
  dueAtIsGuess: boolean;
  status: TaskStatus;
  summary: string | null;
  notes: string | null;
  subject: { name: string; shortCode: string | null } | null;
};

const HOUR_MS = 60 * 60 * 1000;

/** Экранирование текста по RFC 5545: обратный слэш, перевод строки, запятая, точка с запятой. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Время в UTC в формате iCalendar: 2026-05-15T09:00:00.000Z → 20260515T090000Z. */
export function formatIcsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * Свёртка строк по RFC 5545: строка длиннее 75 байт переносится как CRLF + пробел.
 * Считаем байты UTF-8 (кириллическая буква — 2 байта) и не режем символ пополам.
 * В StudyPlan свёртки не было — с русскими названиями строки быстро выходят за лимит.
 */
export function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let chunk = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    // Строка-продолжение начинается с пробела, поэтому ей остаётся 74 байта
    const limit = chunks.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      chunks.push(chunk);
      chunk = '';
      bytes = 0;
    }
    chunk += char;
    bytes += size;
  }
  chunks.push(chunk);
  return chunks.join('\r\n ');
}

export function buildCalendarIcs(tasks: IcsTask[], now = new Date()): string {
  const dtstamp = formatIcsDate(now);

  const events = tasks.flatMap((task) => {
    // Как в StudyPlan: задание без срока в календарь не попадает
    if (!task.dueAt) return [];
    return [
      'BEGIN:VEVENT',
      `UID:${task.id}@nakanune`,
      `DTSTAMP:${dtstamp}`,
      // В StudyPlan событие начиналось в момент дедлайна и шло час после него.
      // Здесь оно заканчивается в момент дедлайна — «успеть до».
      `DTSTART:${formatIcsDate(new Date(task.dueAt.getTime() - HOUR_MS))}`,
      `DTEND:${formatIcsDate(task.dueAt)}`,
      `SUMMARY:${escapeIcsText(eventTitle(task))}`,
      `DESCRIPTION:${escapeIcsText(eventDescription(task))}`,
      'END:VEVENT',
    ];
  });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nakanune//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Nakanune',
    // Подсказка приложениям, подписанным на календарь: перечитывать раз в час
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events,
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** «МА: Решить №5», у сделанного — «✓ МА: Решить №5». */
function eventTitle(task: IcsTask): string {
  const subject = task.subject?.shortCode ?? task.subject?.name;
  const title = subject ? `${subject}: ${task.title}` : task.title;
  return task.status === 'DONE' ? `✓ ${title}` : title;
}

function eventDescription(task: IcsTask): string {
  return [
    `Предмет: ${task.subject?.name ?? 'Без предмета'}`,
    task.dueAtIsGuess ? 'Срок примерный' : null,
    task.summary,
    task.notes ? `Заметки: ${task.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
