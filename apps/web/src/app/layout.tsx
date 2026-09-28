import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { AppHeader } from '@/components/AppHeader';
import { DataLoader } from '@/components/DataLoader';
import { ServerStatus } from '@/components/ServerStatus';
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
  title: { default: 'Nakanune', template: '%s — Nakanune' },
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
      <body className="flex min-h-full flex-col">
        <DataLoader />
        <AppHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">{children}</main>
        <footer className="mx-auto w-full max-w-5xl px-4 pb-6">
          <ServerStatus />
        </footer>
        {/* Тосты вместо самодельного Toast из StudyPlan */}
        <Toaster richColors closeButton position="bottom-right" />
      </body>
    </html>
  );
}
