'use client';

import type {
  SourceDto,
  SourceSyncResult,
  TelegramChatDto,
  TelegramStatus,
} from '@nakanune/shared';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { card, ghostButton, primaryButton } from '@/components/ui';
import { api, describeError } from '@/lib/api';

const code = 'rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800';

/**
 * Telegram: статус входа и выбор групп. Сам вход — только в терминале (pnpm tg:login):
 * номер, код и пароль 2FA не проходят через браузер и сервер.
 */
export function TelegramPanel({
  onAdded,
}: {
  onAdded: (source: SourceDto, sync: SourceSyncResult) => Promise<void>;
}) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [chats, setChats] = useState<TelegramChatDto[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.getTelegramStatus().then(
      (next) => {
        if (!cancelled) setStatus(next);
      },
      (error: unknown) => {
        toast.error('Не удалось проверить Telegram', { description: describeError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  async function loadChats() {
    setBusy('chats');
    try {
      setChats(await api.getTelegramChats());
    } catch (error) {
      toast.error('Не удалось получить список чатов', { description: describeError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function add(chat: TelegramChatDto) {
    setBusy(chat.id);
    try {
      const result = await api.addSource({ type: 'TELEGRAM', chatId: chat.id });
      setChats(
        (list) =>
          list?.map((item) => (item.id === chat.id ? { ...item, added: true } : item)) ?? null,
      );
      await onAdded(result.source, result.sync);
    } catch (error) {
      toast.error('Не удалось добавить чат', { description: describeError(error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`${card} space-y-3 p-4`}>
      <h2 className="font-medium">Telegram</h2>

      {status === null ? (
        <p className="text-sm text-zinc-500">Проверяю…</p>
      ) : !status.configured ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            Открой{' '}
            <a
              href="https://my.telegram.org/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              my.telegram.org → API development tools
            </a>{' '}
            и создай приложение (название любое).
          </li>
          <li>
            Впиши <code className={code}>api_id</code> и <code className={code}>api_hash</code> в{' '}
            <code className={code}>.env</code> как <code className={code}>TG_API_ID</code> и{' '}
            <code className={code}>TG_API_HASH</code> и перезапусти сервер.
          </li>
          <li>
            Войди из терминала: <code className={code}>pnpm tg:login</code>.
          </li>
        </ol>
      ) : !status.loggedIn ? (
        <div className="space-y-2 text-sm">
          <p className="text-zinc-600 dark:text-zinc-400">{status.error}</p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Вход — в терминале: <code className={code}>pnpm tg:login</code> (номер → код из Telegram
            → пароль 2FA, если есть).
          </p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className={`${ghostButton} text-sm`}
          >
            Проверить снова
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-zinc-600 dark:text-zinc-400">
              Вход выполнен: {status.me?.name}
              {status.me?.username && ` (@${status.me.username})`}
            </p>
            {chats === null && (
              <button
                type="button"
                onClick={() => void loadChats()}
                disabled={busy === 'chats'}
                className={primaryButton}
              >
                {busy === 'chats' ? 'Загружаю…' : 'Выбрать чаты'}
              </button>
            )}
          </div>

          {chats !== null &&
            (chats.length === 0 ? (
              <p className="text-sm text-zinc-500">Групп и каналов не нашлось.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {chats.map((chat) => (
                  <li key={chat.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate">
                      {chat.title}{' '}
                      <span className="text-zinc-400">{chat.isGroup ? 'группа' : 'канал'}</span>
                    </span>
                    {chat.added ? (
                      <span className="text-zinc-400">добавлен</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void add(chat)}
                        disabled={busy !== null}
                        className={ghostButton}
                      >
                        {busy === chat.id ? 'Читаю…' : 'Добавить'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ))}

          <p className="text-xs text-zinc-500">
            Читаются только добавленные чаты, раз в час; при добавлении — последняя неделя.
            Приложение ничего не пишет и не отмечает прочитанным. В ИИ уходят только сообщения,
            похожие на задания, без имён авторов. Выйти:{' '}
            <code className={code}>pnpm tg:logout</code>.
          </p>
        </div>
      )}
    </section>
  );
}
