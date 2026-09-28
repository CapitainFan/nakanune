import { ExtractResultSchema } from '@nakanune/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, resetDb } from '../../test/helpers';
import { prisma } from '../db';

beforeEach(resetDb);

// В тестах ключа Gemini нет (vitest.config.ts) — здесь работает эвристика
describe('POST /api/extract', () => {
  it('разбирает текст и кладёт задания во «Входящие» с исходным сообщением', async () => {
    await prisma.subject.create({ data: { name: 'Математический анализ', aliases: ['матан'] } });
    const text = 'Всем привет!\nМатан: к пятнице решить №1234–1240 #кр\nАлгебра: прочитать §3';

    const res = await request(app).post('/api/extract').send({ text }).expect(201);
    const body = ExtractResultSchema.parse(res.body);

    expect(body.engine).toBe('heuristic');
    expect(body.notice).toContain('Ключ Gemini не задан');
    expect(body.report.inserted.map((task) => task.title)).toEqual([
      'Решить №1234–1240',
      'Алгебра: прочитать §3', // такого предмета в базе нет — остаётся в заголовке
    ]);
    for (const task of body.report.inserted) {
      expect(task.status).toBe('INBOX');
      expect(task.origin).toMatchObject({ sourceType: 'MANUAL', text });
    }
    expect(body.report.inserted[0]).toMatchObject({ labels: ['кр'], priority: 'high' });

    const message = await prisma.rawMessage.findFirstOrThrow();
    expect(message).toMatchObject({ text, processed: true });
  });

  it('повторная вставка того же текста не плодит дубли', async () => {
    const text = 'К пятнице решить №1234–1240';
    await request(app).post('/api/extract').send({ text }).expect(201);

    const res = await request(app).post('/api/extract').send({ text }).expect(200);
    const body = ExtractResultSchema.parse(res.body);
    expect(body.report.inserted).toEqual([]);
    expect(body.report.duplicates).toHaveLength(1);
  });

  it('переписку из Telegram делит на сообщения: ссылки — в описание, имена не сохраняет', async () => {
    const text = `Аня Смирнова, [25 сент. 2026\u202fг., 11:25:46]:
ДЗ
1)квентор сверстать по образцу из книги
2) Квентор new, редизайн квентора
ДЕДЛАЙН  09.10!


https://developer.mozilla.org/ru/docs/Web/CSS


Миша Орлов, [25 сент. 2026\u202fг., 11:30:00]:
спасибо`;

    const res = await request(app).post('/api/extract').send({ text }).expect(201);
    const body = ExtractResultSchema.parse(res.body);

    expect(body.messages).toEqual({ total: 2, skipped: 0 });
    expect(body.report.inserted.map((task) => task.title)).toEqual([
      'Квентор сверстать по образцу из книги',
      'Квентор new, редизайн квентора',
    ]);
    for (const task of body.report.inserted) {
      expect(task.description).toBe('https://developer.mozilla.org/ru/docs/Web/CSS');
      // Срок 09.10 без предмета и расписания — 23:59 по Минску
      expect(task.dueAt).toBe('2026-10-09T20:59:00.000Z');
      expect(task.origin).toMatchObject({ sentAt: '2026-09-25T08:25:46.000Z' });
      expect(task.origin?.text).toContain('ДЕДЛАЙН');
    }

    const messages = await prisma.rawMessage.findMany({ orderBy: { sentAt: 'asc' } });
    expect(messages.map((message) => message.text)).toEqual([
      expect.stringContaining('квентор'),
      'спасибо',
    ]);
    expect(JSON.stringify(messages)).not.toContain('Смирнова');
  });

  it('ту же переписку второй раз не разбирает, а вопрос из прошлой вставки даёт предмет ответу', async () => {
    const geometry = await prisma.subject.create({
      data: { name: 'Геометрия', aliases: ['геома'] },
    });
    const question = `Лёша, [23 сент. 2026\u202fг., 14:01:11]:
А че по геоме`;
    const answer = `Аня Смирнова, [23 сент. 2026\u202fг., 14:02:05]:
422-455 задачи`;

    const first = ExtractResultSchema.parse(
      (await request(app).post('/api/extract').send({ text: question }).expect(200)).body,
    );
    expect(first.report.inserted).toEqual([]);

    // Во второй раз скопировали больше: старый вопрос и новый ответ
    const second = ExtractResultSchema.parse(
      (
        await request(app)
          .post('/api/extract')
          .send({ text: `${question}\n\n${answer}` })
          .expect(201)
      ).body,
    );
    expect(second.messages).toEqual({ total: 2, skipped: 1 });
    expect(second.report.inserted).toEqual([
      expect.objectContaining({ title: '422-455 задачи', subjectId: geometry.id }),
    ]);

    const third = ExtractResultSchema.parse(
      (
        await request(app)
          .post('/api/extract')
          .send({ text: `${question}\n\n${answer}` })
          .expect(200)
      ).body,
    );
    expect(third).toMatchObject({ engine: null, messages: { total: 2, skipped: 2 } });
    expect(third.notice).toContain('уже разбирались');
  });

  it('задание по МП (лекции) записывает на Практикум — его практику', async () => {
    const practice = await prisma.subject.create({
      data: { name: 'Практикум по программированию', aliases: ['плюсы'] },
    });
    await prisma.subject.create({
      data: { name: 'Методы программирования', shortCode: 'МП', practiceSubjectId: practice.id },
    });

    const res = await request(app)
      .post('/api/extract')
      .send({ text: 'МП: решить задачу на треугольник\nПо плюсам прочитать 3 главы Шилдта' })
      .expect(201);
    const body = ExtractResultSchema.parse(res.body);
    expect(body.report.inserted.map((task) => task.subjectId)).toEqual([practice.id, practice.id]);
  });

  it('пустой текст — 400', async () => {
    await request(app).post('/api/extract').send({ text: '   ' }).expect(400);
  });
});
