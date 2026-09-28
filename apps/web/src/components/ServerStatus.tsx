'use client';

import { HealthResponseSchema, type HealthResponse } from '@nakanune/shared';
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

type State = { kind: 'loading' } | { kind: 'ok'; health: HealthResponse } | { kind: 'error' };

type Status = 'checking' | 'up' | 'down' | 'unknown';

const STATUS_VIEW: Record<Status, { text: string; dot: string }> = {
  checking: { text: 'проверяю…', dot: 'animate-pulse bg-zinc-400' },
  up: { text: 'работает', dot: 'bg-emerald-500' },
  down: { text: 'нет связи', dot: 'bg-red-500' },
  unknown: { text: 'неизвестно', dot: 'bg-zinc-400' },
};

/** Проверяет всю цепочку: браузер → API-сервер (CORS) → Postgres. */
export function ServerStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_URL}/api/health`, { signal: controller.signal })
      // Без базы сервер отвечает 503, но с тем же телом — поэтому статус не проверяем.
      .then((res) => res.json())
      .then((json) => setState({ kind: 'ok', health: HealthResponseSchema.parse(json) }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      });

    return () => controller.abort();
  }, []);

  const server: Status =
    state.kind === 'loading' ? 'checking' : state.kind === 'ok' ? 'up' : 'down';
  const db: Status =
    state.kind === 'loading' ? 'checking' : state.kind === 'ok' ? state.health.db : 'unknown';

  return (
    <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="mb-3 text-sm font-medium text-zinc-500">Состояние</h2>
      <ul className="space-y-2">
        <StatusRow label="API-сервер" status={server} />
        <StatusRow label="База данных" status={db} />
      </ul>
      {state.kind === 'error' && (
        <p className="mt-4 text-sm text-zinc-500">
          Сервер не отвечает на {API_URL}. Запусти его: <code>pnpm dev:server</code>
        </p>
      )}
    </section>
  );
}

function StatusRow({ label, status }: { label: string; status: Status }) {
  const view = STATUS_VIEW[status];
  return (
    <li className="flex items-center gap-3">
      <span className={`size-2.5 rounded-full ${view.dot}`} aria-hidden />
      <span className="font-medium">{label}</span>
      <span className="text-zinc-500">{view.text}</span>
    </li>
  );
}
