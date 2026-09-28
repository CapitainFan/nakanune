// Повторяющиеся наборы Tailwind-классов. Компонентной библиотеки пока нет — хватает этого.

export const card = 'rounded-xl border border-zinc-200 dark:border-zinc-800';

export const field =
  'rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-400';

export const primaryButton =
  'rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300';

// Без размера шрифта: он наследуется от контейнера (два конфликтующих text-* на одном
// элементе — лотерея, какой победит, зависит от порядка правил в CSS)
export const ghostButton =
  'rounded-md px-2 py-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800';

export const badge = 'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5';
