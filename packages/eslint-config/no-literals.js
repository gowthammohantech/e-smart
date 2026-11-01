// For the workspaces that render UI. Text written straight into JSX skips the
// catalogue, so it stays English for a Tamil user; this fails the lint on it.
// Punctuation, symbols and the few tokens that read the same in every
// language are allowed through.
module.exports = {
  files: ['**/*.tsx'],
  ignores: ['**/__tests__/**'],
  rules: {
    'react/jsx-no-literals': [
      'error',
      {
        noStrings: false,
        allowedStrings: [
          '·', '.', '×', '—', '/', '(', ')', '*', '≈', '=', '%', '₹',
          // Statutory and brand tokens, Latin in every language.
          'IRN', 'GST', 'Lixi',
          // The welcome illustration draws an invoice; its text is artwork.
          'TAX INVOICE', '₹4,720',
          '1.0.0 (1)',
        ],
      },
    ],
  },
};
