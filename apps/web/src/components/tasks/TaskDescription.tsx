'use client';

import { useState } from 'react';
import { Linkified } from '@/components/Linkified';

/** Длиннее этого описание сворачивается до трёх строк (из Moodle приходят целые инструкции). */
const LONG_TEXT = 180;
const LONG_LINES = 3;

/** Описание задания: ссылки кликабельны, длинное — свёрнуто, разворачивается по кнопке. */
export function TaskDescription({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > LONG_TEXT || text.split('\n').length > LONG_LINES;

  return (
    <div className={className}>
      <Linkified text={text} className={long && !expanded ? 'line-clamp-3' : undefined} />
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-0.5 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-300"
        >
          {expanded ? 'Свернуть' : 'Показать полностью'}
        </button>
      )}
    </div>
  );
}
