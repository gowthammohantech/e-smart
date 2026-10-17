// Lints the repo-level scripts in tools/. Each workspace has its own config.
const base = require('@esmart/eslint-config');

module.exports = [
  ...base,
  { ignores: ['apps/**', 'packages/**'] },
  {
    // Build-time scripts that generate the placeholder illustrations. These run
    // in Node, not in the app bundle.
    files: ['tools/**/*.mjs'],
    languageOptions: {
      globals: { Buffer: 'readonly', console: 'readonly', process: 'readonly' },
    },
  },
];
