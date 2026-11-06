// Accessibility lint for the workspaces that render UI. Most of
// eslint-plugin-jsx-a11y reasons about DOM elements (<div onClick>, <img>),
// which React Native code rarely writes, so only the rules that hold for
// RN components as well are on: real ARIA attribute names and values, valid
// roles, and the few DOM elements the web files do write (<a>, <input>).
// What only a rendered page shows (contrast, names, landmarks) is checked
// by the axe scan in apps/web/e2e/a11y.mjs.
const jsxA11y = require('eslint-plugin-jsx-a11y');

module.exports = {
  files: ['**/*.tsx'],
  ignores: ['**/__tests__/**'],
  plugins: { 'jsx-a11y': jsxA11y },
  rules: {
    'jsx-a11y/aria-props': 'error',
    'jsx-a11y/aria-proptypes': 'error',
    'jsx-a11y/aria-role': ['error', { ignoreNonDOM: false }],
    'jsx-a11y/aria-unsupported-elements': 'error',
    'jsx-a11y/role-has-required-aria-props': 'error',
    'jsx-a11y/role-supports-aria-props': 'error',
    'jsx-a11y/anchor-has-content': 'error',
    'jsx-a11y/anchor-is-valid': 'error',
    'jsx-a11y/alt-text': 'error',
    'jsx-a11y/autocomplete-valid': 'error',
    'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
    'jsx-a11y/tabindex-no-positive': 'error',
    'jsx-a11y/no-redundant-roles': 'error',
  },
};
