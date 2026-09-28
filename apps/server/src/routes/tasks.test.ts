import { CreateTasksReportSchema, TaskSchema, type TaskDto } from '@nakanune/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, createSubject, createTasks, resetDb } from '../../test/helpers';

beforeEach(resetDb);

const titles = (tasks: TaskDto[]) => tasks.map((task) => task.title);

describe('POST /api/tasks', () => {
  it('добавляет пачку и отчитывается о дублях и ошибках', async () => {
    const subject = await createSubject('Математический анализ');
    await createTasks([
      { title: 'Решить №5', subjectId: subject.id, dueAt: '2026-10-05T09:00:00Z' },
    ]);

    const res = await request(app)
      .post('/api/tasks')
      .send([
        { title: 'Выучить теорему Ролля', subjectId: subject.id, dueAt: '2026-10-06T09:00:00Z' },
        // дубль предыдущего в этом же запросе: другой регистр и время, но тот же день
        { title: 'выучить теорему ролля!', subjectId: subject.id, dueAt: '2026-10-06T15:00:00Z' },
        // дубль задания, которое уже лежит в базе
        { title: 'Решить №5', subjectId: subject.id, dueAt: '2026-10-05T12:00:00Z' },
        { title: '' },
        { title: 'Реферат', subjectId: 'missing' },
        // без предмета и срока — теперь можно (в StudyPlan было нельзя)
        { title: 'Реферат' },
      ]);

    expect(res.status).toBe(201);
    const report = CreateTasksReportSchema.parse(res.body);
    expect(titles(report.inserted).sort()).toEqual(['Выучить теорему Ролля', 'Реферат']);
    expect(report.duplicates.map((d) => d.index)).toEqual([1, 2]);
    expect(report.errors.map((e) => e.index)).toEqual([3, 4]);
  });

  it('принимает одно задание без массива и подставляет значения по умолчанию', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'Прочитать §3' });
    expect(res.status).toBe(201);
    expect(CreateTasksReportSchema.parse(res.body).inserted[0]).toMatchObject({
      status: 'TODO',
      priority: 'medium',
      confidenceScore: 100,
      labels: [],
      subjectId: null,
      dueAt: null,
      archived: false,
    });
  });

  it('все задания с ошибками — 400; пустой массив — 400', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send([{ title: '' }, { priority: 'urgent' }]);
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(2);

    await request(app).post('/api/tasks').send([]).expect(400);
  });
});

describe('GET /api/tasks', () => {
  it('сортирует по сроку (без срока — в конце) и фильтрует', async () => {
    await createTasks([
      { title: 'Позже', dueAt: '2026-10-10T09:00:00Z' },
      { title: 'Раньше', dueAt: '2026-10-01T09:00:00Z' },
      { title: 'Без срока' },
      { title: 'Во входящих', status: 'INBOX', dueAt: '2026-10-02T09:00:00Z' },
    ]);

    const all = await request(app).get('/api/tasks').expect(200);
    expect(titles(all.body)).toEqual(['Раньше', 'Во входящих', 'Позже', 'Без срока']);

    const inbox = await request(app).get('/api/tasks').query({ status: 'INBOX' }).expect(200);
    expect(titles(inbox.body)).toEqual(['Во входящих']);

    const range = await request(app)
      .get('/api/tasks')
      .query({ from: '2026-10-01T00:00:00Z', to: '2026-10-05T00:00:00Z' })
      .expect(200);
    expect(titles(range.body)).toEqual(['Раньше', 'Во входящих']);

    await request(app).get('/api/tasks').query({ status: 'Not Started' }).expect(400);
  });
});

describe('PUT /api/tasks/:id', () => {
  it('обновляет поля и проверяет значения', async () => {
    const [task] = await createTasks([{ title: 'Решить №5' }]);

    const res = await request(app)
      .put(`/api/tasks/${task!.id}`)
      .send({ status: 'DONE', archived: true });
    expect(res.status).toBe(200);
    expect(TaskSchema.parse(res.body)).toMatchObject({ status: 'DONE', archived: true });

    // статус из StudyPlan — теперь не пройдёт
    await request(app).put(`/api/tasks/${task!.id}`).send({ status: 'Not Started' }).expect(400);
    await request(app).put(`/api/tasks/${task!.id}`).send({}).expect(400);
  });

  it('правка, после которой задание совпадает с другим, — 409', async () => {
    const [, second] = await createTasks([{ title: 'Решить №5' }, { title: 'Решить №6' }]);
    await request(app).put(`/api/tasks/${second!.id}`).send({ title: 'решить №5' }).expect(409);
  });

  it('несуществующее задание — 404', async () => {
    await request(app).put('/api/tasks/missing').send({ status: 'DONE' }).expect(404);
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('удаляет задание; повторно — 404', async () => {
    const [task] = await createTasks([{ title: 'Решить №5' }]);
    await request(app).delete(`/api/tasks/${task!.id}`).expect(204);
    await request(app).delete(`/api/tasks/${task!.id}`).expect(404);
  });
});

describe('ошибки тела запроса', () => {
  it('битый JSON — 400, а не 500', async () => {
    await request(app)
      .post('/api/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": ')
      .expect(400);
  });
});
