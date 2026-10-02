import { create } from 'zustand';

// Ключ доступа к API (API_TOKEN на сервере). Хранится в этом браузере, в localStorage:
// вводишь один раз. Сервер без ключа (локальная разработка) его не спрашивает.
const STORAGE_KEY = 'nakanune.apiToken';

function readStored(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Приватный режим и т. п. — просто без запоминания
    return null;
  }
}

type AuthState = {
  token: string | null;
  /** Сервер ответил 401 — надо показать форму ключа. */
  needsToken: boolean;
  setToken: (token: string) => void;
  clearToken: () => void;
  markUnauthorized: () => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  token: readStored(),
  needsToken: false,

  setToken(token) {
    try {
      window.localStorage.setItem(STORAGE_KEY, token);
    } catch {
      // не запомнится — спросим в следующий раз
    }
    set({ token, needsToken: false });
  },

  clearToken() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // нечего удалять
    }
    set({ token: null, needsToken: true });
  },

  markUnauthorized() {
    set({ needsToken: true });
  },
}));
