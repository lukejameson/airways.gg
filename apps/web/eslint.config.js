import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import sveltePlugin from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript source files (.ts only — not .svelte)
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: { '@typescript-eslint': ts },
    rules: {
      ...ts.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'off', // TypeScript handles this more accurately
      // Already enforced by svelte-check / tsc
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // Svelte component files — do NOT pass parserOptions.project; svelte-eslint-parser
  // handles type-aware linting via the inner TS parser on <script> blocks only
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      svelte: sveltePlugin,
      '@typescript-eslint': ts,
    },
    rules: {
      ...sveltePlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Use the TS rule above; the base rule doesn't support varsIgnorePattern in Svelte blocks
      'no-unused-vars': 'off',
      'no-undef': 'off', // Svelte compiler and tsc handle this
    },
  },

  // Global ignores
  {
    ignores: [
      '.svelte-kit/**',
      'build/**',
      'node_modules/**',
      '*.config.js',
      '*.config.ts',
      'preload-env.js',
    ],
  },
];
