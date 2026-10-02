'use client';

import { IMAGE_TYPES, MAX_IMAGE_BYTES, type ExtractResult } from '@nakanune/shared';
import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { card, field, ghostButton, primaryButton } from '@/components/ui';
import { useTasksStore } from '@/store/tasks';

/**
 * Вставка текста или фото доски на разбор. В StudyPlan это была панель «Paste» с кнопкой
 * извлечения; фото — новое (раздел 11.5 ТЗ).
 */
export function PasteForm({ onResult }: { onResult: (result: ExtractResult) => void }) {
  const extractFromText = useTasksStore((s) => s.extractFromText);
  const extractFromImage = useTasksStore((s) => s.extractFromImage);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'text' | 'photo' | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy('text');
    const result = await extractFromText(text);
    setBusy(null);
    if (result) {
      onResult(result);
      setText('');
    }
  }

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Сбрасываем выбор: то же фото можно будет выбрать снова
    event.target.value = '';
    if (!file || busy) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error('Это не фото', { description: 'Подойдут JPEG, PNG, WEBP или HEIC' });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Фото слишком большое', { description: 'Не больше 10 МБ' });
      return;
    }
    setBusy('photo');
    const result = await extractFromImage(file);
    setBusy(null);
    if (result) onResult(result);
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
          'Вставь сообщение из чата группы, например:\nМатан: к пятнице №1234–1240 из Демидовича #кр\n\nИли выдели несколько сообщений в Telegram Desktop и скопируй — переписка разберётся целиком'
        }
        aria-label="Текст с заданиями"
        className={`${field} w-full resize-y`}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">Ctrl/⌘+Enter — разобрать</p>
        <div className="flex gap-2">
          {/* Без capture: на телефоне можно и снять, и выбрать из галереи */}
          <input
            ref={photoInput}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            onChange={(event) => void onPhoto(event)}
            className="hidden"
            aria-hidden
            tabIndex={-1}
          />
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            disabled={busy !== null}
            className={`${ghostButton} text-sm`}
            title="Фото доски, конспекта или скриншот — разберёт ИИ"
          >
            {busy === 'photo' ? 'Читаю фото…' : 'Фото доски'}
          </button>
          <button type="submit" disabled={busy !== null || !text.trim()} className={primaryButton}>
            {busy === 'text' ? 'Разбираю…' : 'Разобрать'}
          </button>
        </div>
      </div>
    </form>
  );
}
