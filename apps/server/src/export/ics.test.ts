// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: tests/exportIcs.test.js (node:test → vitest). Последние тесты — новые.
import { describe, expect, it } from 'vitest';
import { buildCalendarIcs, escapeIcsText, foldIcsLine, formatIcsDate, type IcsTask } from './ics';

function makeTask(overrides: Partial<IcsTask> = {}): IcsTask {
  return {
    id: 'task_42',
    title: 'Math Assignment - Chapter 5',
    dueAt: new Date('2026-05-15T09:00:00.000Z'),
    dueAtIsGuess: false,
    status: 'TODO',
    summary: null,
    notes: 'Revise examples',
    subject: { name: 'Mathematics', shortCode: null },
    ...overrides,
  };
}

/** Склеивает свёрнутые строки обратно, как это делает календарь при чтении. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('formatIcsDate', () => {
  it('возвращает UTC-время в формате RFC 5545', () => {
    expect(formatIcsDate(new Date('2026-05-15T09:00:00.000Z'))).toBe('20260515T090000Z');
  });
});

describe('escapeIcsText', () => {
  it('экранирует спецсимволы и переводы строк', () => {
    expect(escapeIcsText('Math, notes; line 1\nline 2 \\ done')).toBe(
      'Math\\, notes\\; line 1\\nline 2 \\\\ done',
    );
  });
});

describe('buildCalendarIcs', () => {
  it('создаёт пустой календарь', () => {
    const output = buildCalendarIcs([]);
    expect(output).toMatch(/BEGIN:VCALENDAR/);
    expect(output).toMatch(/VERSION:2.0/);
    expect(output).toMatch(/END:VCALENDAR/);
    expect(output).not.toMatch(/BEGIN:VEVENT/);
  });

  it('создаёт событие на каждое задание со сроком', () => {
    const output = unfold(buildCalendarIcs([makeTask()]));
    expect(output).toMatch(/BEGIN:VEVENT/);
    expect(output).toMatch(/UID:task_42@nakanune/);
    expect(output).toMatch(/SUMMARY:Mathematics: Math Assignment - Chapter 5/);
    // Отличие от StudyPlan: событие заканчивается в момент дедлайна, а не начинается в нём
    expect(output).toMatch(/DTSTART:20260515T080000Z/);
    expect(output).toMatch(/DTEND:20260515T090000Z/);
    expect(output).toMatch(/DESCRIPTION:Предмет: Mathematics\\nЗаметки: Revise examples/);
    expect(output).toMatch(/END:VEVENT/);
  });

  it('пропускает задания без срока', () => {
    expect(buildCalendarIcs([makeTask({ dueAt: null })])).not.toMatch(/BEGIN:VEVENT/);
  });

  it('помечает сделанные задания и примерный срок', () => {
    const output = unfold(
      buildCalendarIcs([
        makeTask({
          status: 'DONE',
          dueAtIsGuess: true,
          subject: { name: 'Математический анализ', shortCode: 'МА' },
        }),
      ]),
    );
    expect(output).toContain('SUMMARY:✓ МА: Math Assignment - Chapter 5');
    expect(output).toContain('Срок примерный');
  });

  it('разделяет строки CRLF и сворачивает длинные до 75 байт', () => {
    const title = 'Решить задачи из сборника Демидовича: номера 1–25 и доказать теорему Ролля';
    const output = buildCalendarIcs([makeTask({ title })]);
    expect(output.endsWith('END:VCALENDAR\r\n')).toBe(true);
    for (const line of output.split('\r\n')) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
    expect(unfold(output)).toContain(title);
  });
});

describe('foldIcsLine', () => {
  it('не трогает короткие строки', () => {
    expect(foldIcsLine('SUMMARY:коротко')).toBe('SUMMARY:коротко');
  });

  it('режет по байтам и не разрывает кириллическую букву', () => {
    const line = `SUMMARY:${'я'.repeat(100)}`;
    const folded = foldIcsLine(line);
    for (const part of folded.split('\r\n')) {
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    }
    expect(unfold(folded)).toBe(line);
  });
});
