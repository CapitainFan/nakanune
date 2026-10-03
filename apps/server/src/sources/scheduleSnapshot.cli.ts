// pnpm schedule:snapshot — скачать расписание с сайта ММФ в снимок apps/server/data/.
// Запускать с компьютера, откуда сайт открывается (Беларусь, без VPN). Потом закоммитить
// снимок: сервер на Render при следующем запуске загрузит его в базу.
import {
  SCHEDULE_PAGE_URL,
  SNAPSHOT_FILE,
  readScheduleSnapshot,
  writeScheduleSnapshot,
} from './scheduleSnapshot';

const url = (await readScheduleSnapshot())?.url ?? SCHEDULE_PAGE_URL;
try {
  const snapshot = await writeScheduleSnapshot(url);
  console.log(
    `Снимок обновлён: ${SNAPSHOT_FILE}\n${snapshot.html.length} символов, ${snapshot.fetchedAt}`,
  );
  console.log(
    'Дальше: git add apps/server/data && git commit -m "chore: update schedule snapshot" && git push',
  );
} catch (error) {
  console.error(
    `Не удалось скачать расписание: ${error instanceof Error ? error.message : error}\n` +
      'Сайт ММФ открывается только из Беларуси — выключи VPN или исключи из него mmf.bsu.by.',
  );
  process.exitCode = 1;
}
