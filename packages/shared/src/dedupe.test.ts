import { describe, expect, it } from 'vitest';
import { dedupeSource, normalizeTitle } from './dedupe';

describe('normalizeTitle', () => {
  it('убирает регистр, ё, пунктуацию и лишние пробелы', () => {
    expect(normalizeTitle('  Решить №5, стр. 10!  ')).toBe('решить 5 стр 10');
    expect(normalizeTitle('Выучить ТЕОРЕМУ Ролля')).toBe(normalizeTitle('выучить теорему ролля'));
    expect(normalizeTitle('Прочёсть §3')).toBe('прочесть 3');
  });
});

describe('dedupeSource', () => {
  it('совпадает у заданий, которые отличаются только оформлением', () => {
    const a = dedupeSource({
      subjectId: 's1',
      title: 'Решить №5',
      dueAt: new Date('2026-10-05T09:00:00Z'),
    });
    const b = dedupeSource({
      subjectId: 's1',
      title: 'решить 5!',
      dueAt: new Date('2026-10-05T18:00:00Z'),
    });
    expect(a).toBe(b);
  });

  it('различает предметы и дни (день — по Минску)', () => {
    const base = { subjectId: 's1', title: 'Решить №5', dueAt: new Date('2026-10-05T12:00:00Z') };
    expect(dedupeSource(base)).not.toBe(dedupeSource({ ...base, subjectId: 's2' }));
    // 21:30 UTC — это уже 6 октября по Минску
    expect(dedupeSource(base)).not.toBe(
      dedupeSource({ ...base, dueAt: new Date('2026-10-05T21:30:00Z') }),
    );
  });

  it('работает без предмета и без срока', () => {
    expect(dedupeSource({ subjectId: null, title: 'Реферат', dueAt: null })).toBe('|реферат|');
  });
});
