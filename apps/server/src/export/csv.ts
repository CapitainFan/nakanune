// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: backend/controllers/csvDownload.controller.js — downloadData.
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  formatMinskDateTime,
  type Priority,
  type TaskStatus,
} from '@nakanune/shared';

type Cell = string | number | null | undefined;

export type CsvTask = {
  id: string;
  title: string;
  dueAt: Date | null;
  dueAtIsGuess: boolean;
  status: TaskStatus;
  priority: Priority;
  confidenceScore: number;
  labels: string[];
  archived: boolean;
  summary: string | null;
  notes: string | null;
  subject: { name: string } | null;
};

/**
 * Разделитель — точка с запятой: Excel с русскими региональными настройками делит
 * столбцы по «;», и файл с запятыми открылся бы одной колонкой.
 */
const DELIMITER = ';';

/**
 * Экранирование ячейки по RFC 4180 — для каждого поля. В StudyPlan в кавычки брались
 * только заметки, и запятая в названии задания ломала файл (баг №11).
 */
export function escapeCsvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // CSV-инъекция: ячейку, которая начинается с = + - @, Excel выполнит как формулу.
  // Названия заданий будут приходить из чужих сообщений в Telegram — гасим апострофом.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";,\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** BOM в начале — чтобы Excel прочитал файл как UTF-8, иначе кириллица превратится в мусор. */
export function toCsv(rows: Cell[][]): string {
  const body = rows.map((row) => row.map(escapeCsvCell).join(DELIMITER)).join('\r\n');
  return `\uFEFF${body}\r\n`;
}

export function buildTasksCsv(tasks: CsvTask[]): string {
  const header = [
    'ID',
    'Предмет',
    'Задание',
    'Срок (Минск)',
    'Срок примерный',
    'Статус',
    'Приоритет',
    'Уверенность',
    'Метки',
    'В архиве',
    'Саммари',
    'Заметки',
  ];
  const rows = tasks.map((task) => [
    task.id,
    task.subject?.name ?? 'Без предмета',
    task.title,
    // В StudyPlan здесь была сырая UTC-строка из базы
    task.dueAt ? formatMinskDateTime(task.dueAt) : '',
    task.dueAtIsGuess ? 'да' : 'нет',
    STATUS_LABELS[task.status],
    PRIORITY_LABELS[task.priority],
    task.confidenceScore,
    task.labels.join(' '),
    task.archived ? 'да' : 'нет',
    task.summary,
    task.notes,
  ]);
  return toCsv([header, ...rows]);
}
