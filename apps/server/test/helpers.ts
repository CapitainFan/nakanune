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
