// For the workspaces that render UI. Text written straight into JSX, or
// handed to a prop that is shown or spoken (`title`, a column `header`...),
// skips the catalogue, so it stays English for a Tamil user; this fails the
// lint on it. Punctuation, symbols and the few tokens that read the same in
// every language are allowed through.
const noLiteralProps = require('./no-literal-props');

// Statutory and brand tokens, Latin in every language.
const LATIN_TOKENS = ['IRN', 'GST', 'GSTIN', 'HSN', 'SAC', 'SKU', 'PIN', 'TDS', 'TCS', 'UPI', 'IFSC', 'PAN', 'TAN', 'Lixi', 'e-Way Bill', 'Elixir Books'];

module.exports = {
  files: ['**/*.tsx'],
  ignores: ['**/__tests__/**'],
  plugins: { esmart: { rules: { 'no-literal-props': noLiteralProps } } },
  rules: {
    'esmart/no-literal-props': ['error', { allowedStrings: LATIN_TOKENS }],
    'react/jsx-no-literals': [
      'error',
      {
        noStrings: false,
        allowedStrings: [
          '·', '.', '×', '—', '/', '(', ')', '*', '≈', '=', '%', '₹',
          ...LATIN_TOKENS,
          // The welcome illustration draws an invoice; its text is artwork.
          'TAX INVOICE', '₹4,720',
          '1.0.0 (1)',
        ],
      },
    ],
  },
};
