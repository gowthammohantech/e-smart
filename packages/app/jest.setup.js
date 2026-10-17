// Runs before every suite. Initialising to English means the whole existing
// test suite keeps asserting on the English catalogue, which turns it into a
// free regression net for the string extraction: if a transcription drifts,
// an existing test fails.
require('intl-pluralrules');
require('@esmart/i18n').initI18n('en', { plugins: [require('react-i18next').initReactI18next] });
