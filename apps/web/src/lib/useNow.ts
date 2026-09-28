'use client';

import { useEffect, useState } from 'react';

/** Текущее время, обновляется раз в минуту — чтобы «сегодня» и «просрочено» не застревали. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
