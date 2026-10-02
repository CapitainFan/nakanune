import type { MetadataRoute } from 'next';
import { BRAND_BACKGROUND } from '@/lib/brand';

/**
 * Манифест PWA: из браузера Nakanune можно «установить» как приложение (Chrome — значок
 * в адресной строке, iPhone — «На экран Домой»), оно откроется в своём окне без вкладок.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nakanune',
    short_name: 'Nakanune',
    description: 'Домашние задания из учебных чатов и Moodle — к нужному дню',
    lang: 'ru',
    start_url: '/',
    display: 'standalone',
    background_color: BRAND_BACKGROUND,
    theme_color: BRAND_BACKGROUND,
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
