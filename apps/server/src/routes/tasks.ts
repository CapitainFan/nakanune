// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: server.js — GET/POST /api/tasks, PUT/DELETE /api/tasks/:id.
import type { Prisma } from '@nakanune/db';
import {
  TaskCreateSchema,
  TaskListQuerySchema,
  TaskUpdateSchema,
  type CreateTasksReport,
  type TaskCreateInput,
} from '@nakanune/shared';
import { Router } from 'express';
import { prisma } from '../db';
import { toTaskDto } from '../dto';
import { dedupeKey } from '../lib/dedupe';
import { HttpError, formatIssues, parseOr400 } from '../lib/http';

export const tasksRouter = Router();

const MAX_BATCH = 100;

tasksRouter.get('/', async (req, res) => {
  const { status, archived, from, to } = parseOr400(TaskListQuerySchema, req.query);

  const tasks = await prisma.task.findMany({
    where: {
      status,
      archived,
      dueAt:
        from || to
          ? { gte: from ? new Date(from) : undefined, lt: to ? new Date(to) : undefined }
          : undefined,
    },
    // Сначала ближайшие сроки; задания без срока — в конце
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  });
  res.json(tasks.map(toTaskDto));
});

/**
 * Пакетное добавление с отчётом { inserted, duplicates, errors }, как в StudyPlan.
 * Одно плохое задание не мешает сохранить остальные.
 */
tasksRouter.post('/', async (req, res) => {
  const items: unknown[] = Array.isArray(req.body) ? req.body : [req.body];
  if (items.length === 0 || items.length > MAX_BATCH) {
    throw new HttpError(400, `Нужно от 1 до ${MAX_BATCH} заданий`);
  }

  const report: CreateTasksReport = { inserted: [], duplicates: [], errors: [] };

  const valid: { index: number; input: TaskCreateInput }[] = [];
  items.forEach((item, index) => {
    const parsed = TaskCreateSchema.safeParse(item);
    if (parsed.success) valid.push({ index, input: parsed.data });
    else report.errors.push({ index, message: formatIssues(parsed.error) });
  });

  // Несуществующий предмет уронил бы внешним ключом всю пачку — отсеиваем заранее
  const subjectIds = [...new Set(valid.flatMap(({ input }) => input.subjectId ?? []))];
  const knownSubjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true },
  });
  const known = new Set(knownSubjects.map((subject) => subject.id));

  const rows: { index: number; key: string; data: Prisma.TaskCreateManyInput }[] = [];
  const keysInBatch = new Set<string>();
  for (const { index, input } of valid) {
    if (input.subjectId && !known.has(input.subjectId)) {
      report.errors.push({ index, message: 'subjectId: предмет не найден' });
      continue;
    }

    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    const key = dedupeKey({ subjectId: input.subjectId ?? null, title: input.title, dueAt });
    // Одинаковые задания в одном запросе. В StudyPlan оба проходили проверку:
    // SELECT на дубль для обоих выполнялся раньше, чем INSERT первого.
    if (keysInBatch.has(key)) {
      report.duplicates.push({ index, title: input.title });
      continue;
    }
    keysInBatch.add(key);
    rows.push({ index, key, data: { ...input, dueAt, dedupeKey: key } });
  }

  // С уже сохранёнными заданиями сравнивает сама база: уникальный индекс по dedupeKey
  // и INSERT … ON CONFLICT DO NOTHING (skipDuplicates). Нет гонки «проверили → вставили».
  const created =
    rows.length > 0
      ? await prisma.task.createManyAndReturn({
          data: rows.map((row) => row.data),
          skipDuplicates: true,
        })
      : [];

  const createdKeys = new Set(created.map((task) => task.dedupeKey));
  for (const row of rows) {
    if (!createdKeys.has(row.key))
      report.duplicates.push({ index: row.index, title: row.data.title });
  }

  report.inserted = created.map(toTaskDto);
  report.duplicates.sort((a, b) => a.index - b.index);
  report.errors.sort((a, b) => a.index - b.index);

  const status = created.length > 0 ? 201 : report.errors.length === items.length ? 400 : 200;
  res.status(status).json(report);
});

tasksRouter.put('/:id', async (req, res) => {
  const patch = parseOr400(TaskUpdateSchema, req.body);

  const current = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!current) throw new HttpError(404, 'Задание не найдено');

  // В StudyPlan UPDATE собирался из тех же полей, но без проверки значений.
  // Ключ дубля пересчитываем: после правки задание может совпасть с другим — тогда 409.
  let dueAt = current.dueAt;
  if (patch.dueAt !== undefined) dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
  const key = dedupeKey({
    subjectId: patch.subjectId === undefined ? current.subjectId : patch.subjectId,
    title: patch.title ?? current.title,
    dueAt,
  });

  const task = await prisma.task.update({
    where: { id: current.id },
    data: { ...patch, dueAt, dedupeKey: key },
  });
  res.json(toTaskDto(task));
});

tasksRouter.delete('/:id', async (req, res) => {
  // В StudyPlan отсутствующий id давал { success: true, changes: 0 }, у нас — 404
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
