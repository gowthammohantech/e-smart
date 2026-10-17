// Shared flat config. Every workspace lints with the Expo rules, since they
// cover plain TypeScript as well as React Native.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', '.turbo/*'],
  },
];
