const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**', 'public/**'],
  },
  // Browser files (app.js, terrain.js, story/*.js, landing*.js)
  {
    files: ['*.js', 'story/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        gsap: 'readonly',
        THREE: 'readonly',
        DRACOLoader: 'readonly',
        EXRLoader: 'readonly',
        FluentDesignSystemProvider: 'readonly',
        state: 'writable',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      eqeqeq: ['warn', 'smart'],
    },
  },
  // Node files (scripts, config, e2e tests)
  {
    files: ['scripts/**/*.mjs', 'bin/**/*.mjs', 'bin/**/*.js', 'e2e/**/*.js', 'eslint.config.js', 'playwright.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      eqeqeq: ['warn', 'smart'],
    },
  },
  // Legacy CJS files
  {
    files: ['bin/**/*.js', 'story/selftest-precommit.js', 'e2e/**/*.js', 'eslint.config.js', 'playwright.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      eqeqeq: ['warn', 'smart'],
    },
  },
];
