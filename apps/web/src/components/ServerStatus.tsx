'use client';

import { HealthResponseSchema, type HealthResponse } from '@nakanune/shared';
import { useEffect, useState } from 'react';
import { API_URL, apiHeaders } from '@/lib/api';

const isLocal = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_URL);

type State = { kind: 'loading' } | { kind: 'ok'; health: HealthResponse } | { kind: 'error' };

/** Строка в подвале: отвечают ли API-сервер и база (браузер → API с CORS → Postgres). */
export function ServerStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_URL}/api/health`, { signal: controller.signal, headers: apiHeaders() })
      // Без базы сервер отвечает 503, но с тем же телом — поэтому статус не проверяем.
      .then((res) => res.json())
      .then((json) => setState({ kind: 'ok', health: HealthResponseSchema.parse(json) }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      });

    return () => controller.abort();
  }, []);

  if (state.kind === 'loading') return null;

  if (state.kind === 'error') {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">
        <Dot className="bg-red-500" /> API-сервер не отвечает на {API_URL}.{' '}
        {isLocal ? (
          <>
            Запусти его: <code>pnpm dev:server</code>
          </>
        ) : (
          'Проверь, что на компьютере с сервером запущены сервер и ngrok'
        )}
      </p>
    );
  }

  const dbUp = state.health.db === 'up';
  return (
    <p className="text-xs text-zinc-500">
      <Dot className="bg-emerald-500" /> API работает ·{' '}
      <Dot className={dbUp ? 'bg-emerald-500' : 'bg-red-500'} /> база{' '}
      {dbUp ? 'работает' : 'недоступна'}
    </p>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block size-2 rounded-full ${className}`} aria-hidden />;
}
