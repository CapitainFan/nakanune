import type { TelegramChatDto, TelegramStatus } from '@nakanune/shared';
import { Router } from 'express';
import { prisma } from '../db';
import { HttpError } from '../lib/http';
import {
  TelegramFloodWait,
  TelegramNotConnected,
  getTelegram,
  telegramConfigured,
  type TelegramGateway,
} from '../telegram/client';

export const telegramRouter = Router();

/** Клиент Telegram или понятная ошибка: не настроен / не вошли — 503, FloodWait — 429. */
export async function connectedTelegram(): Promise<TelegramGateway> {
  try {
    return await getTelegram();
  } catch (error) {
    throw toHttpError(error);
  }
}

function toHttpError(error: unknown): unknown {
  if (error instanceof TelegramNotConnected) return new HttpError(503, error.message);
  if (error instanceof TelegramFloodWait) return new HttpError(429, error.message);
  return error;
}

/**
 * Подключён ли Telegram. Сам вход — только из терминала (pnpm tg:login): код и пароль 2FA
 * не должны ходить через браузер и сервер.
 */
telegramRouter.get('/status', async (_req, res) => {
  const status: TelegramStatus = {
    configured: telegramConfigured(),
    loggedIn: false,
    me: null,
    error: null,
  };
  try {
    const telegram = await getTelegram();
    status.me = await telegram.me();
    status.loggedIn = true;
  } catch (error) {
    if (!(error instanceof TelegramNotConnected || error instanceof TelegramFloodWait)) {
      console.error('Telegram: не удалось проверить вход', error);
    }
    status.error = error instanceof Error ? error.message : 'Не удалось подключиться к Telegram';
  }
  res.json(status);
});

/** Группы и каналы, в которых ты состоишь, — для выбора источника. */
telegramRouter.get('/chats', async (_req, res) => {
  const telegram = await connectedTelegram();
  let chats;
  try {
    chats = await telegram.listChats();
  } catch (error) {
    throw toHttpError(error);
  }
  const added = await prisma.source.findMany({
    where: { type: 'TELEGRAM' },
    select: { config: true },
  });
  const addedIds = new Set(
    added.map(({ config }) => (config as { peer?: { id?: string } }).peer?.id).filter(Boolean),
  );
  res.json(
    chats.map((chat): TelegramChatDto => ({
      id: chat.id,
      title: chat.title,
      isGroup: chat.isGroup,
      added: addedIds.has(chat.id),
    })),
  );
});
