import { describe, expect, it } from 'vitest';
import type { DueHint } from './dates';
import { extractTasksFromMessages, extractTasksHeuristic, isQuestion, linksIn } from './extract';
import { SUBJECTS } from './fixtures';
import { parseTelegramTranscript } from './transcript';

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

  it('срок и предмет без признака задания — не задание', () => {
    expect(extract('В пятницу пары по матану не будет')).toEqual([]);
  });

  it('при ручной вставке без находок берёт весь текст одним заданием', () => {
    expect(extract('Фото с экскурсии для стенгазеты')).toEqual([]);
    expect(extract('Фото с экскурсии для стенгазеты', true)).toEqual([
      expect.objectContaining({
        title: 'Фото с экскурсии для стенгазеты',
        subjectId: null,
        confidence: 20,
      }),
    ]);
  });
});

describe('isQuestion и linksIn', () => {
  it('вопрос — со знаком вопроса или с вопросительного слова', () => {
    expect(isQuestion('А че по геоме')).toBe(true);
    expect(isQuestion('Что по проге на завтра')).toBe(true);
    expect(isQuestion('Когда сдавать лабу?')).toBe(true);
    expect(isQuestion('Решить №5 к пятнице')).toBe(false);
  });

  it('ссылки — только http(s), без хвостовой пунктуации', () => {
    expect(linksIn('см. https://example.com/a?b=1. и pr-cy.ru, javascript:alert(1)')).toEqual([
      'https://example.com/a?b=1',
    ]);
  });
});

// Настоящие переписки из учебного чата (скопированы из Telegram Desktop, имена изменены)
const chat = (text: string) => parseTelegramTranscript(text)!;
const run = (text: string) =>
  extractTasksFromMessages(chat(text), { subjects: SUBJECTS }).map(({ message, task }) => ({
    at: message.sentAt.toISOString(),
    title: task.title,
    subjectId: task.subjectId,
    due: task.due,
    priority: task.priority,
  }));
const day = (date: string, isGuess = false): DueHint => ({
  type: 'date',
  date,
  time: null,
  isGuess,
});
const NEXT_CLASS: DueHint = { type: 'next-class' };

describe('extractTasksFromMessages: настоящие чаты', () => {
  it('болтовню пропускает, «на будущее» и «если хочешь» — низкий приоритет, вопрос даёт предмет', () => {
    const tasks = run(`Миша Орлов, [25 сент. 2026\u202fг., 14:06:06]:
Я свою мышь в универе забыл


Аня Смирнова, [25 сент. 2026\u202fг., 14:06:24]:
Когда конкретно


Миша Орлов, [25 сент. 2026\u202fг., 14:06:38]:
На 3 паре, Я уже еду забирать


Я её в 146 оставил


Саша Ким, [28 сент. 2026\u202fг., 12:37:40]:
Найти сайт определитель cms - 10 сайтов связных с кис БГУ - в ворд результат на каким cms написаны эти сайты


Туда же где графики


pr-cy.ru


Установить joomla ( хотя бы попробовать ) это на будущее


Лёша, [28 сент. 2026\u202fг., 14:48:15]:
Что по проге на завтра


Аня Смирнова, [28 сент. 2026\u202fг., 14:48:58]:
5 заданий тех из классной работы, на 29.09-06.10 до 6 октября плюс всякие доп задачи есть если хочешь


вроде еще какое-то есть там срок до 29сент посмотри короче`);

    expect(tasks.map(({ at, ...task }) => task)).toEqual([
      {
        title:
          'Найти сайт определитель cms - 10 сайтов связных с кис БГУ - в ворд результат на каким cms написаны эти сайты',
        subjectId: null,
        due: null,
        priority: 'medium',
      },
      {
        title: 'Установить joomla (хотя бы попробовать)',
        subjectId: null,
        due: null,
        priority: 'low',
      },
      // Предмет — из вопроса «Что по проге», срок — свой: из диапазона берётся «до 6 октября»
      {
        title: '5 заданий тех из классной работы',
        subjectId: 'mp',
        due: day('2026-10-06'),
        priority: 'medium',
      },
      {
        title: 'Всякие доп задачи есть если хочешь',
        subjectId: 'mp',
        due: day('2026-10-06'),
        priority: 'low',
      },
      {
        title: 'Еще какое-то есть там срок посмотри',
        subjectId: 'mp',
        due: day('2026-09-29'),
        priority: 'medium',
      },
    ]);
  });

  it('заголовок «ДЗ», пункты списка без пробела, дедлайн в конце, ссылки — не задания', () => {
    const tasks = run(`Аня Смирнова, [25 сент. 2026\u202fг., 11:25:46]:
ДЗ 
1)квентор сверстать по образцу из книги
2) Квентор new, редизайн квентора
ДЕДЛАЙН  09.10!


https://developer.mozilla.org/ru/docs/Web/CSS/Reference/...


https://javarush.com/quests/lectures/ru.javarush.web.core.lecture.level03.lecture02?post=full#discussion#1`);

    expect(tasks.map(({ title, due }) => ({ title, due }))).toEqual([
      { title: 'Квентор сверстать по образцу из книги', due: day('2026-10-09') },
      { title: 'Квентор new, редизайн квентора', due: day('2026-10-09') },
    ]);
  });

  it('вопрос «А че по геоме» задаёт предмет ответу, но только в течение часа', () => {
    const question = `Лёша, [23 сент. 2026\u202fг., 14:01:11 (23 сент. 2026\u202fг., 14:01:13)]:
А че по геоме`;
    const answer = (time: string) => `Аня Смирнова, [23 сент. 2026\u202fг., ${time}]:
422-455 задачи


Сборник тот же`;

    expect(run(`${question}\n\n\n${answer('14:02:05')}`)).toEqual([
      {
        at: '2026-09-23T11:02:05.000Z',
        title: '422-455 задачи',
        subjectId: 'geo',
        // Срок не назван — к следующей практике по геометрии, как догадка
        due: { type: 'next-class', isGuess: true },
        priority: 'medium',
      },
    ]);
    // Через два часа это уже не ответ, а без предмета «422-455 задачи» слишком мало
    expect(run(`${question}\n\n\n${answer('16:02:05')}`)).toEqual([]);
  });

  it('«читать А, читать Б» — два задания; предмет из заголовка, срок «на след паре»', () => {
    const tasks = run(`Аня Смирнова, [16 сент. 2026\u202fг., 19:20:14]:
Друзи дз по плюсам:
Демидович 19-44 читать, шилдт справочник с++ читать 3 главы, скоро будет текст на след паре
Сделать индивидуальное задание на курсе, сделать задачу на треугольник, файл с домашним заданием. Классная работа1 файл сделать задачи и спп файлы те сохранить


Есть какая-то там ссылка


Эта`);

    expect(tasks.map(({ title, subjectId, due }) => ({ title, subjectId, due }))).toEqual(
      [
        'Демидович 19-44 читать',
        'Шилдт справочник с++ читать 3 главы, скоро будет текст',
        'Сделать индивидуальное задание на курсе',
        'Сделать задачу на треугольник, файл с домашним заданием',
        'Классная работа1 файл сделать задачи и спп файлы те сохранить',
      ].map((title) => ({ title, subjectId: 'mp', due: NEXT_CLASS })),
    );
  });

  it('самостоятельные и диктанты на парах — тоже задания, важные', () => {
    expect(extract('Завтра самостоялка по алгебре')).toEqual([
      expect.objectContaining({
        title: 'Самостоялка',
        subjectId: 'alg',
        due: dateHint('2026-09-29'),
        priority: 'high',
      }),
    ]);
    expect(extract('На англе будет словарный диктант')).toEqual([
      expect.objectContaining({
        subjectId: 'en',
        due: { type: 'next-class', isGuess: true },
        priority: 'high',
      }),
    ]);
    // «самостоятельно» — не самостоятельная работа
    expect(extract('Решить №5 самостоятельно')[0]).toMatchObject({ priority: 'medium' });
  });

  it('срок из вопроса — догадка', () => {
    const tasks = run(`Лёша, [28 сент. 2026\u202fг., 14:48:15]:
Что по матану на завтра


Аня Смирнова, [28 сент. 2026\u202fг., 14:50:00]:
Решить 1250-1260`);
    expect(tasks).toEqual([
      expect.objectContaining({ subjectId: 'ma', due: day('2026-09-29', true) }),
    ]);
  });
});
