import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src-tauri/target', 'src-tauri/gen']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // The eslint-plugin-react-hooks v7 "React Compiler readiness" rules flag
      // runtime-correct patterns (syncing refs during render, setState in an
      // effect, in-place array sorts). This app does not use the React Compiler,
      // so these are future-proofing signals, not bugs. Keep them as visible
      // warnings rather than CI-blocking errors — forcing them to error would
      // require risk-refactoring untested components (e.g. the Match game loop)
      // to satisfy stylistic checks. rules-of-hooks stays an error (real crashes).
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
])
