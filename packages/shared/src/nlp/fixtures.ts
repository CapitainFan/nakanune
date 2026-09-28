import type { ScheduleContext } from './due';
import type { SubjectRef } from './subject';

/** Предметы как в сиде — для тестов разбора. */
export const SUBJECTS: SubjectRef[] = [
  {
    id: 'ma',
    name: 'Математический анализ',
    shortCode: 'МА',
    aliases: ['матан', 'мат. анализ', 'МА'],
  },
  {
    id: 'alg',
    name: 'Алгебра и теория чисел',
    shortCode: 'АиТЧ',
    aliases: ['алгебра', 'АиТЧ', 'АТЧ'],
  },
  {
    id: 'geo',
    name: 'Геометрия',
    shortCode: 'Геом',
    aliases: ['геома', 'аналитическая геометрия'],
  },
  {
    id: 'mp',
    name: 'Методы программирования',
    shortCode: 'МП',
    aliases: ['методы прог', 'прога', 'МП'],
  },
  {
    id: 'lab',
    name: 'Практикум по программированию',
    shortCode: 'Практикум',
    aliases: ['практикум'],
  },
  {
    id: 'en',
    name: 'Английский язык',
    shortCode: 'Англ',
    aliases: ['английский', 'англ', 'инглиш'],
  },
];

/** Пары матана: пн 13:00, ср 11:15, пт 08:15 и 09:45 — каждую неделю. */
export const SCHEDULE: ScheduleContext = {
  firstWeekDate: '2026-09-01',
  classes: [
    { subjectId: 'ma', weekday: 1, weekParity: null, validFrom: null, startTime: '13:00' },
    { subjectId: 'ma', weekday: 3, weekParity: null, validFrom: null, startTime: '11:15' },
    { subjectId: 'ma', weekday: 5, weekParity: null, validFrom: null, startTime: '08:15' },
    { subjectId: 'ma', weekday: 5, weekParity: null, validFrom: null, startTime: '09:45' },
  ],
};
