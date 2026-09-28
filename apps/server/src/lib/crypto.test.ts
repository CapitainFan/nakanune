import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

const key = randomBytes(32);
const url = 'https://edummf.bsu.by/calendar/export_execute.php?userid=1&authtoken=secret';

describe('encryptSecret / decryptSecret', () => {
  it('расшифровывает то, что зашифровал, а в шифротексте токена нет', () => {
    const encrypted = encryptSecret(url, key);
    expect(encrypted).not.toContain('secret');
    expect(decryptSecret(encrypted, key)).toBe(url);
  });

  it('каждый раз новый iv — одинаковый текст шифруется по-разному', () => {
    expect(encryptSecret(url, key)).not.toBe(encryptSecret(url, key));
  });

  it('чужой ключ или подменённые данные — ошибка, а не мусор', () => {
    const encrypted = encryptSecret(url, key);
    expect(() => decryptSecret(encrypted, randomBytes(32))).toThrow();
    const [version, iv, tag, data] = encrypted.split(':');
    const tampered = Buffer.from(data!, 'base64');
    tampered[0]! ^= 1;
    expect(() =>
      decryptSecret([version, iv, tag, tampered.toString('base64')].join(':'), key),
    ).toThrow();
  });
});
