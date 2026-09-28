import { describe, expect, it } from 'vitest';
import { makeShortCode } from './shortCode';

describe('makeShortCode', () => {
  it('собирает код из первых букв слов, в том числе кириллических', () => {
    expect(makeShortCode('Математический анализ')).toBe('МА');
    expect(makeShortCode('Алгебра и теория чисел')).toBe('АиТЧ');
    expect(makeShortCode('История белорусской государственности')).toBe('ИБГ');
    expect(makeShortCode('Веб-дизайн')).toBe('ВД');
  });

  it('у названия из одного слова берёт первые 4 буквы', () => {
    expect(makeShortCode('Геометрия')).toBe('Геом');
    expect(makeShortCode('physics')).toBe('Phys');
  });

  it('не падает на названии без букв', () => {
    expect(makeShortCode('???')).toBe('???');
  });
});
