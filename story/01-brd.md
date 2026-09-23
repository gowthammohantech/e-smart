# Business Requirements Document — Elixir Books Smart

**Status:** approved baseline · **Owner:** Product · **Applies to:** v1.0 mobile

---

## 1. Executive summary

Elixir Books Smart is a mobile-first billing and books product for Indian small
and medium businesses. It lets an owner raise a GST-correct invoice from a
phone in under a minute, report it to the Invoice Registration Portal, generate
the e-way bill that must accompany the goods, collect the money, and see at any
moment who owes what.

The product is sold as four tiers. The two lower tiers cover the selling side of
a business and are enough for a shop or a services firm. The two higher tiers
add the buying side — purchases, stock, expenses — and turn the app into the
business's whole book of record.

## 2. Business problem

An Indian SMB with turnover above the e-invoicing threshold is legally obliged
to report every B2B invoice to a government portal before it is valid, and to
raise an e-way bill before goods move. The obligations are strict, the windows
are short, and the penalties are real.

The tools available to that business are poorly matched to it:

| Option | Why it fails this buyer |
|---|---|
| Desktop accounting packages | Priced and designed for an accountant at a desk. The owner is on the shop floor or in a vehicle. |
| Spreadsheets and paper books | No compliance path at all. Every IRN and e-way bill becomes a separate manual trip to a portal. |
| Web-first SaaS billing tools | Usable on a phone only in the sense that a website loads. Slow on the connections and devices this market actually uses. |
| A chartered accountant doing it monthly | Compliance is a per-document, same-day obligation. Monthly is too late, and the owner still cannot see their own receivables. |

The gap is not accounting knowledge. It is that compliance and cash visibility
have to happen **at the moment of the transaction, on the device in the owner's
hand**, and nothing on the market does that well in this segment.

## 3. Business objectives

| # | Objective | Measure |
|---|---|---|
| BO-1 | Make a compliant invoice the fastest way to bill | Median time from app open to a finalised, IRN-bearing invoice under 90 seconds |
| BO-2 | Remove the portal as a separate chore | ≥ 95% of invoices requiring an IRN obtain one from inside the app, without visiting the government portal |
| BO-3 | Give the owner cash visibility they did not previously have | ≥ 60% of active accounts open Receivables at least weekly |
| BO-4 | Convert selling-side users into whole-business users | ≥ 25% of paying accounts on a tier that includes purchases and stock within 12 months |
| BO-5 | Build a recurring revenue base, not a one-off tool | Monthly churn below 3%; annual plans ≥ 40% of paid accounts |
| BO-6 | Serve the buyer in their own language | Non-English language selected by ≥ 20% of accounts in the launch states |

## 4. Stakeholders

| Stakeholder | Interest | What they need from the product |
|---|---|---|
| Business owner (primary buyer and user) | Gets paid, stays legal, spends no time on software | Speed, plain words, no accounting jargon |
| Billing staff / counter operator | Raises documents all day | Fewest taps per document; no ability to break the books |
| The business's accountant | Files returns | Clean exports, GSTR-1 data, an audit trail that holds up |
| Transport / dispatch staff | Moves goods legally | E-way bill in hand, Part-B updatable from the road |
| Elixir (the vendor) | Recurring revenue, low support load | Clear tier boundaries, self-serve upgrade, honest error messages |
| Tax authorities (indirect) | Correct, timely reporting | Documents that match what was reported; nothing silently altered after reporting |

## 5. Scope

### 5.1 In scope

- **Selling**: quotations, sales orders, delivery notes, tax invoices, sales returns.
- **Buying**: purchase orders, goods receipts, purchase bills, purchase returns.
- **Money**: payments in and out, multi-document allocation, advances, FX settlement, receivables and payables with aging.
- **Compliance**: GST e-invoicing (IRN, acknowledgement, signed QR, cancellation), e-way bills (Part-A, Part-B, validity, extension, cancellation), GSTR-1 preparation.
- **Stock**: items and services, opening stock, adjustments, branch transfers, low-stock, barcode lookup, valuation.
- **Spend**: expenses with categories, recurrence and receipts; receipt capture by camera.
- **Reporting**: nine standard reports with filters and CSV export.
- **Business setup**: company, branches, users and roles, tax categories, currencies and rates, document numbering, payment accounts, expense categories.
- **Platform**: multi-company under one account, multi-branch, multi-currency, English and Tamil, light and dark, offline-tolerant.

### 5.2 Out of scope for v1

- Full double-entry general ledger, trial balance and balance sheet. The product keeps a complete, reconcilable transaction record; it does not present formal financial statements.
- Payroll, TDS and income tax.
- GSTR-3B and annual return filing. GSTR-1 data is prepared; the filing itself stays on the portal.
- Manufacturing, bill of materials, batch and serial tracking, warehouse binning.
- A web or desktop client. The product is a phone app; a browser client is a later consideration.
- Selling outside India. The data model is country-neutral (`TaxRegistration.regime` supports `GST`, `VAT` and `NONE`) but only India is supported, tested and sold in v1.

## 6. Commercial model

Four tiers, sold monthly or annually. Annual is priced at ten months.

| Tier | Monthly | Yearly | Business it fits |
|---|---:|---:|---|
| Free | ₹0 | ₹0 | Trying the product; very low document volume |
| Smart Basic | ₹399 | ₹3,990 | A business that only needs to sell and stay compliant |
| Smart Pro *(most popular)* | ₹899 | ₹8,990 | A business that also buys, holds stock and tracks spend |
| Smart Business | ₹1,799 | ₹17,990 | Multi-user, multi-branch, needs roles and support |

Two commercial rules follow from this and are binding on the product:

1. **Every tier is GST-compliant.** E-invoicing and e-way bills are never
   withheld to force an upgrade. Compliance is a legal obligation, not a
   feature, and gating it would make the free tier actively dangerous.
2. **The data model is identical on every tier.** Gating is a question the
   interface asks, not a difference in what can be stored. Downgrading never
   destroys a record, and upgrading never requires a migration. This is why
   `hasModule()` answers from the tier alone and the schema has no tier column.

The upsell boundary is therefore exactly one thing: **the buying side of the
business**. Purchases, inventory, expenses, OCR, payables, multi-currency and
multi-branch are the Pro line.

## 7. Target market

- **Geography**: India. Launch focus on Tamil Nadu, Maharashtra and Karnataka.
- **Size**: 1 to 25 employees; annual turnover ₹20 lakh to ₹50 crore.
- **Sectors**: wholesale and distribution, retail, services, light manufacturing that bills rather than makes to order.
- **Device reality**: mid-range Android as the majority device, iOS a meaningful minority; intermittent connectivity assumed as normal, not exceptional.
- **Language**: English as the business default; Tamil at launch because the launch state demands it and because a product that only speaks English silently excludes the counter staff who actually operate it.

## 8. Regulatory drivers

These are legal obligations the product exists to discharge, not features it
chose to have. Each is specified precisely in the FRD.

| Obligation | Effect on the product |
|---|---|
| E-invoicing above the notified turnover threshold | Every applicable B2B invoice must obtain an IRN from the IRP before it is a valid tax invoice. The threshold is configurable per company because it has moved repeatedly. |
| Reporting window | The portal refuses a document older than the notified window. The product must block, not merely warn, outside it. |
| 24-hour IRN cancellation | After 24 hours an IRN cannot be cancelled at all; the only remedy is a credit note. The interface must make the closing window visible. |
| E-way bill for consignments above the threshold | Goods above the value threshold cannot legally move without a bill. |
| Rule 138(10) validity | One day per 200 km, or per 20 km for over-dimensional cargo, always expiring at midnight. |
| Extension window | Eight hours before expiry to eight hours after, and no other time. |
| Invoice numbering | Unique, gapless within a series and financial year, never reused. A number is assigned on finalisation, not on draft creation. |
| Record retention and audit | Every write is attributable to a user and a time, and is retained. |

## 9. Success metrics

**Adoption**

- Activation: account completes onboarding and issues a first finalised invoice within 24 hours — target 55%.
- Weekly active businesses / paid businesses — target 75%.

**Product**

- IRN success rate on first attempt — target ≥ 90% (validation runs client-side first, so most rejections should never reach the portal).
- E-way bills expiring un-extended while goods are still moving — target < 2%.
- Median documents per active business per week — target ≥ 15.

**Commercial**

- Free → paid conversion within 30 days — target 12%.
- Basic → Pro upgrade within 12 months — target 25%.
- Monthly logo churn — target < 3%.

**Support**

- Tickets per 100 active accounts per month — target < 8.
- Share of tickets about "why was this rejected" — target < 15% of total, because the product should say why itself.

## 10. Assumptions

- The business has, or can obtain, IRP and e-way bill API credentials through a GSP. The product never asks a user for a portal password in the clear; credentials are held server-side and shown masked.
- One person in the business can read enough English to complete initial setup, even where daily operation happens in another language.
- Connectivity is intermittent but not absent: a document can be created offline and reported when a connection returns.
- Businesses will accept that a finalised document cannot be edited, provided the product gives them a lawful correction path (credit note, cancellation inside the window).

## 11. Constraints

| Constraint | Consequence |
|---|---|
| Phone-sized screens | No table-first layouts. Every list row must be legible and actionable at 360 dp. |
| Mid-range Android | No heavy chart libraries; charts are hand-drawn SVG. Cold start and list scroll are budgeted, not assumed. |
| Government portals are slow and occasionally down | Portal calls are asynchronous with explicit states. A failed call must never lose the document. |
| Money must be exact | No binary floats touch a monetary value anywhere in the product. |
| Statutory vocabulary is fixed | GST, GSTIN, HSN, IRN, CGST/SGST/IGST are never translated, because that is how they appear on a filing. |

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Statutory rules change (thresholds, schema versions, windows) | High | Every threshold and window is configuration, not a constant in a screen. Schema version is explicit. |
| GSP dependency — outage or commercial failure | High | The portal sits behind an adapter with an explicit interface (`irpAdapter.ts`). Swapping providers is a server change, not a client one. |
| Users distrust software with their tax position | High | The product shows its working: every total, tax split and outstanding figure is derived and explainable, never asserted. |
| Rounding disputes with counterparties | Medium | A single, documented order of operations, integer minor units throughout, and a visible round-off line. |
| Support load from compliance rejections | Medium | Full client-side validation before any portal call, reporting every finding at once rather than one per attempt. |
| Under-serving the buying side and losing the upsell | Medium | Purchases, stock and expenses are built to the same depth as sales, not as a thin add-on. |

## 13. Dependencies

Third-party services the business depends on to operate. All sit behind the
backend; the mobile client never calls them directly.

| Need | Candidates |
|---|---|
| GST e-invoice (IRP) and e-way bill APIs | GSP/ASP — ClearTax, Masters India, IRIS, or NIC direct |
| GSTIN verification | GST public search through a GSP |
| SMS / OTP | MSG91, Twilio, Gupshup (DLT-registered sender required) |
| WhatsApp Business | Meta Cloud API, Gupshup, Interakt |
| Email | SES, SendGrid, Postmark |
| Payment collection and subscriptions | Razorpay (links, UPI, subscriptions) |
| OCR | Google Document AI, AWS Textract, or a vision model |
| Object storage, PDF rendering, push | S3/GCS/R2, headless Chromium, Expo Push / FCM / APNs |
| FX rates, HSN and PIN reference data | Open Exchange Rates or RBI; CBIC HSN master; India Post |

## 14. Approval

This BRD is the baseline for the PRD. A change to scope, packaging or the
commercial model requires this document to be revised first; a change to how a
feature behaves belongs in the PRD or FRD and does not.
