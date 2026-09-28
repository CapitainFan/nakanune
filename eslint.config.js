// ESLint для сервера и пакетов. У apps/web свой конфиг (eslint-config-next),
// его запускает `pnpm lint` отдельной командой.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['apps/web/', '**/generated/', '**/dist/']),
  {
    files: ['**/*.{js,ts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: {
      // Типы импортируем через `import type` — они исчезают из итогового JS
      '@typescript-eslint/consistent-type-imports': 'error',
      // Аргумент можно не использовать, если его имя начинается с _
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Отключает правила, которые спорят с Prettier: форматирование — его работа
  prettier,
]);
