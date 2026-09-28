import type { SubjectDto, TaskDto } from '@nakanune/shared';

/** Задание для тестов: всё по умолчанию, кроме того, что передали. */
export function makeTask(id: string, fields: Partial<TaskDto> = {}): TaskDto {
  return {
    id,
    subjectId: null,
    title: id,
    description: null,
    summary: null,
    notes: null,
    dueAt: null,
    dueAtIsGuess: false,
    status: 'TODO',
    priority: 'medium',
    confidenceScore: 100,
    labels: [],
    archived: false,
    sourceId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...fields,
  };
}

export function makeSubject(id: string, name: string): SubjectDto {
  return { id, name, shortCode: null, color: '#3b82f6', aliases: [] };
}
