import { describe, expect, it } from 'vitest';
import { summarize } from './summary';
import { makeSubject, makeTask } from './test-factories';

// Четверг, 1 октября 2026, 12:00 по Минску
const NOW = new Date('2026-10-01T09:00:00Z');

describe('summarize', () => {
  const subjects = [
    makeSubject('ma', 'Математический анализ'),
    makeSubject('en', 'Английский язык'),
  ];

  it('считает сегодня, неделю и просроченное', () => {
    const tasks = [
      makeTask('tonight', { subjectId: 'ma', dueAt: '2026-10-01T20:00:00Z' }),
      makeTask('saturday', { subjectId: 'ma', dueAt: '2026-10-03T09:00:00Z' }),
      makeTask('monday', { subjectId: 'en', dueAt: '2026-10-05T09:00:00Z' }),
      makeTask('late', { dueAt: '2026-09-30T09:00:00Z' }),
    ];
    expect(summarize(tasks, subjects, NOW)).toEqual({
      today: 1,
      week: 3,
      overdue: 1,
      topSubject: 'Математический анализ',
    });
  });

  it('основной предмет — по заданиям недели, а не через месяц', () => {
    const tasks = [
      makeTask('en1', { subjectId: 'en', dueAt: '2026-10-02T09:00:00Z' }),
      ...['1', '2', '3'].map((n) =>
        makeTask(`ma${n}`, { subjectId: 'ma', dueAt: '2026-11-15T09:00:00Z' }),
      ),
    ];
    expect(summarize(tasks, subjects, NOW).topSubject).toBe('Английский язык');
  });

  it('не считает сделанное, архив и «Входящие»', () => {
    const due = '2026-10-02T09:00:00Z';
    const tasks = [
      makeTask('done', { dueAt: due, status: 'DONE' }),
      makeTask('archived', { dueAt: due, archived: true }),
      makeTask('inbox', { dueAt: due, status: 'INBOX' }),
    ];
    expect(summarize(tasks, subjects, NOW)).toEqual({
      today: 0,
      week: 0,
      overdue: 0,
      topSubject: null,
    });
  });
});
