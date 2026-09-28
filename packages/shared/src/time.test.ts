import { describe, expect, it } from 'vitest';
import {
  formatMinskDateTime,
  fromMinskDateKey,
  fromMinskInputValue,
  toMinskDateKey,
  toMinskInputValue,
} from './time';

describe('toMinskDateKey', () => {
  it('берёт день по Минску, а не по UTC', () => {
    // 21:30 UTC 5 октября = 00:30 по Минску 6 октября (UTC+3)
    expect(toMinskDateKey('2026-10-05T21:30:00Z')).toBe('2026-10-06');
    expect(toMinskDateKey(new Date('2026-10-05T20:59:00Z'))).toBe('2026-10-05');
  });
});

describe('fromMinskDateKey', () => {
  it('даёт полночь этого дня по Минску', () => {
    expect(fromMinskDateKey('2026-10-05').toISOString()).toBe('2026-10-04T21:00:00.000Z');
  });
});

describe('formatMinskDateTime', () => {
  it('показывает минское время', () => {
    expect(formatMinskDateTime('2026-10-05T20:59:00Z')).toBe('2026-10-05 23:59');
  });
});

describe('datetime-local по Минску (баг №8 из StudyPlan)', () => {
  it('в поле — минское время, а не UTC', () => {
    // toISOString().substring(0, 16) из StudyPlan дал бы «2026-10-05T20:59»
    expect(toMinskInputValue('2026-10-05T20:59:00Z')).toBe('2026-10-05T23:59');
  });

  it('из поля — тот же момент времени', () => {
    const iso = fromMinskInputValue('2026-10-05T23:59');
    expect(new Date(iso).toISOString()).toBe('2026-10-05T20:59:00.000Z');
    expect(toMinskInputValue(iso)).toBe('2026-10-05T23:59');
  });
});
