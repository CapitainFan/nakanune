import {
  CreateTasksReportSchema,
  SubjectSchema,
  type SubjectDto,
  type TaskCreateInput,
  type TaskDto,
} from '@nakanune/shared';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { env } from '../src/env';
import { SCHEDULE_URL } from './schedule-site';

export const app = createApp();

/** Очищает таблицы. Защита: работает только с базой, в имени которой есть «_test». */
export async function resetDb() {
  if (!new URL(env.DATABASE_URL).pathname.endsWith('_test')) {
    throw new Error('Тесты запущены не на тестовой базе — очистка отменена');
  }
  await prisma.$executeRaw`TRUNCATE "Task", "RawMessage", "ClassSession", "Source", "Subject" CASCADE`;
}

export async function createSubject(name: string): Promise<SubjectDto> {
  const res = await request(app).post('/api/subjects').send({ name }).expect(201);
  return SubjectSchema.parse(res.body);
}

export async function createTasks(tasks: TaskCreateInput[]): Promise<TaskDto[]> {
  const res = await request(app).post('/api/tasks').send(tasks).expect(201);
  return CreateTasksReportSchema.parse(res.body).inserted;
}

/** Как в сиде: английский — подгруппа «а», остальное — «б»; у ИБГ алиас с опечаткой из расписания. */
export async function setupSchedule() {
  await prisma.subject.createMany({
    data: [
      { name: 'Английский язык', subgroup: 'а' },
      { name: 'Английский язык (профессиональная лексика)', subgroup: 'а' },
      {
        name: 'История белорусской государственности',
        aliases: ['История белорусской гусударственности'],
      },
    ],
  });
  return prisma.source.create({
    data: {
      type: 'MMF_SCHEDULE',
      title: 'Расписание: 1 курс, 2 группа',
      config: { url: SCHEDULE_URL, defaultSubgroup: 'б', firstWeekDate: '2026-09-01' },
    },
  });
}
