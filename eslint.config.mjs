import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'tmp/**',
      '.codex-remote-attachments/**',
      '**/.next/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      'eslint.config.mjs',
      'provider-manager-v1.10.0.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: false },
      ],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: [
      'apps/web/test/n10-browser.mjs',
      'apps/web/test/n11-browser.mjs',
      'apps/web/test/n13-integration.mjs',
      'apps/web/test/n13-server-acceptance.mjs',
      'apps/api/test/n13-ocr.mjs',
      'scripts/n13-mobile-provider.cjs',
    ],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
);
