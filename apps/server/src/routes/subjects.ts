// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: server.js — GET/POST /api/subjects. PUT и DELETE добавлены (как в апстрим-PR #1001).
import { SubjectCreateSchema, SubjectUpdateSchema } from '@nakanune/shared';
import { Router } from 'express';
import { prisma } from '../db';
import { toSubjectDto } from '../dto';
import { HttpError, parseOr400 } from '../lib/http';
import { makeShortCode } from '../lib/shortCode';

export const subjectsRouter = Router();

subjectsRouter.get('/', async (_req, res) => {
  const subjects = await prisma.subject.findMany({ orderBy: { name: 'asc' } });
  res.json(subjects.map(toSubjectDto));
});

subjectsRouter.post('/', async (req, res) => {
  const input = parseOr400(SubjectCreateSchema, req.body);
  await assertNameIsFree(input.name);

  const subject = await prisma.subject.create({
    data: {
      ...input,
      shortCode: input.shortCode === undefined ? makeShortCode(input.name) : input.shortCode,
    },
  });
  res.status(201).json(toSubjectDto(subject));
});

subjectsRouter.put('/:id', async (req, res) => {
  const patch = parseOr400(SubjectUpdateSchema, req.body);
  if (patch.name !== undefined) await assertNameIsFree(patch.name, req.params.id);

  // Нет такого id — Prisma бросит P2025, errorHandler ответит 404
  const subject = await prisma.subject.update({ where: { id: req.params.id }, data: patch });
  res.json(toSubjectDto(subject));
});

// Задания удалённого предмета остаются «Без предмета» (onDelete: SetNull в schema.prisma),
// пары из расписания удаляются вместе с ним (onDelete: Cascade).
subjectsRouter.delete('/:id', async (req, res) => {
  await prisma.subject.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

/** Название уникально без учёта регистра — как в StudyPlan (LOWER(name) = LOWER(?)). */
async function assertNameIsFree(name: string, exceptId?: string) {
  const clash = await prisma.subject.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      NOT: exceptId ? { id: exceptId } : undefined,
    },
    select: { id: true },
  });
  if (clash) throw new HttpError(409, 'Предмет с таким названием уже есть');
}
