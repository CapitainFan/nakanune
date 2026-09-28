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
import { extractWithGemini, type GeminiConfig, type MessageForAi } from './gemini';
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
    const systemInstruction = buildSystemInstruction({
      now: context.now,
      subjects: context.subjects,
      upcomingClasses: listUpcomingClasses(context.schedule, context.subjects, earliest),
    });
    const failures: string[] = [];
    const deadline = Date.now() + AI_BUDGET_MS;
    for (const model of gemini.models) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_ATTEMPT_MS) break;
      try {
        const items = await extractWithGemini(
          messages,
          systemInstruction,
          gemini.apiKey,
          model,
          Math.min(MODEL_TIMEOUT_MS, remaining),
        );
        return {
          engine: 'gemini',
          model,
          notice: null,
          drafts: fromAiItems(items, messages, context),
        };
      } catch (error) {
        failures.push(`${model}: ${describeFailure(error)}`);
      }
    }
    notice = `ИИ не ответил (${failures.join('; ')}) — текст разобран без ИИ, проверь задания внимательнее`;
  }
  return { engine: 'heuristic', model: null, notice, drafts: fromHeuristic(messages, context) };
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
    const subjectId = item.subjectName
      ? findSubjectByName(item.subjectName, context.subjects)
      : null;
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
    const due = resolveDue(task.due, task.subjectId, message.sentAt, context.schedule);
    return {
      messageId: message.id,
      title: task.title,
      subjectId: task.subjectId,
      dueAt: due.dueAt?.toISOString() ?? null,
      dueAtIsGuess: due.isGuess,
      summary: null,
      confidenceScore: task.confidence,
      priority: task.priority,
      labels: task.labels,
    };
  });
}
