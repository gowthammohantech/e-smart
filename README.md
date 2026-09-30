# Elixir Books Smart

Business accounting for Indian SMEs — invoicing, GST e-invoicing and e-way
bills, payments, stock, expenses and reports — as a monorepo with a
React Native app for phones, the same app for the web, and the API behind
both.

The apps run in two modes. **Demo mode** (the default) needs no server: every
screen runs against a seeded local dataset. **Remote mode** makes them an
offline-first client of the API. Either way the calculations — tax splits,
document totals, receivables aging, stock balances, FX settlement — are real
implementations of the rules in the FRD, shared by the apps and the server
from one package.

## Repository layout

```
apps/
  mobile/          Expo app for iOS and Android (expo-router routes only)
  web/             Expo app for the browser: desktop sidebar shell, same screens
  api/             Fastify server, routed and validated from the OpenAPI contract
packages/
  core/            pure domain engines: money, tax, totals, numbering, ledgers,
                   compliance, reports, types, seed data, invoice HTML
  i18n/            message catalogues (English, Tamil) and the i18next instance
  ui/              theme, component kit, charts, illustrations and brand assets
  app/             screens, features, stores, and remote mode (remote/)
  api-contract/    openapi.yaml and the TypeScript types generated from it
  api-client/      typed fetch client: auth refresh, idempotency, problem errors
  db/              Drizzle schema, migrations, reference data and the demo seed
  tsconfig/, eslint-config/   shared presets
docs/              API notes and the database diagram
story/             BRD, PRD, FRD and the module breakdown
tools/             illustration generator, i18n report, import codemod
```

Packages ship TypeScript source; Metro, Jest and tsx compile them where
they're used, so there is no build step between packages. The API bundles
them with tsup for production.

## Getting started

Needs Node 22 (`.nvmrc`) and, for the API, Postgres 16 (Docker works).

```bash
npm install

# Demo mode: no server
npm run mobile            # Expo dev server for the phone app
npm run web               # the web app in a browser

# The API
docker compose up -d                      # Postgres, MinIO (S3), Mailpit
npm run db:migrate -w @esmart/db          # schema + reference data
npm run db:seed -w @esmart/db             # the demo businesses
npm run api                               # http://localhost:4000/v1

# The apps against the API (remote mode)
EXPO_PUBLIC_DATA_SOURCE=remote EXPO_PUBLIC_API_URL=http://localhost:4000 npm run web
```

Demo sign-in, in both modes: **gowtham@vertextraders.in / demo1234**. In demo
mode the phone OTP is `123456`; the API sends real codes (set `DEMO_OTP=true`
in `apps/api/.env` to accept `123456` in development).

| Command | What it does |
|---|---|
| `npm run typecheck` / `lint` / `test` | Turborepo runs it in every workspace (the API's tests need Postgres; see `TEST_DATABASE_URL`) |
| `npm run build -w @esmart/api` | Bundles the server to `apps/api/dist` |
| `npx expo export -p web` (in `apps/web`) | Static web build |
| `npm run generate -w @esmart/api-contract` | Regenerates the TypeScript types after editing `openapi.yaml` |
| `npm run db:generate -w @esmart/db` | Writes a migration from changes to `packages/db/src/schema.ts` |

CI (`.github/workflows/ci.yml`) runs typecheck, lint and test against a
Postgres service, builds the API and exports the web app.

### Configuration

- **Apps:** `EXPO_PUBLIC_DATA_SOURCE` (`local` or `remote`) and
  `EXPO_PUBLIC_API_URL`, fixed at build time.
- **API:** `apps/api/.env.example` lists every setting. All of them have a
  development default, so an empty `.env` works against the docker-compose
  Postgres. Production must set `JWT_SECRET` and `CREDENTIALS_KEY`.

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

## The API

`packages/api-contract/openapi.yaml` is the source of truth: 152 operations
and 2 webhooks, and the server implements every one (a test fails if any
operation lacks a handler).

- **Contract-driven routing.** Each operation becomes a route under `/v1` with
  its request schema, so a request the contract rejects never reaches a
  handler. Handlers are typed from the generated types and keyed by
  `operationId` (`apps/api/src/modules/<tag>/handlers.ts`).
- **Guards from the spec.** Bearer tokens with device-bound, rotating refresh
  tokens; company access on every `/companies/{companyId}` path; `x-roles`;
  and `x-plan-module` gating that returns `403 PLAN_UPGRADE_REQUIRED`.
- **The server is authoritative.** Totals, tax splits, numbers (assigned on
  finalise under a row lock, never reused), stock, outstanding amounts and
  derived statuses are computed with `@esmart/core`, the same engines the apps
  use for previews.
- **Safe writes.** `Idempotency-Key` on every POST (a retry replays the
  stored response), `If-Match` / `ETag` on updates (a stale write gets 412),
  problem+json errors with stable codes and `issues[]`, an audit trail and a
  change log for `/sync/pull`.
- **Providers.** SMS, email, WhatsApp, push, object storage, PDF rendering,
  the GST portals (IRP and e-way bill), GSTIN lookup, OCR, FX rates and
  Razorpay all sit behind interfaces. Each has an in-process stand-in (an
  outbox of sent messages, memory storage with signed URLs, a portal
  simulator over `@esmart/core/domain/irpAdapter`…), so development and tests
  need only Postgres; environment variables switch in the real adapters.
- **Tests** (`apps/api/test`) run against a real Postgres, and every response
  in every test is checked against the contract.

The database is `packages/db`: the baseline migration is the original SQL
schema (Drizzle can't express its deferrable foreign keys), `src/schema.ts`
mirrors it, and later migrations are generated from diffs of that file.

## Remote mode: offline first

With `EXPO_PUBLIC_DATA_SOURCE=remote` the apps are an offline-first client of
the API (`packages/app/remote/`). It is the outbox pattern, one code path
whether or not there is a network:

1. Every action still updates the local store at once, so the app is instant
   and keeps working offline.
2. A wrapper queues what the action means to the API (`POST` a new party,
   `PUT` an edit against the version you had, `POST …/status`…) into the
   store's `syncQueue`, in the contract's `SyncMutation` shape. Edits to
   something the server hasn't seen yet fold into its pending create.
3. The sync engine sends the queue through `POST /sync/push` straight away
   when online, again when the connection returns or the app comes to the
   foreground, and every minute; after a failed attempt it retries with
   backoff. The queue entry's id is the idempotency key, so a resend never
   applies twice.
4. It then pulls `GET /sync/pull` for what the server decided — numbers,
   totals, statuses, IRNs — and other devices' changes, and refreshes
   notifications, the audit trail, stock movements, devices and users.
5. Ids minted offline are swapped for the server's everywhere once the create
   syncs. A change that lost a race (412) stays in **Settings → Sync** with the
   server's copy shown, to send again or discard.

E-invoicing and e-way bills go straight to the API instead of the queue,
because the GST portals need a connection. Tokens are kept in the Keychain /
Keystore (`expo-secure-store`), or localStorage on the web.

## How the domain works

### The domain layer

Everything financial lives in `packages/core/src/domain` as pure functions, so it can be
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
  scheme, and why `packages/core/src/lib/hash.ts` is a real digest rather than a stand-in.
- The **signed QR** is a JWS carrying the ten claims the portal specifies, drawn
  by a QR encoder in `packages/core/src/lib/qr.ts` (byte mode, all four error-correction
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

Copy lives in `packages/i18n/src/locales/{en,ta}`, fifteen namespaces per language,
resolved through i18next. Three rules keep it honest:

- **The domain layer never sees a translator.** `packages/core/src/domain` returns a code and
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

Adding a language is a folder under `packages/i18n/src/locales` and one entry in
`SUPPORTED_LANGUAGES`. Note that Tamil's plural rule matches English (`one` at
n = 1 only); Hindi's does not — it counts zero as singular — so the
`_one`/`_other` split is worth re-reading when it lands.

### Data and state in the apps

`packages/app/store/appStore.ts` holds every entity in a Zustand store persisted to
AsyncStorage, so anything created in the prototype survives a restart. Fields
that a person picks from a fixed list store a stable slug rather than the
English label they saw — `Company.businessType` learned this the hard way, and
a migration maps the labels that shipped. Seeded master data the user can then
edit (tax categories, expense categories) is written in whatever language was
active at onboarding and is their data from then on; it does not follow a later
language switch. Reads go
through `packages/app/store/selectors.ts`, which scopes them by the active company —
that is how company isolation is enforced here.

Writes also append an audit event and, where the PRD calls for it, raise a
notification.

In remote mode the same store is the local half of an offline-first client;
see [Remote mode](#remote-mode-offline-first) above.

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
than left to a lone icon. `packages/ui/illustrations/registry.ts` maps a semantic name
(`not-found`, `all-settled`, `welcome`…) to a file in `packages/ui/assets/illustrations/`,
and `EmptyState` takes an `illustration` prop, so a screen asks for meaning
rather than a filename. Four hero moments — welcome, setup complete, scanning
and the empty dashboard — are animated GIFs; the rest are PNG. Small in-sheet
empty states deliberately keep their icon, because illustrations turn to mush
at that size.

The shipped files are placeholders drawn in the Storyset **Rafiki** style.
Replacing one with the real download keeps its filename, so no code changes are
needed — `packages/ui/assets/illustrations/README.md` lists what belongs in each file.

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
Rafiki style; see `packages/ui/assets/illustrations/README.md` for how to swap in the real
downloads.

## Known limits

- The GST portals, GSTIN lookup and OCR run on simulators; the e-invoice and
  e-way bill provider has a GSP skeleton (`apps/api/src/providers/compliance.ts`
  lists what a real one needs) and OCR and GSTIN lookup have none yet.
  SMS (MSG91), email (SES), WhatsApp (Meta), push (Expo), storage (S3),
  PDF (Chromium), FX (Open Exchange Rates) and Razorpay have real adapters.
- Recurring expenses are materialised by an exported function
  (`materializeRecurringExpenses`) that nothing schedules yet.
- Share links are created, but the contract has no public page to open them.
- A company-wide notification has one read state for everyone in it.
- Attachments picked in the app stay on the device in remote mode; the
  pre-signed upload API exists, but the app doesn't call it yet.
- The assistant answers from the local store with rule-based logic, not a model.
- Google sign-in exists only in demo mode.
- The illustrations are placeholders, not the real Storyset artwork.
