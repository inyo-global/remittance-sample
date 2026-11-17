import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      // Count identifiers used in JSX (<Icon />, <Comp />) as used
      'react/jsx-uses-vars': 'error',
    },
  },
  {
    files: ['server.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['test/**/*.{js,jsx}', 'src/**/*.test.{js,jsx}', 'vitest.config.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    // Test helpers mix components and plain exports; HMR boundaries do not apply to them.
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
