import { describe, expect, it } from 'vitest';
import { extractTasksHeuristic } from './extract';
import { SUBJECTS } from './fixtures';

// Понедельник, 28 сентября 2026, 12:00 по Минску
const sentAt = new Date('2026-09-28T09:00:00Z');
const extract = (text: string, wholeTextFallback = false) =>
  extractTasksHeuristic(text, { sentAt, subjects: SUBJECTS, wholeTextFallback });

const dateHint = (date: string) => ({ type: 'date', date, time: null, isGuess: false });

describe('extractTasksHeuristic', () => {
  it('предмет, срок и метка из одного сообщения', () => {
    expect(extract('Матан: к пятнице решить №1234–1240 из Демидовича #кр')).toEqual([
      {
        title: 'Решить №1234–1240 из Демидовича',
        subjectId: 'ma',
        due: dateHint('2026-10-02'),
        labels: ['кр'],
        priority: 'high', // «кр» — контрольная
        confidence: 70,
      },
    ]);
  });

  it('приветствие отдельно, задание отдельно', () => {
    const [task, ...rest] = extract('Всем привет! ДЗ по алгебре на 5.10: стр. 45 №3, 4 и 7');
    expect(rest).toEqual([]);
    expect(task).toMatchObject({
      title: 'Стр. 45 №3, 4 и 7',
      subjectId: 'alg',
      due: dateHint('2026-10-05'),
    });
  });

  it('убирает вводные слова, предмет и срок из заголовка', () => {
    expect(extract('Напоминаю, лаба по методам программирования до среды, сдавать в мудл')).toEqual(
      [
        expect.objectContaining({
          title: 'Лаба, сдавать в мудл',
          subjectId: 'mp',
          due: dateHint('2026-09-30'),
        }),
      ],
    );
  });

  it('номер упражнения не путает с датой', () => {
    expect(extract('Англ: упр. 3.12 и 3.13 к завтрашнему занятию')).toEqual([
      expect.objectContaining({
        title: 'Упр. 3.12 и 3.13',
        subjectId: 'en',
        due: dateHint('2026-09-29'),
      }),
    ]);
  });

  it('заголовок списка задаёт срок и предмет пунктам под ним', () => {
    const tasks = extract('ДЗ на пятницу:\n1) Геометрия — №45, 46\n2) Матан — прочитать §3');
    expect(tasks.map(({ title, subjectId, due }) => ({ title, subjectId, due }))).toEqual([
      { title: '№45, 46', subjectId: 'geo', due: dateHint('2026-10-02') },
      { title: 'Прочитать §3', subjectId: 'ma', due: dateHint('2026-10-02') },
    ]);
  });

  it('коллоквиум — важное, срок «через 2 недели»', () => {
    expect(extract('Коллоквиум по матану через 2 недели, вопросы в мудле')).toEqual([
      expect.objectContaining({
        title: 'Коллоквиум, вопросы в мудле',
        subjectId: 'ma',
        due: dateHint('2026-10-12'),
        priority: 'high',
      }),
    ]);
  });

  it('болтовню пропускает', () => {
    expect(extract('ок, спасибо')).toEqual([]);
    expect(extract('Кто идёт на физру сегодня?')).toEqual([]);
    expect(extract('+')).toEqual([]);
  });

  it('при ручной вставке без находок берёт весь текст одним заданием', () => {
    expect(extract('Презентация про Минск')).toEqual([]);
    expect(extract('Презентация про Минск', true)).toEqual([
      expect.objectContaining({ title: 'Презентация про Минск', subjectId: null, confidence: 20 }),
    ]);
  });
});
