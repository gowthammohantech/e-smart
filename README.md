# Elixir Books Smart

Business accounting for Indian SMEs — invoicing, GST e-invoicing and e-way
bills, payments, stock, expenses and reports — as a monorepo with a
React Native app for phones, the same app for the web, and the API behind
both.

The apps are an offline-first client of the API: every screen reads and
writes the books on the server, and keeps working on a local copy when the
connection drops. The calculations — tax splits, document totals, receivables
aging, stock balances, FX settlement — are real implementations of the rules
in the FRD, shared by the apps and the server from one package. A demo
account lives in the database, seeded on demand; nothing demo ships in the
apps. What is still to do before the production release is tracked in
[docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).

## Repository layout

```
apps/
  mobile/          Expo app for iOS and Android (expo-router routes only)
  web/             Expo app for the browser: desktop sidebar shell, same screens
  api/             Fastify server, routed and validated from the OpenAPI contract
  admin/           React + Vite console for platform operators (tenants, plans, audit)
packages/
  core/            pure domain engines: money, tax, totals, numbering, ledgers,
                   compliance, reports, types, invoice HTML
  i18n/            message catalogues (English, Tamil) and the i18next instance
  ui/              theme, component kit, charts, illustrations and brand assets
  app/             screens, features, stores, and the API client half (remote/)
  api-contract/    openapi.yaml and the TypeScript types generated from it
  api-client/      typed fetch client: auth refresh, idempotency, problem errors
  db/              Drizzle schema, migrations, reference data, and the demo
                   account's dataset and seeder (src/demo/, src/seed.ts)
  tsconfig/, eslint-config/   shared presets
docs/              API notes, the database diagram and the production checklist
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

# The API
docker compose up -d                      # Postgres, MinIO (S3), Mailpit
cp apps/api/.env.example apps/api/.env    # then set the demo account, below
npm run db:migrate -w @esmart/db          # schema + reference data (+ the demo account)
npm run api                               # http://localhost:4000/v1

# The apps (they always talk to the API at EXPO_PUBLIC_API_URL)
npm run web               # the web app in a browser
npm run mobile            # Expo dev server for the phone app

# The platform admin console (needs the API)
npm run db:platform-admin -w @esmart/db -- --email you@example.com --role superadmin
npm run admin                             # http://localhost:5174
```

**The demo account.** With `SEED_DEMO_ACCOUNT=true` and a
`DEMO_ACCOUNT_PASSWORD` in `apps/api/.env`, `db:migrate` loads the demo
businesses under their own account after the reference data (an existing
demo account is left alone; `npm run db:seed -w @esmart/db -- --reset`
rebuilds it). The owner signs in as `DEMO_ACCOUNT_EMAIL` (default
`gowtham@vertextraders.in`). The seed is env-gated, so it may run in any
environment; in production the password must be at least 12 characters and
not `demo1234`. `npm run db:reset -w @esmart/db` drops everything and
migrates again, seeding when the gate is on.

**Prefilling the sign-in form.** `EXPO_PUBLIC_DEMO_LOGIN_EMAIL` /
`EXPO_PUBLIC_DEMO_LOGIN_PASSWORD` (web and mobile) and `VITE_DEMO_LOGIN_EMAIL`
/ `VITE_DEMO_LOGIN_PASSWORD` (admin) prefill the sign-in form. They are
compiled into the client bundle, where anyone who loads it can read them:
set them only on a demo or sandbox deployment. Unset, the form starts empty.

The API sends real OTP codes; set `DEMO_OTP=true` in `apps/api/.env` to accept
`123456` in development (production refuses it).

| Command | What it does |
|---|---|
| `npm run typecheck` / `lint` / `test` | Turborepo runs it in every workspace (the API's tests need Postgres; see `TEST_DATABASE_URL`) |
| `npm run build -w @esmart/api` | Bundles the server to `apps/api/dist` |
| `npx expo export -p web` (in `apps/web`) | Static web build |
| `npm run build -w @esmart/admin` | Static build of the admin console to `apps/admin/dist` |
| `npm run generate -w @esmart/api-contract` | Regenerates the TypeScript types after editing `openapi.yaml` |
| `npm run db:generate -w @esmart/db` | Writes a migration from changes to `packages/db/src/schema.ts` |

CI (`.github/workflows/ci.yml`) runs typecheck, lint and test against a
Postgres service, builds the API and the admin console, and exports the web app.

### Configuration

- **Apps:** `EXPO_PUBLIC_API_URL`, and optionally the sign-in prefill
  `EXPO_PUBLIC_DEMO_LOGIN_EMAIL` / `EXPO_PUBLIC_DEMO_LOGIN_PASSWORD`, fixed
  at build time; see `apps/web/.env.example` and `apps/mobile/.env.example`.
- **Admin console:** `VITE_API_URL` (the API origin, without `/v1`), and
  optionally `VITE_DEMO_LOGIN_EMAIL` / `VITE_DEMO_LOGIN_PASSWORD`, fixed at
  build time; see `apps/admin/.env.example`.
- **API:** `apps/api/.env.example` lists every setting. All of them have a
  development default, so an empty `.env` works against the docker-compose
  Postgres. With `NODE_ENV=production` the server refuses to start while any
  provider is a simulator or log-only, a chosen provider lacks its
  credentials, a webhook secret is still the development default,
  `CORS_ORIGINS` is `*`, or `JWT_SECRET` / `CREDENTIALS_KEY` are unset.
  GSTIN lookup and OCR have no real adapter yet, so production runs them as
  `disabled` (503 `FEATURE_UNAVAILABLE`).
- **Database:** `SEED_DEMO_ACCOUNT`, `DEMO_ACCOUNT_EMAIL` and
  `DEMO_ACCOUNT_PASSWORD` control the demo account (above).

## What's in the demo account

Seeded into the database (`packages/db/src/demo/`) when
`SEED_DEMO_ACCOUNT=true`. Two businesses under one account, so company
isolation is visible:

- **Vertex Traders** — a Mumbai wholesaler with 13 customers, 8 suppliers, 33
  items, ~60 documents across every type and status, payments, expenses and a
  full stock movement history. Includes an AED customer so multi-currency and
  FX settlement are exercisable.
- **Aurora Design Studio** — a Bengaluru services business with its own
  contacts, numbering and books.

Switch between them from the header. `npm run db:seed -w @esmart/db -- --reset`
restores the original dataset.

## The API

`packages/api-contract/openapi.yaml` is the source of truth: 165 operations
and 2 webhooks, and the server implements every one (a test fails if any
operation lacks a handler).

- **Contract-driven routing.** Each operation becomes a route under `/v1` with
  its request schema, so a request the contract rejects never reaches a
  handler. Handlers are typed from the generated types and keyed by
  `operationId` (`apps/api/src/modules/<tag>/handlers.ts`).
- **Guards from the spec.** Bearer tokens with device-bound, rotating refresh
  tokens; company access on every `/companies/{companyId}` path; `x-roles`;
  and `x-plan-module` gating that returns `403 PLAN_UPGRADE_REQUIRED`.
  Cross-tenant `/admin/*` routes use `x-platform-roles` instead (see
  [docs/api](docs/api/README.md#platform-operators)).
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
  need only Postgres; environment variables switch in the real adapters, and
  production refuses to start on a stand-in.
- **Tests** (`apps/api/test`) run against a real Postgres, and every response
  in every test is checked against the contract.

The database is `packages/db`: the baseline migration is the original SQL
schema (Drizzle can't express its deferrable foreign keys), `src/schema.ts`
mirrors it, and later migrations are generated from diffs of that file.

## Offline first

The apps are an offline-first client of the API (`packages/app/remote/`). It
is the outbox pattern, one code path whether or not there is a network:

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

E-invoicing and e-way bills, attachments and OCR, PDFs, share and payment
links, sending documents, exports and Lixi go straight to the API instead of
the queue, because they need the server (or the GST portal) to answer. Tokens
are kept in the Keychain / Keystore (`expo-secure-store`), or localStorage on
the web.

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

`packages/app/store/appStore.ts` holds the signed-in account's entities in a
Zustand store persisted to AsyncStorage (`ebs.remote.v1`), so the app opens
instantly and works offline. It starts empty and is filled from the API on
sign-in; nothing is bundled. Fields
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

The store is the local half of the offline-first client; see
[Offline first](#offline-first) above.

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

Auth (email, phone OTP) · five-step onboarding that creates a real
company · Home dashboard · quotations, sales orders, delivery notes, invoices,
sales returns · purchase orders, goods receipts, purchase bills, purchase
returns · expenses with recurrence and receipts · payments in and out with
multi-invoice allocation, advances and FX settlement · receivables and payables
with aging and reminders · e-invoicing with IRN, acknowledgement and a
scannable signed QR, cancellation inside the 24-hour window, and a compliance
register · e-way bills with Part-A and Part-B, distance-based validity,
extension and cancellation · items, stock adjustments, branch transfers, opening
stock, low stock, barcode lookup by typed code · customers and suppliers with full history ·
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

The full list of what is still pending before the production release —
adapters to build, vendor accounts to provision, dead links, background jobs,
ops and QA — lives in [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).
In short:

- GSTIN lookup and OCR have no real adapter yet; production runs them as
  `disabled`. The e-invoice and e-way bill provider has a GSP skeleton
  (`apps/api/src/providers/compliance.ts` lists what a real one needs).
  SMS (MSG91), email (ACS, SES), WhatsApp (Meta), push (Expo), storage
  (Azure Blob, S3), PDF (Chromium), FX (Open Exchange Rates), Razorpay and
  Lixi (Anthropic) have real adapters.
- Recurring expenses are materialised by an exported function
  (`materializeRecurringExpenses`) that nothing schedules yet.
- Share links and payment links are created, but the public pages they point
  at don't exist yet.
- A company-wide notification has one read state for everyone in it.
- Google sign-in is not built; barcode scanning takes a typed code, not the camera.
- The illustrations are placeholders, not the real Storyset artwork.
