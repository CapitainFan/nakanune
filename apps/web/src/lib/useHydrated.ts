import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * false при серверном рендере и первом проходе в браузере, true — после гидрации. Для того,
 * что зависит от localStorage: иначе разметка сервера и браузера разойдётся.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
