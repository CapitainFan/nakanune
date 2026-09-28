import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '../../test/helpers';
import { prisma } from '../db';
import { loadExtractionContext } from './context';

beforeEach(resetDb);

describe('loadExtractionContext', () => {
  it('практики лекционного предмета для сроков — пары его практики, лекции остаются', async () => {
    const practice = await prisma.subject.create({
      data: { name: 'Практикум по программированию', aliases: ['прога'] },
    });
    const lectures = await prisma.subject.create({
      data: { name: 'Методы программирования', practiceSubjectId: practice.id },
    });
    await prisma.source.create({
      data: {
        type: 'MMF_SCHEDULE',
        title: 'Расписание',
        config: { url: 'https://example.com/', defaultSubgroup: null, firstWeekDate: '2026-09-01' },
        classes: {
          create: [
            {
              subjectId: lectures.id,
              weekday: 2,
              startTime: '09:45',
              endTime: '11:05',
              kind: 'LECTURE',
            },
            {
              subjectId: lectures.id,
              weekday: 2,
              startTime: '11:15',
              endTime: '12:35',
              kind: 'LAB',
            },
          ],
        },
      },
    });

    const context = await loadExtractionContext();

    expect(context.practiceOf).toEqual({ [lectures.id]: practice.id });
    // Лишнее поле в SubjectRef не тащим: связь уже в practiceOf
    for (const subject of context.subjects) expect(subject).not.toHaveProperty('practiceSubjectId');
    expect(
      context.schedule?.classes.map(({ subjectId, startTime }) => ({ subjectId, startTime })),
    ).toEqual(
      expect.arrayContaining([
        { subjectId: lectures.id, startTime: '09:45' },
        { subjectId: practice.id, startTime: '11:15' },
      ]),
    );
  });
});
