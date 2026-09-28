import { env } from '../env';
import { decryptSecret, encryptSecret } from './crypto';
import { HttpError } from './http';

function key(): Buffer {
  if (!env.ENCRYPTION_KEY) {
    throw new HttpError(
      503,
      'На сервере не задан ENCRYPTION_KEY — без него ссылку не сохранить. Сгенерируй: openssl rand -base64 32',
    );
  }
  return Buffer.from(env.ENCRYPTION_KEY, 'base64');
}

/** Шифрует секрет источника ключом из ENCRYPTION_KEY. */
export const sealSecret = (plain: string) => encryptSecret(plain, key());
/** Расшифровывает секрет источника. */
export const openSecret = (sealed: string) => decryptSecret(sealed, key());
