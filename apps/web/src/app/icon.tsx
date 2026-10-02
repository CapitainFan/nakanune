import { brandIcon } from '@/lib/brandIcon';

// Иконки для вкладки и установки как приложение (PWA). Адреса — /icon/192, /icon/512 и
// /icon/maskable (Android сам обрезает её по форме), на них ссылается manifest.ts
const ICONS = [
  { id: '192', size: 192, rounded: true },
  { id: '512', size: 512, rounded: true },
  { id: 'maskable', size: 512, rounded: false },
];

export function generateImageMetadata() {
  return ICONS.map(({ id, size }) => ({
    id,
    size: { width: size, height: size },
    contentType: 'image/png',
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const iconId = String(await id);
  const icon = ICONS.find((item) => item.id === iconId) ?? ICONS[0]!;
  return brandIcon(icon.size, { rounded: icon.rounded });
}
