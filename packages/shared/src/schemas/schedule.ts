import { z } from 'zod';

// Значения совпадают с enum ClassKind в schema.prisma.
export const ClassKindSchema = z.enum(['LECTURE', 'PRACTICE', 'LAB', 'SEMINAR']);
export type ClassKind = z.infer<typeof ClassKindSchema>;

export const CLASS_KIND_LABELS: Record<ClassKind, string> = {
  LECTURE: 'лекция',
  PRACTICE: 'практика',
  LAB: 'лабораторная',
  SEMINAR: 'семинар',
};

/** Пара в недельном расписании. */
export const ClassSessionSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  weekday: z.number().int().min(1).max(7), // 1 — понедельник
  startTime: z.string(), // "09:45"
  endTime: z.string(),
  weekParity: z.union([z.literal(1), z.literal(2)]).nullable(), // null — каждую неделю
  kind: ClassKindSchema.nullable(),
  teacher: z.string().nullable(),
  room: z.string().nullable(),
  subgroup: z.string().nullable(),
  validFrom: z.iso.date().nullable(), // «с 10.10» → "2026-10-10"
  note: z.string().nullable(),
});

export type ClassSessionDto = z.infer<typeof ClassSessionSchema>;

/** Настройки источника расписания (поле Source.config). */
export const ScheduleConfigSchema = z.object({
  /** Ссылка на страницу группы: https://mmf.bsu.by/ru/raspisanie-zanyatij/…/1-kurs/2-gruppa/ */
  url: z.url(),
  /** Моя подгруппа («б»), если у предмета не задана своя. null — показывать все подгруппы. */
  defaultSubgroup: z.string().nullable(),
  /** Любая дата первой недели: неделя, в которую попадает 1 сентября, — «1н». */
  firstWeekDate: z.iso.date(),
});

export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;

/** Ответ GET /api/schedule. */
export const ScheduleResponseSchema = z.object({
  source: z
    .object({
      id: z.string(),
      title: z.string(),
      url: z.url(),
      firstWeekDate: z.iso.date(),
      lastCheckedAt: z.iso.datetime({ offset: true }).nullable(),
      /** Когда расписание в последний раз реально обновилось: с сайта или из снимка. */
      lastSyncedAt: z.iso.datetime({ offset: true }).nullable(),
      lastError: z.string().nullable(),
    })
    .nullable(),
  classes: z.array(ClassSessionSchema),
  /** Сервер сейчас перепроверяет сайт — имеет смысл перезапросить чуть позже. */
  refreshing: z.boolean(),
});

export type ScheduleResponse = z.infer<typeof ScheduleResponseSchema>;

/** Ответ POST /api/schedule/sync: итог обновления с сайта и расписание (при ошибке — прежнее). */
export const ScheduleSyncResponseSchema = ScheduleResponseSchema.extend({
  sync: z.discriminatedUnion('status', [
    z.object({ status: z.literal('updated'), classes: z.number().int() }),
    z.object({ status: z.literal('unchanged') }),
    z.object({ status: z.literal('failed'), error: z.string() }),
  ]),
});

export type ScheduleSyncResponse = z.infer<typeof ScheduleSyncResponseSchema>;
