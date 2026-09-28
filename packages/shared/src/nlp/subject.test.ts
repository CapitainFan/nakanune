import { describe, expect, it } from 'vitest';
import { SUBJECTS } from './fixtures';
import { buildSubjectMatcher, findSubjectByName } from './subject';

const match = buildSubjectMatcher(SUBJECTS);
const subjectOf = (text: string) => match(text)?.subjectId ?? null;

describe('buildSubjectMatcher', () => {
  it('узнаёт предмет в другом падеже', () => {
    expect(subjectOf('ДЗ по алгебре')).toBe('alg');
    expect(subjectOf('коллоквиум по матану')).toBe('ma');
    expect(subjectOf('по мат анализу')).toBe('ma');
    expect(subjectOf('к семинару по математическому анализу')).toBe('ma');
    expect(subjectOf('№45 по геометрии')).toBe('geo');
    expect(subjectOf('лаба по методам программирования')).toBe('mp');
  });

  it('основа слова — не само слово: «плюс» — не «плюсы»', () => {
    expect(subjectOf('дз по плюсам')).toBe('lab');
    expect(subjectOf('плюс ещё задача')).toBeNull();
  });

  it('выбирает самое длинное совпадение', () => {
    // «прога» совпадает и с «программированию», но полное название практикума длиннее
    expect(subjectOf('Практикум по программированию: задача 3')).toBe('lab');
  });

  it('сокращения — только целым словом, с заглавными — с учётом регистра', () => {
    expect(subjectOf('МА: №1250')).toBe('ma');
    expect(subjectOf('англ: упр. 5')).toBe('en');
    expect(subjectOf('на англе диктант')).toBe('en');
    expect(subjectOf('ма, я задание не понял')).toBeNull();
    expect(subjectOf('манная каша')).toBeNull();
  });

  it('возвращает найденную фразу — её уберут из заголовка', () => {
    expect(match('Матан: к пятнице №5')).toEqual({ subjectId: 'ma', phrase: 'Матан' });
  });
});

describe('findSubjectByName', () => {
  it('сначала точное совпадение с названием или алиасом, потом поиск по тексту', () => {
    expect(findSubjectByName('Алгебра и теория чисел', SUBJECTS)).toBe('alg');
    expect(findSubjectByName('алгебра', SUBJECTS)).toBe('alg');
    expect(findSubjectByName('Мат. анализ', SUBJECTS)).toBe('ma');
    expect(findSubjectByName('Физика', SUBJECTS)).toBeNull();
  });
});
