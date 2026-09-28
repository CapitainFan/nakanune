import { describe, expect, it } from 'vitest';
import { groupByDeadline, groupBySubject } from './grouping';
import { makeSubject, makeTask } from './test-factories';

// Четверг, 1 октября 2026, 12:00 по Минску
const NOW = new Date('2026-10-01T09:00:00Z');

const summary = (groups: ReturnType<typeof groupByDeadline>) =>
  Object.fromEntries(groups.map((group) => [group.key, group.tasks.map((task) => task.id)]));

describe('groupByDeadline', () => {
  it('раскладывает по срокам; просроченное и без срока — отдельно', () => {
    const tasks = [
      makeTask('later', { dueAt: '2026-10-20T09:00:00Z' }),
      makeTask('overdue', { dueAt: '2026-09-30T10:00:00Z' }),
      makeTask('tonight', { dueAt: '2026-10-01T20:00:00Z' }),
      makeTask('sunday', { dueAt: '2026-10-04T09:00:00Z' }),
      makeTask('tuesday', { dueAt: '2026-10-06T09:00:00Z' }),
      makeTask('undated'),
      makeTask('done', { dueAt: '2026-10-02T09:00:00Z', status: 'DONE' }),
    ];

    expect(summary(groupByDeadline(tasks, NOW))).toEqual({
      overdue: ['overdue'],
      soon: ['tonight', 'sunday'],
      week: ['tuesday'],
      later: ['later'],
      undated: ['undated'],
      done: ['done'],
    });
  });

  it('считает дни по Минску', () => {
    // 21:30 UTC 4 октября — уже понедельник 5 октября по Минску: 4 дня, а не 3
    const tasks = [makeTask('monday', { dueAt: '2026-10-04T21:30:00Z' })];
    expect(summary(groupByDeadline(tasks, NOW))).toEqual({ week: ['monday'] });
  });

  it('пустые группы не возвращает', () => {
    expect(groupByDeadline([], NOW)).toEqual([]);
  });
});

describe('groupBySubject', () => {
  it('по алфавиту, «Без предмета» — в конце, сделанное — отдельно', () => {
    const subjects = [makeSubject('geo', 'Геометрия'), makeSubject('alg', 'Алгебра')];
    const tasks = [
      makeTask('g1', { subjectId: 'geo' }),
      makeTask('a1', { subjectId: 'alg' }),
      makeTask('none'),
      // Предмет удалён: в StudyPlan сюда подставился бы первый предмет из списка
      makeTask('ghost', { subjectId: 'deleted' }),
      makeTask('g2', { subjectId: 'geo', status: 'DONE' }),
    ];

    const groups = groupBySubject(tasks, subjects);
    expect(groups.map((group) => group.title)).toEqual([
      'Алгебра',
      'Геометрия',
      'Без предмета',
      'Сделано',
    ]);
    expect(groups[2]?.tasks.map((task) => task.id)).toEqual(['none', 'ghost']);
  });
});
