'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTasksStore } from '@/store/tasks';

const TABS = [
  { href: '/', label: 'Задания' },
  { href: '/calendar', label: 'Календарь' },
  { href: '/inbox', label: 'Входящие' },
  { href: '/sources', label: 'Источники' },
];

const badgeClass =
  'rounded-full bg-white px-1.5 text-xs font-medium text-zinc-900 ring-1 ring-zinc-300 dark:ring-0';

/**
 * Шапка с навигацией. На широком экране — вкладки в строку, на узком (меньше 640 px,
 * телефон и установленное приложение) — кнопка-бургер и выпадающее меню.
 */
export function AppHeader() {
  const pathname = usePathname();
  // Сколько заданий ждут проверки — число, а не новый массив: компонент не перерисуется зря
  const inboxCount = useTasksStore(
    (s) => s.tasks.filter((task) => task.status === 'INBOX' && !task.archived).length,
  );
  // Меню открыто «на этой странице»: перешли на другую — закрылось само, без эффекта
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const headerRef = useRef<HTMLElement>(null);

  // Пока меню открыто: Escape и клик мимо шапки закрывают его
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenOn(null);
    };
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setOpenOn(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const links = (variant: 'bar' | 'menu') =>
    TABS.map((tab) => {
      const active = pathname === tab.href;
      const count = tab.href === '/inbox' ? inboxCount : 0;
      return (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active ? 'page' : undefined}
          // Тот же адрес — pathname не изменится, поэтому закрываем меню явно
          onClick={() => setOpenOn(null)}
          className={`flex items-center gap-1.5 rounded-md whitespace-nowrap ${
            variant === 'bar' ? 'px-3 py-1.5' : 'px-3 py-2.5'
          } ${
            active
              ? 'bg-zinc-100 font-medium dark:bg-zinc-800'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
          }`}
        >
          {tab.label}
          {count > 0 && (
            <span className={badgeClass} aria-label={`на проверку: ${count}`}>
              {count}
            </span>
          )}
        </Link>
      );
    });

  return (
    <header ref={headerRef} className="relative border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Nakanune
        </Link>

        <nav aria-label="Разделы" className="hidden gap-1 text-sm sm:flex">
          {links('bar')}
        </nav>

        <button
          type="button"
          onClick={() => setOpenOn(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          className="relative ml-auto rounded-md p-2 text-zinc-700 hover:bg-zinc-100 sm:hidden dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            {open ? (
              <path
                d="M5 5 L15 15 M15 5 L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M3 6 H17 M3 10 H17 M3 14 H17"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            )}
          </svg>
          {/* Новое во «Входящих» видно и при закрытом меню */}
          {!open && inboxCount > 0 && (
            <span className={`${badgeClass} absolute -top-1 -right-1`} aria-hidden>
              {inboxCount}
            </span>
          )}
        </button>
      </div>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Разделы"
          className="absolute inset-x-0 top-full z-20 border-b border-zinc-200 bg-background px-4 py-2 shadow-sm sm:hidden dark:border-zinc-800"
        >
          <div className="flex flex-col gap-0.5 text-sm">{links('menu')}</div>
        </nav>
      )}
    </header>
  );
}
