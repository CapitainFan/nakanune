import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Секреты источников (ссылка календаря Moodle с личным токеном, потом сессия Telegram)
// храним в базе зашифрованными: AES-256-GCM. GCM ещё и проверяет целостность — подменённый
// или испорченный шифротекст не расшифруется, а выбросит ошибку.
// Формат строки: v1:<iv>:<tag>:<шифротекст>, всё в base64. v1 — чтобы можно было сменить
// алгоритм, не ломая старые записи.
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // рекомендованный размер nonce для GCM

export function encryptSecret(plain: string, key: Buffer): string {
  // Новый случайный iv на каждое шифрование: с одним iv и ключом GCM теряет стойкость
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv, tag, data]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64')))
    .join(':');
}

export function decryptSecret(value: string, key: Buffer): string {
  const [version, iv, tag, data] = value.split(':');
  if (version !== 'v1' || !iv || !tag || data === undefined) {
    throw new Error('Неизвестный формат зашифрованного значения');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}
