# Nakanune

Трекер домашних заданий, который сам собирает ДЗ из учебных Telegram-групп и календаря Moodle
и показывает, что сделать к какому дню. У каждого задания — короткое ИИ-саммари: что требуется,
в каком виде сдавать, что понадобится.

> **Статус:** Этап 1 — REST API предметов и заданий, экспорт в календарь и CSV.

## Стек

- **TypeScript** во всех пакетах
- **apps/web** — Next.js 16 (App Router, Turbopack), Tailwind CSS 4
- **apps/server** — Node.js 24, Express 5, запуск через tsx
- **packages/db** — PostgreSQL 17, Prisma 7 (через драйвер pg)
- **packages/shared** — zod-схемы и типы, общие для фронта и сервера
- pnpm workspaces, ESLint 9, Prettier

## Структура

```
apps/
  web/          Next.js — вкладки «Задания», «Календарь», «Входящие»
  server/       Express API; позже — cron, источники, ИИ
packages/
  db/           schema.prisma, миграции, сид, фабрика Prisma Client
  shared/       zod-схемы — контракт между фронтом и сервером
docker-compose.yml   Postgres для локальной разработки
```

Фронт не импортирует Prisma: он получает данные по REST, а их форму описывают схемы из
`@nakanune/shared`. Пакеты монорепо отдают TypeScript-исходники без сборки: их компилируют
Next.js (фронт) и tsx (сервер).

## Быстрый старт

Нужны Node.js 24+, pnpm 12 (`npm i -g pnpm`) и Docker.

```bash
pnpm install          # зависимости + генерация Prisma Client
cp .env.example .env  # локальные переменные окружения
pnpm db:up            # Postgres в Docker, порт 5433
pnpm db:migrate       # применить миграции
pnpm db:seed          # заполнить предметы
pnpm dev              # API на :4000 и фронт на :3000
```

На http://localhost:3000 видно, отвечают ли API и база.

## Команды

| Команда                           | Что делает                                                |
| --------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                        | сервер и фронт вместе                                     |
| `pnpm dev:server`, `pnpm dev:web` | по отдельности                                            |
| `pnpm test`                       | тесты (vitest); нужен запущенный Postgres                 |
| `pnpm typecheck`                  | проверка типов во всех пакетах                            |
| `pnpm lint`                       | ESLint                                                    |
| `pnpm format`                     | Prettier                                                  |
| `pnpm build`                      | продакшен-сборка фронта                                   |
| `pnpm db:up`, `pnpm db:down`      | запустить / остановить Postgres                           |
| `pnpm db:migrate --name <имя>`    | создать и применить миграцию после правки `schema.prisma` |
| `pnpm db:generate`                | перегенерировать Prisma Client                            |
| `pnpm db:seed`                    | заполнить предметы (можно запускать повторно)             |
| `pnpm db:reset`                   | пересоздать базу: все миграции с нуля + сид               |
| `pnpm db:studio`                  | Prisma Studio — база в браузере                           |

В Prisma 7 `migrate dev` не перегенерирует клиент, поэтому после изменения схемы нужны
две команды: `pnpm db:migrate --name <имя>`, затем `pnpm db:generate`.

Тесты маршрутов работают с отдельной базой `nakanune_test` на том же Postgres: перед запуском
она создаётся и получает миграции, перед каждым тестом очищается. Рабочая база не затрагивается.

## API

| Метод и путь                   | Что делает                                                               |
| ------------------------------ | ------------------------------------------------------------------------ |
| `GET /api/health`              | жив ли сервер и есть ли связь с базой                                    |
| `GET /api/subjects`            | предметы по алфавиту                                                     |
| `POST /api/subjects`           | новый предмет; без `shortCode` код соберётся из названия («МА»)          |
| `PUT /api/subjects/:id`        | изменить предмет                                                         |
| `DELETE /api/subjects/:id`     | удалить; его задания останутся «Без предмета»                            |
| `GET /api/tasks`               | задания; фильтры `?status=&archived=&from=&to=`                          |
| `POST /api/tasks`              | одно задание или массив до 100; ответ `{ inserted, duplicates, errors }` |
| `PUT /api/tasks/:id`           | изменить задание                                                         |
| `DELETE /api/tasks/:id`        | удалить задание                                                          |
| `GET /api/export/calendar.ics` | календарь заданий — можно подписаться в Google Calendar                  |
| `GET /api/export/tasks.csv`    | все задания для Excel                                                    |

Схемы запросов и ответов — в [packages/shared/src/schemas](packages/shared/src/schemas).

## Переменные окружения

- `.env` в корне — сервер и Prisma. Шаблон с пояснениями: [.env.example](.env.example).
- `apps/web/.env.local` — фронт, необязательно. Шаблон: [apps/web/.env.example](apps/web/.env.example).

Сервер проверяет переменные zod-схемой при старте ([apps/server/src/env.ts](apps/server/src/env.ts))
и с неверным конфигом сразу завершается.

## План

- [x] Этап 0 — каркас: монорепо, Postgres + Prisma, Express, Next.js, линтеры
- [x] Этап 1 — API предметов и заданий, экспорт `.ics` и CSV, тесты
- [ ] Расписание пар с сайта ММФ — синхронизация раз в сутки и при открытии приложения
- [ ] Этап 2 — фронт: «Задания» и «Календарь»
- [ ] Этап 3 — ручное добавление + ИИ, вкладка «Входящие»
- [ ] Этап 4 — Moodle + cron
- [ ] Этап 5 — Telegram
- [ ] Этап 6 — полировка, PWA

## Credits

Task extraction, heuristic NLP parser, task store and calendar/ICS logic are adapted from
StudyPlan by Charushi and contributors (https://github.com/Charushi06/StudyPlan), MIT License.
The license text is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
