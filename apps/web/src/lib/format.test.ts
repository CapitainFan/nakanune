import { describe, expect, it } from 'vitest';
import { formatDay, formatDue } from './format';

// Четверг, 1 октября 2026, 12:00 по Минску
const NOW = new Date('2026-10-01T09:00:00Z');

describe('formatDue', () => {
  it('сегодня / завтра / вчера и минское время', () => {
    expect(formatDue('2026-10-01T20:59:00Z', NOW)).toBe('сегодня, 23:59');
    expect(formatDue('2026-10-02T05:15:00Z', NOW)).toBe('завтра, 08:15');
    expect(formatDue('2026-09-30T10:00:00Z', NOW)).toBe('вчера, 13:00');
  });

  it('дальше — дата: «9 окт., 23:59»', () => {
    expect(formatDue('2026-10-09T20:59:00Z', NOW)).toBe('9 окт., 23:59');
  });
});

describe('formatDay', () => {
  it('короткий день недели и дата по-русски', () => {
    expect(formatDay('2026-10-09T09:00:00Z')).toBe('пт, 9 октября');
  });
});
