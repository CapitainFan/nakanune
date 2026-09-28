import { SubjectSchema } from '@nakanune/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, createSubject, createTasks, resetDb } from '../../test/helpers';
import { prisma } from '../db';

beforeEach(resetDb);

describe('/api/subjects', () => {
  it('создаёт предмет и сам собирает короткий код из кириллицы', async () => {
    const res = await request(app)
      .post('/api/subjects')
      .send({ name: 'Математический анализ', aliases: ['матан'] });

    expect(res.status).toBe(201);
    expect(SubjectSchema.parse(res.body)).toMatchObject({
      name: 'Математический анализ',
      shortCode: 'МА',
      color: '#3b82f6',
      aliases: ['матан'],
    });
  });

  it('отдаёт список по алфавиту', async () => {
    await createSubject('Геометрия');
    await createSubject('Алгебра и теория чисел');
    const res = await request(app).get('/api/subjects').expect(200);
    expect(res.body.map((s: { name: string }) => s.name)).toEqual([
      'Алгебра и теория чисел',
      'Геометрия',
    ]);
  });

  it('не даёт завести тот же предмет в другом регистре', async () => {
    await createSubject('Геометрия');
    await request(app).post('/api/subjects').send({ name: 'геометрия' }).expect(409);
  });

  it('проверяет тело запроса', async () => {
    const res = await request(app).post('/api/subjects').send({ name: '', color: 'red' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { path: string }) => d.path)).toEqual(['name', 'color']);
  });

  it('обновляет предмет; несуществующий — 404', async () => {
    const subject = await createSubject('Геометрия');
    const res = await request(app).put(`/api/subjects/${subject.id}`).send({ color: '#10b981' });
    expect(res.status).toBe(200);
    expect(res.body.color).toBe('#10b981');

    await request(app).put('/api/subjects/missing').send({ color: '#10b981' }).expect(404);
    await request(app).put(`/api/subjects/${subject.id}`).send({}).expect(400);
  });

  it('при удалении предмета его задания остаются «Без предмета»', async () => {
    const subject = await createSubject('Геометрия');
    const [task] = await createTasks([{ title: 'Решить №5', subjectId: subject.id }]);

    await request(app).delete(`/api/subjects/${subject.id}`).expect(204);

    const saved = await prisma.task.findUniqueOrThrow({ where: { id: task!.id } });
    expect(saved.subjectId).toBeNull();
  });
});
