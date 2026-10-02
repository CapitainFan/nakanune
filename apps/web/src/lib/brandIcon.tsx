import { ImageResponse } from 'next/og';

const ICON_BACKGROUND = '#000000';

/**
 * Иконка Nakanune — белая N на чёрном квадрате со скруглёнными углами.
 * Букву рисуем SVG-фигурой, а не шрифтом: в ImageResponse нет жирного шрифта, а фигура
 * одинаково чёткая в любом размере.
 *
 * rounded — скруглённый квадрат на прозрачном фоне (обычные иконки). Для maskable (Android)
 * и apple-icon (iPhone) — квадрат целиком: углы система скругляет сама, иначе вышло бы
 * скругление внутри скругления.
 */
export function brandIcon(size: number, { rounded }: { rounded: boolean }): ImageResponse {
  // Буква занимает середину: у maskable система может обрезать края до круга
  const letter = Math.round(size * (rounded ? 0.56 : 0.5));
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: ICON_BACKGROUND,
        borderRadius: rounded ? Math.round(size * 0.22) : 0,
      }}
    >
      <svg width={letter} height={letter} viewBox="0 0 100 100">
        {/* Левая ножка, диагональ, правая ножка — одной фигурой */}
        <path d="M18 12 H34 L66 62 V12 H82 V88 H66 L34 38 V88 H18 Z" fill="#ffffff" />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
