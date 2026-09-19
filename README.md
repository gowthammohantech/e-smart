# Elixir Books Smart — GST sales build

A React Native (Expo) prototype of a **sales-only, GST-focused** business app:
quotation to tax invoice, with a fully simulated NIC **e-Invoice (IRP)** and
**e-Way Bill** integration.

It is a **UI prototype** — there is no server, and every screen runs against a
seeded local dataset. But the rules behind those screens are real
implementations, not hard-coded numbers: the CGST/SGST/IGST split, the GSTIN
check digit, the NIC payload schema and its validation codes, the IRN hash, the
24-hour cancellation window, the ₹50,000 e-way bill threshold and the
one-day-per-200-km validity rule all behave the way the law and the portal do.

## Running it

```bash
npm install
npx expo start
```

Then open the project in **Expo Go** (iOS/Android) by scanning the QR code, or
press `i` / `a` for a simulator. The app targets phones.

Demo credentials are pre-filled on the sign-in screen. Phone OTP accepts the
code `123456`.

| Command | What it does |
|---|---|
| `npm start` | Expo dev server |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm test` | Jest suite over the calculation and compliance engines |
| `npx eslint .` | Lint |

## What's covered

Auth (email, phone OTP, Google) · three-step onboarding that creates a real
GST-registered company · Home dashboard · quotations, sales orders, delivery
notes, tax invoices, credit notes · payments received with multi-invoice
allocation and advances · receivables with aging and reminders · customers and
items · **e-Invoice generation, cancellation and the signed QR** · **e-way bill
Part-A/Part-B, validity, vehicle updates and cancellation** · **GSTR-1 with its
B2B, B2CL, B2CS, CDNR and HSN tables** · a GST-compliant invoice PDF · global
search that matches on IRN and e-way bill number · notifications · audit trail
· settings for the company, GST registration, tax slabs, numbering, payment
accounts, transporters and users.

Four tabs: **Home · Sell · GST · More**, split around **Lixi**, the assistant
in the middle of the bar. Lixi has no model behind it. It works out what you're
asking and answers from the same company-scoped books the screens use: sales
for a period, who owes you, a customer by name, GST and e-way bill problems, or
a document by its number. Each answer comes with buttons that open the relevant
screen. A count on the orb means the IRP rejected an invoice or an e-way bill is
expiring.

## What's in the demo data

Two businesses under one account, so company isolation is visible:

- **Vertex Traders** — a Mumbai wholesaler with 13 customers, 30 items and
  ~45 sales documents across every status, plus payments. Its turnover slab is
  above ₹5 crore, so e-invoicing applies.
- **Aurora Design Studio** — a Bengaluru services business, deliberately left
  **under the ₹5 crore threshold** so the "e-invoicing does not apply yet" path
  is reachable by switching companies from the header.

Every fifth customer is unregistered, so the B2C path has data; one is an SEZ
unit, so the SEZ supply type does too. Seeded invoices carry genuine IRNs —
they are produced by running the finished documents through the same mock IRP
the app uses — including one cancelled IRN and one the portal rejected.

**More → Reset demo data** restores the original dataset.

## Architecture

```
app/                      expo-router routes (screens only)
src/
  theme/                  design tokens + ThemeProvider, chart palettes
  components/             primitives, form kit, charts
  features/               screen-level composites (documents, gst, contacts, …)
  domain/                 pure calculation engines, no React
  store/                  zustand store + company-scoped selectors
  data/                   seed dataset
  illustrations/          illustration registry (name → asset)
  lib/                    money, sha256, formatting, dates, validators
assets/illustrations/     the artwork, plus how to replace it
tools/illustrations/      script that draws the placeholder art
```

### The domain layer

Everything financial and statutory lives in `src/domain` as pure functions, so
it can be tested without rendering anything.

| Module | Responsibility |
|---|---|
| `lib/money.ts` | Decimal-safe arithmetic on integer minor units. No binary floats touch a monetary value. |
| `lib/sha256.ts` | Synchronous, dependency-free SHA-256. React Native has no usable sync crypto, and the IRN has to be derivable while a document is being saved. |
| `lineCalc.ts` | Document totals in order: qty × price → line discount → taxable → tax → document discount → charges → round-off → grand total. |
| `taxEngine.ts` | Splits a rate into CGST + SGST within the state, or a single IGST line across a state line. |
| `numbering.ts` | Prefix / sequence / fiscal year / branch, with reset policy. Numbers are assigned on finalisation and never reused. |
| `documentStates.ts` | Legal status transitions per document type. |
| `receivables.ts` | `total − allocated payments = outstanding`, plus configurable aging buckets. |
| `reports.ts` | Sales, output-tax and payment summaries. |

### The GST layer — `src/domain/gst`

| Module | Responsibility |
|---|---|
| `stateCodes.ts` | All 37 state and UT codes — the input to the intra/inter-state decision. |
| `gstin.ts` | Shape and **check digit**, so a typo is caught here rather than at the portal. |
| `supplyType.ts` | Place of supply, and B2B / B2C / SEZ / export classification. |
| `applicability.ts` | Whether a document needs an e-invoice **and why**. The reason is part of the answer — the screens print it verbatim. |
| `einvoice/schema.ts` | The NIC JSON schema, version 1.1, with the portal's own field names. |
| `einvoice/buildPayload.ts` | Document → payload. Figures are read back from `calculateLine` and `doc.totals`, never recomputed. |
| `einvoice/validate.ts` | The portal's checks, each with its real error code (2150, 2172, 2182, 2189, 2211, 2265, 3028…). |
| `einvoice/irn.ts` | The 64-character hash of supplier GSTIN + doc type + number + financial year. |
| `einvoice/qr.ts` | The ten fields the IRP signs into the QR, in a JWS-shaped wrapper. |
| `einvoice/mockIrp.ts` | A local IRP: validates, mints, enforces the duplicate rule and the 24-hour cancellation window. |
| `eway/applicability.ts` | Goods only, movement only, over ₹50,000. |
| `eway/buildPartA.ts` | Part-A derived entirely from the document, so only Part-B is typed. |
| `eway/validate.ts` | Vehicle number, PIN/state agreement, transporter ID, 4,000 km ceiling. |
| `eway/validity.ts` | One day per 200 km or part thereof (20 km for over-dimensional cargo), expiring at midnight. |
| `eway/mockEwb.ts` | A local NIC portal: generate, update vehicle, extend, cancel. |
| `returns.ts` | GSTR-1 bucketing into B2B, B2CL, B2CS, CDNR and the HSN summary. |

`npm test` covers the parts that would be expensive to get wrong: rounding,
inclusive vs exclusive tax, the CGST/SGST/IGST split, allocation without losing
a paisa, aging buckets, the GSTIN checksum against a published example,
SHA-256 against the NIST vectors, every NIC error code, the duplicate-IRN and
cancellation-window rules, the validity arithmetic, GSTR-1 bucketing — and the
seed itself.

### What is real and what is simulated

Worth being precise about, because "e-invoice support" usually means a status
badge:

**Real.** The payload schema and its field names. The validation rules and
their error codes. The IRN, which is a genuine SHA-256 of the four identifying
facts, so the same document always hashes to the same IRN — which is what makes
duplicate detection meaningful. The GSTIN check digit. The 24-hour windows. The
₹50,000 threshold and the ₹2.5 lakh B2CL line. The validity arithmetic. The
GSTR-1 bucketing.

**Simulated.** The transport. `mockIrp` and `mockEwb` are deterministic,
in-process, and nothing ever leaves the device. The QR is signed with an HMAC
under a demo secret, not NIC's private key, and the app says so wherever it
shows one. No GSTIN is looked up against the real GSTN registry — a
well-formed, checksum-valid GSTIN is treated as active.

Neither mock holds state of its own: the register of live IRNs and e-way bills
is rebuilt from the documents on every call, so it cannot drift from what the
app holds, including across a reload.

### Data and state

`src/store/appStore.ts` holds every entity in a Zustand store persisted to
AsyncStorage. Reads go through `src/store/selectors.ts`, which scopes them by
the active company — that is how company isolation is enforced here. Writes
append an audit event and, where it matters, raise a notification.

`src/data/buildSeedData.ts` assembles the demo book. It sits outside the store
so the seed can be asserted without pulling in AsyncStorage.

### Charts

Charts are drawn with `react-native-svg` rather than a chart library. The
categorical series palette is validated against the usual accessibility checks
(lightness band, chroma floor, colour-vision separation, contrast). Status
colours stay reserved for state; aging buckets use a single-hue sequential ramp
because the buckets are ordered severity, not identity.

### Illustrations

Empty states, first-run screens and confirmation moments are illustrated rather
than left to a lone icon. `src/illustrations/registry.ts` maps a semantic name
(`not-found`, `all-settled`, `welcome`…) to a file in `assets/illustrations/`,
so a screen asks for meaning rather than a filename.

The shipped files are placeholders drawn in the Storyset **Rafiki** style.
Replacing one with the real download keeps its filename, so no code changes are
needed — `assets/illustrations/README.md` lists what belongs in each file.

## Credits

Illustrations by [Storyset](https://storyset.com), used under their free
licence, which requires attribution — the app credits them on
**Settings → About**. The files currently in the repo are placeholders in the
Rafiki style.

## Known limits

This is deliberately a prototype:

- **No server, and no portal.** Both GST portals are local mocks; see *What is
  real and what is simulated* above.
- **India and INR only.** Multi-currency was removed with the rest of the
  non-sales surface; an export supply is classified and reported, but invoiced
  in rupees.
- **No purchases, expenses or inventory.** This build is the sales side alone,
  so there is no input tax credit and GSTR-1 has no GSTR-2 counterpart.
- The threshold and rate constants (₹5 crore for e-invoicing, ₹50,000 for an
  e-way bill, 200 km per day) are current as of writing and live in named
  constants so they can be retuned in one place.
- Google sign-in signs straight into the demo account.
- The illustrations are placeholders, not the real Storyset artwork.
