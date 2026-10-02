import { brandIcon } from '@/lib/brandIcon';

// Иконка для «На экран Домой» на iPhone
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  // iPhone сам скругляет углы — отдаём квадрат целиком
  return brandIcon(size.width, { rounded: false });
}
