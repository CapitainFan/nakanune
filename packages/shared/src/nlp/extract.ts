// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: server.js — nlpSplitSegments, nlpTaskScore, nlpCleanTitle, nlpExtractTasksFromText.
// Структура та же, словари русские. Отличия — под настоящие чаты:
// - предмет и срок из заголовка («ДЗ на пятницу:», «Друзи дз по плюсам:») и из вопроса
//   («А че по геоме») переходят на задания ниже и на ответы;
// - срок в конце сообщения («ДЕДЛАЙН 09.10!») относится ко всем заданиям сообщения;
// - «читать А, читать Б» — два задания, ссылки — не задания;
// - без глагола, маркера или пункта списка отрывок не задание, даже если в нём есть
//   срок и предмет («В пятницу пары не будет»);
// - срок в чатах часто не пишут: тогда задание — к следующей практике по предмету (догадка);
// - самостоятельные, диктанты, опросы на парах тоже запоминаются — с высоким приоритетом;
// - приоритет больше не выводится из уверенности (в StudyPlan confidence > 70 давало high);
// - если задание не нашлось, оно не выдумывается (для Telegram), кроме явной вставки
//   текста руками (wholeTextFallback).
import { normalizeTitle } from '../dedupe';
import { extractLabels } from '../labels';
import type { Priority } from '../schemas/task';
import { extractDate, type DueHint } from './dates';
import { WORD_END, WORD_START, escapeRegExp } from './regex';
import { buildSubjectMatcher, type SubjectMatch, type SubjectRef } from './subject';

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
/** Вопрос «что по геоме?» задаёт предмет ответам, пришедшим в течение часа. */
const QUESTION_CONTEXT_MS = 60 * 60 * 1000;
/** Срок не назван — к следующей практике по предмету. Это догадка, в карточке будет «?». */
const NEXT_CLASS_GUESS: DueHint = { type: 'next-class', isGuess: true };

// Проверки на парах: о них пишут «завтра самостоялка по алгебре»
const IN_CLASS_CHECK =
  'самостоятельн(?:ая|ую|ой|ые|ых)|самостоялк\\p{L}*|с/р|диктант\\p{L}*|опрос\\p{L}*|летучк\\p{L}*|проверочн\\p{L}*';

const VERB = new RegExp(
  `${WORD_START}(?:сда[тюёевлч]|реш|выполн|сдела|прочит|прочес|прочт|чита|выуч|подготов|напис|законспект|повтор|додела|доказ|разобра|разбер|найти|найд|установ|сверста|верста|оформ|постро|вычисл|изуч|нарис|доработ|распечат)\\p{L}*`,
  'iu',
);
const MARKER = new RegExp(
  `(?:${WORD_START}(?:дз|д/з|кр|стр|упр|домашк\\p{L}*|задани\\p{L}*|задач\\p{L}*|упражнени\\p{L}*|параграф\\p{L}*|лаб\\p{L}*|реферат\\p{L}*|доклад\\p{L}*|презентаци\\p{L}*|конспект\\p{L}*|контрольн\\p{L}*|коллоквиум\\p{L}*|зач[её]т\\p{L}*|экзамен\\p{L}*|тест\\p{L}*|${IN_CLASS_CHECK}|срок\\p{L}*|дедлайн\\p{L}*)${WORD_END})|№|§`,
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
// «Что по проге на завтра», «А че по геоме», «Когда сдавать?» — спрашивают о задании,
// а само задание придёт ответом
const QUESTION = new RegExp(
  `^(?:(?:а|и|ну)\\s+)?(?:что|чт[оё]|че|ч[её]|чо|шо|как(?:ое|ие|ая|ой)|когда|где|кто|сколько|есть\\s+ли|задали\\s+ли)${WORD_END}`,
  'iu',
);
const FILLER = new RegExp(
  `^(?:(?:дз|д/з|домашк\\p{L}*|домашнее\\s+задание|задание|напоминаю|напоминание|внимание|важно|срочно|пожалуйста|нужно|надо|необходимо|не\\s+забудьте|не\\s+забыть|дедлайн|срок(?:и)?|друзья|друзи|ребята|ребят|народ|всем|итак|так|ну|вроде|короче|кстати|типа)${WORD_END}[\\s:,.!—–-]*)+`,
  'iu',
);
const TRAILING_FILLER = new RegExp(
  `(?:[\\s,]+(?:короче|вроде|типа|кстати|плиз|пж|(?:это\\s+)?на\\s+будущее))+[\\s.!)]*$`,
  'iu',
);
const HIGH_PRIORITY = new RegExp(
  `${WORD_START}(?:контрольн\\p{L}*|коллоквиум\\p{L}*|зач[её]т\\p{L}*|экзамен\\p{L}*|тест\\p{L}*|${IN_CLASS_CHECK}|кр|срочно|важно|обязательно)${WORD_END}`,
  'iu',
);
const LOW_PRIORITY = new RegExp(
  `${WORD_START}(?:по\\s+желанию|необязательн\\p{L}*|факультативн\\p{L}*|на\\s+будущее|если\\s+(?:хочешь|хотите|захочешь|захотите))`,
  'iu',
);
// Пункт списка: «1) …», «1)…» (в чатах без пробела), «1. …», «- …», «• …»
const LIST_MARKER = /^\s*(?:\d{1,2}\)\s*|\d{1,2}\.\s+|[-•*–—]\s+)/u;
// «плюс доп задачи», «а также реферат» — новое задание внутри предложения
const ADDITION = /^(?:плюс|а\s+также|и\s+ещ[её]|ещ[её])\s+/iu;
// Строка из одной ссылки или домена («pr-cy.ru») — не задание
const URL_ONLY =
  /^(?:(?:https?:\/\/|www\.)\S+|[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}(?:\/\S*)?)[\s.,;!]*$/iu;
const LINK = /https?:\/\/[^\s<>"'«»]+/giu;

export type Segment = { text: string; listItem: boolean; paragraph: number };

/**
 * Режет сообщение на кандидатов: абзацы, строки, предложения. Абзац — это обычно
 * отдельное сообщение: Telegram склеивает подряд идущие сообщения автора через пустую строку.
 * В StudyPlan резало и по «\d+[.)]» в середине строки — «на 5.10» ломалось пополам.
 */
export function splitSegments(text: string): Segment[] {
  return text.split(/\r?\n\s*\n/u).flatMap((paragraphText, paragraph) =>
    paragraphText.split(/\r?\n/u).flatMap((line) => {
      const marker = LIST_MARKER.exec(line);
      const body = marker ? line.slice(marker[0].length) : line;
      return body
        .split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/u)
        .map((sentence, index) => ({
          text: sentence.trim(),
          listItem: marker !== null && index === 0,
          paragraph,
        }))
        .filter((segment) => segment.text.length > 0 && !URL_ONLY.test(segment.text));
    }),
  );
}

/**
 * «Демидович 19-44 читать, шилдт справочник читать 3 главы» — два задания. Новое начинается
 * с части, где есть свой глагол (если у предыдущей он уже был), или со слов «плюс …».
 * «Стр. 45 №3, 4 и 7» не делится: во второй части нет глагола.
 */
export function splitClauses(text: string): string[] {
  const parts = text.split(/(\s*[,;]\s+|\s+(?=плюс\s))/iu);
  const groups: { text: string; hasVerb: boolean }[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const clause = parts[index]!;
    const hasVerb = VERB.test(clause);
    const current = groups.at(-1);
    const startsNew =
      current !== undefined &&
      ((hasVerb && current.hasVerb) || (ADDITION.test(clause) && (hasVerb || MARKER.test(clause))));
    if (!current || startsNew) {
      groups.push({ text: clause, hasVerb });
    } else {
      current.text += `${parts[index - 1]}${clause}`;
      current.hasVerb ||= hasVerb;
    }
  }
  return groups.map((group) => group.text);
}

/**
 * Префильтр для чатов (раздел 11.1 ТЗ): есть ли в сообщении хоть что-то похожее на задание —
 * глагол («решить», «сверстать»), маркер («дз», «№», «лаба», «самостоялка») или пункт списка.
 * Такие сообщения (и вопросы перед ними) уходят в ИИ, болтовня — нет.
 */
export function hasTaskSignal(text: string): boolean {
  return splitSegments(text).some(
    (segment) =>
      !isQuestion(segment.text) &&
      (segment.listItem || VERB.test(segment.text) || MARKER.test(segment.text)),
  );
}

/** Вопрос не бывает заданием — он задаёт контекст ответу. */
export function isQuestion(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.endsWith('?') || QUESTION.test(trimmed);
}

/** Ссылки http(s) из текста — для описания задания. Хвостовую пунктуацию отрезаем. */
export function linksIn(text: string): string[] {
  const links = [...text.matchAll(LINK)].map(([link]) => link.replace(/[.,;:!?…]+$/u, ''));
  return [...new Set(links)];
}

export type ScoreSignals = {
  /** Свой срок и предмет — названы в самом отрывке (или в его предложении). */
  hasDate?: boolean;
  hasSubject?: boolean;
  /** Срок и предмет из заголовка, вопроса или конца сообщения. */
  contextDate?: boolean;
  contextSubject?: boolean;
  listItem?: boolean;
  /** Отрывок под заголовком «ДЗ:» в том же абзаце. */
  afterHeader?: boolean;
};

/** Насколько отрывок похож на задание, 0–100. Веса — из StudyPlan. */
export function taskScore(segment: string, signals: ScoreSignals): number {
  if (isQuestion(segment)) return 0;
  const hasVerb = VERB.test(segment);
  const hasMarker = MARKER.test(segment);
  // Срок и предмет сами по себе — не задание: «В пятницу пары по матану не будет»
  if (!hasVerb && !hasMarker && !signals.listItem && !signals.afterHeader) return 0;

  let score = 0;
  if (hasVerb) score += 30;
  if (hasMarker) score += 25;
  if (signals.listItem) score += 10;
  if (signals.afterHeader) score += 20;
  if (segment.length > 15 && segment.length < 300) score += 15;
  if (signals.hasDate) score += 25;
  else if (signals.contextDate) score += 10;
  if (signals.hasSubject) score += 20;
  else if (signals.contextSubject) score += 10;
  // Шум: приветствия, «спасибо», «ок»
  if (GREETING.test(segment) || SMALL_TALK.test(segment)) score -= 40;
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
    .cleanTitle.replace(ADDITION, '')
    .replace(FILLER, '')
    .replace(TRAILING_FILLER, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+([,.:;!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:;,.!?–—-]+|[\s:;,.!–—-]+$/gu, '')
    .trim();

  if (title.length > 120) title = `${title.slice(0, 119).replace(/\s+\S*$/, '')}…`;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function priorityOf(text: string): Priority {
  if (HIGH_PRIORITY.test(text)) return 'high';
  if (LOW_PRIORITY.test(text)) return 'low';
  return 'medium';
}

/** Все сроки в отрывке: в «на 29.09-06.10 до 6 октября» их два. Срок — первый найденный. */
function findDates(text: string, sentAt: Date): { hint: DueHint | null; phrases: string[] } {
  const phrases: string[] = [];
  let hint: DueHint | null = null;
  let rest = text;
  for (let attempt = 0; attempt < 3; attempt++) {
    const date = extractDate(rest, sentAt);
    if (!date) break;
    hint ??= date.hint;
    phrases.push(...date.phrases);
    for (const phrase of date.phrases) rest = rest.replace(phrase, ' ');
  }
  return { hint, phrases };
}

/** Срок, выведенный не из самого отрывка, помечаем как догадку. */
function asGuess(hint: DueHint): DueHint {
  return { ...hint, isGuess: true };
}

type Context = { subjectId: string | null; due: DueHint | null };
const NO_CONTEXT: Context = { subjectId: null, due: null };

type MatchSubject = (text: string) => SubjectMatch | null;

/** Разбор одного сообщения. context — предмет и срок из вопроса перед ним. */
function extractFromMessage(
  text: string,
  sentAt: Date,
  matchSubject: MatchSubject,
  inherited: Context,
): { tasks: HeuristicTask[]; context: Context; hasOwnContext: boolean } {
  const segments = splitSegments(text).map((segment) => ({
    ...segment,
    subject: matchSubject(segment.text),
    dates: findDates(segment.text, sentAt),
  }));

  // «ДЕДЛАЙН 09.10!» в конце сообщения — срок для всех заданий выше. Берём только сроки
  // из отрывков с признаком задания: «В пятницу пары не будет» — не срок
  const messageDue =
    segments.find(
      (segment) =>
        segment.dates.hint &&
        !isQuestion(segment.text) &&
        (VERB.test(segment.text) || MARKER.test(segment.text)),
    )?.dates.hint ?? null;

  const tasks: HeuristicTask[] = [];
  const seen = new Set<string>();
  const context: Context = { ...inherited };
  let hasOwnContext = false;
  let afterHeader = false;
  let paragraph = 0;

  for (const segment of segments) {
    if (segment.paragraph !== paragraph) {
      paragraph = segment.paragraph;
      afterHeader = false;
    }

    // Вопрос в середине переписки: предмет и срок из него — догадка для ответа
    if (isQuestion(segment.text)) {
      if (segment.subject) context.subjectId = segment.subject.subjectId;
      if (segment.dates.hint) context.due = asGuess(segment.dates.hint);
      hasOwnContext ||= Boolean(segment.subject || segment.dates.hint);
      continue;
    }

    let isHeader = true;
    for (const clause of splitClauses(segment.text)) {
      const subject = matchSubject(clause) ?? segment.subject;
      const clauseDates = findDates(clause, sentAt);
      const ownDue = clauseDates.hint ?? segment.dates.hint;
      const score = taskScore(clause, {
        hasDate: ownDue !== null,
        hasSubject: subject !== null,
        contextDate: context.due !== null || messageDue !== null,
        contextSubject: context.subjectId !== null,
        listItem: segment.listItem,
        afterHeader,
      });
      if (score < TASK_SCORE_THRESHOLD) continue;

      const title = cleanTitle(clause, [
        ...clauseDates.phrases,
        ...(subject && clause.includes(subject.phrase) ? [subject.phrase] : []),
      ]);
      const key = normalizeTitle(title);
      // После чистки пусто («ДЗ на пятницу:» → «») — это заголовок, а не задание
      if (key.length < 3) continue;
      isHeader = false;
      if (seen.has(key)) continue;
      seen.add(key);

      const subjectId = subject?.subjectId ?? context.subjectId;
      const due = ownDue ?? context.due ?? messageDue ?? (subjectId ? NEXT_CLASS_GUESS : null);
      tasks.push({
        title,
        subjectId,
        due,
        labels: extractLabels(clause).labels,
        priority: priorityOf(clause),
        confidence: Math.min(
          MAX_HEURISTIC_CONFIDENCE,
          score + (due ? 10 : 0) + (subjectId ? 10 : 0),
        ),
      });
    }

    // Заголовок «ДЗ на пятницу:» или «Матан:» задаёт срок и предмет заданиям под ним
    if (isHeader) {
      if (segment.subject) context.subjectId = segment.subject.subjectId;
      if (segment.dates.hint) context.due = segment.dates.hint;
      hasOwnContext ||= Boolean(segment.subject || segment.dates.hint);
      if (MARKER.test(segment.text)) afterHeader = true;
    }
  }
  return { tasks, context, hasOwnContext };
}

export type HeuristicOptions = {
  subjects: SubjectRef[];
  /** Ничего не нашлось — вернуть весь текст одним заданием (для ручной вставки, не для чатов). */
  wholeTextFallback?: boolean;
};

export type HeuristicMessage = { sentAt: Date; text: string };

/**
 * Эвристический разбор переписки без ИИ: фолбэк, когда ИИ недоступен, и префильтр для
 * Telegram. Сообщения разбираются по времени: вопрос «А че по геоме» задаёт предмет
 * ответам в течение часа.
 */
export function extractTasksFromMessages<M extends HeuristicMessage>(
  messages: M[],
  options: HeuristicOptions,
): { message: M; task: HeuristicTask }[] {
  const matchSubject = buildSubjectMatcher(options.subjects);
  const sorted = [...messages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const found: { message: M; task: HeuristicTask }[] = [];
  let carried: (Context & { at: number }) | null = null;

  for (const message of sorted) {
    const fresh = carried && message.sentAt.getTime() - carried.at <= QUESTION_CONTEXT_MS;
    const inherited: Context =
      carried && fresh
        ? { subjectId: carried.subjectId, due: carried.due && asGuess(carried.due) }
        : NO_CONTEXT;
    const { tasks, context, hasOwnContext } = extractFromMessage(
      message.text,
      message.sentAt,
      matchSubject,
      inherited,
    );
    // Сообщение без заданий, но с предметом или сроком («Что по проге на завтра») —
    // контекст для следующих сообщений
    if (tasks.length === 0 && hasOwnContext) {
      carried = { ...context, at: message.sentAt.getTime() };
    }
    found.push(...tasks.map((task) => ({ message, task })));
  }

  const [single] = messages;
  if (found.length === 0 && options.wholeTextFallback && messages.length === 1 && single) {
    const text = single.text.trim();
    // Совсем короткое — шум: «ок», «+», стикер
    if (text.length >= 10) {
      const dates = findDates(text, single.sentAt);
      const subjectId = matchSubject(text)?.subjectId ?? null;
      found.push({
        message: single,
        task: {
          title: cleanTitle(text.replace(/\s+/g, ' '), dates.phrases),
          subjectId,
          due: dates.hint ?? (subjectId ? NEXT_CLASS_GUESS : null),
          labels: extractLabels(text).labels,
          priority: priorityOf(text),
          confidence: 20,
        },
      });
    }
  }
  return found;
}

/** Разбор одного текста — обёртка над extractTasksFromMessages. */
export function extractTasksHeuristic(
  text: string,
  options: HeuristicOptions & { sentAt: Date },
): HeuristicTask[] {
  return extractTasksFromMessages([{ sentAt: options.sentAt, text }], options).map(
    ({ task }) => task,
  );
}
