import { ServerStatus } from '@/components/ServerStatus';

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-16 sm:py-24">
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Nakanune</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Трекер домашних заданий: сам собирает ДЗ из Telegram-групп и Moodle и показывает, что
          сделать к какому дню.
        </p>
      </header>

      <ServerStatus />

      <p className="text-sm text-zinc-500">
        Этап 0 — каркас. Вкладки «Задания» и «Календарь» появятся на Этапе 2.
      </p>
    </main>
  );
}
