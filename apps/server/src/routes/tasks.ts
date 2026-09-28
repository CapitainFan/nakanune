// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: server.js — GET/POST /api/tasks, PUT/DELETE /api/tasks/:id.
import {
  TaskBulkUpdateSchema,
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
import { insertTasks } from '../tasks/insert';
import { taskInclude } from '../tasks/query';

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
    include: taskInclude,
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

  const valid: { index: number; task: TaskCreateInput }[] = [];
  const invalid: CreateTasksReport['errors'] = [];
  items.forEach((item, index) => {
    const parsed = TaskCreateSchema.safeParse(item);
    if (parsed.success) valid.push({ index, task: parsed.data });
    else invalid.push({ index, message: formatIssues(parsed.error) });
  });

  const result = await insertTasks(valid);
  const report: CreateTasksReport = {
    inserted: result.inserted.map(toTaskDto),
    duplicates: result.duplicates,
    errors: [...invalid, ...result.errors].sort((a, b) => a.index - b.index),
  };

  const status =
    report.inserted.length > 0 ? 201 : report.errors.length === items.length ? 400 : 200;
  res.status(status).json(report);
});

/**
 * Статус или архив сразу у нескольких заданий — одной транзакцией: либо обновятся все,
 * либо ни одно. В StudyPlan «отметить все за день» слал N запросов, и при ошибке одного
 * интерфейс откатывал все, хотя часть уже сохранилась на сервере.
 */
tasksRouter.patch('/', async (req, res) => {
  const { ids, patch } = parseOr400(TaskBulkUpdateSchema, req.body);
  const uniqueIds = [...new Set(ids)];

  const tasks = await prisma.$transaction(async (tx) => {
    const { count } = await tx.task.updateMany({ where: { id: { in: uniqueIds } }, data: patch });
    // Исключение внутри транзакции откатывает и уже сделанный updateMany
    if (count !== uniqueIds.length) throw new HttpError(404, 'Часть заданий не найдена');
    return tx.task.findMany({ where: { id: { in: uniqueIds } }, include: taskInclude });
  });
  res.json(tasks.map(toTaskDto));
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
    include: taskInclude,
  });
  res.json(toTaskDto(task));
});

tasksRouter.delete('/:id', async (req, res) => {
  // В StudyPlan отсутствующий id давал { success: true, changes: 0 }, у нас — 404
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
