# Functional Requirements Document — Elixir Books Smart

**Status:** approved baseline · **Owner:** Engineering · **Applies to:** v1.0
· **Depends on:** [02-prd.md](02-prd.md)

This is the precise document. Where it and a screen disagree, this document is
right and the screen is a bug. Section numbers are referenced from the code
(`FRD 10`, `FRD 16`, …) and must not be renumbered.

---

## 1. Money

**FR-1.1** Every monetary value in the system is `Money = { minor: integer, currency: string }`.
A monetary value is never a float, never a string, and never carries an implied
currency.

**FR-1.2** `precisionOf(currency)` gives the number of minor digits; the factor is
`10 ** precision`. JPY is 0, everything else defaults to 2.

**FR-1.3** Arithmetic operations are `add`, `subtract`, `sum`, `negate`, `abs`,
`multiply`, `divide`, `percent`, `inclusiveTax`, `allocate`, `roundToWholeUnit`.
`add` and `subtract` require matching currencies and throw otherwise.

**FR-1.4** Rounding mode is a parameter, defaulting to `half-up`. The supported
modes are `half-up`, `half-even`, `down`, `up`.

**FR-1.5** `allocate(amount, weights)` distributes an amount across weights such
that the parts sum **exactly** to the whole. The remainder is distributed one
minor unit at a time, largest-remainder first. This is what guarantees that a
CGST/SGST split of an odd amount does not lose a paisa.

**FR-1.6** `inclusiveTax(gross, pct)` extracts the tax already contained in a
gross amount: `gross × pct / (100 + pct)`.

**FR-1.7** Display formatting is separate from arithmetic. `formatMoney` renders
with Indian digit grouping for INR (`₹1,23,456.00`) and Western grouping
otherwise. Digits are ASCII in every language.

## 2. Tenancy

**FR-2.1** The hierarchy is `CustomerAccount → Company → Branch → User`.

**FR-2.2** A `User` belongs to one account and carries explicit `companyIds` and
`branchIds`. Every read is scoped to the active company; every write records the
company. There is no cross-company read path.

**FR-2.3** A company has exactly one primary branch. Additional branches require
the `branches` module.

**FR-2.4** A branch may hold its own GSTIN (`Branch.gstin`) when it is registered
in another state. When it does, documents raised at that branch report under it.

**FR-2.5** Roles are `owner`, `admin`, `accountant`, `sales`, `viewer`. A user's
status is `active`, `invited` or `disabled`; a disabled user can authenticate to
nothing.

**FR-2.6** Role capability matrix:

| Capability | owner | admin | accountant | sales | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| Read business data | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/edit draft documents | ✓ | ✓ | ✓ | ✓ | — |
| Finalise documents | ✓ | ✓ | ✓ | ✓ | — |
| Cancel a finalised document | ✓ | ✓ | ✓ | — | — |
| Record payments | ✓ | ✓ | ✓ | ✓ | — |
| Report / cancel e-invoice, e-way bill | ✓ | ✓ | ✓ | ✓ | — |
| Edit company, tax, numbering, currencies | ✓ | ✓ | — | — | — |
| Manage users and roles | ✓ | ✓ | — | — | — |
| Change plan, billing | ✓ | — | — | — | — |
| Reset / delete company data | ✓ | — | — | — | — |

**FR-2.7** A company's plan is `free`, `basic`, `pro` or `business`. The plan
affects visibility and route access only. The stored schema is identical across
tiers.

## 3. Parties

**FR-3.1** A party is a `customer` or a `supplier`, scoped to a company, with a
unique code within that company.

**FR-3.2** A customer carries `gstRegistrationType` ∈ {`regular`, `composition`,
`unregistered`, `sez`, `overseas`}. When unset it reads as `regular` if a GSTIN
is present, otherwise `unregistered`.

**FR-3.3** A party has a billing address and an optional shipping address, a
currency, payment terms in days, an optional credit limit, and an opening
balance. A positive opening balance means the customer owes us, or we owe the
supplier.

**FR-3.4** `paymentTermsDays` defaults the due date of a document raised for that
party: `dueDate = date + paymentTermsDays`.

**FR-3.5** A party with any document or payment against it may be deactivated but
never deleted.

## 4. Catalogue

**FR-4.1** An item is `goods` or `service`. Only goods can be inventory-tracked,
and only goods can trigger an e-way bill.

**FR-4.2** An item carries SKU, name, unit, sale price, purchase price, tax
category, optional HSN/SAC, optional barcode, `trackInventory`, opening stock and
reorder level.

**FR-4.3** Opening stock, when non-zero, writes a single `opening` stock movement
on creation. Changing it afterwards adjusts that movement; it does not create a
second one.

**FR-4.4** HSN is required on every line of a document that will be reported to
the IRP. The catalogue is where it should come from; a line may still override.

## 5. Tax categories

**FR-5.1** A tax category has a name, a combined percentage `rate`, a `type`, an
optional HSN and an `effectiveFrom` date.

**FR-5.2** The combined rate is stored; the split into legal components happens at
calculation time (§15), never in storage.

**FR-5.3** A document line stores a **snapshot** of the rate applied
(`DocumentLine.taxRate`). Changing a tax category later never alters a document
already raised.

## 6. Currency and exchange rates

**FR-6.1** A company has one `baseCurrency`. A document may be in any currency.

**FR-6.2** `resolveRate(rates, from, to, onDate)` returns the rate to convert
`from` into `to` on a date:
1. If `from === to`, return 1.
2. Otherwise the most recent direct rate whose `effectiveFrom <= onDate`.
3. Otherwise the inverse of the most recent reverse rate, if its rate is non-zero.
4. Otherwise 1.

**FR-6.3** The resolved rate is **stored on the document** (`exchangeRate`), so a
historical document remains reproducible after rates change.

**FR-6.4** `grandTotalBase = round(grandTotal.minor × exchangeRate)` in the base
currency, computed once at calculation time.

**FR-6.5** On settlement, FX gain or loss is
`(amount × settlementRate) − (amount × documentRate)`, in base currency, recorded
on the payment as `fxGainLoss`. A positive value is a gain.

**FR-6.6** Rates are `manual` or `provider`-sourced and are effective-dated. A
rate is never edited in place; a new effective-dated row supersedes it.

## 7. Branches

**FR-7.1** Documents, payments, expenses and stock movements all carry a branch.

**FR-7.2** Stock is held per branch. `stockOnHand(itemId, movements, branchId)`
filters by branch; omitting the branch gives the company total.

**FR-7.3** A branch code may participate in document numbering (§17).

## 8. Documents — structure

**FR-8.1** Nine document kinds:

| Group | Kinds |
|---|---|
| Sales | `quote`, `salesOrder`, `delivery`, `invoice`, `salesReturn` |
| Purchase | `purchaseOrder`, `goodsReceipt`, `purchaseBill`, `purchaseReturn` |

**FR-8.2** A document carries: company, branch, kind, number, status, party, date,
optional due date and valid-until, reference, supplier document number (purchase
side), currency, exchange rate, lines, document-level discount, charges,
round-off settings, place of supply, notes, terms, attachments, an optional
`sourceDocumentId`, computed totals, optional compliance info, and creation and
update audit fields.

**FR-8.3** A line carries: optional item reference, name, description, HSN,
quantity, unit, unit price, discount mode and value, tax category, a **snapshot**
of the tax rate, and whether the price is tax-inclusive.

**FR-8.4** `sourceDocumentId` records conversion lineage. Conversion copies party,
currency, exchange rate, place of supply and lines; it does not copy number,
status, date or compliance.

**FR-8.5** `attachmentIds` links files; attachments are company-scoped and carry
their own entity reference.

## 9. Documents — lifecycle

**FR-9.1** Initial status is `requested` for `salesReturn` and `purchaseReturn`,
and `draft` for every other kind.

**FR-9.2** Legal transitions, by kind. No other transition is permitted, in the
client or on the server.

| Kind | From | To |
|---|---|---|
| quote | draft | sent, cancelled |
| | sent | accepted, rejected, expired |
| | expired | sent |
| | accepted / rejected | *(terminal)* |
| salesOrder | draft | confirmed, cancelled |
| | confirmed | fulfilled, cancelled |
| | fulfilled | *(terminal)* |
| delivery | draft | delivered, cancelled |
| | delivered | *(terminal)* |
| invoice | draft | issued, cancelled |
| | issued | partiallyPaid, paid, overdue, cancelled |
| | partiallyPaid | paid, overdue |
| | overdue | partiallyPaid, paid |
| | paid | *(terminal)* |
| salesReturn | requested | approved, cancelled |
| | approved | processed |
| | processed | *(terminal)* |
| purchaseOrder | draft | confirmed, cancelled |
| | confirmed | received, cancelled |
| | received | *(terminal)* |
| goodsReceipt | draft | received, cancelled |
| | received | billed |
| purchaseBill | draft | issued, cancelled |
| | issued | partiallyPaid, paid, overdue, cancelled |
| | partiallyPaid | paid, overdue |
| | overdue | partiallyPaid, paid |
| | paid | *(terminal)* |
| purchaseReturn | requested | approved, cancelled |
| | approved | processed |
| | processed | *(terminal)* |

**FR-9.3** `isFinalized(status)` is true for every status except `draft` and
`requested`. A finalised document is **immutable**: no line, amount, date, party
or tax may change. The only permitted mutations are status transitions, payment
allocation, compliance fields and attachments.

**FR-9.4** A document's number is assigned **on finalisation**, not on creation,
and is never reused (§17).

**FR-9.5** `isCancelled(status)` covers `cancelled` and `rejected`. Cancelled and
draft documents are excluded from every report, every aging calculation and every
stock effect.

**FR-9.6** `paid`, `partiallyPaid` and `overdue` are **derived** (§18.6), never
set directly by a user.

**FR-9.7** Each status carries a tone used consistently everywhere it is shown:

| Tone | Statuses |
|---|---|
| neutral | draft, cancelled, requested |
| info | sent, confirmed, issued, approved |
| success | accepted, fulfilled, delivered, paid, processed, received, billed |
| warning | expired, partiallyPaid |
| danger | rejected, overdue |

The tone is a domain value (`STATUS_TONE`); the words live in the `domain:status.*`
catalogue. The domain layer never sees a translator.

**FR-9.8** Documents that create a receivable or payable are `invoice` and
`purchaseBill` only.

## 10. Document calculation

**FR-10.1** The order of operations is fixed and is the single most important
rule in this document:

```
1. gross      = quantity × unit price
2. discount   = line discount applied to gross
3. net        = gross − discount
4. taxable    = net                      (exclusive)
             or net − inclusiveTax(net)  (inclusive)
5. tax        = taxable × rate           (exclusive, and only if registered)
             or inclusiveTax(net)        (inclusive)
--- per document ---
6. subtotal   = Σ gross
7. lineDiscount = Σ discount
8. taxableAmount = Σ taxable
9. taxLines   = taxable grouped by (taxCategory, rate), each split per §15
10. totalTax  = Σ taxLines.totalTax
11. afterTax  = taxableAmount + totalTax
12. documentDiscount = discount applied to afterTax
13. beforeRounding = afterTax − documentDiscount + charges
14. roundOff  = manual adjustment, or to the nearest whole unit, or zero
15. grandTotal = beforeRounding + roundOff
16. grandTotalBase = round(grandTotal × exchangeRate)
```

**FR-10.2** The document-level discount is applied **after tax**. This is
deliberate and must not be "corrected".

**FR-10.3** A percentage discount is capped at 100%. An amount discount is capped
at the base it is applied to, and can never make a line or a document negative.

**FR-10.4** When the business is not tax-registered, exclusive tax is zero.
Inclusive-priced lines still extract their tax, because the price the customer
was quoted already contained it.

**FR-10.5** Tax lines are grouped by `taxCategoryId:rate` and sorted ascending by
rate, so the document shows one row per slab in a predictable order.

**FR-10.6** Round-off applies only when `applyRoundOff` is true. When
`roundOffManual` is present it is used verbatim (it may be negative); otherwise
the total is rounded to the nearest whole unit and the adjustment recorded.

**FR-10.7** `flattenTaxComponents` collapses per-rate components into one row per
legal component (one CGST row, one SGST row, one IGST row) for the printed
document.

**FR-10.8** Totals are recomputed, never trusted from the client. The server
re-runs this identical algorithm on every write.

## 11. Document numbering

**FR-11.1** *(referenced in code as FRD 17)* Format:

```
PREFIX[/BRANCHCODE][/FY]/SEQUENCE
```

Example: `INV/MUM/2026-27/0042`.

**FR-11.2** A series exists per kind, plus `payment` and `expense` — eleven series
in total. Default prefixes: `INV`, `QT`, `SO`, `DN`, `CRN`, `PO`, `GRN`, `BILL`,
`DRN`, `PAY`, `EXP`.

**FR-11.3** A series carries prefix, `nextNumber`, `padding` (default 4),
`includeFiscalYear` (default true), `includeBranchCode` (default false) and
`resetPolicy` ∈ {`never`, `yearly`, `monthly`} (default `yearly`).

**FR-11.4** Trailing slashes in a prefix are stripped so the separator does not
double.

**FR-11.5** The financial year is derived from the document date and the company's
`fiscalYearStartMonth` (April in India), rendered as `2026-27`.

**FR-11.6** The number is allocated by the **server**, atomically, at
finalisation. A number is never reused, even if the document is later cancelled.
The client's `previewNumber()` is a preview only and is not binding.

## 12. Payments

**FR-12.1** A payment has a direction (`received` or `paid`), a party, a date, an
amount and currency, an exchange rate, a method, an account, a reference, a list
of allocations and an unallocated remainder.

**FR-12.2** Methods are `cash`, `bank`, `upi`, `card`, `cheque`, `wallet`, `other`.

**FR-12.3** A method constrains which account types can settle it:

| Method | Permitted account types |
|---|---|
| cash | cash |
| bank, cheque, card | bank |
| upi | bank, wallet |
| wallet | wallet |
| other | cash, bank, wallet |

When the method changes, the current account is kept if it still fits; otherwise
the method's default account is selected.

**FR-12.4** `Σ allocations + unallocated = amount`, always, exactly.

**FR-12.5** An allocation may not exceed the target document's outstanding amount.

**FR-12.6** The unallocated remainder is an **advance** held against the party.

**FR-12.7** `allocateAdvances` applies advances against open documents:
oldest advance first, oldest open document first, same currency only. Documents
are matched by date ascending. It returns only the payments that changed.

**FR-12.8** A payment in a currency other than the document's is not allocated
against that document.

**FR-12.9** Recording a payment against a foreign-currency document at a different
rate records `fxGainLoss` per §6.5.

**FR-12.10** Payments are numbered from the `payment` series on creation.

## 13. Inventory

**FR-13.1** Stock is **always derived** from an immutable movement list. There is
no stored on-hand counter anywhere in the system.

**FR-13.2** Eight movement types with fixed signs:

| Type | Sign | Raised by |
|---|:-:|---|
| `opening` | +1 | Item creation / opening stock screen |
| `purchaseReceipt` | +1 | Goods receipt |
| `salesIssue` | −1 | Delivery note or invoice |
| `salesReturn` | +1 | Sales return |
| `purchaseReturn` | −1 | Purchase return |
| `transferIn` | +1 | Branch transfer (destination) |
| `transferOut` | −1 | Branch transfer (source) |
| `adjustment` | *(quantity carries its own sign)* | Stock adjustment |

**FR-13.3** `signedQuantity(m)` returns `m.quantity` for an adjustment, and
`sign × |m.quantity|` for every other type. A non-adjustment movement's stored
quantity is therefore always treated as a magnitude.

**FR-13.4** The ledger for an item is sorted by date, then by `createdAt` as
tie-breaker, and carries a running balance.

**FR-13.5** Valuation is weighted average of inbound movements with a non-zero
unit cost: `Σ(cost × qty) / Σ qty × onHand`. With no such inbound movements, the
item's purchase price is used.

**FR-13.6** `isLowStock(item, onHand)` = `trackInventory && reorderLevel > 0 && onHand <= reorderLevel`.
`isOutOfStock` = `trackInventory && onHand <= 0`.

**FR-13.7** A branch transfer writes exactly two movements — a `transferOut` at
the source and a `transferIn` at the destination — sharing a reference.

**FR-13.8** Movements are append-only. A correction is a new movement, never an
edit.

## 14. Expenses

**FR-14.1** An expense carries a number, category, optional supplier, date, amount
and currency, exchange rate, optional tax category, tax amount, an inclusive flag,
an account, a method, reference, notes, a billable flag, recurrence, attachments
and audit fields.

**FR-14.2** Recurrence is `none`, `weekly`, `monthly`, `quarterly` or `yearly`,
with a `nextRecurrenceDate`. A recurring expense generates the next instance as a
draft on its due date; it never posts silently.

**FR-14.3** Tax on an expense is input tax and feeds the tax summary report as a
credit against output tax.

**FR-14.4** Expenses are numbered from the `expense` series.

**FR-14.5** Expense categories are seeded at onboarding in the then-active
language. From that point they are the user's own data and do **not** follow a
later language switch.

## 15. Tax engine

**FR-15.1** The tax context is `{ regime, homeStateCode, placeOfSupplyStateCode, registered }`.

**FR-15.2** If the rate is zero or the business is not registered, there are no
components.

**FR-15.3** Under `GST`:
- A supply is **inter-state** when both state codes are known and differ. It
  produces a single `IGST` component at the full rate.
- Otherwise it is **intra-state** and produces `CGST` and `SGST`, each at half the
  rate, split with `allocate(total, [1, 1])` so no minor unit is lost.

**FR-15.4** Under `VAT`, a single `VAT` component at the full rate.

**FR-15.5** Under `NONE`, no components.

**FR-15.6** Component labels carry the rate: `IGST 18%`, `CGST 9%`, `SGST 9%`.
These labels are statutory and are not translated.

**FR-15.7** Place of supply defaults from the customer's billing state and may be
overridden per document. Exports use state code `96`.

## 16. Compliance

### 16.1 GSTIN

**FR-16.1.1** A GSTIN is 15 characters: two state-code digits, a ten-character
PAN, an entity number, the literal `Z`, and a check character.
Shape: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$`.

**FR-16.1.2** The check character is a base-36 weighted modulus over the first 14
characters: each character's base-36 value is weighted 1, 2, 1, 2 …; products
above 35 are folded (`⌊p/36⌋ + p mod 36`); the check character brings the sum to
the next multiple of 36.

**FR-16.1.3** A GSTIN is valid only if it is 15 characters, matches the shape, has
a **recognised state code**, and its check character verifies. Shape alone is not
acceptance.

**FR-16.1.4** Displayed grouped: `27 ABCDE1234F 1Z5`.

**FR-16.1.5** A transporter is identified by a GSTIN or by a TRANSIN; both share
the same shape and validation.

### 16.2 E-invoice applicability

**FR-16.2.1** Reportable kinds are `invoice` (→ `INV`) and `salesReturn` (→ `CRN`).
Debit notes (`DBN`) exist in the type system but have no document kind in v1.

**FR-16.2.2** E-invoicing applies when: the feature is enabled, the company's
declared annual turnover is at or above the configured threshold, the document
kind is reportable, and the counterparty is not an unregistered consumer.

**FR-16.2.3** Supply type is derived, not asked: `B2B`, `SEZWP`/`SEZWOP` for an
SEZ party with or without tax charged, `EXPWP`/`EXPWOP` for an overseas party,
`DEXP` for a deemed export.

**FR-16.2.4** The turnover threshold and the reporting window are **per-company
configuration**, because both have moved repeatedly.

### 16.3 E-invoice validation

**FR-16.3.1** Validation runs entirely client-side before any portal call, and
returns **every** finding at once. Each finding is
`{ code, field, message, severity }` where `field` is a dotted path such as
`lines[2].hsnCode` and `code` mirrors the NIC error catalogue.

**FR-16.3.2** Blocking validations:

| Check | Rule |
|---|---|
| Supplier GSTIN | Present and valid per §16.1 |
| Buyer GSTIN | Present and valid, unless the supply type permits its absence |
| HSN | Present on every line |
| Document number | Matches `^[A-Za-z1-9][A-Za-z0-9/-]{0,15}$` — at most 16 characters, not starting with `0` or a symbol |
| Place of supply | Present; IGST vs CGST/SGST must agree with it |
| Totals | Recomputed total within ±1 rupee (`TOTAL_TOLERANCE_MINOR = 100`) of the stored total |
| Reporting window | Document date within the configured window |
| Unit codes | Mapped to an NIC UQC; unmapped units fall back to `OTH` |

**FR-16.3.3** Only blocking findings prevent submission; warnings are shown and
the user may proceed.

### 16.4 IRN

**FR-16.4.1** The IRN is `SHA-256(supplierGSTIN + docType + docNumber + financialYear)`,
lowercase hex, 64 characters. It is a real digest: anyone holding those four
public fields can recompute and verify it. That is the point of the scheme.

**FR-16.4.2** The financial year is formatted as the portal spells it: `2026-27`.

**FR-16.4.3** The portal returns the IRN, a 16-digit acknowledgement number and an
acknowledgement timestamp in `yyyy-MM-dd HH:mm:ss`. Portal **dates** elsewhere are
`dd/MM/yyyy`, unlike the ISO dates used everywhere else in the system.

**FR-16.4.4** The payload is NIC schema 1.1. Line-level HSN, UQC, taxable value
and per-component tax are all required.

### 16.5 Signed QR

**FR-16.5.1** The signed QR is a JWS compact serialisation carrying ten claims:
supplier GSTIN, buyer GSTIN, document number, document date, total value,
item count, main HSN, IRN, IRN date, and the taxable value.

**FR-16.5.2** The QR is rendered by a byte-mode encoder supporting versions 1–40,
all four error-correction levels, and all eight masks scored against the four
penalty rules. The payload runs to roughly 700 bytes, landing around version 21.

**FR-16.5.3** In the prototype the signature is derived from the signing input
rather than produced with the portal's private key, and is explicitly marked as
such. This is the **only** part of the compliance implementation that is not real.

### 16.6 E-invoice cancellation

**FR-16.6.1** Cancellation must reach the portal within **24 hours** of IRN
generation. After that the IRN cannot be cancelled at all and the only remedy is a
credit note.

**FR-16.6.2** Four reason codes are accepted: 1 duplicate, 2 data entry mistake,
3 order cancelled, 4 other. Only "other" obliges a remark.

**FR-16.6.3** The closing deadline is shown on screen from the moment an IRN is
issued.

**FR-16.6.4** A cancelled IRN records `irnCancelledAt`, the reason code and the
remark. The document itself remains, marked cancelled.

### 16.7 E-way bills

**FR-16.7.1** A bill accompanies `invoice` and `delivery` only, and only when the
document contains at least one line resolving to a **good**. Services never
trigger a bill.

**FR-16.7.2** A bill is required when the feature is enabled, the consignment
value exceeds the configured threshold, and goods are present.

**FR-16.7.3** Validity, rule 138(10):
`days = ceil(distanceKm / 200)` for regular cargo, `ceil(distanceKm / 20)` for
over-dimensional cargo, minimum 1. Validity always expires at **midnight** of the
final day, never at a rolling hour.

**FR-16.7.4** A single bill is capped at 4,000 km.

**FR-16.7.5** Status is derived: `active`, `expired` (from the clock) or
`cancelled`. Only `active` and `cancelled` are ever stored; `expired` is never
persisted.

**FR-16.7.6** Extension opens **8 hours before** expiry and closes **8 hours
after**. Outside that window extension is refused with the window stated. The
fresh validity is computed from the **remaining** distance, not the original.

**FR-16.7.7** Cancellation closes at **24 hours** from generation, and is refused
once the consignment has been verified in transit.

**FR-16.7.8** Part-B may be updated while the bill is active. Each update is
appended to `partBUpdates`; nothing is overwritten. Reason codes: 1 first time,
2 vehicle breakdown, 3 transhipment, 4 others.

**FR-16.7.9** Field formats:

| Field | Rule |
|---|---|
| E-way bill number | 12 digits |
| Vehicle number | Capitals, no spaces or hyphens, normalised on entry |
| Pincode | `^[1-9][0-9]{5}$` |
| Place GSTIN | Valid GSTIN, or the literal `URP` for an unregistered person |

**FR-16.7.10** Transport modes are road (1), rail (2), air (3), ship (4). Vehicle
types are regular (`R`) and over-dimensional (`O`). Ten sub-supply types are
supported; `others` requires a description.

**FR-16.7.11** One document may have several bills over its life, because
cancel-and-regenerate is routine when a vehicle or distance turns out wrong. The
document carries a denormalised view of the **latest** bill; the `EwayBill`
entity remains the source of truth, and both are written by the same action.

### 16.8 Compliance settings

**FR-16.8.1** Compliance settings are a **separate record** from `Company`,
because saving the company profile replaces the whole object and would otherwise
clobber them.

**FR-16.8.2** Configurable: e-invoice enabled, annual turnover, turnover
threshold, reporting window days, auto-generate on finalise, IRP username, masked
client id, environment (`sandbox`/`production`); e-way bill enabled, threshold,
auto-generate on finalise, default transporter, default distance, default
transport mode, default vehicle type.

**FR-16.8.3** Credentials are stored masked (`ELX-****-9F21`) and never returned
in the clear. Real secrets live in a KMS, server-side.

### 16.9 Portal adapter

**FR-16.9.1** The portal sits behind an adapter with an explicit interface. It
takes an explicit `now`, reads no clock and draws no random number, so a given
request always answers identically. This is what makes compliance testable.

**FR-16.9.2** A portal timeout or failure leaves the document exactly as it was,
records the attempt (`lastMessage`, `lastAttemptAt`) and sets status `failed`.
Retry is always safe.

## 17. GSTR-1

**FR-17.1** Invoices are classified into GSTR-1 sections by counterparty and
value: B2B, B2C large, B2C small, credit/debit notes, exports, nil-rated.

**FR-17.2** Each section reports taxable value and tax by rate, matching the tax
summary report.

**FR-17.3** The product **prepares** GSTR-1 data for export; it does not file.

## 18. Receivables and payables

**FR-18.1** The governing identity is:

```
document total − allocated payments = outstanding
```

**FR-18.2** Draft, cancelled and rejected documents are excluded entirely.

**FR-18.3** Outstanding is floored at zero; an over-allocation never produces a
negative outstanding.

**FR-18.4** `daysOverdue = daysBetween(dueDate, asOf)`. A document with no due
date has zero days overdue.

**FR-18.5** Five aging buckets: `current` (≤ 0 days), `1–30`, `31–60`, `61–90`,
`90+`. The bucket is chosen by days overdue.

**FR-18.6** Derived document status:

```
if status is draft or cancelled     → unchanged
if outstanding <= 0                 → paid
if dueDate is past                  → overdue
if outstanding < grandTotal         → partiallyPaid
otherwise                           → issued
```

**FR-18.7** The aging summary reports, in base currency: total, overdue,
due-soon (within 7 days by default) and per-bucket amount and count. Foreign
currency documents are converted at the rate stored on the document.

**FR-18.8** A party's balance is `openingBalance + Σ invoiced − Σ received`, all
in base currency at each record's stored rate.

**FR-18.9** Payables are the identical calculation over `purchaseBill` documents
and `paid`-direction payments.

## 19. Reports

**FR-19.1** Nine reports:

| Key | Report | Module gate |
|---|---|---|
| `sales-summary` | Sales summary | — |
| `purchase-summary` | Purchase summary | purchases |
| `expense-summary` | Expense summary | expenses |
| `receivables` | Receivables | — |
| `payables` | Payables | payables |
| `stock` | Stock report | inventory |
| `tax-summary` | Tax summary | — |
| `payments` | Payments & cash | — |
| `profit` | Profit snapshot | expenses |

**FR-19.2** Filters: date range (preset or custom), branch, party, currency.
Default range is last 90 days, except `profit` and `tax-summary`, which default
to the current financial year.

**FR-19.3** Only "live" documents are counted. Live statuses are: issued,
partiallyPaid, paid, overdue, sent, confirmed, delivered, fulfilled, received,
billed, accepted, approved, processed.

**FR-19.4** Every amount is converted to base currency at the rate stored on the
record, never at today's rate.

**FR-19.5** **Revenue is taxable value, not grand total.** Tax collected is never
counted as income. This is stated on the profit report itself.

**FR-19.6** Every report exports to CSV with exactly the numbers displayed.

## 20. Supporting records

**FR-20.1** **Audit.** Every write appends an `AuditEvent` with actor id and name,
action, entity type, id and label, a before and after snapshot, device and time.
Audit is append-only and is never edited or deleted.

**FR-20.2** **Notifications.** Seven kinds: `invoiceSent`, `paymentReceived`,
`invoiceOverdue`, `lowStock`, `compliance`, `syncFailure`, `system`. A
notification may reference an entity, and is read or unread.

**FR-20.3** **Attachments.** Company-scoped, with mime type, size, URI and an
optional entity reference.

**FR-20.4** **Sync.** A queue entry carries a label, entity, action, status
(`synced`, `pending`, `failed`, `offline`), attempt count and last error. Writes
replay with an idempotency key; a client-generated id is mapped to the server id
on first success.

**FR-20.5** **Integrations.** Five categories: payments, compliance, messaging,
accounting, storage. Each is connected or not, with an optional configuration
route.

## 21. Assistant (Lixi)

**FR-21.1** Lixi answers **only** from company-scoped data already in the store.
If the data is not there, Lixi says so. It never estimates and never invents a
figure.

**FR-21.2** Lixi **never writes**. Any action that would open a form which writes
carries a `confirm` prompt that the chat asks before navigating.

**FR-21.3** Lixi respects the plan: it does not answer for modules the tier
excludes, and its suggestions never link to a route the tier cannot open.

**FR-21.4** Lixi resolves language at call time, so a language switch is picked up
without a restart. The brain module takes its translator by injection, so a test
can pass a translator that echoes its key.

**FR-21.5** Three access gestures, each independently switchable: long-press a tab
(asks about that tab), swipe up on the tab bar, tap the floating orb. The orb
carries a nudge count of failed e-invoices plus expiring e-way bills — work that
costs money if it waits. An already-expired bill is a finished trip and does not
count.

## 22. Internationalisation

**FR-22.1** Languages ship as `en` (default, fallback) and `ta`. A fresh install
follows the device where it can; an upgrade stays on English rather than changing
under the user.

**FR-22.2** Fifteen namespaces per language: auth, common, compliance, contacts,
domain, errors, inventory, lixi, nav, onboarding, plan, purchases, reports, sales,
settings.

**FR-22.3** **The domain layer never sees a translator.** It returns a code and a
tone; words are resolved at the point of display.

**FR-22.4** **One key per whole sentence.** Nothing is assembled from translated
fragments, because word order differs between scripts.

**FR-22.5** **Digits stay ASCII.** `₹1,23,456.00` is identical in every language;
only the lakh/crore word is translated. Statutory tokens — GST, GSTIN, HSN, IRN,
CGST/SGST/IGST — stay Latin, because that is how they appear on a filing.

**FR-22.6** The type scale is per script. Latin keeps the platform default line
height and its negative tracking; Tamil gets 1.5 line height and zero tracking,
because vowel signs sit above and below the line and collide at negative tracking.

**FR-22.7** Enforced by test: both catalogues carry identical keys, identical
interpolation parameters and paired plural forms; no Tamil value is still its
untranslated English source; every document status, kind, series and module
resolves in both languages; tab labels fit nine graphemes.

**FR-22.8** Printed invoices under Tamil are **bilingual**: each field label and
column header reads in Tamil with the English term beneath, because a GST invoice
is read by officers and by counterparties in other states. Values render once, in
Latin. An English PDF is unchanged.

**FR-22.9** Fixed-list choices store a stable slug, never the displayed label.

## 23. Server contract

**FR-23.1** Business data lives under `/companies/{companyId}/…`. The server
checks the caller's `companyIds` and `branchIds` on every request.

**FR-23.2** Money crosses the wire as `{ minor, currency }`. There are no floats
anywhere in the contract.

**FR-23.3** **The server is authoritative.** It recomputes totals, tax splits,
stock, outstanding amounts and derived statuses by porting `src/domain/*`. The
client keeps its engines for instant preview only.

**FR-23.4** The server assigns document, payment and expense numbers at
finalisation, atomically. A number is never reused.

**FR-23.5** Optimistic concurrency on every write via `version` + `If-Match`. A
stale write returns `412`.

**FR-23.6** Every `POST` accepts an `Idempotency-Key`, making offline-queue
retries safe.

**FR-23.7** Errors are Problem+JSON with a stable `code`. Validation and portal
rejections carry `issues[]` in the same shape as `ComplianceIssue`.

**FR-23.8** A module outside the plan returns `403 PLAN_UPGRADE_REQUIRED`.
Operations are annotated `x-plan-module` and `x-roles`.

**FR-23.9** The contract is `docs/api/openapi.yaml`: 111 paths, 152 operations,
2 inbound webhooks. Entity schemas mirror `src/types/index.ts` field for field.
The persistent schema is `docs/database/schema.sql`, 63 tables.

## 24. Test obligations

The following must be covered by automated tests, because they are expensive to
get wrong and invisible to review:

- Rounding, in every mode, at the half.
- Inclusive versus exclusive tax on the same line.
- The CGST/SGST/IGST split, including an odd taxable amount that cannot halve evenly.
- Allocation across documents without losing a minor unit.
- Aging bucket boundaries at exactly 0, 1, 30, 31, 60, 61, 90 and 91 days.
- Stock derivation across all eight movement types, including a signed adjustment.
- FX settlement gain and loss in both directions.
- E-way bill validity at the 200 km and 20 km steps, and midnight expiry.
- The 24-hour cancellation windows and the 8-hour extension window, on both sides.
- IRN digest reproducibility against a known input.
- QR encode/decode round-trip against an independently written decoder.
- Catalogue parity between languages, and the nine-grapheme tab budget.
