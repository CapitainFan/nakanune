'use client';

import type { ExtractResult } from '@nakanune/shared';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { card, field, primaryButton } from '@/components/ui';
import { useTasksStore } from '@/store/tasks';

/** Вставка текста на разбор. В StudyPlan это была панель «Paste» с кнопкой извлечения. */
export function PasteForm({ onResult }: { onResult: (result: ExtractResult) => void }) {
  const extractFromText = useTasksStore((s) => s.extractFromText);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const result = await extractFromText(text);
    setBusy(false);
    if (result) {
      onResult(result);
      setText('');
    }
  }

  // Ctrl/Cmd+Enter — разобрать, не отрывая рук от клавиатуры
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit();
  }

  return (
    <form onSubmit={submit} className={`${card} space-y-2 p-3`}>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        rows={4}
        placeholder={
          'Вставь сообщение из чата группы, например:\nМатан: к пятнице №1234–1240 из Демидовича #кр'
        }
        aria-label="Текст с заданиями"
        className={`${field} w-full resize-y`}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">Ctrl/⌘+Enter — разобрать</p>
        <button type="submit" disabled={busy || !text.trim()} className={primaryButton}>
          {busy ? 'Разбираю…' : 'Разобрать'}
        </button>
      </div>
    </form>
  );
}
