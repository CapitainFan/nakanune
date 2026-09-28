'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Задания' },
  { href: '/calendar', label: 'Календарь' },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Nakanune
        </Link>
        <nav className="flex gap-1 text-sm">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 ${
                  active
                    ? 'bg-zinc-100 font-medium dark:bg-zinc-800'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
