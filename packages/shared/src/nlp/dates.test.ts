import { describe, expect, it } from 'vitest';
import { extractDate } from './dates';

// Понедельник, 28 сентября 2026, 12:00 по Минску
const MONDAY_NOON = new Date('2026-09-28T09:00:00Z');

const dateOf = (text: string, sentAt = MONDAY_NOON) => {
  const match = extractDate(text, sentAt);
  return match?.hint.type === 'date' ? match.hint.date : (match?.hint.type ?? null);
};

describe('extractDate', () => {
  it('сегодня, завтра, послезавтра — от даты отправки сообщения', () => {
    expect(dateOf('сдать сегодня')).toBe('2026-09-28');
    expect(dateOf('на завтра')).toBe('2026-09-29');
    expect(dateOf('к завтрашнему занятию')).toBe('2026-09-29');
    expect(dateOf('послезавтра')).toBe('2026-09-30');
    // 00:30 по Минску в понедельник (в UTC ещё воскресенье)
    expect(dateOf('завтра', new Date('2026-09-27T21:30:00Z'))).toBe('2026-09-29');
  });

  it('дни недели во всех падежах и сокращения с предлогом', () => {
    expect(dateOf('к пятнице')).toBe('2026-10-02');
    expect(dateOf('до пятницы')).toBe('2026-10-02');
    expect(dateOf('в среду')).toBe('2026-09-30');
    expect(dateOf('до пт')).toBe('2026-10-02');
    expect(dateOf('до воскресенья')).toBe('2026-10-04');
    // «в понедельник», сказанное в понедельник, — следующий понедельник
    expect(dateOf('в понедельник')).toBe('2026-10-05');
  });

  it('«в следующую среду» — через неделю и помечается как догадка', () => {
    const match = extractDate('к следующей среде', MONDAY_NOON);
    expect(match?.hint).toEqual({ type: 'date', date: '2026-10-07', time: null, isGuess: true });
  });

  it('кириллица: слова целиком, а не кусками', () => {
    // В JS \b не видит кириллицу — «среди» не должна стать средой
    expect(dateOf('решить три задачи среди этих')).toBeNull();
    expect(dateOf('завтрашний')).toBe('2026-09-29');
  });

  it('число и месяц словами', () => {
    expect(dateOf('до 5 октября')).toBe('2026-10-05');
    expect(dateOf('к 5-го окт.')).toBe('2026-10-05');
    // Недавняя прошедшая дата — это просрочка, а не следующий год
    expect(dateOf('до 1 сентября')).toBe('2026-09-01');
    // Давно прошедшая — следующий год
    expect(dateOf('до 15 января')).toBe('2027-01-15');
    expect(dateOf('31 февраля')).toBeNull();
  });

  it('числом через точку, но не номер упражнения', () => {
    expect(dateOf('на 5.10')).toBe('2026-10-05');
    expect(dateOf('до 05.10.26')).toBe('2026-10-05');
    expect(dateOf('упр. 3.12 и 3.13')).toBeNull();
    expect(dateOf('№ 5.10')).toBeNull();
    expect(dateOf('стр. 4.5')).toBeNull();
    expect(dateOf('пункт 1.2.3')).toBeNull();
  });

  it('через N дней и недель, следующая неделя', () => {
    expect(dateOf('через 2 дня')).toBe('2026-09-30');
    expect(dateOf('через неделю')).toBe('2026-10-05');
    expect(dateOf('через две недели')).toBe('2026-10-12');
    expect(extractDate('на следующей неделе', MONDAY_NOON)?.hint).toMatchObject({
      date: '2026-10-05',
      isGuess: true,
    });
  });

  it('«к следующей паре» оставляет расписанию', () => {
    expect(dateOf('к следующей паре')).toBe('next-class');
    expect(dateOf('на след. практику')).toBe('next-class');
  });

  it('время и фразы, которые потом уберутся из заголовка', () => {
    expect(extractDate('Решить №5 к пятнице до 18:00', MONDAY_NOON)).toEqual({
      hint: { type: 'date', date: '2026-10-02', time: '18:00', isGuess: false },
      phrases: ['к пятнице', 'до 18:00'],
    });
    // Только время: сегодня, а если оно уже прошло — завтра
    expect(extractDate('сдать до 23:59', MONDAY_NOON)?.hint).toMatchObject({ date: '2026-09-28' });
    expect(extractDate('сдать до 9:00', MONDAY_NOON)?.hint).toMatchObject({
      date: '2026-09-29',
      time: '09:00',
    });
  });

  it('нет даты — нет даты (в StudyPlan подставлялось «+7 дней»)', () => {
    expect(extractDate('прочитать главу про пределы', MONDAY_NOON)).toBeNull();
  });
});
