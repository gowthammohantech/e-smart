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

`npm test` covers the parts that would be expensive to get wrong: rounding,
inclusive vs exclusive tax, the CGST/SGST/IGST split, allocation without losing
a paisa, aging buckets, stock derivation and FX settlement.

### Data and state

`src/store/appStore.ts` holds every entity in a Zustand store persisted to
AsyncStorage, so anything created in the prototype survives a restart. Reads go
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
with aging and reminders · items, stock adjustments, branch transfers, opening
stock, low stock, barcode lookup · customers and suppliers with full history ·
nine reports with filters and CSV export · invoice PDF preview and share ·
global search · notifications · OCR capture and review · an assistant that
reads the books but confirms before acting · settings for company, branches,
users and roles, taxes, currencies, numbering, accounts, categories,
integrations, backup and export, audit trail, sync, devices, appearance and
plan.

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
- E-invoice and e-way bill statuses are illustrative — no IRP integration.
- Google sign-in signs straight into the demo account.
- The illustrations are placeholders, not the real Storyset artwork — the
  environment this was built in cannot reach storyset.com.
