import { describe, expect, it } from 'vitest';
import { resolveDue } from './due';
import { SCHEDULE } from './fixtures';

// Понедельник, 28 сентября 2026, 12:00 по Минску
const MONDAY_NOON = new Date('2026-09-28T09:00:00Z');
const iso = (result: { dueAt: Date | null }) => result.dueAt?.toISOString() ?? null;

describe('resolveDue', () => {
  const friday = { type: 'date', date: '2026-10-02', time: null, isGuess: false } as const;

  it('«к пятнице» — к началу первой пятничной пары по предмету', () => {
    // 08:15 по Минску
    expect(iso(resolveDue(friday, 'ma', MONDAY_NOON, SCHEDULE))).toBe('2026-10-02T05:15:00.000Z');
  });

  it('пары в тот день нет или предмет неизвестен — 23:59', () => {
    expect(iso(resolveDue(friday, 'alg', MONDAY_NOON, SCHEDULE))).toBe('2026-10-02T20:59:00.000Z');
    expect(iso(resolveDue(friday, null, MONDAY_NOON, null))).toBe('2026-10-02T20:59:00.000Z');
  });

  it('названное время важнее расписания', () => {
    const hint = { ...friday, time: '18:00' };
    expect(iso(resolveDue(hint, 'ma', MONDAY_NOON, SCHEDULE))).toBe('2026-10-02T15:00:00.000Z');
  });

  it('«к следующей паре» — ближайшая практика после отправки сообщения, не лекция', () => {
    const next = { type: 'next-class' } as const;
    // В понедельник в 12:00 ближайшая пара матана — лекция в 13:00, а практика — в среду в 11:15
    expect(iso(resolveDue(next, 'ma', MONDAY_NOON, SCHEDULE))).toBe('2026-09-30T08:15:00.000Z');
    // Среда, 12:00: практика уже прошла — следующая в пятницу в 08:15
    const wednesday = new Date('2026-09-30T09:00:00Z');
    expect(iso(resolveDue(next, 'ma', wednesday, SCHEDULE))).toBe('2026-10-02T05:15:00.000Z');
    // Предмет неизвестен — срок неизвестен
    expect(resolveDue(next, null, MONDAY_NOON, SCHEDULE)).toEqual({ dueAt: null, isGuess: false });
  });

  it('«к следующей лекции» — лекция', () => {
    const lecture = { type: 'next-class', atLecture: true } as const;
    expect(iso(resolveDue(lecture, 'ma', MONDAY_NOON, SCHEDULE))).toBe('2026-09-28T10:00:00.000Z');
  });

  it('у предмета только лекции — любая его пара', () => {
    const lecturesOnly = {
      ...SCHEDULE,
      classes: SCHEDULE.classes.filter((lesson) => lesson.kind === 'LECTURE'),
    };
    const next = { type: 'next-class' } as const;
    expect(iso(resolveDue(next, 'ma', MONDAY_NOON, lecturesOnly))).toBe('2026-09-28T10:00:00.000Z');
  });
});
