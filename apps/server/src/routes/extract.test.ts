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

  it('пустой текст — 400', async () => {
    await request(app).post('/api/extract').send({ text: '   ' }).expect(400);
  });
});
