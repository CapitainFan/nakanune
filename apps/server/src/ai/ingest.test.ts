import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '../../test/helpers';
import { prisma } from '../db';
import { ingestMessages, type IncomingMessage } from './ingest';

// Gemini подменяем: проверяем, что и сколько раз ему отправляется
const generateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const gemini = { apiKey: 'test-key', models: ['gemini-test'] };
const NOW = new Date('2026-09-28T12:00:00Z');
const message = (externalId: string, iso: string, text: string): IncomingMessage => ({
  externalId,
  sentAt: new Date(iso),
  text,
});
const aiItem = (messageId: string, fields: Record<string, unknown> = {}) => ({
  messageId,
  isHomework: true,
  subjectName: null,
  title: 'Решить задачи 422–455',
  summary: null,
  dueAt: '2026-10-01T08:15:00+03:00',
  dueAtIsGuess: false,
  confidence: 90,
  priority: 'medium',
  labels: [],
  ...fields,
});

let sourceId: string;
beforeEach(async () => {
  await resetDb();
  generateContent.mockReset();
  sourceId = (
    await prisma.source.create({ data: { type: 'TELEGRAM', title: 'Группа', config: {} } })
  ).id;
});

const ingest = (messages: IncomingMessage[], extra: { autoAccept?: boolean } = {}) =>
  ingestMessages({
    sourceId,
    sourceLabel: 'Telegram: Группа',
    messages,
    gemini,
    now: NOW,
    prefilter: true,
    ...extra,
  });

describe('ingestMessages с префильтром (Telegram)', () => {
  it('одна болтовня — Gemini не вызывается, сообщения помечены разобранными', async () => {
    const result = await ingest([
      message('1', '2026-09-28T10:00:00Z', 'Я свою мышь в универе забыл'),
      message('2', '2026-09-28T10:01:00Z', 'Когда конкретно'),
    ]);
    expect(generateContent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ engine: null, report: { inserted: [] } });
    expect(await prisma.rawMessage.count({ where: { processed: true } })).toBe(2);
  });

  it('в ИИ — кандидат и вопрос перед ним (даже из прошлой синхронизации), без посторонней болтовни', async () => {
    await ingest([message('1', '2026-09-28T09:00:00Z', 'А че по геоме')]);
    generateContent.mockImplementation(async (request: { contents: string }) => {
      const sent = JSON.parse(request.contents) as { id: string; text: string }[];
      const answer = sent.find((item) => item.text.startsWith('422'))!;
      return { text: JSON.stringify({ items: [aiItem(answer.id)] }) };
    });

    await ingest(
      [
        message('2', '2026-09-28T09:01:00Z', '422-455 задачи'),
        message('3', '2026-09-28T11:30:00Z', 'кто-нибудь видел мою мышь'),
      ],
      { autoAccept: true },
    );

    expect(generateContent).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(generateContent.mock.calls[0]![0].contents) as { text: string }[];
    expect(sent.map((item) => item.text)).toEqual(['А че по геоме', '422-455 задачи']);
  });

  it('автопринятие: уверенно и с точным сроком — в «Задания», иначе — во «Входящие»', async () => {
    generateContent.mockImplementation(async (request: { contents: string }) => {
      const [first, second, third] = JSON.parse(request.contents) as { id: string }[];
      return {
        text: JSON.stringify({
          items: [
            aiItem(first!.id, { title: 'Уверенное' }),
            aiItem(second!.id, { title: 'Срок угадан', dueAtIsGuess: true }),
            aiItem(third!.id, { title: 'Не уверен', confidence: 60 }),
          ],
        }),
      };
    });
    const result = await ingest(
      [
        message('1', '2026-09-28T09:00:00Z', 'Решить 1250-1260 к среде'),
        message('2', '2026-09-28T09:01:00Z', 'Прочитать §3'),
        message('3', '2026-09-28T09:02:00Z', 'Сделать лабу'),
      ],
      { autoAccept: true },
    );
    expect(result.report.inserted.map(({ title, status }) => ({ title, status }))).toEqual([
      { title: 'Уверенное', status: 'TODO' },
      { title: 'Срок угадан', status: 'INBOX' },
      { title: 'Не уверен', status: 'INBOX' },
    ]);
  });
});
