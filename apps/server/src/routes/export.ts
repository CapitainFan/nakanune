// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: backend/routers/csvDownload.router.js и контроллер downloadData / downloadCalendar.
import { Router } from 'express';
import { prisma } from '../db';
import { buildTasksCsv } from '../export/csv';
import { buildCalendarIcs } from '../export/ics';

export const exportRouter = Router();

// На этот адрес можно подписаться в Google Calendar. В календарь идут подтверждённые
// задания со сроком: «Входящие» ещё не проверены, архив не нужен.
exportRouter.get('/calendar.ics', async (_req, res) => {
  const tasks = await prisma.task.findMany({
    where: { archived: false, status: { in: ['TODO', 'DONE'] }, dueAt: { not: null } },
    include: { subject: true },
    orderBy: { dueAt: 'asc' },
  });
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="nakanune.ics"',
  });
  res.send(buildCalendarIcs(tasks));
});

exportRouter.get('/tasks.csv', async (_req, res) => {
  const tasks = await prisma.task.findMany({
    include: { subject: true },
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  });
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="nakanune-tasks.csv"',
  });
  res.send(buildTasksCsv(tasks));
});
