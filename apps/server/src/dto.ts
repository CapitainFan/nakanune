import type { Subject, Task } from '@nakanune/db';
import type { SubjectDto, TaskDto } from '@nakanune/shared';

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
