import { ScheduleConfigSchema, type ScheduleContext, type SubjectRef } from '@nakanune/shared';
import { prisma } from '../db';
import { toClassSessionDto } from '../dto';

export type ExtractionContext = {
  subjects: SubjectRef[];
  schedule: ScheduleContext | null;
  /** Предмет → его практика: задания по МП (лекции) записываются на Практикум. */
  practiceOf: Record<string, string>;
};

/** Что нужно знать для разбора: предметы с алиасами и расписание пар (если настроено). */
export async function loadExtractionContext(): Promise<ExtractionContext> {
  const [rows, source] = await Promise.all([
    prisma.subject.findMany({
      select: { id: true, name: true, shortCode: true, aliases: true, practiceSubjectId: true },
    }),
    prisma.source.findFirst({
      where: { type: 'MMF_SCHEDULE', enabled: true },
      include: { classes: true },
    }),
  ]);

  const practiceOf = Object.fromEntries(
    rows.flatMap((row) => (row.practiceSubjectId ? [[row.id, row.practiceSubjectId]] : [])),
  );
  const subjects = rows.map(({ practiceSubjectId: _, ...subject }) => subject);

  const config = source ? ScheduleConfigSchema.safeParse(source.config) : null;
  const schedule =
    source && config?.success
      ? {
          firstWeekDate: config.data.firstWeekDate,
          // Для сроков не-лекционные пары МП («лаб.») — это пары его практики (Практикума):
          // домашка по программированию сдаётся на ближайшей из них. Показ расписания
          // (GET /api/schedule) это не меняет
          classes: source.classes.map((lesson) => {
            const dto = toClassSessionDto(lesson);
            const practice = practiceOf[dto.subjectId];
            return practice && dto.kind !== 'LECTURE' ? { ...dto, subjectId: practice } : dto;
          }),
        }
      : null;
  return { subjects, schedule, practiceOf };
}
