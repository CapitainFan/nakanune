// Вход в Telegram из терминала: pnpm tg:login. Номер, код и пароль 2FA вводятся здесь и
// никуда не сохраняются; сохраняется только сессия — в базу, зашифрованной ENCRYPTION_KEY.
// Сессию на экран не выводим: это полный доступ к аккаунту.
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { prisma } from '../db';
import { createClient } from './client';
import { saveSession } from './session';

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Ввод без эха — для пароля 2FA. Backspace стирает, Ctrl+C отменяет. */
function askHidden(question: string): Promise<string> {
  if (!stdin.isTTY) return ask(question);
  stdout.write(question);
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          finish();
          reject(new Error('Вход отменён'));
          return;
        }
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  const client = createClient('');
  console.log('Вход в Telegram для Nakanune. Приложение будет только читать выбранные группы.\n');
  await client.start({
    phoneNumber: () => ask('Номер телефона в международном формате (+375…): '),
    phoneCode: () => ask('Код, который пришёл в Telegram: '),
    password: (hint) =>
      askHidden(`Пароль двухэтапной проверки${hint ? ` (подсказка: ${hint})` : ''}: `),
    // Неверный код или пароль — сообщаем и спрашиваем снова
    onError: (error) => {
      console.error(`Ошибка: ${error.message}`);
    },
  });

  const me = await client.getMe();
  await saveSession(String(client.session.save()));
  const name = [me.firstName, me.lastName].filter(Boolean).join(' ');
  console.log(
    `\nГотово: вошли как ${name}${me.username ? ` (@${me.username})` : ''}. Сессия сохранена в базе в зашифрованном виде.`,
  );
  await client.disconnect();
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Клиент Telegram держит таймеры переподключения — выходим явно
    process.exit();
  });
