import { describe, expect, it } from 'vitest';
import { formatMinskDateTime, toMinskDateKey } from './time';

describe('toMinskDateKey', () => {
  it('берёт день по Минску, а не по UTC', () => {
    // 21:30 UTC 5 октября = 00:30 по Минску 6 октября (UTC+3)
    expect(toMinskDateKey('2026-10-05T21:30:00Z')).toBe('2026-10-06');
    expect(toMinskDateKey(new Date('2026-10-05T20:59:00Z'))).toBe('2026-10-05');
  });
});

describe('formatMinskDateTime', () => {
  it('показывает минское время', () => {
    expect(formatMinskDateTime('2026-10-05T20:59:00Z')).toBe('2026-10-05 23:59');
  });
});
