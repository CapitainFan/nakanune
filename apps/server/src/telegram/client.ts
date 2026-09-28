import bigInt from 'big-integer';
import { Api, TelegramClient, errors } from 'teleproto';
import { LogLevel } from 'teleproto/extensions/Logger';
import { StringSession } from 'teleproto/sessions';
import { env } from '../env';
import { loadSession } from './session';

/** Чат, из которого читаем: обычная группа или супергруппа/канал (у них нужен accessHash). */
export type TelegramPeer = { kind: 'chat' | 'channel'; id: string; accessHash: string | null };
export type TelegramChat = TelegramPeer & { title: string; isGroup: boolean };
export type TelegramMessage = { id: number; sentAt: Date; text: string };

/** Всё, что приложению нужно от Telegram. В тестах подменяется целиком. */
export type TelegramGateway = {
  me(): Promise<{ name: string; username: string | null }>;
  listChats(): Promise<TelegramChat[]>;
  /**
   * Сообщения новее minId (от старых к новым). since — не старше этой даты (для первой
   * синхронизации). maxId — самый большой id среди просмотренных, в том числе служебных
   * сообщений без текста: курсор должен уйти за них.
   */
  fetchMessages(
    peer: TelegramPeer,
    options: { minId: number; since: Date | null; limit: number },
  ): Promise<{ messages: TelegramMessage[]; maxId: number }>;
};

/** Telegram не настроен или вход не выполнен — объясняем, что сделать. */
export class TelegramNotConnected extends Error {}

/** Telegram просит подождать (FloodWait) — пробуем в следующий раз, а не долбим API. */
export class TelegramFloodWait extends Error {
  constructor(readonly seconds: number) {
    super(`Telegram просит подождать ${seconds} с — попробую при следующей проверке`);
  }
}

export function telegramConfigured(): boolean {
  return Boolean(env.TG_API_ID && env.TG_API_HASH);
}

function apiCredentials(): { apiId: number; apiHash: string } {
  if (!env.TG_API_ID || !env.TG_API_HASH) {
    throw new TelegramNotConnected(
      'Telegram не настроен: впиши TG_API_ID и TG_API_HASH в .env (их выдают на my.telegram.org)',
    );
  }
  return { apiId: env.TG_API_ID, apiHash: env.TG_API_HASH };
}

/** Клиент без логов (в логах GramJS/teleproto бывают id и служебные данные). */
export function createClient(session: string): TelegramClient {
  const { apiId, apiHash } = apiCredentials();
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 3,
    // Короткие FloodWait клиент переждёт сам, длинные — ошибка (TelegramFloodWait)
    floodSleepThreshold: 30,
  });
  client.setLogLevel(LogLevel.NONE);
  return client;
}

// Один клиент на процесс. version — время сохранения сессии: выполнили tg:login заново
// (отдельным процессом) — переподключаемся с новой сессией
let current: { client: TelegramClient; version: number } | null = null;
let connecting: Promise<TelegramClient> | null = null;

async function connectedClient(): Promise<TelegramClient> {
  apiCredentials();
  const stored = await loadSession();
  if (!stored) {
    throw new TelegramNotConnected(
      'Вход в Telegram не выполнен: запусти в терминале pnpm tg:login',
    );
  }
  if (current?.version === stored.updatedAt.getTime()) return current.client;

  connecting ??= (async () => {
    await current?.client.disconnect();
    current = null;
    const client = createClient(stored.session);
    await client.connect();
    if (!(await client.checkAuthorization())) {
      await client.disconnect();
      throw new TelegramNotConnected(
        'Сессия Telegram больше не действует (вышли на другом устройстве?) — выполни pnpm tg:login заново',
      );
    }
    current = { client, version: stored.updatedAt.getTime() };
    return client;
  })().finally(() => {
    connecting = null;
  });
  return connecting;
}

export async function getTelegram(): Promise<TelegramGateway> {
  const client = await connectedClient();
  return {
    async me() {
      const me = await client.getMe();
      const name = [me.firstName, me.lastName].filter(Boolean).join(' ') || 'без имени';
      return { name, username: me.username ?? null };
    },

    async listChats() {
      const dialogs = await withFloodWait(() => client.getDialogs({ limit: 200 }));
      return dialogs.flatMap((dialog): TelegramChat[] => {
        const entity = dialog.entity;
        if (entity instanceof Api.Chat && !entity.deactivated && !entity.migratedTo) {
          return [
            {
              kind: 'chat',
              id: entity.id.toString(),
              accessHash: null,
              title: entity.title,
              isGroup: true,
            },
          ];
        }
        if (entity instanceof Api.Channel && !entity.left) {
          return [
            {
              kind: 'channel',
              id: entity.id.toString(),
              accessHash: entity.accessHash?.toString() ?? null,
              title: entity.title,
              // Супергруппа — это группа; broadcast — канал (например, канал преподавателя)
              isGroup: Boolean(entity.megagroup),
            },
          ];
        }
        return [];
      });
    },

    async fetchMessages(peer, { minId, since, limit }) {
      const input =
        peer.kind === 'chat'
          ? new Api.InputPeerChat({ chatId: bigInt(peer.id) })
          : new Api.InputPeerChannel({
              channelId: bigInt(peer.id),
              accessHash: bigInt(peer.accessHash ?? '0'),
            });
      const messages: TelegramMessage[] = [];
      let maxId = minId;
      let offsetId = 0;
      // Страницы от новых к старым. Больше limit за раз не берём: если в группе за час
      // написали больше, самые старые из новых пропустятся — для ДЗ это приемлемо
      pages: while (messages.length < limit) {
        const page = await withFloodWait(() =>
          client.getMessages(input, { limit: 100, minId, offsetId }),
        );
        for (const message of page) {
          maxId = Math.max(maxId, message.id);
          const sentAt = new Date(message.date * 1000);
          if (since && sentAt < since) break pages;
          const text = typeof message.message === 'string' ? message.message.trim() : '';
          if (text) messages.push({ id: message.id, sentAt, text });
        }
        const last = page.at(-1);
        if (!last || page.length < 100) break;
        offsetId = last.id;
      }
      return { messages: messages.slice(0, limit).sort((a, b) => a.id - b.id), maxId };
    },
  };
}

async function withFloodWait<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof errors.FloodWaitError) throw new TelegramFloodWait(error.seconds);
    throw error;
  }
}

/** Закрыть соединение при остановке сервера. */
export async function disconnectTelegram(): Promise<void> {
  await current?.client.disconnect();
  current = null;
}
