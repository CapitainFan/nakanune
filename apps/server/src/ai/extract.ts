import {
  extractTasksFromMessages,
  findSubjectByName,
  fromMinskDateTime,
  inMinsk,
  resolveDue,
  toMinskDateKey,
  type DueHint,
  type ExtractedItem,
  type Priority,
  type ScheduleContext,
  type SubjectRef,
} from '@nakanune/shared';
import { format } from 'date-fns';
import { ZodError } from 'zod';
import { homeworkSubject } from './context';
import {
  extractImageWithGemini,
  extractWithGemini,
  type GeminiConfig,
  type ImageForAi,
  type MessageForAi,
} from './gemini';
import { buildSystemInstruction, listUpcomingClasses } from './prompt';

/** Черновик задания из сообщения — одинаковый у ИИ и у эвристики. */
export type Draft = {
  messageId: string;
  title: string;
  subjectId: string | null;
  dueAt: string | null;
  dueAtIsGuess: boolean;
  summary: string | null;
  confidenceScore: number;
  priority: Priority;
  labels: string[];
};

export type ExtractContext = {
  subjects: SubjectRef[];
  schedule: ScheduleContext | null;
  /** Предмет → его практика: задания по МП записываются на Практикум. */
  practiceOf?: Record<string, string>;
  now: Date;
  /** Ручная вставка: ничего не нашлось — весь текст одним черновиком. Для чатов — нет. */
  wholeTextFallback?: boolean;
};

export type ExtractOutcome = {
  engine: 'gemini' | 'heuristic';
  /** Какая модель Gemini ответила. */
  model: string | null;
  notice: string | null;
  drafts: Draft[];
};

/** Срок не назван — к следующей практике по предмету (догадка). */
const NEXT_CLASS_GUESS: DueHint = { type: 'next-class', isGuess: true };

/**
 * Сколько всего ждём ИИ, перебирая модели. Перегруженная модель отвечает 503 за секунды,
 * но бывает, что молчит — тогда без общего лимита вставка ждала бы минуту и больше.
 * Одной модели — не больше 30 с: gemini-2.5-flash на длинной переписке думает до 20 с.
 */
const AI_BUDGET_MS = 45_000;
const MODEL_TIMEOUT_MS = 30_000;
const MIN_ATTEMPT_MS = 5_000;

/**
 * Разбор сообщений: модели Gemini по очереди, а если ключа нет или ни одна не ответила —
 * эвристика (как в StudyPlan). notice объясняет, почему без ИИ.
 */
export async function extractDrafts(
  messages: MessageForAi[],
  context: ExtractContext,
  gemini: GeminiConfig | null,
): Promise<ExtractOutcome> {
  let notice = 'Ключ Gemini не задан — текст разобран без ИИ, проверь задания внимательнее';

  if (gemini) {
    const earliest = new Date(Math.min(...messages.map((message) => message.sentAt.getTime())));
    const systemInstruction = instructionFor(context, earliest);
    const result = await withModelChain(gemini, (model, timeoutMs) =>
      extractWithGemini(messages, systemInstruction, gemini.apiKey, model, timeoutMs),
    );
    if (result.ok) {
      return {
        engine: 'gemini',
        model: result.model,
        notice: null,
        drafts: fromAiItems(result.value, messages, context),
      };
    }
    notice = `ИИ не ответил (${result.failures.join('; ')}) — текст разобран без ИИ, проверь задания внимательнее`;
  }
  return { engine: 'heuristic', model: null, notice, drafts: fromHeuristic(messages, context) };
}

const IMAGE_RULES = [
  '',
  'Фото вместо сообщений:',
  '- Во входных данных фото (доска, конспект, скриншот) и рядом JSON с его id и sentAt. messageId каждого элемента — этот id.',
  '- transcript — весь текст с фото как есть: каждая строка с фото — отдельной строкой (символ перевода строки \\n между ними). Формулы — как читаются, можно в LaTeX. Неразборчивое — […].',
  '- Задания на фото ищи по тем же правилам, что и в сообщениях. Нет заданий — один элемент с isHomework=false.',
].join('\n');

/**
 * Фото доски (раздел 11.5 ТЗ): та же инструкция и схема, что и для текста, плюс transcript.
 * Без ИИ фото не разобрать — если ключа нет или модели не ответили, это ошибка.
 */
export async function extractDraftsFromImage(
  image: ImageForAi,
  context: ExtractContext,
  gemini: GeminiConfig,
): Promise<{ model: string; transcript: string; drafts: Draft[] }> {
  const systemInstruction = instructionFor(context, image.sentAt) + IMAGE_RULES;
  const result = await withModelChain(
    gemini,
    (model, timeoutMs) =>
      extractImageWithGemini(image, systemInstruction, gemini.apiKey, model, timeoutMs),
    // Фото модель разбирает дольше текста
    { budgetMs: 60_000, modelTimeoutMs: 45_000 },
  );
  if (!result.ok) throw new Error(`ИИ не ответил (${result.failures.join('; ')})`);

  const message = { id: image.id, sentAt: image.sentAt, source: 'фото доски', text: '' };
  return {
    model: result.model,
    transcript: result.value.transcript.trim(),
    drafts: fromAiItems(result.value.items, [message], context),
  };
}

function instructionFor(context: ExtractContext, earliest: Date): string {
  return buildSystemInstruction({
    now: context.now,
    subjects: context.subjects,
    practiceOf: context.practiceOf ?? {},
    upcomingClasses: listUpcomingClasses(context.schedule, context.subjects, earliest),
  });
}

/**
 * Модели по очереди: перегружена или молчит — следующая. Общий лимит времени, чтобы
 * вставка не ждала минуту и больше.
 */
async function withModelChain<T>(
  gemini: GeminiConfig,
  call: (model: string, timeoutMs: number) => Promise<T>,
  limits: { budgetMs: number; modelTimeoutMs: number } = {
    budgetMs: AI_BUDGET_MS,
    modelTimeoutMs: MODEL_TIMEOUT_MS,
  },
): Promise<{ ok: true; model: string; value: T } | { ok: false; failures: string[] }> {
  const failures: string[] = [];
  const deadline = Date.now() + limits.budgetMs;
  for (const model of gemini.models) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    try {
      return {
        ok: true,
        model,
        value: await call(model, Math.min(limits.modelTimeoutMs, remaining)),
      };
    } catch (error) {
      failures.push(`${model}: ${describeFailure(error)}`);
    }
  }
  return { ok: false, failures };
}

function describeFailure(error: unknown): string {
  if (error instanceof ZodError) return 'ответ не прошёл проверку схемы';
  if (error instanceof SyntaxError) return 'ответ — не JSON';
  const message = error instanceof Error ? error.message : String(error);
  // Ошибки API приходят JSON-строкой: {"error":{"code":503,"message":"…high demand…"}}
  const code = /"code":\s*(\d{3})/.exec(message)?.[1];
  if (code === '503') return 'перегружена (503)';
  if (code === '429') return 'исчерпан лимит (429)';
  if (code === '404') return 'недоступна (404)';
  if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(message))) {
    return 'не ответила вовремя';
  }
  return message.length > 100 ? `${message.slice(0, 100)}…` : message;
}

function fromAiItems(
  items: ExtractedItem[],
  messages: MessageForAi[],
  context: ExtractContext,
): Draft[] {
  const sentAt = new Map(messages.map((message) => [message.id, message.sentAt]));
  return items.flatMap((item) => {
    const messageSentAt = sentAt.get(item.messageId);
    if (!item.isHomework || !item.title || !messageSentAt) return [];
    // В StudyPlan пустое имя предмета совпадало с первым же предметом, а «не нашёлся» —
    // превращался в subjects[3] (баг №6). Здесь не нашёлся — значит «Без предмета»
    const found = item.subjectName ? findSubjectByName(item.subjectName, context.subjects) : null;
    const subjectId = found && homeworkSubject(found, context.practiceOf);
    let dueAt = parseAiDate(item.dueAt);
    // Срок, который не удалось прочитать, помечаем как догадку
    let dueAtIsGuess = item.dueAtIsGuess || (item.dueAt !== null && dueAt === null);
    // Правила «к практике» считаем сами, по расписанию, а не доверяем модели:
    // срок не назван — следующая практика; назван только день (модель ставит 23:59) —
    // начало практики в этот день, если она есть
    if (subjectId && !item.dueAt) {
      const due = resolveDue(NEXT_CLASS_GUESS, subjectId, messageSentAt, context.schedule);
      dueAt = due.dueAt;
      dueAtIsGuess = due.isGuess;
    } else if (subjectId && dueAt && isEndOfDay(dueAt)) {
      const date = toMinskDateKey(dueAt);
      const hint: DueHint = { type: 'date', date, time: null, isGuess: dueAtIsGuess };
      dueAt = resolveDue(hint, subjectId, messageSentAt, context.schedule).dueAt;
    }
    return {
      messageId: item.messageId,
      title: item.title,
      subjectId,
      dueAt: dueAt?.toISOString() ?? null,
      dueAtIsGuess,
      summary: item.summary?.trim() || null,
      confidenceScore: item.confidence,
      priority: item.priority,
      labels: [
        ...new Set(item.labels.map((label) => label.replace(/^#/, '').trim()).filter(Boolean)),
      ],
    };
  });
}

/** 23:59 или 00:00 по Минску — модель назвала день, а не время. */
function isEndOfDay(date: Date): boolean {
  const time = format(date, 'HH:mm', { in: inMinsk });
  return time === '23:59' || time === '00:00';
}

/** Дата от модели: ISO с зоной — как есть; без зоны или только день — по Минску. */
export function parseAiDate(value: string | null): Date | null {
  if (!value) return null;
  const text = value.trim();
  const dayOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(text);
  if (dayOnly) return fromMinskDateTime(dayOnly[1]!, '23:59');
  const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(text);
  if (local) return fromMinskDateTime(local[1]!, local[2]!);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fromHeuristic(messages: MessageForAi[], context: ExtractContext): Draft[] {
  return extractTasksFromMessages(messages, {
    subjects: context.subjects,
    wholeTextFallback: context.wholeTextFallback,
  }).map(({ message, task }) => {
    // «к лекции» по МП — остаётся лекцией, остальное — на практику
    const subjectId =
      task.subjectId && homeworkSubject(task.subjectId, context.practiceOf, task.due?.atLecture);
    const due = resolveDue(task.due, subjectId, message.sentAt, context.schedule);
    return {
      messageId: message.id,
      title: task.title,
      subjectId,
      dueAt: due.dueAt?.toISOString() ?? null,
      dueAtIsGuess: due.isGuess,
      summary: null,
      confidenceScore: task.confidence,
      priority: task.priority,
      labels: task.labels,
    };
  });
}
