import { ExtractResultSchema } from '@nakanune/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app, resetDb } from '../../test/helpers';
import { prisma } from '../db';

// Gemini подменяем, а ключ «задаём»: фото разбирает только ИИ
const generateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
vi.mock('../ai/config', () => ({
  geminiFromEnv: () => ({ apiKey: 'test-key', models: ['gemini-test'] }),
}));

// Не настоящая картинка: содержимое в тестах не важно, Gemini подменён
const PHOTO = Buffer.from('fake-png-bytes');

type Part = { inlineData?: { mimeType: string; data: string }; text?: string };

function answerWith(fields: { transcript: string; title?: string }) {
  generateContent.mockImplementation(async (req: { contents: Part[] }) => {
    const { id } = JSON.parse(req.contents[1]!.text!) as { id: string };
    const items = fields.title
      ? [
          {
            messageId: id,
            isHomework: true,
            subjectName: null,
            title: fields.title,
            summary: null,
            dueAt: '2026-10-09T23:59:00+03:00',
            dueAtIsGuess: false,
            confidence: 85,
            priority: 'medium',
            labels: [],
          },
        ]
      : [];
    return { text: JSON.stringify({ transcript: fields.transcript, items }) };
  });
}

const upload = (body: Buffer = PHOTO, type = 'image/png') =>
  request(app).post('/api/extract/image').set('Content-Type', type).send(body);

beforeEach(async () => {
  await resetDb();
  generateContent.mockReset();
});

describe('POST /api/extract/image — фото доски', () => {
  it('отдаёт фото Gemini, задания — во «Входящие», прочитанный текст — исходным сообщением', async () => {
    answerWith({ transcript: 'ДЗ: №45, 46\nк пятнице', title: 'Решить №45, 46' });

    const res = await upload().expect(201);
    const body = ExtractResultSchema.parse(res.body);
    expect(body).toMatchObject({ engine: 'gemini', model: 'gemini-test', notice: null });
    expect(body.report.inserted).toEqual([
      expect.objectContaining({
        title: 'Решить №45, 46',
        status: 'INBOX',
        origin: expect.objectContaining({ text: 'Фото доски:\nДЗ: №45, 46\nк пятнице' }),
      }),
    ]);

    // Картинка — отдельной частью, рядом JSON с id; ответ — по схеме с transcript
    const sent = generateContent.mock.calls[0]![0] as {
      contents: Part[];
      config: {
        responseJsonSchema: { properties: Record<string, unknown> };
        systemInstruction: string;
      };
    };
    expect(sent.contents[0]!.inlineData).toEqual({
      mimeType: 'image/png',
      data: PHOTO.toString('base64'),
    });
    expect(sent.config.responseJsonSchema.properties).toHaveProperty('transcript');
    expect(sent.config.systemInstruction).toContain('Фото вместо сообщений');
  });

  it('то же фото второй раз не разбирает', async () => {
    answerWith({ transcript: 'ДЗ: №45', title: 'Решить №45' });
    await upload().expect(201);

    const res = await upload().expect(200);
    expect(ExtractResultSchema.parse(res.body)).toMatchObject({
      engine: null,
      notice: 'Это фото уже разбиралось',
      messages: { total: 1, skipped: 1 },
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('заданий нет — объясняет, что ИИ прочитал', async () => {
    answerWith({ transcript: 'Тема: пределы' });
    const res = await upload().expect(200);
    expect(res.body.notice).toBe('Заданий на фото не нашлось. ИИ прочитал: «Тема: пределы»');
  });

  it('ИИ не ответил — 502, и то же фото можно прислать снова', async () => {
    generateContent.mockRejectedValueOnce(new Error('{"error":{"code":503}}'));
    const failed = await upload().expect(502);
    expect(failed.body.error).toContain('gemini-test: перегружена (503)');

    answerWith({ transcript: 'ДЗ: №45', title: 'Решить №45' });
    await upload().expect(201);
    expect(await prisma.rawMessage.count()).toBe(1);
  });

  it('не картинка — 400', async () => {
    await request(app)
      .post('/api/extract/image')
      .set('Content-Type', 'text/plain')
      .send('hi')
      .expect(400);
  });
});
