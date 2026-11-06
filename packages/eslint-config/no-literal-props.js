// A lint rule for the string props that `react/jsx-no-literals` can't see:
// a `title="Not found"` attribute, or a table column's `header: 'Status'`,
// renders as English whatever the user's language. Flags a string (or a
// template literal with words in its fixed parts) given to a prop that is
// shown or read aloud, either as a JSX attribute or as an object property
// in a .tsx file (columns, menu entries, tiles).

const PROPS = new Set([
  'title',
  'header',
  'label',
  'caption',
  'placeholder',
  'accessibilityLabel',
  'accessibilityHint',
  'aria-label',
  'message',
  'subtitle',
  'description',
  'emptyText',
  'confirmLabel',
  'cancelLabel',
]);

// Words, not just punctuation, symbols or figures.
const WORDS = /[A-Za-z]{2,}/;
// A catalogue key handed on to be translated later (`'settings:mode.dark'`).
const I18N_KEY = /^[a-z][\w-]*:[\w.-]+$/;
// No lowercase at all: a code or a sample value (CGST, B2CL, GSTR-1,
// MH12AB1234), which reads the same in every language.
const CODE = /^[^a-z]+$/;

function staticText(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.cooked ?? '').join(' ');
  if (node.type === 'JSXExpressionContainer') return staticText(node.expression);
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Shown or spoken prop text must come from the i18n catalogue' },
    schema: [{ type: 'object', properties: { allowedStrings: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }],
    messages: { literal: 'Translate "{{text}}" ({{prop}}): put it in the i18n catalogue and use tr().' },
  },
  create(context) {
    const allowed = new Set((context.options[0] && context.options[0].allowedStrings) || []);
    const check = (prop, valueNode, reportNode) => {
      if (!PROPS.has(prop)) return;
      const text = staticText(valueNode);
      if (text == null || !WORDS.test(text)) return;
      const trimmed = text.trim();
      if (allowed.has(trimmed) || I18N_KEY.test(trimmed) || CODE.test(trimmed)) return;
      context.report({ node: reportNode, messageId: 'literal', data: { prop, text: text.trim().slice(0, 40) } });
    };
    return {
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;
        if (name) check(name, node.value, node);
      },
      Property(node) {
        if (node.computed || node.kind !== 'init') return;
        const name = node.key.type === 'Identifier' ? node.key.name : node.key.type === 'Literal' ? String(node.key.value) : null;
        if (name) check(name, node.value, node);
      },
    };
  },
};

module.exports = rule;
