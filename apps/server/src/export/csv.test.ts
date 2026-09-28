import { describe, expect, it } from 'vitest';
import { buildTasksCsv, escapeCsvCell, type CsvTask } from './csv';

describe('escapeCsvCell', () => {
  it('берёт в кавычки поля с разделителями, кавычками и переводами строк', () => {
    // Баг №11 из StudyPlan: запятая в названии ломала строку CSV
    expect(escapeCsvCell('Решить №5, №6')).toBe('"Решить №5, №6"');
    expect(escapeCsvCell('до пятницы; сдать')).toBe('"до пятницы; сдать"');
    expect(escapeCsvCell('сдать в "Moodle"')).toBe('"сдать в ""Moodle"""');
    expect(escapeCsvCell('строка 1\nстрока 2')).toBe('"строка 1\nстрока 2"');
    expect(escapeCsvCell('просто текст')).toBe('просто текст');
  });

  it('обезвреживает формулы (CSV-инъекция), но не трогает числа', () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil.example")')).toBe(
      `"'=HYPERLINK(""http://evil.example"")"`,
    );
    expect(escapeCsvCell('+7 задач')).toBe("'+7 задач");
    expect(escapeCsvCell(-5)).toBe('-5');
  });

  it('пустое значение — пустая ячейка', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});

describe('buildTasksCsv', () => {
  const task: CsvTask = {
    id: 't1',
    title: 'Решить №5, №6',
    dueAt: new Date('2026-10-05T20:59:00Z'),
    dueAtIsGuess: false,
    status: 'TODO',
    priority: 'high',
    confidenceScore: 90,
    labels: ['срочно', 'кр'],
    archived: false,
    summary: null,
    notes: 'Сдать в "Moodle"',
    subject: { name: 'Математический анализ' },
  };

  it('BOM, «;», CRLF, срок по Минску, русские статусы', () => {
    const csv = buildTasksCsv([task]);
    expect(csv.startsWith('\uFEFF')).toBe(true);

    const [header, row, rest] = csv.slice(1).split('\r\n');
    expect(header).toBe(
      'ID;Предмет;Задание;Срок (Минск);Срок примерный;Статус;Приоритет;Уверенность;Метки;В архиве;Саммари;Заметки',
    );
    expect(row).toBe(
      't1;Математический анализ;"Решить №5, №6";2026-10-05 23:59;нет;К выполнению;высокий;90;срочно кр;нет;;"Сдать в ""Moodle"""',
    );
    expect(rest).toBe('');
  });

  it('задание без предмета и срока', () => {
    const [, row] = buildTasksCsv([{ ...task, subject: null, dueAt: null }]).split('\r\n');
    expect(row).toContain(';Без предмета;');
    expect(row).toContain(';"Решить №5, №6";;нет;');
  });
});
