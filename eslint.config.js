import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'data/**', 'docs/**', 'test-results/**', 'playwright-report/**', '.e2e-cache/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/server/**/*.ts', 'test/**/*.{ts,mjs}', 'e2e/**/*.{ts,mjs}', '*.ts', '*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['services/**/*.js', 'routes/**/*.js', 'tests/**/*.js', '.github/scripts/**/*.js', 'src/server/learning/legacy/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  { files: ['services/learningRelevance.js'], languageOptions: { globals: { escape: 'off' } } },
  { files: ['tests/e2e/browser.test.js'], languageOptions: { globals: { ...globals.browser, origin: 'off' } } },
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: { ...globals.node } } },
  { files: ['public/js/**/*.js'], languageOptions: { globals: { ...globals.browser } } },
  {
    files: ['src/web/**/*.{ts,tsx,js}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
