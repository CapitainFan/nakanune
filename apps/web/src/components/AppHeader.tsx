'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTasksStore } from '@/store/tasks';

const TABS = [
  { href: '/', label: 'Задания' },
  { href: '/calendar', label: 'Календарь' },
  { href: '/inbox', label: 'Входящие' },
  { href: '/sources', label: 'Источники' },
];

export function AppHeader() {
  const pathname = usePathname();
  // Сколько заданий ждут проверки — число, а не новый массив: компонент не перерисуется зря
  const inboxCount = useTasksStore(
    (s) => s.tasks.filter((task) => task.status === 'INBOX' && !task.archived).length,
  );

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 overflow-x-auto px-4 py-3 sm:gap-6">
        <Link href="/" className="font-semibold tracking-tight">
          Nakanune
        </Link>
        <nav className="flex gap-1 text-sm">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            const count = tab.href === '/inbox' ? inboxCount : 0;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 whitespace-nowrap ${
                  active
                    ? 'bg-zinc-100 font-medium dark:bg-zinc-800'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className="rounded-full bg-white px-1.5 text-xs font-medium text-zinc-900 ring-1 ring-zinc-300 dark:ring-0"
                    aria-label={`на проверку: ${count}`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
