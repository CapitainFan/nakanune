// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: server.js — nlpSplitSegments, nlpTaskScore, nlpCleanTitle, nlpExtractTasksFromText.
// Структура та же, словари русские. Отличия: предмет и срок из заголовка переходят на пункты
// списка под ним, приоритет больше не выводится из уверенности (в StudyPlan confidence > 70
// давало high), а если задание не нашлось — оно не выдумывается (для Telegram), кроме
// явной вставки текста руками (wholeTextFallback).
import { normalizeTitle } from '../dedupe';
import { extractLabels } from '../labels';
import type { Priority } from '../schemas/task';
import { extractDate, type DueHint } from './dates';
import { WORD_END, WORD_START, escapeRegExp } from './regex';
import { buildSubjectMatcher, type SubjectRef } from './subject';

export type HeuristicTask = {
  title: string;
  subjectId: string | null;
  due: DueHint | null;
  labels: string[];
  priority: Priority;
  confidence: number;
};

/** Порог «похоже на задание» — как в StudyPlan: лучше пропустить лишнее, чем потерять ДЗ. */
export const TASK_SCORE_THRESHOLD = 30;
/** Эвристике доверяем меньше, чем ИИ: не выше 70 — ниже порога автопринятия (75). */
const MAX_HEURISTIC_CONFIDENCE = 70;

const VERB = new RegExp(
  `${WORD_START}(?:сда[тюёевлч]|реш|выполн|сдела|прочит|прочес|прочт|выуч|подготов|напис|законспект|повтор|додела|доказ|разобра|разбер)\\p{L}*`,
  'iu',
);
const MARKER = new RegExp(
  `(?:${WORD_START}(?:дз|д/з|кр|стр|упр|домашк\\p{L}*|задани\\p{L}*|упражнени\\p{L}*|параграф\\p{L}*|лаб\\p{L}*|реферат\\p{L}*|доклад\\p{L}*|контрольн\\p{L}*|коллоквиум\\p{L}*|зач[её]т\\p{L}*|экзамен\\p{L}*|тест\\p{L}*)${WORD_END})|№|§`,
  'iu',
);
const GREETING = new RegExp(
  `^(?:всем\\s+)?(?:привет\\p{L}*|здравствуй\\p{L}*|добр\\p{L}*\\s+(?:день|утро|вечер)|хай)${WORD_END}`,
  'iu',
);
const SMALL_TALK = new RegExp(
  `^(?:спасибо|спс|благодарю|ок|окей|ага|да|нет|понятно|понял|поняла|хорошо|ясно|\\+|👍)${WORD_END}[\\s!.)]*$`,
  'iu',
);
const FILLER = new RegExp(
  `^(?:(?:дз|д/з|домашк\\p{L}*|домашнее\\s+задание|задание|напоминаю|напоминание|внимание|важно|срочно|пожалуйста|нужно|надо|необходимо|не\\s+забудьте|не\\s+забыть)${WORD_END}[\\s:,.!—–-]*)+`,
  'iu',
);
const HIGH_PRIORITY = new RegExp(
  `${WORD_START}(?:контрольн\\p{L}*|коллоквиум\\p{L}*|зач[её]т\\p{L}*|экзамен\\p{L}*|кр|срочно|важно|обязательно)${WORD_END}`,
  'iu',
);
const LOW_PRIORITY = new RegExp(
  `${WORD_START}(?:по\\s+желанию|необязательн\\p{L}*|факультативн\\p{L}*)`,
  'iu',
);

/**
 * Режет сообщение на кандидатов: строки, предложения, пункты списка.
 * В StudyPlan резало и по «\d+[.)]» в середине строки — «на 5.10» ломалось пополам.
 */
export function splitSegments(text: string): string[] {
  return text
    .split(/\r?\n+|(?<=[.!?])\s+(?=[А-ЯЁA-Z])/u)
    .map((segment) => segment.replace(/^\s*(?:\d+[.)]|[-•*–—])\s+/u, '').trim())
    .filter((segment) => segment.length >= 3);
}

/** Насколько отрывок похож на задание, 0–100. Веса — из StudyPlan. */
export function taskScore(
  segment: string,
  found: { hasDate: boolean; hasSubject: boolean },
): number {
  let score = 0;
  if (VERB.test(segment)) score += 30;
  if (MARKER.test(segment)) score += 25;
  if (found.hasDate) score += 25;
  if (segment.length > 15 && segment.length < 300) score += 15;
  if (found.hasSubject) score += 20;
  // Шум: приветствия, «спасибо», «ок» — и вопросы: «что задали на завтра?» спрашивает
  // о задании, а само задание придёт ответом
  const isQuestion = segment.trimEnd().endsWith('?');
  if (GREETING.test(segment) || SMALL_TALK.test(segment) || isQuestion) score -= 40;
  return Math.max(0, Math.min(100, score));
}

/** Заголовок без срока, предмета, меток и вводных слов: «Матан: к пятнице решить №5 #кр» → «Решить №5». */
export function cleanTitle(segment: string, phrases: string[]): string {
  let title = segment;
  for (const phrase of phrases) {
    // Вместе с фразой убираем предлог перед ней и двоеточие/тире после: «по матану:», «Матан —»
    const pattern = new RegExp(
      `(?:${WORD_START}(?:по|для)\\s+)?${escapeRegExp(phrase)}(?:\\s*[:—–-](?=\\s|$))?`,
      'iu',
    );
    title = title.replace(pattern, ' ');
  }
  title = extractLabels(title)
    .cleanTitle.replace(FILLER, '')
    .replace(/\s+([,.:;!?])/g, '$1')
    .replace(/^[\s:;,.!?–—-]+|[\s:;,–—-]+$/gu, '')
    .trim();

  if (title.length > 120) title = `${title.slice(0, 119).replace(/\s+\S*$/, '')}…`;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function priorityOf(text: string): Priority {
  if (HIGH_PRIORITY.test(text)) return 'high';
  if (LOW_PRIORITY.test(text)) return 'low';
  return 'medium';
}

export type HeuristicOptions = {
  sentAt: Date;
  subjects: SubjectRef[];
  /** Ничего не нашлось — вернуть весь текст одним заданием (для ручной вставки, не для чатов). */
  wholeTextFallback?: boolean;
};

/** Эвристический разбор без ИИ: фолбэк, когда Gemini недоступен, и префильтр для Telegram. */
export function extractTasksHeuristic(text: string, options: HeuristicOptions): HeuristicTask[] {
  const matchSubject = buildSubjectMatcher(options.subjects);
  const tasks: HeuristicTask[] = [];
  const seen = new Set<string>();
  // Сообщение целиком короче 10 символов — шум: «ок», «+», стикер
  if (text.trim().length < 10) return tasks;

  let contextSubject: string | null = null;
  let contextDue: DueHint | null = null;

  for (const segment of splitSegments(text)) {
    const subject = matchSubject(segment);
    const date = extractDate(segment, options.sentAt);
    // Заголовок «ДЗ на пятницу:» или «Матан:» задаёт срок и предмет пунктам списка под ним
    const subjectId = subject?.subjectId ?? contextSubject;
    const due = date?.hint ?? contextDue;
    if (subject) contextSubject = subject.subjectId;
    if (date) contextDue = date.hint;

    const score = taskScore(segment, { hasDate: due !== null, hasSubject: subjectId !== null });
    if (score < TASK_SCORE_THRESHOLD) continue;

    const title = cleanTitle(segment, [
      ...(date?.phrases ?? []),
      ...(subject ? [subject.phrase] : []),
    ]);
    const key = normalizeTitle(title);
    // Строка-заголовок после чистки пустеет («ДЗ на пятницу:» → «») — это не задание
    if (key.length < 3 || seen.has(key)) continue;
    seen.add(key);

    tasks.push({
      title,
      subjectId,
      due,
      labels: extractLabels(segment).labels,
      priority: priorityOf(segment),
      confidence: Math.min(MAX_HEURISTIC_CONFIDENCE, score + (due ? 10 : 0) + (subjectId ? 10 : 0)),
    });
  }

  if (tasks.length === 0 && options.wholeTextFallback) {
    const date = extractDate(text, options.sentAt);
    tasks.push({
      title: cleanTitle(text.replace(/\s+/g, ' '), date?.phrases ?? []),
      subjectId: matchSubject(text)?.subjectId ?? null,
      due: date?.hint ?? null,
      labels: extractLabels(text).labels,
      priority: priorityOf(text),
      confidence: 20,
    });
  }
  return tasks;
}
