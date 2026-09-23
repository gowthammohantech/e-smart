# Product Requirements Document — Elixir Books Smart

**Status:** approved baseline · **Owner:** Product · **Applies to:** v1.0 mobile
· **Depends on:** [01-brd.md](01-brd.md)

---

## 1. Product vision

A business owner should be able to take out a phone, bill a customer, satisfy
every statutory obligation that billing creates, and know what they are owed —
without leaving the counter, without a desktop, and without knowing what a
ledger is.

The product's job is to make the compliant path the *fastest* path. Nothing in
the interface should reward doing it the wrong way.

## 2. Product principles

These are binding. A design or implementation that violates one is wrong even
if it is otherwise attractive.

1. **Show the working.** Every number is derived and can be explained on the
   screen that shows it. Totals, tax splits, outstanding amounts and stock
   balances are never asserted.
2. **Say why, not just no.** A rejection names the field and the reason, and
   reports every finding at once. Never one error per attempt.
3. **Compliance is never a paywall.** Every tier reports e-invoices and raises
   e-way bills.
4. **Plain words, statutory terms intact.** The interface speaks the owner's
   language; GST, GSTIN, HSN, IRN and CGST/SGST/IGST stay exactly as a filing
   spells them.
5. **Nothing is lost.** A failed portal call, a downgrade, a language switch, a
   crash — none of them destroy a record.
6. **Derived, not stored.** Stock, outstanding and document payment status are
   computed from immutable records, never kept as mutable counters.
7. **Finalisation is a commitment.** Once a document has a number it cannot be
   edited. Corrections happen through lawful instruments.
8. **The phone is the target.** One-handed use, 44 dp touch targets, legible at
   360 dp, usable on a mid-range Android.

## 3. Personas

### P1 — Ramesh, owner, Vertex Traders (wholesale, Mumbai)
Runs a 14-person distribution business. Raises 40–60 invoices a week, most B2B
and many inter-state. Cares about: getting the IRN without a laptop, e-way bills
before the truck leaves, and who has not paid. Will pay for Pro. Reads English.

**Needs:** speed, compliance certainty, receivables at a glance, multi-branch.

### P2 — Lakshmi, counter operator (retail/services, Coimbatore)
Operates the app all day; does not own the business. Works in Tamil. Must not be
able to break the books.

**Needs:** Tamil interface, the fewest possible taps, no destructive powers,
clear confirmation that a document went through.

### P3 — Arun, founder, Aurora Design Studio (services, Bengaluru)
Bills a handful of clients monthly, no stock, some foreign clients in AED and
USD. Basic today, Pro when expenses matter.

**Needs:** quotes that convert to invoices, multi-currency, expense tracking,
professional-looking PDFs.

### P4 — Priya, the business's accountant (external)
Sees the data monthly. Files the returns.

**Needs:** GSTR-1 data, CSV exports, an audit trail, tax summary that ties out.

### P5 — Dispatch/transport staff
Touches only the e-way bill.

**Needs:** Part-B updatable from a phone in a yard, expiry visible, extension
possible before it is too late.

## 4. Packaging and gating

### 4.1 Tiers

| | Free | Basic | Pro | Business |
|---|---|---|---|---|
| Price / month | ₹0 | ₹399 | ₹899 | ₹1,799 |
| Price / year | ₹0 | ₹3,990 | ₹8,990 | ₹17,990 |
| Module set | sales | sales | **full** | **full** |
| Businesses | 1 | 1 | 3 | unlimited |
| Invoices | capped | unlimited | unlimited | unlimited |
| E-invoice + e-way bill | ✓ | ✓ | ✓ | ✓ |
| GSTR-1 | — | ✓ | ✓ | ✓ |
| Receivables | ✓ | ✓ | ✓ | ✓ |
| Purchases, stock, expenses | — | — | ✓ | ✓ |
| OCR, multi-currency, branches, payables | — | — | ✓ | ✓ |
| All nine reports | — | — | ✓ | ✓ |
| Roles and permissions, priority support, backup | — | — | — | ✓ |

Source of truth: `src/domain/plan.ts`. Feature sentences live in the `plan`
i18n namespace keyed by stable slugs, so the module carries no copy.

### 4.2 Gating rules

- There are exactly **two module sets**: `sales` (Free, Basic) and `full` (Pro,
  Business). `moduleSetFor(tier)` is the only place this is decided.
- Seven gateable modules: `purchases`, `inventory`, `expenses`, `ocr`, `fx`,
  `branches`, `payables`.
- Gating is enforced at **three** layers and must agree at all three:
  1. **Navigation** — the tab bar shows 7 tabs on `full`, 4 on `sales`.
  2. **Route** — `canOpen(tier, route)` blocks a gated path and routes to the
     upgrade screen instead. Gated prefixes are listed in `GATED_PATHS`.
  3. **Server** — a gated endpoint returns `403 PLAN_UPGRADE_REQUIRED`.
- Five of the nine reports are gated, each to the module whose data it reads:
  `purchase-summary`→purchases, `expense-summary`→expenses, `payables`→payables,
  `stock`→inventory, `profit`→expenses.
- The upsell target is always `pro` (`FULL_PLAN`), never `business`.
- **A downgrade hides data; it never deletes it.** Re-upgrading restores the
  same records untouched.

## 5. Feature epics

Each epic lists the user stories and the acceptance criteria that QA tests
against. Exact arithmetic and state rules are in the FRD; this section defines
*what must be true*, not *how it is computed*.

### E1 — Account, authentication and onboarding

**Stories**
- As a new owner I can sign up with email, phone OTP or Google.
- As a returning user I can sign in and stay signed in.
- As a new owner I am walked through setting up my business once, and never asked again.
- As an owner with more than one business I can switch between them from the header.

**Acceptance**
- Onboarding is five steps — country, business, tax, numbering, branches — plus a completion screen, and each step is independently resumable.
- Completing onboarding creates a real `Company`, a primary `Branch`, a default numbering series per document kind, default tax categories, expense categories and a payment account.
- Nothing entered in onboarding is discarded on a back navigation.
- A user's accessible companies and branches are enforced on every read (`selectors.ts` scopes by active company).
- Choices picked from a fixed list store a stable slug, never the English label the user saw.

### E2 — Selling

**Stories**
- I can raise a quotation, sales order, delivery note, tax invoice or sales return.
- I can convert a quote into an order, an order into a delivery, a delivery into an invoice, without retyping.
- I can add lines from my catalogue or type a one-off line.
- I can discount a line or the whole document, add charges, and round off.
- I can see the tax split before I finalise.
- I can share the invoice as a PDF on WhatsApp.

**Acceptance**
- Five sales document kinds, each with its own numbering series and its own status machine.
- A draft is editable and unnumbered; finalising assigns the number and locks the document.
- Totals update live as lines change, following the FRD §10 order exactly.
- The tax panel shows one row per rate, split into CGST+SGST or IGST according to place of supply.
- Conversion carries party, currency, rate, lines and references the source document (`sourceDocumentId`).
- The PDF matches the on-screen totals to the paisa and, under Tamil, carries bilingual labels with values rendered once in Latin.

### E3 — Buying *(Pro and above)*

**Stories**
- I can raise a purchase order, record a goods receipt against it, enter the supplier's bill and raise a purchase return.
- I can record the supplier's own bill number.
- Receiving goods increases my stock without my doing anything else.

**Acceptance**
- Four purchase document kinds mirroring the sales set, with their own series and state machines.
- `supplierDocNumber` is captured on purchase documents and shown on the register.
- A goods receipt writes a `purchaseReceipt` stock movement; a purchase return writes `purchaseReturn`.
- A purchase bill creates a payable and appears in aging.

### E4 — Money in and out

**Stories**
- I can record a payment against one invoice or several at once.
- I can take money on account before there is an invoice, and have it applied later.
- I can settle a foreign-currency invoice and see the gain or loss.
- I can see who owes me, how overdue, and chase them.

**Acceptance**
- A payment allocates across multiple documents; the unallocated remainder is held as an advance against the party.
- Allocation never loses a minor unit.
- Advances apply oldest-advance-first against oldest-open-document-first, same currency only.
- Payment method constrains the account it can settle through (cash cannot pay a bank cheque).
- Settling at a different rate from the document rate records `fxGainLoss`.
- Receivables and payables show total, overdue, due-soon and five aging buckets, with a reminder action per row.
- Document status (`paid`, `partiallyPaid`, `overdue`) is derived from outstanding and due date, never set by hand.

### E5 — GST compliance

**Stories**
- I can report an invoice to the IRP and get back an IRN, acknowledgement and a QR I can print.
- I am told before I try if the document will be rejected, and why.
- I can cancel an IRN inside 24 hours, with a reason.
- I can raise an e-way bill, fill Part-B, extend it, and cancel it.
- I can see, in one place, everything that needs attention.

**Acceptance**
- Applicability is decided from company turnover vs the configured threshold, party registration type, document kind and value — not guessed.
- Validation runs fully client-side first and returns **every** finding at once, each with a code, a dotted field path and a severity.
- The IRN is the genuine SHA-256 of supplier GSTIN, document type, document number and financial year, so any holder of those four fields can verify it.
- The signed QR carries the ten specified claims and scans with a standard reader.
- Cancellation is refused after 24 hours, with the deadline shown.
- E-way bill validity is one day per 200 km (20 km for ODC), expiring at midnight; extension opens 8 hours before expiry and closes 8 hours after.
- A compliance hub summarises pending, generated, failed, expiring and expired.
- Nothing about a reported document may be edited afterwards.

### E6 — Stock *(Pro and above)*

**Stories**
- I can keep items and services with price, tax category, HSN and barcode.
- I can set opening stock, adjust, and transfer between branches.
- I can see what is running low before it runs out.
- I can look an item up by scanning it.

**Acceptance**
- On-hand quantity is always derived from the immutable movement list; there is no stored counter.
- Eight movement types with fixed sign; adjustments carry their own sign.
- Valuation is weighted average of inbound movements, falling back to purchase price.
- Low stock is `trackInventory && reorderLevel > 0 && onHand <= reorderLevel`.
- A branch transfer writes a paired `transferOut` and `transferIn`.

### E7 — Expenses *(Pro and above)*

**Stories**
- I can record a business expense with a category, attach the receipt, and mark it recurring.
- I can photograph a bill and have it filled in for me.

**Acceptance**
- Expense carries category, optional supplier, tax category and amount, inclusive or exclusive, an account, a method and attachments.
- Recurrence supports weekly, monthly, quarterly, yearly, with a next date.
- OCR capture produces a reviewable extraction; the user confirms before anything is written.
- Expense categories are seeded at onboarding in the then-active language and are thereafter the user's own data — a later language switch does not rewrite them.

### E8 — Reports

**Stories**
- I can see sales, purchases, expenses, receivables, payables, stock, tax, payments and profit, filtered by period, branch, party and currency, and export any of them.

**Acceptance**
- Nine reports, each with a hero figure, key figures, at least one chart and a data table.
- Filters: date range preset or custom, branch, party, currency.
- Every report exports to CSV carrying the same numbers shown.
- Profit treats revenue as **taxable value**, so tax collected is never counted as income.
- Gated reports are hidden from the hub rather than shown and blocked.

### E9 — Business setup

**Stories**
- I can set up my company, branches, staff, taxes, currencies, numbering, accounts and categories; connect integrations; back up and export; and see who changed what.

**Acceptance**
- Nineteen settings screens (listed in [04-modules-and-features.md](04-modules-and-features.md)).
- Five roles — owner, admin, accountant, sales, viewer — enforced on operations.
- Numbering is configurable per series: prefix, next number, padding, fiscal year, branch code, reset policy; with a live preview.
- Compliance settings are a separate record from the company profile, so an unrelated profile edit cannot clobber them.
- Credentials are stored masked and never displayed in the clear.
- Every write appends an audit event with actor, entity, before and after.

### E10 — Assistant (Lixi)

**Stories**
- I can ask, in plain words, what I am owed or what needs attention, and get an answer from my own books.
- Lixi can take me to the right screen, but never changes anything without asking.

**Acceptance**
- Lixi answers only from company-scoped data. If the data is not there it says so; it never invents a figure.
- Lixi never writes. Any action that opens a form which would write carries an explicit confirm prompt first.
- Lixi respects the plan: it does not answer for modules the tier excludes.
- Three access gestures — hold a tab, swipe up on the bar, tap the floating orb — each independently switchable in Settings → Appearance.

### E11 — Language and appearance

**Stories**
- I can use the whole app in Tamil, including printed invoices.
- I can choose light, dark, or follow the system.

**Acceptance**
- Fifteen namespaces per language; both catalogues carry identical keys, identical interpolation parameters and paired plural forms — enforced by test.
- No Tamil value may still be its untranslated English source — enforced by test.
- Digits stay ASCII in every language; only the lakh/crore word is translated.
- Statutory tokens are never translated.
- The type scale adapts per script: Tamil gets 1.5 line height and zero tracking, because the vowel signs collide otherwise.
- Tab labels fit a nine-grapheme budget — enforced by test.
- Printed invoices under Tamil carry bilingual labels; values render once, in Latin.

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | Cold start to interactive ≤ 2.5 s on a mid-range Android. List scroll ≥ 55 fps at 500 rows. Document totals recompute ≤ 16 ms. |
| **Correctness** | No binary float touches a monetary value. All money is integer minor units with an explicit currency. Every calculation engine is unit-tested. |
| **Offline** | Every read works offline against local state. Writes queue and replay with an idempotency key. The UI states offline explicitly rather than failing silently. |
| **Concurrency** | Optimistic concurrency on every server write (`version` + `If-Match`); a stale write returns `412`. |
| **Security** | Company-scoped authorisation on every read and write. Role checks on every operation. Portal credentials held in a KMS, never returned in the clear. No PII in logs. |
| **Accessibility** | Minimum touch target 44 dp. Text contrast meets WCAG AA in both schemes. Status is never carried by colour alone — every status badge carries a word. Dynamic type respected. |
| **Internationalisation** | Adding a language is a folder plus one entry in `SUPPORTED_LANGUAGES`. No sentence is assembled from translated fragments. |
| **Auditability** | Every mutation records actor, action, entity, before, after, device and time. Audit is append-only. |
| **Resilience** | A portal timeout leaves the document exactly as it was, with the attempt recorded. Retry is always safe. |
| **Data retention** | Financial records are retained for at least eight years; nothing financial is hard-deleted. |

## 7. Platform

- **Client:** React Native on Expo, `expo-router` file-based routing. iOS and Android phones. Tablet layouts are explicitly not supported in v1.
- **State:** Zustand, persisted to AsyncStorage; reads through company-scoped selectors.
- **Domain:** pure TypeScript in `src/domain`, no React, fully testable without rendering.
- **Charts:** hand-drawn `react-native-svg`. No chart library.
- **Server (to build):** contract already defined in `docs/api/openapi.yaml` — 111 paths, 152 operations, 2 webhooks; schema in `docs/database/schema.sql` (63 tables).
- **iOS App Intents:** a Create Invoice intent, so Siri and Shortcuts can start an invoice for a known customer and item.

## 8. Release plan

| Phase | Contents | Exit criteria |
|---|---|---|
| **M1 — Sell** | Auth, onboarding, contacts, catalogue, quotes → invoices, PDF, payments received, receivables | An owner can bill and collect end to end |
| **M2 — Comply** | E-invoicing, e-way bills, compliance hub, GSTR-1, transporters | 90% first-attempt IRN success on a live sandbox |
| **M3 — Buy** | Purchases, goods receipts, bills, returns, payables, payments made, inventory, expenses, OCR | Pro tier saleable |
| **M4 — Run** | Nine reports, branches, users and roles, audit, backup, integrations, multi-currency | Business tier saleable |
| **M5 — Scale** | Server, real portal connectivity, real OCR, sync, push, assistant on a model | Prototype boundaries removed |

## 9. Open questions

1. Does the free tier's invoice cap reset monthly or is it a lifetime cap? Currently unspecified in `plan.ts`; the copy says "capped".
2. Is Hindi the second language after Tamil? Its plural rule counts zero as singular, unlike Tamil and English, so the `_one`/`_other` split needs re-reading before it lands.
3. Does the product ever file GSTR-1 itself, or only prepare it? v1 prepares only.
4. Are branch-level GSTINs required at launch, or only branch codes? The model supports both (`Branch.gstin`).

## 10. Traceability

| Epic | BRD objective | FRD section | Modules doc |
|---|---|---|---|
| E1 | BO-1 | §2, §17 | Account & onboarding |
| E2 | BO-1 | §9, §10, §15 | Sales |
| E3 | BO-4 | §9, §13 | Purchases |
| E4 | BO-3 | §12, §18, §6 | Money |
| E5 | BO-2 | §16 | Compliance |
| E6 | BO-4 | §13 | Inventory |
| E7 | BO-4 | §14 | Expenses |
| E8 | BO-3 | §19 | Reports |
| E9 | BO-5 | §2, §17, §20 | Settings |
| E10 | BO-1 | §21 | Lixi |
| E11 | BO-6 | §22 | i18n |
