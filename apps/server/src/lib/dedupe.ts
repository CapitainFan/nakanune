import { createHash } from 'node:crypto';
import { dedupeSource, type DedupeInput } from '@nakanune/shared';

/** Ключ дедупликации (уровень 2 из ТЗ): sha1 от «предмет | заголовок | день по Минску». */
export function dedupeKey(input: DedupeInput): string {
  return createHash('sha1').update(dedupeSource(input)).digest('hex');
}
