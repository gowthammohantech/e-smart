# Elixir Books Smart — mobile UI prototype

A React Native (Expo) prototype of **Elixir Books Smart**, the mobile-first
business product described in the BRD, PRD and FRD. It is a **UI prototype**:
there is no backend. Every screen runs against a seeded local dataset, but the
calculations behind them — tax splits, document totals, receivables aging,
stock balances, FX settlement — are real implementations of the rules in the
FRD, not hard-coded numbers.

## Running it

```bash
npm install
npx expo start
```

Then open the project in **Expo Go** (iOS/Android) by scanning the QR code, or
press `i` / `a` for a simulator. The app targets phones; tablet layouts are not
part of this prototype.

Demo credentials are pre-filled on the sign-in screen. Phone OTP accepts the
code `123456`.

| Command | What it does |
|---|---|
| `npm start` | Expo dev server |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm test` | Jest suite over the calculation engines |
| `npx eslint .` | Lint |

## What's in the demo data

Two businesses under one account, so company isolation is visible:

- **Vertex Traders** — a Mumbai wholesaler with 13 customers, 8 suppliers, 33
  items, ~60 documents across every type and status, payments, expenses and a
  full stock movement history. Includes an AED customer so multi-currency and
  FX settlement are exercisable.
- **Aurora Design Studio** — a Bengaluru services business with its own
  contacts, numbering and books.

Switch between them from the header. **More → Reset demo data** restores the
original dataset.

## Architecture

```
app/                      expo-router routes (screens only)
src/
  theme/                  design tokens + ThemeProvider, chart palettes
  components/             primitives, form kit, charts
  features/               screen-level composites (documents, contacts, …)
  domain/                 pure calculation engines, no React
  i18n/                   the message catalogues, and the code that resolves them
  store/                  zustand stores + company-scoped selectors
  data/                   seed dataset
  illustrations/          illustration registry (name → asset)
  lib/                    money, formatting, dates, validators
assets/illustrations/     the artwork, plus how to replace it
tools/illustrations/      script that draws the placeholder art
```

### The domain layer

Everything financial lives in `src/domain` as pure functions, so it can be
tested without rendering anything:

| Module | Responsibility |
|---|---|
| `lib/money.ts` | Decimal-safe arithmetic on integer minor units. No binary floats touch a monetary value. |
| `lineCalc.ts` | Document totals in the FRD §10 order: qty × price → line discount → taxable → tax → document discount → charges → round-off → grand total. |
| `taxEngine.ts` | Splits a rate into CGST + SGST within the home state, or a single IGST line across states. |
| `numbering.ts` | Prefix / sequence / fiscal year / branch, with reset policy. Numbers are assigned on finalisation and never reused. |
| `documentStates.ts` | Legal status transitions per document type. |
| `receivables.ts` | `total − allocated payments = outstanding`, plus configurable aging buckets. |
| `stockLedger.ts` | Current stock derived from an immutable movement list; never stored as a mutable counter. |
| `fx.ts` | Effective-dated rates, the rate stored on each document, and gain/loss on settlement. |
| `reports.ts` | The nine PRD reports. |
| `plan.ts` | What each tier unlocks, and which routes and reports a plan can open. Prices and gating only — the words live in the catalogue. |
| `eInvoice.ts` | Who must report, the portal's blocking validations, the NIC schema 1.1 payload, the IRN, the signed QR and the 24-hour cancellation window. |
| `ewayBill.ts` | When a consignment needs a bill, how long it stays valid, and the windows for extending, cancelling and updating Part-B. |
| `irpAdapter.ts` | Stands in for the portal. Takes an explicit `now`, reads no clock and draws no random number, so a request always answers the same way. |

`npm test` covers the parts that would be expensive to get wrong: rounding,
inclusive vs exclusive tax, the CGST/SGST/IGST split, allocation without losing
a paisa, aging buckets, stock derivation, FX settlement, and the compliance
boundaries — the 200 km and 20 km validity steps, midnight expiry, and the
24-hour and 8-hour windows.

### E-invoicing and e-way bills

The compliance area is as real as the rest of the domain layer, short of the
network:

- The **IRN** is the genuine SHA-256 of the supplier GSTIN, document type,
  document number and financial year. Anyone holding those four public fields
  can recompute it and check it against the invoice — which is the point of the
  scheme, and why `src/lib/hash.ts` is a real digest rather than a stand-in.
- The **signed QR** is a JWS carrying the ten claims the portal specifies, drawn
  by a QR encoder in `src/lib/qr.ts` (byte mode, all four error-correction
  levels, versions 1 to 40, all eight masks scored against the four penalty
  rules). The payload runs to about 700 bytes, which lands around version 21.
  The code scans; it is verified by a decoder written independently against the
  standard.
- **Validation** is the portal's own list — HSN on every line, a structurally
  valid GSTIN at both ends, IGST against the place of supply, totals within a
  rupee, a document number of at most 16 characters, the reporting window — and
  every finding is reported at once rather than one per attempt.
- **E-way bill validity** is one day per 200 km, or one per 20 km for
  over-dimensional cargo, always expiring at midnight. Extension opens eight
  hours before expiry and closes eight hours after. Cancellation, for both an
  IRN and a bill, closes at 24 hours.

The signature inside the QR is the one piece that cannot be real: it is derived
from the signing input rather than produced with the portal's private key, and
is marked as such in the code.

### Language

The app ships in English and Tamil. English is the default; a fresh install
follows the device where it can, and anyone upgrading stays on English rather
than having the language change under them. The switch is under
**Settings → Appearance & language**.

Copy lives in `src/i18n/locales/{en,ta}`, fifteen namespaces per language,
resolved through i18next. Three rules keep it honest:

- **The domain layer never sees a translator.** `src/domain` returns a code and
  a tone — `STATUS_TONE`, a plan's feature slugs, a `ComplianceIssue`'s
  `messageKey` — and the words are resolved where they are displayed. The pure
  functions stay testable without a catalogue.
- **One key per whole sentence.** Nothing is assembled from translated
  fragments, because Tamil word order differs: `formatDateTime` moved its
  joining word out of the date pattern, and the English-grammar patches in
  Lixi (`run${n === 1 ? 's' : ''}`) became CLDR plurals.
- **Digits stay ASCII.** Tamil numerals are archaic and never used in Indian
  commerce, so `₹1,23,456.00` is identical in both languages and only the
  lakh/crore word is translated. Statutory tokens — GST, GSTIN, HSN, IRN,
  CGST/SGST/IGST — stay Latin, because that is how they appear on a filing.

`npm test` enforces the parts a reviewer cannot eyeball: that both catalogues
carry the same keys, the same interpolation parameters and paired plural forms;
that no Tamil value is still its untranslated English source; that every
document status, kind, series and module resolves in both languages; and that
tab labels fit the nine-grapheme budget the bar allows. `node tools/i18n/report.mjs`
lists any user-facing literal still outside the catalogue.

Two things are deliberately not translated, and the reporter says so rather
than counting them as work left: the product name, and the "TAX INVOICE" drawn
inside the welcome artwork.

**Printed invoices are bilingual.** Under Tamil each field label and column
header reads in Tamil with the English term beneath it, because a GST invoice
is read by officers and by counterparties in other states. Values — amounts,
GSTIN, HSN, IRN, dates — render once, in Latin. An English PDF is unchanged.

Adding a language is a folder under `src/i18n/locales` and one entry in
`SUPPORTED_LANGUAGES`. Note that Tamil's plural rule matches English (`one` at
n = 1 only); Hindi's does not — it counts zero as singular — so the
`_one`/`_other` split is worth re-reading when it lands.

### Data and state

`src/store/appStore.ts` holds every entity in a Zustand store persisted to
AsyncStorage, so anything created in the prototype survives a restart. Fields
that a person picks from a fixed list store a stable slug rather than the
English label they saw — `Company.businessType` learned this the hard way, and
a migration maps the labels that shipped. Seeded master data the user can then
edit (tax categories, expense categories) is written in whatever language was
active at onboarding and is their data from then on; it does not follow a later
language switch. Reads go
through `src/store/selectors.ts`, which scopes them by the active company —
that is how company isolation is enforced here.

Writes also append an audit event and, where the PRD calls for it, raise a
notification.

### Charts

Charts are drawn with `react-native-svg` rather than a chart library. The
categorical series palette is selected per surface and validated against the
usual accessibility checks (lightness band, chroma floor, adjacent-pair
colour-vision separation, normal-vision separation, contrast). Status colours
stay reserved for state and are never reused as a series colour; aging buckets
use a single-hue sequential ramp because the buckets are ordered severity, not
identity.

### Illustrations

Empty states, first-run screens and confirmation moments are illustrated rather
than left to a lone icon. `src/illustrations/registry.ts` maps a semantic name
(`not-found`, `all-settled`, `welcome`…) to a file in `assets/illustrations/`,
and `EmptyState` takes an `illustration` prop, so a screen asks for meaning
rather than a filename. Four hero moments — welcome, setup complete, scanning
and the empty dashboard — are animated GIFs; the rest are PNG. Small in-sheet
empty states deliberately keep their icon, because illustrations turn to mush
at that size.

The shipped files are placeholders drawn in the Storyset **Rafiki** style.
Replacing one with the real download keeps its filename, so no code changes are
needed — `assets/illustrations/README.md` lists what belongs in each file.

## What's covered

Auth (email, phone OTP, Google) · five-step onboarding that creates a real
company · Home dashboard · quotations, sales orders, delivery notes, invoices,
sales returns · purchase orders, goods receipts, purchase bills, purchase
returns · expenses with recurrence and receipts · payments in and out with
multi-invoice allocation, advances and FX settlement · receivables and payables
with aging and reminders · e-invoicing with IRN, acknowledgement and a
scannable signed QR, cancellation inside the 24-hour window, and a compliance
register · e-way bills with Part-A and Part-B, distance-based validity,
extension and cancellation · items, stock adjustments, branch transfers, opening
stock, low stock, barcode lookup · customers and suppliers with full history ·
nine reports with filters and CSV export · invoice PDF preview and share ·
global search · notifications · OCR capture and review · an assistant that
reads the books but confirms before acting · settings for company, branches,
users and roles, taxes, currencies, numbering, accounts, categories,
integrations, backup and export, audit trail, sync, devices, appearance,
language and plan · the whole interface in English and Tamil, including
printed invoices and the assistant.

## Credits

Illustrations by [Storyset](https://storyset.com), used under their free
licence, which requires attribution — the app credits them on
**Settings → About**. The files currently in the repo are placeholders in the
Rafiki style; see `assets/illustrations/README.md` for how to swap in the real
downloads.

## Known limits

This is deliberately a prototype:

- No server. Nothing syncs, and the offline/sync screens simulate the states
  rather than implementing a real queue.
- OCR returns a fixed plausible extraction so the review step can be
  demonstrated; no image is actually read.
- The assistant answers from the local store with rule-based logic, not a model.
- Nothing is reported to a real Invoice Registration Portal. The rules are
  real; only the network hop is simulated (see below).
- Google sign-in signs straight into the demo account.
- The illustrations are placeholders, not the real Storyset artwork — the
  environment this was built in cannot reach storyset.com.
