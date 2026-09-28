// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: server.js — пакетная вставка в POST /api/tasks с проверкой дублей.
import type { Prisma } from '@nakanune/db';
import type { CreateTasksReport, TaskCreateInput } from '@nakanune/shared';
import { prisma } from '../db';
import { dedupeKey } from '../lib/dedupe';
import { taskInclude, type TaskRow } from './query';

/** Задание к вставке: поля из API плюс происхождение (для заданий из источников). */
export type NewTask = TaskCreateInput & {
  sourceId?: string | null;
  rawMessageId?: string | null;
};

export type InsertResult = {
  inserted: TaskRow[];
  duplicates: CreateTasksReport['duplicates'];
  errors: CreateTasksReport['errors'];
};

/**
 * Вставляет пачку заданий, пропуская дубли. index — позиция задания во входных данных,
 * по ней клиент поймёт, какие строки отчёта к чему относятся.
 * Используют и POST /api/tasks, и разбор текста (POST /api/extract).
 */
export async function insertTasks(
  tasks: { index: number; task: NewTask }[],
): Promise<InsertResult> {
  const result: InsertResult = { inserted: [], duplicates: [], errors: [] };

  // Несуществующий предмет уронил бы внешним ключом всю пачку — отсеиваем заранее
  const subjectIds = [...new Set(tasks.flatMap(({ task }) => task.subjectId ?? []))];
  const knownSubjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true },
  });
  const known = new Set(knownSubjects.map((subject) => subject.id));

  const rows: { index: number; key: string; data: Prisma.TaskCreateManyInput }[] = [];
  const keysInBatch = new Set<string>();
  for (const { index, task } of tasks) {
    if (task.subjectId && !known.has(task.subjectId)) {
      result.errors.push({ index, message: 'subjectId: предмет не найден' });
      continue;
    }

    const dueAt = task.dueAt ? new Date(task.dueAt) : null;
    const key = dedupeKey({ subjectId: task.subjectId ?? null, title: task.title, dueAt });
    // Одинаковые задания в одном запросе. В StudyPlan оба проходили проверку:
    // SELECT на дубль для обоих выполнялся раньше, чем INSERT первого.
    if (keysInBatch.has(key)) {
      result.duplicates.push({ index, title: task.title });
      continue;
    }
    keysInBatch.add(key);
    rows.push({ index, key, data: { ...task, dueAt, dedupeKey: key } });
  }

  // С уже сохранёнными заданиями сравнивает сама база: уникальный индекс по dedupeKey
  // и INSERT … ON CONFLICT DO NOTHING (skipDuplicates). Нет гонки «проверили → вставили».
  if (rows.length > 0) {
    result.inserted = await prisma.task.createManyAndReturn({
      data: rows.map((row) => row.data),
      skipDuplicates: true,
      include: taskInclude,
    });
  }

  const createdKeys = new Set(result.inserted.map((task) => task.dedupeKey));
  for (const row of rows) {
    if (!createdKeys.has(row.key)) {
      result.duplicates.push({ index: row.index, title: row.data.title });
    }
  }
  result.duplicates.sort((a, b) => a.index - b.index);
  result.errors.sort((a, b) => a.index - b.index);
  return result;
}
