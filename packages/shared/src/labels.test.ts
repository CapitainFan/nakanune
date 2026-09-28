import { describe, expect, it } from 'vitest';
import { extractLabels, labelColor } from './labels';

describe('extractLabels', () => {
  it('находит кириллические хэштеги и убирает их из заголовка', () => {
    expect(extractLabels('Решить №5 #срочно на #кр_2')).toEqual({
      cleanTitle: 'Решить №5 на',
      labels: ['срочно', 'кр_2'],
    });
  });

  it('без меток — заголовок как есть, повторы меток схлопываются', () => {
    expect(extractLabels('Прочитать §3')).toEqual({ cleanTitle: 'Прочитать §3', labels: [] });
    expect(extractLabels('#лаб задача #лаб').labels).toEqual(['лаб']);
  });
});

describe('labelColor', () => {
  it('одна метка — всегда один цвет из палитры', () => {
    expect(labelColor('срочно')).toBe(labelColor('срочно'));
    expect(labelColor('срочно')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
