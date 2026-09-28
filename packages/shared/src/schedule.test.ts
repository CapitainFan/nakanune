import { describe, expect, it } from 'vitest';
import { classesOn, weekParityOf } from './schedule';

// Неделя с 1 сентября 2026 — первая (1 сентября — вторник, неделя 31.08–06.09)
const FIRST_WEEK = '2026-09-01';

describe('weekParityOf', () => {
  it('первая неделя — та, где 1 сентября, дальше через одну', () => {
    expect(weekParityOf('2026-08-31', FIRST_WEEK)).toBe(1);
    expect(weekParityOf('2026-09-06', FIRST_WEEK)).toBe(1);
    expect(weekParityOf('2026-09-07', FIRST_WEEK)).toBe(2);
    // Подтверждено: 28.09–04.10 — первая неделя
    expect(weekParityOf('2026-09-28', FIRST_WEEK)).toBe(1);
    expect(weekParityOf('2026-10-04', FIRST_WEEK)).toBe(1);
    expect(weekParityOf('2026-10-05', FIRST_WEEK)).toBe(2);
  });

  it('считает по Минску: 21:30 UTC воскресенья — это уже понедельник', () => {
    // 27.09 21:30 UTC = 28.09 00:30 по Минску — начало первой недели, а не конец второй
    expect(weekParityOf(new Date('2026-09-27T21:30:00Z'), FIRST_WEEK)).toBe(1);
  });
});

describe('classesOn', () => {
  type Lesson = {
    id: string;
    weekday: number;
    weekParity: 1 | 2 | null;
    validFrom: string | null;
    startTime: string;
  };
  // По умолчанию — четверг, 11:15, каждую неделю
  const lesson = (id: string, fields: Partial<Lesson> = {}): Lesson => ({
    id,
    weekday: 4,
    weekParity: null,
    validFrom: null,
    startTime: '11:15',
    ...fields,
  });

  const classes = [
    lesson('web', { weekParity: 1 }),
    lesson('intro', { weekParity: 2 }),
    lesson('geometry', { startTime: '08:15' }),
    lesson('psychology', { weekday: 6, validFrom: '2026-10-10' }),
  ];

  it('учитывает день недели, чётность и сортирует по времени', () => {
    // 01.10.2026 — четверг первой недели
    expect(classesOn(classes, '2026-10-01', FIRST_WEEK).map((c) => c.id)).toEqual([
      'geometry',
      'web',
    ]);
    // 08.10.2026 — четверг второй недели
    expect(classesOn(classes, '2026-10-08', FIRST_WEEK).map((c) => c.id)).toEqual([
      'geometry',
      'intro',
    ]);
  });

  it('не показывает пару раньше даты «с …»', () => {
    expect(classesOn(classes, '2026-10-03', FIRST_WEEK)).toEqual([]);
    expect(classesOn(classes, '2026-10-10', FIRST_WEEK).map((c) => c.id)).toEqual(['psychology']);
  });
});
