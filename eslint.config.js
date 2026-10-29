import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['main.js', 'dist/', 'dist-electron/', 'release/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
