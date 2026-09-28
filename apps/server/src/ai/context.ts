import { ScheduleConfigSchema, type ScheduleContext, type SubjectRef } from '@nakanune/shared';
import { prisma } from '../db';
import { toClassSessionDto } from '../dto';

/** Что нужно знать для разбора: предметы с алиасами и расписание пар (если настроено). */
export async function loadExtractionContext(): Promise<{
  subjects: SubjectRef[];
  schedule: ScheduleContext | null;
}> {
  const [subjects, source] = await Promise.all([
    prisma.subject.findMany({ select: { id: true, name: true, shortCode: true, aliases: true } }),
    prisma.source.findFirst({
      where: { type: 'MMF_SCHEDULE', enabled: true },
      include: { classes: true },
    }),
  ]);

  const config = source ? ScheduleConfigSchema.safeParse(source.config) : null;
  const schedule =
    source && config?.success
      ? { firstWeekDate: config.data.firstWeekDate, classes: source.classes.map(toClassSessionDto) }
      : null;
  return { subjects, schedule };
}
