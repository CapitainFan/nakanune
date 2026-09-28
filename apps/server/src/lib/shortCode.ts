// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Было: name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'SUB' —
// кириллица выбрасывалась целиком, и любой русский предмет получал код «SUB».

/**
 * Короткий код предмета из названия:
 * «Математический анализ» → «МА», «Алгебра и теория чисел» → «АиТЧ», «Геометрия» → «Геом».
 */
export function makeShortCode(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const [first] = words;
  if (!first) return name.trim().slice(0, 4);
  if (words.length === 1) return capitalize(first.slice(0, 4));

  // Первые буквы слов; короткие служебные слова («и», «по», «в») — строчной буквой
  return words
    .map((word) => (word.length <= 2 ? word.charAt(0).toLowerCase() : word.charAt(0).toUpperCase()))
    .join('')
    .slice(0, 6);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
