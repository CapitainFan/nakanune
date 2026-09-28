import { describe, expect, it } from 'vitest';
import type { TaskDto } from './schemas/task';
import { analyzeWorkload } from './workload';

type Task = Pick<TaskDto, 'id' | 'dueAt' | 'status' | 'archived' | 'priority'>;

const task = (id: string, dueAt: string | null, fields: Partial<Task> = {}): Task => ({
  id,
  dueAt,
  status: 'TODO',
  archived: false,
  priority: 'medium',
  ...fields,
});

const NOW = new Date('2026-10-01T09:00:00Z');

describe('analyzeWorkload', () => {
  it('день с 4 заданиями перегружен: начать важное заранее, простое сделать накануне', () => {
    const tasks = [
      task('a', '2026-10-05T09:00:00Z'),
      task('b', '2026-10-05T10:00:00Z', { priority: 'high' }),
      task('c', '2026-10-05T12:00:00Z'),
      task('d', '2026-10-05T14:00:00Z'),
    ];

    expect(analyzeWorkload(tasks, NOW)).toEqual([
      {
        date: '2026-10-05',
        score: 11, // 4 × 2 + 3 за важное
        level: 'medium',
        taskIds: ['a', 'b', 'c', 'd'],
        suggestions: [
          { type: 'start-early', taskId: 'b' },
          { type: 'do-day-before', taskId: 'a', date: '2026-10-04' },
        ],
      },
    ]);
  });

  it('два важных задания в один день — совет разбить на части, уровень high', () => {
    const tasks = [
      task('a', '2026-10-06T09:00:00Z', { priority: 'high' }),
      task('b', '2026-10-06T10:00:00Z', { priority: 'high' }),
      task('c', '2026-10-06T11:00:00Z'),
    ];
    const [day] = analyzeWorkload(tasks, NOW);
    expect(day?.level).toBe('high'); // 3 × 2 + 2 × 3 = 12
    expect(day?.suggestions).toContainEqual({ type: 'split' });
  });

  it('не считает сделанные, архивные, без срока и прошедшие дни', () => {
    const tasks = [
      task('done', '2026-10-05T09:00:00Z', { status: 'DONE' }),
      task('archived', '2026-10-05T09:00:00Z', { archived: true }),
      task('undated', null),
      ...['p1', 'p2', 'p3', 'p4'].map((id) => task(id, '2026-09-29T09:00:00Z')),
    ];
    expect(analyzeWorkload(tasks, NOW)).toEqual([]);
  });

  it('группирует по дню по Минску', () => {
    // 21:30 UTC 4 октября — это уже 5 октября по Минску
    const tasks = ['a', 'b', 'c', 'd'].map((id) => task(id, '2026-10-04T21:30:00Z'));
    expect(analyzeWorkload(tasks, NOW)[0]?.date).toBe('2026-10-05');
  });
});
