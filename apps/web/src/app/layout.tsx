import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin', 'cyrillic'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin', 'cyrillic'],
});

export const metadata: Metadata = {
  title: 'Nakanune',
  description: 'Домашние задания из учебных чатов и Moodle — к нужному дню',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // Расширения браузера (например, LanguageTool) дописывают свои атрибуты в <html>
    // до загрузки React. suppressHydrationWarning прощает расхождение только в атрибутах
    // самого <html> — ошибки гидрации внутри страницы по-прежнему будут видны.
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
