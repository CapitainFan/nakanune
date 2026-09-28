import {
  SourceSyncResponseSchema,
  TelegramChatSchema,
  TelegramStatusSchema,
} from '@nakanune/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, resetDb } from '../../test/helpers';
import { prisma } from '../db';
import {
  TelegramFloodWait,
  TelegramNotConnected,
  getTelegram,
  type TelegramGateway,
  type TelegramMessage,
} from '../telegram/client';
import type * as TelegramModule from '../telegram/client';

// Настоящий Telegram в тестах не трогаем: подменяем шлюз целиком
vi.mock('../telegram/client', async (importOriginal) => ({
  ...(await importOriginal<typeof TelegramModule>()),
  getTelegram: vi.fn(),
  telegramConfigured: () => true,
}));

const NOW = new Date('2026-09-28T09:00:00Z'); // понедельник, 12:00 по Минску
const at = (iso: string) => new Date(iso);

const CHATS = [
  {
    kind: 'channel' as const,
    id: '1001',
    accessHash: '777',
    title: '1 курс 2 группа',
    isGroup: true,
  },
  { kind: 'chat' as const, id: '42', accessHash: null, title: 'Староста', isGroup: true },
];

// Кусок настоящей переписки (без имён — их Telegram-шлюз и не отдаёт)
const MESSAGES: TelegramMessage[] = [
  { id: 10, sentAt: at('2026-09-25T11:06:06Z'), text: 'Я свою мышь в универе забыл' },
  {
    id: 11,
    sentAt: at('2026-09-25T08:25:46Z'),
    text: 'ДЗ\n1)квентор сверстать по образцу из книги\n2) Квентор new, редизайн квентора\nДЕДЛАЙН  09.10!\n\nhttps://developer.mozilla.org/ru/docs/Web/CSS',
  },
];

function gateway(overrides: Partial<TelegramGateway> = {}): TelegramGateway {
  return {
    me: async () => ({ name: 'Богдан', username: 'bogdan' }),
    listChats: async () => CHATS,
    fetchMessages: vi.fn(async () => ({ messages: MESSAGES, maxId: 12 })),
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(getTelegram).mockReset();
});

describe('GET /api/telegram/status', () => {
  it('не вошли — объясняет, что сделать', async () => {
    vi.mocked(getTelegram).mockRejectedValue(
      new TelegramNotConnected('Вход в Telegram не выполнен: запусти в терминале pnpm tg:login'),
    );
    const res = await request(app).get('/api/telegram/status').expect(200);
    expect(TelegramStatusSchema.parse(res.body)).toEqual({
      configured: true,
      loggedIn: false,
      me: null,
      error: 'Вход в Telegram не выполнен: запусти в терминале pnpm tg:login',
    });
  });

  it('вошли — имя аккаунта', async () => {
    vi.mocked(getTelegram).mockResolvedValue(gateway());
    const res = await request(app).get('/api/telegram/status').expect(200);
    expect(res.body).toMatchObject({ loggedIn: true, me: { name: 'Богдан', username: 'bogdan' } });
  });
});

describe('добавление чата и синхронизация', () => {
  it('добавляет группу из диалогов и сразу читает последнюю неделю', async () => {
    const telegram = gateway();
    vi.mocked(getTelegram).mockResolvedValue(telegram);

    const chats = await request(app).get('/api/telegram/chats').expect(200);
    expect(
      TelegramChatSchema.array()
        .parse(chats.body)
        .map((chat) => chat.added),
    ).toEqual([false, false]);

    const res = await request(app)
      .post('/api/sources')
      .send({ type: 'TELEGRAM', chatId: '1001' })
      .expect(201);
    const { source, sync } = SourceSyncResponseSchema.parse(res.body);
    expect(source).toMatchObject({ type: 'TELEGRAM', title: '1 курс 2 группа', lastError: null });
    expect(sync).toEqual({ status: 'updated', created: 2, updated: 0 });

    // Первый раз — только за неделю; peer взят у Telegram, а не из запроса
    expect(telegram.fetchMessages).toHaveBeenCalledWith(
      { kind: 'channel', id: '1001', accessHash: '777' },
      { minId: 0, since: new Date('2026-09-21T09:00:00Z'), limit: 300 },
    );
    const stored = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(stored.lastCursor).toBe('12');

    // Эвристика не уверена (≤ 70) — задания ждут проверки во «Входящих», ссылка — в описании
    const tasks = await prisma.task.findMany({ orderBy: { title: 'asc' } });
    expect(tasks.map(({ title, status, description }) => ({ title, status, description }))).toEqual(
      [
        {
          title: 'Квентор new, редизайн квентора',
          status: 'INBOX',
          description: 'https://developer.mozilla.org/ru/docs/Web/CSS',
        },
        {
          title: 'Квентор сверстать по образцу из книги',
          status: 'INBOX',
          description: 'https://developer.mozilla.org/ru/docs/Web/CSS',
        },
      ],
    );
    expect(await prisma.rawMessage.count({ where: { processed: true } })).toBe(2);

    const again = await request(app).get('/api/telegram/chats').expect(200);
    expect(again.body[0].added).toBe(true);
    await request(app).post('/api/sources').send({ type: 'TELEGRAM', chatId: '1001' }).expect(409);
  });

  it('следующая синхронизация — с курсора; нового нет — unchanged', async () => {
    const telegram = gateway();
    vi.mocked(getTelegram).mockResolvedValue(telegram);
    const { body } = await request(app)
      .post('/api/sources')
      .send({ type: 'TELEGRAM', chatId: '42' })
      .expect(201);

    vi.mocked(telegram.fetchMessages).mockResolvedValue({ messages: [], maxId: 12 });
    const res = await request(app).post(`/api/sources/${body.source.id}/sync`).expect(200);
    expect(res.body.sync).toEqual({ status: 'unchanged' });
    expect(telegram.fetchMessages).toHaveBeenLastCalledWith(
      { kind: 'chat', id: '42', accessHash: null },
      { minId: 12, since: null, limit: 300 },
    );
  });

  it('FloodWait — ошибка в статусе источника, задания и курсор на месте', async () => {
    const telegram = gateway();
    vi.mocked(getTelegram).mockResolvedValue(telegram);
    const { body } = await request(app)
      .post('/api/sources')
      .send({ type: 'TELEGRAM', chatId: '42' })
      .expect(201);

    vi.mocked(telegram.fetchMessages).mockRejectedValue(new TelegramFloodWait(120));
    const res = await request(app).post(`/api/sources/${body.source.id}/sync`).expect(502);
    expect(res.body.source.lastError).toBe(
      'Telegram просит подождать 120 с — попробую при следующей проверке',
    );
    const stored = await prisma.source.findUniqueOrThrow({ where: { id: body.source.id } });
    expect(stored.lastCursor).toBe('12');
    expect(await prisma.task.count()).toBe(2);
  });

  it('неизвестный чат — 404, не вошли — 503', async () => {
    vi.mocked(getTelegram).mockResolvedValue(gateway());
    await request(app).post('/api/sources').send({ type: 'TELEGRAM', chatId: '999' }).expect(404);

    vi.mocked(getTelegram).mockRejectedValue(
      new TelegramNotConnected('Вход в Telegram не выполнен'),
    );
    const res = await request(app).get('/api/telegram/chats').expect(503);
    expect(res.body.error).toBe('Вход в Telegram не выполнен');
  });
});
