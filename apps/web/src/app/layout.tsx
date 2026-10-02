import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { AppHeader } from '@/components/AppHeader';
import { AuthGate, ChangeTokenLink } from '@/components/AuthGate';
import { DataLoader } from '@/components/DataLoader';
import { ServerStatus } from '@/components/ServerStatus';
import { BRAND_BACKGROUND } from '@/lib/brand';
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
  // Установленное на iPhone приложение — без адресной строки Safari
  appleWebApp: { capable: true, title: 'Nakanune', statusBarStyle: 'black-translucent' },
};

// Цвет панели браузера и заголовка окна установленного приложения — под тему
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: BRAND_BACKGROUND },
  ],
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
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
          <AuthGate>{children}</AuthGate>
        </main>
        <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 pb-6">
          <ServerStatus />
          <ChangeTokenLink />
        </footer>
        {/* Тосты вместо самодельного Toast из StudyPlan */}
        <Toaster richColors closeButton position="bottom-right" />
      </body>
    </html>
  );
}
