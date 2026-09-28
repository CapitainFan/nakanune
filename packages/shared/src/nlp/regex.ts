// Граница слова \b в JS знает только латиницу: /\bзавтра\b/ не найдёт «завтра».
// Поэтому «слово целиком» описываем сами: слева и справа не буква, не цифра и не «_».
export const WORD_CHAR = '[\\p{L}\\p{N}_]';
export const WORD_START = `(?<!${WORD_CHAR})`;
export const WORD_END = `(?!${WORD_CHAR})`;

/** Регэксп для слова (или фразы) целиком. body — фрагмент регэкспа. */
export function wholeWord(body: string, flags = 'iu'): RegExp {
  return new RegExp(`${WORD_START}(?:${body})${WORD_END}`, flags);
}

/** Экранирует текст, чтобы вставить его в регэксп буквально. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
