import { Fragment } from 'react';

// Только http(s): javascript:… и прочие схемы остаются текстом
const LINK = /(https?:\/\/[^\s<>"'«»]+)/u;

/** Текст, в котором ссылки кликабельны (описание задания — ссылки из сообщения). */
export function Linkified({ text, className }: { text: string; className?: string }) {
  return (
    <p className={`break-words whitespace-pre-line ${className ?? ''}`}>
      {text.split(LINK).map((part, index) =>
        // После split с группой нечётные элементы — сами ссылки
        index % 2 === 1 ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-400"
          >
            {part}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
