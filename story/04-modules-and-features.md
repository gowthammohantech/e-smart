# Modules and Features — Elixir Books Smart

**Status:** working index · **Owner:** Engineering
· **Depends on:** [03-frd.md](03-frd.md)

Every module, every screen, every feature, with the route that serves it, the
entities it touches and the plan that unlocks it. This is the document to read
when asking "where does this live" or "what is supposed to be on that screen".

**Gating key:** *(all)* = every tier · *(Pro)* = Pro and Business only.

---

## Module map

| # | Module | Gate | Routes | Core entities |
|---|---|---|---|---|
| 1 | Account & authentication | all | `(auth)/*` | User, DeviceSession |
| 2 | Onboarding | all | `(onboarding)/*` | Company, Branch, NumberingSeries |
| 3 | Home & dashboard | all | `(tabs)/index` | — (reads everything) |
| 4 | Sales | all | `sales/*` | BusinessDocument |
| 5 | Purchases | **Pro** | `purchases/*` | BusinessDocument |
| 6 | Contacts | all *(suppliers Pro)* | `contacts/*` | Party |
| 7 | Catalogue | all | `catalog/items/*` | Item, Unit |
| 8 | Inventory | **Pro** | `inventory/*` | StockMovement |
| 9 | Money | all *(payables Pro)* | `payments/*`, `receivables`, `payables` | Payment, PaymentAccount |
| 10 | Expenses | **Pro** | `expenses/*` | Expense, ExpenseCategory |
| 11 | Compliance | all | `compliance/*`, `gst/*` | ComplianceInfo, EwayBill |
| 12 | Reports | all *(5 of 9 Pro)* | `reports/*` | — (reads everything) |
| 13 | Settings | all *(some Pro)* | `settings/*` | Company, Branch, User, … |
| 14 | Lixi assistant | all | `lixi`, `assistant` | — (reads everything) |
| 15 | OCR | **Pro** | `ocr/*` | Attachment, Expense |
| 16 | Search & notifications | all | `search`, `notifications` | AppNotification |
| 17 | Plan & upgrade | all | `upgrade`, `settings/plan` | PlanTier |

---

## 1. Account & authentication *(all)*

| Screen | Route | What it does |
|---|---|---|
| Welcome | `(auth)/welcome` | First-run hero, animated illustration, sign in / sign up |
| Sign in | `(auth)/sign-in` | Email + password, phone, or Google |
| Sign up | `(auth)/sign-up` | Creates the account, goes straight into onboarding |
| OTP | `(auth)/otp` | Six-digit phone verification, resend with cooldown |
| Forgot password | `(auth)/forgot-password` | Reset link by email |

**Features**
- Three sign-in methods: email/password, phone OTP, Google.
- Session persists across restarts; sign-out clears the session, not the data.
- Device and session management lives in Settings → Devices, where any session but the current one can be revoked.

**Prototype boundary:** demo credentials are pre-filled; OTP accepts `123456`; Google signs straight into the demo account.

---

## 2. Onboarding *(all)*

Five steps plus a completion screen, each independently resumable. Draft state
lives in `onboardingStore`, separate from the app store, so nothing half-built
pollutes the books.

| Step | Route | Captures |
|---|---|---|
| 1. Country | `(onboarding)/country` | Country, base currency, fiscal year start month |
| 2. Business | `(onboarding)/business` | Name, legal name, type, logo, address, email, phone |
| 3. Tax | `(onboarding)/tax` | Registered or not, GSTIN, composition scheme |
| 4. Numbering | `(onboarding)/numbering` | Invoice prefix, next number, fiscal-year inclusion — with a live preview |
| 5. Branches | `(onboarding)/branches` | Additional branches (name, code, city) |
| Done | `(onboarding)/done` | Animated confirmation, into the app |

**What completing it creates:** a real `Company`, a primary `Branch`, eleven
`NumberingSeries`, default `TaxCategory` rows for the regime, default
`ExpenseCategory` rows, and a default `PaymentAccount`.

**Rules**
- Business type stores a stable slug, never the English label shown. A migration maps the labels that shipped before this was true.
- The GSTIN field validates the full check digit, not just the shape, and offers the state code back as the place-of-supply default.
- Seeded master data is written in the language active at onboarding and is the user's data from then on.

---

## 3. Home & dashboard *(all)*

**Route:** `(tabs)/index`

| Section | Contents |
|---|---|
| Header | Company switcher, notification bell, search |
| First steps | Shown only while the books are empty — the setup checklist |
| This month | Six stat tiles: sales, collected, expenses, net, e-invoices, e-way bills |
| Sales trend | Six-month bar chart, links to the sales summary report |
| Owed to you | Total receivable, overdue split, link to Receivables |
| You owe | Total payable, link to Payables *(Pro)* |
| Needs attention | Overdue invoices, draft invoices, open quotes, low stock, rejected e-invoices, expiring e-way bills — each with a count, a tone and a destination |
| Recent invoices | Last few invoices with status badges, or an illustrated empty state |
| FAB | New invoice, with a sheet of other create actions |

**Quick actions** (the create sheet): new invoice, new quote, receive payment,
add expense, add customer, add item.

---

## 4. Sales *(all)*

**Hub:** `(tabs)/sales` — tiles for each document kind with open counts.

Five document kinds, each with a register, a create screen, a detail screen and
an edit screen:

| Kind | Register | New | Detail | Edit |
|---|---|---|---|---|
| Quotation | `sales/quotes` | `sales/quotes/new` | `sales/quotes/[id]` | `sales/quotes/[id]/edit` |
| Sales order | `sales/orders` | `…/new` | `…/[id]` | `…/[id]/edit` |
| Delivery note | `sales/deliveries` | `…/new` | `…/[id]` | `…/[id]/edit` |
| Tax invoice | `sales/invoices` | `…/new` | `…/[id]` | `…/[id]/edit` |
| Sales return | `sales/returns` | `…/new` | `…/[id]` | `…/[id]/edit` |

**Register features:** search, status filter chips, date range, sort, infinite
list, per-row status badge and outstanding amount, swipe actions, illustrated
empty state.

**Editor features**
- Party picker with inline create.
- Line editor sheet: item picker or free text, quantity, unit, price, discount (percent or amount), tax category, inclusive toggle.
- Live totals panel: subtotal, line discount, taxable, one row per tax slab, document discount, charges, round-off, grand total — and the base-currency equivalent when the document is not in base currency.
- Place of supply, which drives CGST+SGST versus IGST.
- Currency and effective-dated exchange rate.
- Notes, terms, attachments, reference.
- Save as draft, or finalise — finalising assigns the number and locks the document.

**Detail features:** status badge and legal next actions only, totals, compliance
card (e-invoice and e-way bill), payment history and outstanding, conversion
actions, PDF preview, share, duplicate, cancel.

**Conversion chain:** quote → sales order → delivery note → invoice, and invoice
→ sales return. Conversion carries party, currency, rate, place of supply and
lines, and records `sourceDocumentId`.

**Shared code:** `DocumentEditor`, `DocumentDetail`, `LineEditorSheet`,
`useDocumentDraft`, `documentHtml` (the PDF template), `DocumentListView`,
`DocumentRow`, `TotalsPanel`.

---

## 5. Purchases *(Pro)*

**Hub:** `(tabs)/purchases`. Mirrors sales exactly, four kinds:

| Kind | Routes |
|---|---|
| Purchase order | `purchases/orders/{index,new,[id],[id]/edit}` |
| Goods receipt | `purchases/receipts/…` |
| Purchase bill | `purchases/bills/…` |
| Purchase return | `purchases/returns/…` |

**Differences from sales**
- Party picker is suppliers.
- `supplierDocNumber` captures the supplier's own bill number and is shown on the register.
- A goods receipt writes a `purchaseReceipt` stock movement; a purchase return writes `purchaseReturn`.
- A purchase bill creates a payable and enters aging.
- Tax on purchases is input tax and credits the tax summary.

**Chain:** purchase order → goods receipt → purchase bill, and purchase bill →
purchase return.

---

## 6. Contacts *(customers all · suppliers Pro)*

**Hub:** `(tabs)/contacts` — segmented between customers and suppliers.

| Screen | Route |
|---|---|
| Customer list | `(tabs)/contacts` |
| New customer | `contacts/customers/new` |
| Customer detail | `contacts/customers/[id]` |
| Edit customer | `contacts/customers/[id]/edit` |
| Supplier equivalents | `contacts/suppliers/…` |

**Form fields:** name, display name, code, GSTIN (validated), GST registration
type, email, phone, currency, billing address, shipping address, credit limit,
opening balance, payment terms in days, notes, status.

**Detail screen:** outstanding balance and aging, full document history, payment
history, advances held, quick actions (new invoice, receive payment, call,
WhatsApp, email), statement export.

**City field** (`CityField`) offers a state-aware city list, feeding the state
code that place-of-supply depends on.

---

## 7. Catalogue *(all)*

| Screen | Route |
|---|---|
| Item list | `catalog/items` |
| New item | `catalog/items/new` |
| Item detail | `catalog/items/[id]` |
| Edit item | `catalog/items/[id]/edit` |

**Fields:** SKU, name, description, type (goods or service), unit, sale price,
purchase price, tax category, HSN/SAC, barcode, track inventory, opening stock,
reorder level, image, status.

**Detail screen:** current stock across branches, movement ledger with running
balance, recent documents containing the item, valuation.

---

## 8. Inventory *(Pro)*

**Hub:** `(tabs)/inventory` — on-hand value, low-stock count, out-of-stock count.

| Screen | Route | What it does |
|---|---|---|
| Stock adjustment | `inventory/adjust` | Signed correction with reason and reference |
| Low stock | `inventory/low-stock` | Items at or under reorder level, with a reorder action |
| Movements | `inventory/movements` | Full company movement ledger, filterable by item, branch, type and date |
| Opening stock | `inventory/opening-stock` | Bulk opening balances |
| Branch transfer | `inventory/transfer` | Paired out/in movements between branches |
| Scan | `inventory/scan` | Barcode camera lookup straight to the item |

Every quantity on every screen is derived from the movement list. There is no
stored counter to drift.

---

## 9. Money *(payments in: all · payables and payments out: Pro)*

| Screen | Route | Gate |
|---|---|---|
| Payments received | `payments/received` | all |
| Payments made | `payments/made` | Pro |
| New payment | `payments/new?direction=received\|paid` | direction-dependent |
| Payment detail | `payments/[id]` | — |
| Receivables | `receivables` | all |
| Payables | `payables` | Pro |

**New payment features**
- Party picker, then that party's open documents listed with outstanding amounts.
- Allocate all, allocate oldest-first, or type per-document amounts.
- The unallocated remainder is shown explicitly and held as an advance.
- Method drives the permitted account; changing the method re-picks the account when the current one no longer fits.
- Foreign-currency settlement shows the document rate, the settlement rate and the resulting gain or loss.
- Existing advances for the party are offered for application.

**Receivables / Payables screens** (`AgingScreen`)
- Hero total, overdue and due-soon figures.
- Aging bar chart over five buckets, using a single-hue sequential ramp because the buckets are ordered severity, not identity.
- Bucket filter chips.
- Per-row: party, document, due date, days overdue, outstanding, and a reminder action (WhatsApp, SMS, email).
- CSV export.

---

## 10. Expenses *(Pro)*

| Screen | Route |
|---|---|
| Expense list | `expenses` |
| New expense | `expenses/new` |
| Expense detail | `expenses/[id]` |
| Edit expense | `expenses/[id]/edit` |

**Fields:** category, supplier, date, amount, currency, tax category, tax
inclusive toggle, account, method, reference, notes, billable flag, recurrence
(none/weekly/monthly/quarterly/yearly) with next date, receipt attachments.

**Features:** category chips with colour and icon, receipt photo or file, running
month total, recurrence badge, round-off handling, category management in
Settings.

---

## 11. Compliance *(all)*

| Screen | Route | What it does |
|---|---|---|
| GST hub | `(tabs)/gst` | The Sales-plan compliance tab |
| Compliance register | `compliance` | Everything reportable, filtered by state |
| New e-way bill | `compliance/eway/new` | Part-A and Part-B capture |
| E-way bill detail | `compliance/eway/[id]` | Status, validity countdown, Part-B history, extensions, cancel |
| GSTR-1 | `gst/gstr1` | Section-wise summary and export |
| E-invoicing settings | `settings/e-invoicing` | Thresholds, windows, credentials, auto-generate |
| Transporters | `settings/transporters` | Saved carriers with GSTIN/TRANSIN |

**E-invoice features** (`EInvoiceSheet`, `ComplianceCard`)
- Applicability stated on the document before anything is attempted.
- Full validation with every finding listed at once, each naming its field.
- Generate → IRN, acknowledgement number and date, signed QR rendered on screen and on the PDF.
- The 24-hour cancellation deadline shown as a countdown; cancellation with a reason code and, for "other", a remark.
- Failed attempts recorded with the portal's message and retryable.

**E-way bill features** (`EwayBillForm`, `EwayBillDetail`)
- Part-A: document, parties, from/to places with GSTIN or `URP`, consignment and taxable value, tax split, main HSN, item count, sub-supply type.
- Part-B: transporter, mode, vehicle number (normalised), vehicle type, transport document, distance.
- Validity computed from distance and cargo type, expiring at midnight, shown as a countdown.
- Extension inside the 8-hour window, computed from remaining distance.
- Cancellation inside 24 hours.
- Part-B updates appended, never overwritten, with full history.

**Compliance hub summary:** pending, generated, failed, expiring within 24 hours,
expired, and documents that need a bill and have none.

---

## 12. Reports *(4 of 9 on every tier)*

**Hub:** `(tabs)/reports` — profit hero, stock summary, six-month trend, and the
report list filtered to what the tier can open.

| Report | Route | Gate | Contents |
|---|---|---|---|
| Sales summary | `reports/sales-summary` | all | Total, taxable, tax, discount; by month, customer, item, branch |
| Purchase summary | `reports/purchase-summary` | purchases | Same shape, buying side |
| Expense summary | `reports/expense-summary` | expenses | Spend by category over time |
| Receivables | `reports/receivables` | all | Outstanding with aging |
| Payables | `reports/payables` | payables | Supplier dues with aging |
| Stock | `reports/stock` | inventory | On-hand quantity and valuation |
| Tax summary | `reports/tax-summary` | all | Output tax less input tax, by rate |
| Payments & cash | `reports/payments` | all | Money in and out by method and account |
| Profit snapshot | `reports/profit` | expenses | Revenue less cost and expenses, by month |

**Every report screen** (`ReportShell`, `reportParts`) has: a scope bar (date
range preset or custom, branch, party, currency), a hero figure, a key-figures
row, at least one chart, a data table, and CSV export.

---

## 13. Settings *(mixed)*

Nineteen screens, grouped as the More tab groups them.

**Business setup**

| Screen | Route | Gate |
|---|---|---|
| Business profile | `settings/company` | all |
| Branches | `settings/branches` | Pro |
| Users & roles | `settings/users` | all *(roles Business)* |
| Taxes | `settings/taxes` | all |
| Currencies & rates | `settings/currencies` | Pro |
| Document numbering | `settings/numbering` | all |
| Payment accounts | `settings/accounts` | all |
| Expense categories | `settings/expense-categories` | Pro |

**Data & compliance**

| Screen | Route |
|---|---|
| E-invoicing | `settings/e-invoicing` |
| Transporters | `settings/transporters` |
| Integrations | `settings/integrations` |
| Backup & export | `settings/backup` |
| Audit trail | `settings/audit` |
| Sync status | `settings/sync` |

**Account**

| Screen | Route |
|---|---|
| Profile | `settings/profile` |
| Devices & sessions | `settings/devices` |
| Plan & billing | `settings/plan` |
| Appearance & language | `settings/appearance` |
| About | `settings/about` |

**Notable behaviour**
- Numbering: per-series prefix, next number, padding, fiscal year, branch code, reset policy, with a live preview of the next number.
- Appearance: theme (system / light / dark), language (English / தமிழ்), and the three Lixi access gestures, each independently switchable.
- Audit: append-only event list with actor, action, entity, before/after and device.
- About: version, licences, and the Storyset illustration attribution the licence requires.

---

## 14. Lixi assistant *(all)*

**Routes:** `lixi`, `assistant`.

**Access:** long-press a tab (asks about that tab), swipe up on the tab bar, or
tap the floating orb. Each gesture is switchable in Settings → Appearance. The
orb carries a nudge badge counting failed e-invoices plus expiring e-way bills.

**What it answers:** receivables and payables, overdue lists, this month's sales,
tax charged, low stock, compliance state, a party's balance, what needs
attention.

**What it will not do:** write anything. Any action that opens a writing form is
preceded by a confirmation prompt in the chat. It does not answer for modules
outside the tier, and never invents a figure.

**Prototype boundary:** rule-based intent matching over the local store, not a
model.

---

## 15. OCR *(Pro)*

| Screen | Route |
|---|---|
| Capture | `ocr/capture` |
| Review | `ocr/review` |

Photograph a supplier bill or receipt; the extraction is presented field by
field with confidence, every field editable, and nothing is written until the
user confirms. Confirmation creates an expense or a purchase bill draft with the
image attached.

**Prototype boundary:** returns a fixed plausible extraction; no image is read.

---

## 16. Search & notifications *(all)*

- **Global search** (`search`): documents by number, party or amount; parties; items. Recent searches retained.
- **Notifications** (`notifications`): seven kinds, unread badge on the More tab, each entry linking to its entity.

---

## 17. Plan & upgrade *(all)*

- **Upgrade** (`upgrade`): reached whenever a gated route is attempted. Names the module that was blocked, shows the four tiers with the popular one marked, and offers monthly or annual.
- **Plan & billing** (`settings/plan`): current tier, renewal, invoices, change plan.

Upgrade copy lives in `planCopy.ts` and the `plan` namespace; `plan.ts` carries
prices and gating only, never a sentence.

---

## Cross-cutting concerns

| Concern | Where it lives | Rule |
|---|---|---|
| Company scoping | `src/store/selectors.ts` | Every read is scoped by active company. There is no cross-company read path. |
| Plan gating | `src/domain/plan.ts` | Three layers — tab visibility, route, server — that must agree. |
| Audit | `src/store/appStore.ts` | Every write appends an event and, where the PRD calls for it, raises a notification. |
| Money | `src/lib/money.ts` | Integer minor units. No float touches a monetary value. |
| Language | `src/i18n/*` | Domain returns codes; words resolve at display. |
| Theme | `src/theme/*` | Tokens only. No screen hard-codes a colour or a size. |
| Charts | `src/components/charts/*` | Hand-drawn SVG; validated palettes; status colours never reused as series colours. |
| Illustrations | `src/illustrations/registry.ts` | Screens ask for meaning (`not-found`, `all-settled`), never a filename. |

## Prototype boundaries, in one place

| Area | Today | What removes it |
|---|---|---|
| Server | Zustand + AsyncStorage | `docs/api/openapi.yaml`, `docs/database/schema.sql` |
| Portals | In-process adapter with deterministic responses | GSP/ASP integration behind the same adapter interface |
| OCR | Fixed extraction | Document AI / Textract / vision model |
| Assistant | Rule-based over local store | A model with the same read-only, confirm-before-acting contract |
| Sync | Simulated states | Real queue with idempotency keys and id mapping |
| Google sign-in | Straight into the demo account | Real OAuth |
| Illustrations | Placeholders in the Storyset Rafiki style | The real downloads, same filenames |
| QR signature | Derived from the signing input, marked as such | The portal's own signature |
