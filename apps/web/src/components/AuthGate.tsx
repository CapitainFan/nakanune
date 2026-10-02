'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { card, field, primaryButton } from '@/components/ui';
import { API_URL, apiHeaders } from '@/lib/api';
import { useHydrated } from '@/lib/useHydrated';
import { useAuthStore } from '@/store/auth';
import { useScheduleStore } from '@/store/schedule';
import { useTasksStore } from '@/store/tasks';

/**
 * Если сервер требует ключ доступа (API_TOKEN) и ответил 401 — вместо страницы форма ключа.
 * Сервер без ключа (локальная разработка) сюда не приводит.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const needsToken = useAuthStore((s) => s.needsToken);
  return needsToken ? <TokenForm /> : children;
}

function TokenForm() {
  const setToken = useAuthStore((s) => s.setToken);
  const hadToken = useAuthStore((s) => s.token !== null);
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'wrong' | 'offline'>('idle');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const token = value.trim();
    if (!token) return;
    setState('checking');
    try {
      // Сначала проверяем ключ, потом запоминаем — неверный не сохранится
      const res = await fetch(`${API_URL}/api/subjects`, {
        headers: { ...apiHeaders(), Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setState('wrong');
        return;
      }
      setToken(token);
      void useTasksStore.getState().fetchInitialData();
      void useScheduleStore.getState().fetchSchedule();
    } catch {
      setState('offline');
    }
  }

  return (
    <form onSubmit={submit} className={`${card} mx-auto max-w-md space-y-3 p-5`}>
      <h1 className="font-medium">Ключ доступа</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {hadToken
          ? 'Сохранённый ключ не подошёл — возможно, его сменили на сервере.'
          : 'Сервер закрыт ключом, чтобы задания и сообщения из чатов не увидел посторонний.'}{' '}
        Ключ — значение <code className="font-mono text-xs">API_TOKEN</code> из{' '}
        <code className="font-mono text-xs">.env</code> сервера. Вводится один раз: браузер его
        запомнит.
      </p>
      <input
        type="password"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoComplete="current-password"
        aria-label="Ключ доступа"
        className={`${field} w-full font-mono`}
        autoFocus
      />
      {state === 'wrong' && (
        <p className="text-sm text-red-700 dark:text-red-400">Ключ не подошёл.</p>
      )}
      {state === 'offline' && (
        <p className="text-sm text-red-700 dark:text-red-400">
          Сервер не отвечает — проверь, что он и туннель запущены.
        </p>
      )}
      <button
        type="submit"
        disabled={!value.trim() || state === 'checking'}
        className={primaryButton}
      >
        {state === 'checking' ? 'Проверяю…' : 'Войти'}
      </button>
    </form>
  );
}

/** «Сменить ключ доступа» в подвале — только если ключ сохранён. */
export function ChangeTokenLink() {
  const hasToken = useAuthStore((s) => s.token !== null);
  const clearToken = useAuthStore((s) => s.clearToken);
  // Ключ лежит в localStorage — на сервере его нет; до гидрации не показываем
  const hydrated = useHydrated();
  if (!hydrated || !hasToken) return null;
  return (
    <button
      type="button"
      onClick={clearToken}
      className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-300"
    >
      Сменить ключ доступа
    </button>
  );
}
