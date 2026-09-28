// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: server.js — nlpDetectSubject. Там были зашитые английские ключевые слова
// для четырёх предметов; здесь предметы и их алиасы берутся из базы.
import type { SubjectDto } from '../schemas/subject';
import { WORD_START, escapeRegExp, wholeWord } from './regex';

export type SubjectRef = Pick<SubjectDto, 'id' | 'name' | 'shortCode' | 'aliases'>;
export type SubjectMatch = { subjectId: string; phrase: string };

type Pattern = { regex: RegExp; onFolded: boolean };

/** Регистр и «ё» не важны: «Матан» = «матан», «зачёт» = «зачет». Длина строки не меняется. */
const fold = (text: string) => text.toLowerCase().replaceAll('ё', 'е');

/**
 * Основа слова, чтобы узнавать его в других падежах: «алгебра» → «алгеб» (алгебре),
 * «матан» → «мата» (матану). Слова до 4 букв сравниваются целиком.
 */
function stem(word: string): string {
  if (word.length >= 7) return word.slice(0, -2);
  return word.slice(0, -1);
}

function aliasPattern(alias: string): Pattern | null {
  const words = alias.match(/[\p{L}\p{N}]+/gu);
  if (!words) return null;

  const [first] = words;
  if (words.length === 1 && first!.length <= 4) {
    // Сокращения («МА», «ДУ», «англ») — только целым словом. Если в них есть заглавные —
    // ещё и с учётом регистра: «МА» не должно находиться в «ма»
    return /\p{Lu}/u.test(first!)
      ? { regex: wholeWord(escapeRegExp(first!), 'u'), onFolded: false }
      : { regex: wholeWord(escapeRegExp(fold(first!)), 'iu'), onFolded: true };
  }

  // Основы всех слов подряд: «мат. анализ» найдёт «мат анализу»
  const body = words
    .map((word) =>
      word.length <= 4 ? escapeRegExp(fold(word)) : `${escapeRegExp(stem(fold(word)))}\\p{L}*`,
    )
    .join('[^\\p{L}\\p{N}]+');
  return { regex: new RegExp(`${WORD_START}${body}`, 'iu'), onFolded: true };
}

/**
 * Готовит поиск предмета в тексте по названию, короткому коду и алиасам.
 * Если подходят несколько, побеждает самое длинное совпадение — оно конкретнее:
 * «практикум по программированию» важнее, чем «прога» внутри «программированию».
 */
export function buildSubjectMatcher(subjects: SubjectRef[]) {
  const compiled = subjects.map((subject) => ({
    id: subject.id,
    patterns: [subject.name, subject.shortCode ?? '', ...subject.aliases].flatMap((alias) => {
      const pattern = aliasPattern(alias);
      return pattern ? [pattern] : [];
    }),
  }));

  return function matchSubject(text: string): SubjectMatch | null {
    const folded = fold(text);
    let best: { subjectId: string; start: number; length: number } | null = null;

    for (const subject of compiled) {
      for (const { regex, onFolded } of subject.patterns) {
        const match = regex.exec(onFolded ? folded : text);
        if (match && (!best || match[0].length > best.length)) {
          best = { subjectId: subject.id, start: match.index, length: match[0].length };
        }
      }
    }
    if (!best) return null;
    return { subjectId: best.subjectId, phrase: text.slice(best.start, best.start + best.length) };
  };
}

/** Предмет по названию из ответа ИИ: сначала точное совпадение, потом как в тексте. */
export function findSubjectByName(name: string, subjects: SubjectRef[]): string | null {
  const wanted = fold(name.trim());
  const exact = subjects.find((subject) =>
    [subject.name, subject.shortCode ?? '', ...subject.aliases].some(
      (alias) => fold(alias) === wanted,
    ),
  );
  return exact?.id ?? buildSubjectMatcher(subjects)(name)?.subjectId ?? null;
}
