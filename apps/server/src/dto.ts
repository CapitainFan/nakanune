import type { ClassSession, Source, Subject, Task } from '@nakanune/db';
import {
  ScheduleConfigSchema,
  type ClassSessionDto,
  type ScheduleResponse,
  type SubjectDto,
  type TaskDto,
} from '@nakanune/shared';

// Строки базы → объекты API. Поля перечислены явно: служебное (dedupeKey, rawMessageId)
// не утечёт наружу, даже если в схеме появятся новые колонки.

export function toSubjectDto(subject: Subject): SubjectDto {
  return {
    id: subject.id,
    name: subject.name,
    shortCode: subject.shortCode,
    color: subject.color,
    aliases: subject.aliases,
  };
}

export function toTaskDto(task: Task): TaskDto {
  return {
    id: task.id,
    subjectId: task.subjectId,
    title: task.title,
    description: task.description,
    summary: task.summary,
    notes: task.notes,
    dueAt: task.dueAt?.toISOString() ?? null,
    dueAtIsGuess: task.dueAtIsGuess,
    status: task.status,
    priority: task.priority,
    confidenceScore: task.confidenceScore,
    labels: task.labels,
    archived: task.archived,
    sourceId: task.sourceId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function toClassSessionDto(lesson: ClassSession): ClassSessionDto {
  return {
    id: lesson.id,
    subjectId: lesson.subjectId,
    weekday: lesson.weekday,
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    weekParity: lesson.weekParity === 1 || lesson.weekParity === 2 ? lesson.weekParity : null,
    kind: lesson.kind,
    teacher: lesson.teacher,
    room: lesson.room,
    subgroup: lesson.subgroup,
    // Колонка типа DATE приходит как полночь UTC — берём только дату
    validFrom: lesson.validFrom?.toISOString().slice(0, 10) ?? null,
    note: lesson.note,
  };
}

export function toScheduleSourceDto(source: Source): NonNullable<ScheduleResponse['source']> {
  const config = ScheduleConfigSchema.parse(source.config);
  return {
    id: source.id,
    title: source.title,
    url: config.url,
    firstWeekDate: config.firstWeekDate,
    lastCheckedAt: source.lastCheckedAt?.toISOString() ?? null,
    lastError: source.lastError,
  };
}
