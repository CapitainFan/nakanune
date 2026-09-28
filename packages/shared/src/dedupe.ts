// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Там дубль искался SQL-запросом: LOWER(title) + subject_id + DATE(due_at).
import { toMinskDateKey } from './time';

/**
 * Приводит заголовок к виду, в котором мелкие различия не делают задания «разными»:
 * регистр, «ё»/«е», пунктуация и лишние пробелы.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export type DedupeInput = {
  subjectId: string | null;
  title: string;
  dueAt: Date | null;
};

/**
 * Строка, из которой сервер считает dedupeKey: предмет | заголовок | день дедлайна по Минску.
 * Хэш (sha1) считается на сервере — этот пакет попадает и в браузер, а node:crypto там нет.
 */
export function dedupeSource({ subjectId, title, dueAt }: DedupeInput): string {
  return [subjectId ?? '', normalizeTitle(title), dueAt ? toMinskDateKey(dueAt) : ''].join('|');
}
