# Accounting and GST rules: review pack for a chartered accountant

Every tax and accounting rule Elixir Books Smart applies, with:
- its legal basis;
- the code that applies it;
- the automated test that checks it.

It is written for the chartered accountant who signs off the rules before **filing through the app** (`GST_FILING_ENABLED`) is switched on in production. Until then the app prepares and saves returns, and filing happens on the GST portal.

**How to review:**
1. **Read each rule.** For each one:
   - mark it ✅ agreed, ✏️ change needed (with the change), or ❓ question;
   - for any rule you doubt, run its test (named below);
   - or ask for a worked example on the demo company.
2. **Answer the open questions.** The questions at the end are judgement calls the team made; they need your answer.
3. **Sign off.** When every rule is ✅, sign and date the sign-off at the end, and attach it to the release ticket.

**Where the code lives:**
- `packages/core/src/domain/`: the rules themselves. They run on the server and in the app, with the same code.
- `apps/api/src/modules/`: the server's use of them.
- Core tests: `packages/core/src/domain/__tests__/`. API tests: `apps/api/test/`.

Amounts are kept in paise. Every source document's postings balance to the paisa; a rounding remainder goes to *Round off*.

---

## 1. GST on each line

| # | Rule | Basis | Code | Test |
|---|---|---|---|---|
| 1.1 | Intra-state supply: CGST + SGST at half the rate each; inter-state, or an export or SEZ supply: IGST | IGST Act s.7, 8 | `taxEngine.ts` `splitTax` | core `gstTreatment` › *a branch with its own GSTIN* |
| 1.2 | The home state is the branch's GSTIN state when it has one, otherwise the company's | CGST s.25 (separate registration) | `taxEngine.ts` `homeStateCode` | core `gstTreatment` › *supplies from its own state* |
| 1.3 | Nil-rated, exempt and non-GST lines carry no tax and are reported separately | CGST s.2(47), (78); GSTR-1 table 8 | `lineCalc.ts` `lineTreatment` | core `gstTreatment` › *charges nothing on nil-rated, exempt and non-GST*; `gstr1` › *splits table 8* |
| 1.4 | Compensation cess is its own component, never split between centre and state | Compensation Cess Act s.8 | `taxEngine.ts` `cessComponent` | core `gstTreatment` › *adds cess as its own component* |
| 1.5 | A composition dealer charges no GST and issues a bill of supply; it still pays reverse charge on what it buys | CGST s.10, Rule 49 | `taxEngine.ts` `buildTaxContext` | core `gstTreatment` › *composition dealer* |
| 1.6 | A tax-inclusive price is grossed down by GST and cess together | — | `lineCalc.ts` | core `gstTreatment` › *strips cess and GST together* |
| 1.7 | A pure-agent reimbursement is outside the taxable value and the discount, but in the total; it is shown separately and left out of every GSTR-1 table | CGST Rule 33 | `lineCalc.ts`; `gstr1.ts` | core `gstTreatment` › *keeps a reimbursement out of the taxable value*; `gstr1` › *leaves a reimbursement out of every table* |
| 1.8 | The buyer's GSTIN and state are fixed on the document when it is issued | — | `documents/engine.ts` | api `gst-treatment` › *snapshots the buyer's GSTIN* |
| 1.9 | **New.** On the printed invoice, reimbursements sit in their own table after the items, so the items add up to the subtotal. On the e-invoice they are not items: they travel in `OthChrg`, and need no HSN | Rule 33; e-invoice schema 1.1 | `render/documentHtml.ts`; `eInvoice.ts` `buildIrpPayload` | core `compliance` › *sends a pure-agent reimbursement as other charges* |

## 2. Reverse charge

| # | Rule | Basis | Code | Test |
|---|---|---|---|---|
| 2.1 | A notified reverse-charge supply, or a bill from a supplier marked reverse charge: the tax is shown but is not owed to the supplier; it is owed to the government and, if eligible, claimed | CGST s.9(3), 9(4); notification 13/2017-CT(R) | `lineCalc.ts`; `postings.ts` | core `gstTreatment` › *reverse charge*; `books` › *self-assesses reverse-charge tax* |
| 2.2 | An imported service: IGST self-assessed, though the import bill carries none | IGST s.5(3) | `taxEngine.ts` | core `gstTreatment` › *self-assesses IGST on an imported service* |
| 2.3 | From an unregistered supplier: a self-invoice from its own series | CGST s.31(3)(f), Rule 46(f) | `documents/lifecycle.ts` | api `tds` › *raises a self-invoice for the tax the business pays* |
| 2.4 | A sale under reverse charge charges no tax; reported with `rchrg Y` / `RegRev Y` | GSTR-1 instructions | `gstr1.ts`; `providers/gsp/common.ts` | core `gstr1` › *flags a reverse-charge sale* |
| 2.5 | Reverse-charge tax is paid in cash, never from credit | CGST s.49(4), Rule 86(2) | `gstr3b.ts` `utilizeItc` | core `gstr3b` › *never lets CGST credit pay SGST, and pays reverse charge in cash* |

## 3. Input tax credit

| # | Rule | Basis | Code | Test |
|---|---|---|---|---|
| 3.1 | Each line's GST is eligible, capital goods, reverse charge, blocked or ineligible | CGST s.16, 17 | `itc.ts` `itcOfDocument` | core `itc` › *sorts each line's GST* |
| 3.2 | Blocked (s.17(5)) and ineligible credit is a cost, never input GST; 3B reports it in 4B(1) | CGST s.17(5); Rule 42, 43 | `postings.ts`; `gstr3b.ts` | core `books` › *posts a bill with … a blocked line to cost*; `gstr3b` › *reverses the blocked line in 4B(1)* |
| 3.3 | Capital goods go to fixed assets; their credit is shown apart | Rule 43 | `postings.ts` | core `books` › same test |
| 3.4 | A bill's credit is claimed in the period whose GSTR-2B carries it, once accepted | CGST s.16(2)(aa) | `gst/gstr2b.ts` `claimMatched`; `gstr3b.ts` | api `gstr2b` › *…claims the matched credit*; core `gstr3b` › *claims only the bills 2B matched* |
| 3.5 | 2B lines marked ITC-unavailable are never claimed | GSTR-2B "ITC availability" | `reconcile2b.ts` | core `reconcile2b` › *never claims what 2B marks unavailable* |
| 3.6 | Unpaid 180 days after the bill: credit reversed (with a GST journal), reclaimed once paid | CGST s.16(2) second proviso, Rule 37 | `documents/itcReversal.ts` | api `tds` › *reverses it once, tells the business, and reclaims it* |
| 3.7 | A supplier credit note lowers the credit | CGST s.34 | `itc.ts` | core `itc` › *counts a supplier credit note against the credit* |
| 3.8 | Expense GST is split CGST/SGST or IGST by place of supply; blocked or ineligible expense GST is a cost | CGST s.16, 17 | `expenseTax.ts` | core `gstTreatment` › *expense GST* |

**GSTR-2B matching** (`reconcile2b.ts`; core `reconcile2b`, api `gstr2b`). **Changed: please review.**
- **Supplier numbers** are compared ignoring case, separators and leading zeros. A financial-year segment (24-25, 2024/25) is dropped, but only when its second year follows the first, so "A/12/34" stays distinct.
- **Matched:** same supplier GSTIN, number and date, with taxable value and tax within ₹1.
- **Matched, dates differ (new):** the same, but dated up to the company's date tolerance apart (Settings › Business profile, 3 days by default; 0 means the same day only). It is claimable like a match.
- **Mismatch (was "partial"):** same GSTIN and number, but the amount differs, or the date is further off than the tolerance. The screen says which: taxable value, tax, date.
- **Probable:** same GSTIN and tax within 3 days, under another number. It is only suggested, never claimed until a person accepts it.
- **Linked by you (new):** a person accepted a suggestion or linked the line to any of the supplier's unclaimed bills. It is claimable.
- **Claimed (new):** matched to a bill already claimed for this period.
- **Reverse charge (changed):** a reverse-charge bill is compared on its reverse-charge tax, which 2B shows.
- **Bills entered after the period (changed):** they can match the period's 2B, but only bills dated in or before the period are chased as "not in 2B".
- **Bills of entry (changed):** matched on the bill-of-entry number, whatever the supplier. Imports are never chased.
- **Decisions** survive a fresh download.

## 4. TDS

| # | Rule | Basis | Code | Test |
|---|---|---|---|---|
| 4.1 | Rates and thresholds by section (table below); a company with no TAN deducts nothing | Income-tax Act Ch. XVII-B | `data/tdsSections.ts`; `tds.ts` | core `tds`; api `tds` › *deducts nothing for a business without a TAN* |
| 4.2 | Single-bill and annual thresholds per deductee per financial year; crossing the annual one catches up the year's earlier bills on that bill | s.194C(5) and similar | `tds.ts` `tdsFor` | core `tds` › *catches up on the year*; api `tds` › *catches up on the year when a bill takes the total past ₹1 lakh* |
| 4.3 | TDS is on the value excluding GST | CBDT circular 23/2017 | `tds.ts` | api `tds` › *keeps back 2% on a contractor's bill over ₹30,000* |
| 4.4 | No PAN: 20% (194Q: 5%) | s.206AA | `tds.ts` | core `tds` › *deducts 20% … (s.206AA)* |
| 4.5 | A lower-deduction certificate's rate applies while valid and within its limit | s.197 | `tds.ts` | core `tds` › *applies a lower deduction certificate* |
| 4.6 | 194Q only on purchases above ₹50 lakh in the year | s.194Q | `tds.ts` | core `tds` › *taxes only what the year's purchases exceed ₹50 lakh by* |
| 4.7 | The supplier is owed the bill less TDS; TDS goes to *TDS payable* by section; a supplier credit note gives it back at the bill's rate | — | `postings.ts`; `lib/tds.ts` | api `tds` › *gives TDS back on a supplier credit note* |
| 4.8 | The register is by section, deductee and 26Q quarter, net of credit notes | Form 26Q | `tds.ts` `tdsRegister` | core `tds` › *registers deductions by section, deductee and quarter* |
| 4.9 | TDS a customer deducts settles the invoice and goes to *TDS receivable* | s.199, Form 26AS | `postings.ts` `postPayment` | api `notes` › *settles with cash plus TDS the customer deducted* |
| 4.10 | **New.** TDS payable report: deducted by section and month, from the *TDS payable* ledgers; each challan settles its section's oldest month first; due by the 7th of the next month, 30 April for March | Rule 30 | `tdsReports.ts` `tdsPayableSummary` | core `tdsReports` › *settles the oldest first from challans* |
| 4.11 | **New.** TDS receivable report: what customers kept back, by customer and quarter, to check against 26AS | Form 26AS | `tdsReports.ts` `tdsReceivable` | core `tdsReports` › *adds up what each customer kept back* |
| 4.12 | **New.** Form 26Q deductee rows: one per bill, and one per payment that kept TDS back, with PAN, section, amount, rate and TDS, and the challan that deposited it (oldest deduction first). **Changed:** a payment that keeps TDS back asks for its section (the supplier's by default) and posts it to that section's payable, so it is in 26Q too; only older payments without a section stay out | Form 26Q annexure | `tdsReports.ts` `tdsReturnRows` | core `tdsReports` › *names the challan that deposited each deduction* |
| 4.13 | **New.** A TDS challan voucher may carry its BSR code (7 digits), serial (up to 5) and deposit date; only a TDS challan may | ITNS 281 | `books/handlers.ts` | api `books` › *takes other income in with a receipt…* |

| Section | Nature | Rate (individual / other) | Threshold |
|---|---|---|---|
| 194C | Contractors | 1% / 2% | ₹30,000 a bill, ₹1 lakh a year |
| 194J(a) | Technical services, royalty | 2% | ₹50,000 a year |
| 194J(b) | Professional services | 10% | ₹50,000 a year |
| 194H | Commission | 2% | ₹20,000 a year |
| 194I(a) | Rent of plant and machinery | 2% | ₹50,000 a payment |
| 194I(b) | Rent of land, building, furniture | 10% | ₹50,000 a payment |
| 194A | Interest | 10% | ₹10,000 a year |
| 194Q | Purchase of goods | 0.1% | Above ₹50 lakh a year |

## 5. Credit and debit notes, and settling without cash

| # | Rule | Basis | Code | Test |
|---|---|---|---|---|
| 5.1 | Value-only notes move no stock; a credit note lowers what the invoice owes, a debit note adds to it | CGST s.34 | `documents/lifecycle.ts` | api `notes` › *lowers what an invoice owes with a credit note, moving no stock* |
| 5.2 | Notes can't exceed the invoice's value less earlier notes, net of its debit notes | — | `lifecycle.ts` `checkAgainstSource` | api `notes` › *refuses credit beyond what the invoice charged* |
| 5.3 | No credit note after 30 November following the year of the supply | CGST s.34(2) | `lifecycle.ts`; `gstr1.ts` | core `gstr1` › *is 30 November after the end of the financial year*; api `notes` › *refuses a credit note after 30 November…* |
| 5.4 | Notes go to CDNR (registered buyer) or CDNUR (unregistered, when the invoice was B2CL); a small note to a consumer nets against B2CS | GSTR-1 tables 9B, 7 | `gstr1.ts` | core `gstr1` › *GSTR-1 credit and debit notes* |
| 5.5 | Discount allowed and write-off settle the invoice with no money moving; write-off is owner, admin or accountant only | — | `payments/engine.ts` | api `notes` › *writes off the rest with no money moving* |
| 5.6 | **New.** A direct note, raised against no one invoice or bill (a discount across several, a rate revision), must give its reason. Its credit waits on the party like an advance. 5.2 and 5.3 can't be checked on it. It is reported by the buyer it is issued to: CDNR if registered, otherwise netted in B2CS | CGST s.34 | `documents/engine.ts`; `lifecycle.ts` `checkAgainstSource`; `lib/balances.ts` | api `notes` › *takes a direct note with a reason*; core `gstr1` › *reports a direct note…* |

## 6. Books (double entry)

| # | Rule | Code | Test |
|---|---|---|---|
| 6.1 | Postings are worked out from the records, never stored; drafts are off the books; every source balances to the paisa | `ledger/postings.ts` | core `books` › *leaves drafts off the books and balances to the paisa* |
| 6.2 | **Changed (perpetual stock).** Stock is perpetual from a company's `perpetualStockFrom`, the first day of a financial year (new businesses: their first year; others: an owner turns it on from this year, or the next if this one is closed). From then each stock movement posts at cost: goods bought move from *Purchases* to *Stock in hand* at what the stock ledger valued them at (Purchases keeps services, untracked goods and credit that can't be claimed); goods sold, or returned, move between Stock in hand and *Cost of goods sold*; a count found short or over goes to *Stock adjustments*; transfers and cancelled documents move no value. Goods that come in on a goods receipt before their bill go to *Goods received, not billed* (a current liability), and the bill made from the receipt, or from the order the receipt came from, moves that amount into Purchases on its own date, so the bill's price difference stays in Purchases. Cost is a moving weighted average, item by item across the company, taken on each movement's day; stock run down to nothing is worth nothing. Gross profit = sales − purchases − direct costs − cost of goods sold, with no stock valued at the end. Before that day the books stay periodic, as Tally: gross profit = sales − (opening stock + purchases + direct costs − closing stock), closing stock at weighted-average cost on the day | `stockLedger.ts` `costMovements`, `perpetualStock`; `ledger/postings.ts` `postStock`; `ledger/reports.ts` `profitAndLoss`, `balanceSheet` | core `stockCosting` › *issues at the moving average on the day*; core `perpetual stock` › *posts goods bought to stock and goods sold to cost of goods sold…*, *holds goods received before their bill as owed…*, *works out gross profit from the cost of goods sold…*; core `books` › *works out gross profit from sales, purchases and the change in stock*; api `perpetual stock` › *posts the goods sold to cost of goods sold…* |
| 6.3 | Trial balance debits equal credits; balance-sheet sides agree; last year's profit moves to *Profit and loss of earlier years* | `ledger/reports.ts` | core `books` › *has a trial balance…*, *has a balance sheet…*, *carries last year's profit…*; api `books` › *balances over sales, purchases with TDS…* |
| 6.4 | Opening balances sit at the start of the books; the difference goes to *Opening balances* (capital). A foreign-currency account's opening is in base at the rate on its opening date. **Changed:** an account, a party, or a cash or bank account may give its opening an "as on" date (cash and bank openings left undated by the form until now are treated as undated). It then stands at the start of that day, so reports from that day show it as opening and earlier ones don't. Changing a dated opening in a closed period is refused. Cash and bank openings stay at the start of the books (their date only picks the FX rate) | `postOpenings`; `settings/accounts.ts`; `books/handlers.ts` | api `settings` › *counts its opening balance in base…*; core `books` › *stands a dated opening balance at the start of its day*; api `books` › *dates an opening balance…* |
| 6.5 | Vouchers balance and may have any number of lines; a contra moves money only between cash and bank; a GST journal touches a GST ledger; a TDS challan clears TDS payable from cash or bank. **New:** a receipt (the Receipts menu: interest, rent, a refund) debits only cash or bank and credits only accounts that aren't; taxable income belongs on an invoice | `books/handlers.ts` | api `books` › *refuses an unbalanced voucher…*, *splits one contra across more than two…*, *takes other income in with a receipt…* |
| 6.6 | Closing the books (owner only) refuses any document, payment, expense or voucher dated on or before the close (`PERIOD_LOCKED`) | `documents/lifecycle.ts` `assertPeriodOpen` | api `books` › *closes payments and expenses with the books too* |
| 6.7 | Cost centres: a document's and an expense's postings carry their centre; a voucher splits by line. **Changed:** under periodic stock profit by centre excludes the change in stock; under perpetual stock the goods sold post under each document's centre, so the centres add up to the profit | `ledger/reports.ts` `costCentreProfit` | core `extras` › *tags a document's postings and splits a voucher by centre*; core `perpetual stock` › *splits the goods sold by cost centre…* |
| 6.8 | Tally export: every account as a ledger under Tally's reserved group with its opening; every voucher balanced | `exports/tally.ts` | api `exports` › *writes the whole book for Tally* |
| 6.9 | **New.** A voucher may be saved as a draft: it posts nothing, takes no number from the series (none is lost if it is abandoned), may be unbalanced or one line, and is outside closed periods. Posting it applies every rule in 6.5 and 6.6 and gives it the next number on its date; a posted voucher cannot return to draft. Drafts are left out of cash and bank balances, party statements, the TDS challan register and the Tally export | `ledger/postings.ts` `postVoucher`, `isDraftVoucher`; `books/handlers.ts` | core `books` › *leaves a draft voucher off the books until it is posted*; api `books` › *keeps a draft out of the books and its number series…*, *keeps and deletes a draft in a closed period…* |
| 6.10 | **New.** Changing to perpetual stock: the stock the periodic years closed with (beyond the opening stock already posted) is brought onto the books on the first perpetual day, Stock in hand against *Profit and loss of earlier years*, so earlier years keep their profit. A sales return comes back at what its invoice's goods went out at, a purchase return goes back at what its bill's goods came in at. The day can be set, moved or cleared only by an owner, only to a financial year's start (`PERPETUAL_NOT_YEAR_START`), and never so that a closed period changes (`PERIOD_LOCKED`). The profit report takes cost of goods from the same postings, so it agrees with the books | `companies/handlers.ts` `checkPerpetualFrom`; `ledger/postings.ts` `postStock`; `stockLedger.ts` `goodsCostByDocument`; `reports.ts` `profitSnapshot` | core `perpetual stock` › *carries the periodic years’ closing stock onto the books…*, *moves no value for a cancelled sale*; core `stockCosting` › *brings a sales return back at its invoice cost…*; api `perpetual stock` › *changes only from the start of an open financial year, by an owner*, *starts a new business perpetual…* |
| 6.11 | **New.** A party may be both a customer and a supplier: one ledger, kept in Sundry Debtors as Tally keeps it, on sales and purchase documents and payments either way; its statement nets both sides (positive: they owe us). A party's opening balance carries its side (Dr: they owe us; Cr: we owe them), defaulting to the kind's usual side; a supplier's Dr opening reads as an advance paid. A general contact (landlord, auditor, transporter) has no ledger, no opening balance, and is on no document or payment | `partyKinds.ts` `openingDebit`, `openingOnSide`; `ledger/postings.ts` `postOpenings`; `lib/balances.ts`; `parties/statement.ts` | api `party-kinds` › *lets a party that is both buy and sell under one ledger…*, *keeps a general contact off documents…*, *reads a supplier opening given as Dr as an advance…* |
| 6.12 | **New.** Opening invoices and bills: what a customer still owed, or what was still owed to a supplier, invoice by invoice, when the books started here, imported from a spreadsheet. Each is an issued *opening invoice* (or *opening bill*) under its original number, date and due date, for the amount still outstanding, with one line outside GST. It posts only Dr the party / Cr *Opening balances* (the other way for a bill), on its own date; never sales, purchases, GST, TDS or stock, and it is in no return. It is paid, aged, put on statements and allocated against like an invoice or bill, and can be cancelled if entered wrongly, but not finalised, converted or deleted. A party that already has an opening balance is refused, so a debt is never counted twice; the party is found by GSTIN, else by its one exact name, and must be on that side. A row dated in a closed period is refused | `ledger/postings.ts` `postDocument`; `documentStates.ts` `OPENING_KINDS`, `PAYABLE_KINDS`; `documents/openings.ts` `importOpeningDocuments`; `books/book.ts`; `parties/statement.ts` (on statements); `documents/engine.ts` (no custom fields asked) | core `opening invoices and bills` › *posts only to the party and Opening balances…*; api `opening invoices and bills` › *imports what was owed, invoice by invoice…*, *refuses a party that already has an opening balance…* |
| 6.13 | **New.** TCS on sales (s.206C): an invoice may name a TCS section, s.206C(1) scrap, liquor, tendu leaves, timber, forest produce, minerals, or s.206C(1F) motor vehicles and notified luxury goods over ₹10 lakh (s.206C(1H) omitted from 1 Apr 2025). TCS is worked on the price with GST (after document discount, with charges, not pure-agent reimbursements), rounded to the rupee, at the section's rate, or under s.206CC the higher of twice the rate and 5% when the buyer has neither PAN nor GSTIN. It is added to what the buyer owes and credited to TCS payable for its section, not sales; it is not part of GST taxable value and travels in the e-invoice as another charge | Income-tax Act s.206C, s.206CC | `data/tcsSections.ts`; `lineCalc.ts` `calculateDocument`; `ledger/postings.ts` `postDocument`; `documents/engine.ts` | core `books` › *adds TCS to what the buyer owes…*; core `compliance` › *sends TCS collected as other charges…*; api `tcs` › *collects TCS on a scrap sale…*, *takes the higher rate from a buyer with no PAN…* |

## 7. GSTR-3B and filing

| # | Rule | Basis | Code | Test |
|---|---|---|---|---|
| 7.1 | 3.1(a) the period's taxable sales net of notes; (b) zero-rated; (c) nil and exempt; (d) inward reverse charge; (e) non-GST | GSTR-3B | `gstr3b.ts` `gstr3b` | core `gstr3b` › *GSTR-3B* |
| 7.2 | 3.2 inter-state supplies to unregistered buyers by place of supply | GSTR-3B | same | core `gstr3b` › *lists inter-state supplies to unregistered buyers* |
| 7.3 | Set-off order: IGST credit first, on IGST, then CGST and SGST, split to leave least cash; CGST then IGST; SGST then IGST; never CGST ↔ SGST; cess only cess | CGST s.49(5), Rule 88A | `gstr3b.ts` `utilizeItc` | core `gstr3b` › *paying the tax from credit (rule 88A)*: 5 tests |
| 7.4 | Unused credit carries forward into the next period's set-off | Electronic credit ledger | `gst/gstr3bBuild.ts` | api `gst-filing` › *builds 3B from the books…* |
| 7.5 | Due the 20th; QRMP the 22nd (category X states) or 24th | CGST Rule 61(5) | `gstr3b.ts` `dueDate` | core `gstr3b` › *falls due on the 20th, or the 22nd or 24th* |
| 7.6 | Late fee ₹25 + ₹25 a day (₹10 + ₹10 for a nil return), capped by turnover (₹1,000 + ₹1,000 up to ₹1.5 crore, ₹2,500 + ₹2,500 up to ₹5 crore, ₹5,000 + ₹5,000 above; ₹250 + ₹250 nil); interest 18% a year on tax paid in cash late | CGST s.47, s.50 | `gstr3b.ts` `lateFeeAndInterest`, `lateFeeCap` | core `gstr3b` › *charges ₹50 a day late (₹20 nil) and 18% a year on cash tax* |
| 7.7 | GSTR-1 is filed before the period's 3B; a filed return is never filed or saved again; the portal is asked before every filing | — | `gst/filing.ts` | api `gst-filing` › *files GSTR-1 then 3B, never twice…* |
| 7.8 | A filing whose answer is lost is settled from the portal's return tracker | — | `gst/filing.ts` `recoverLostFilings` | api `gst-filing` › *settles a filing whose answer was lost…* |
| 7.9 | Filing 3B closes the books through the period and posts the credit used as a GST journal (Dr output, Cr input) | — | `gst/filing.ts` `afterFiled3b` | api `gst-filing` › same test as 7.7 |
| 7.10 | **New.** Every 3B table that the books fill breaks down to the documents, expenses and advances behind it, signed, adding up to the table | GSTR-3B | `gstr3b.ts` `sources` | core `gstr3b` › *breaks every table down…*; core `extras` › *shows each advance in the 3B breakup* |
| 7.11 | **New.** An import bill records its bill of entry (number, date, port, assessable value, IGST and cess paid at customs). That IGST and cess is input credit (Dr input IGST/cess, Cr *Customs IGST payable*), matched to the 2B import line on the bill of entry number and port, and claimed in 3B 4A(1) | CGST s.16; IGST s.5 proviso | `ledger/postings.ts` `postDocument`; `gstr3b.ts`; `gst/gstr2b.ts` `billsFor` | core `books` › *books customs IGST on a bill of entry…*; core `gstr3b` › *claims customs IGST… in 4A(1)…* |
| 7.12 | **New.** A purchase bill marked as an Input Service Distributor's invoice puts its credit in 3B 4A(4) instead of 4A(5); 2B's ISD section is read and matched to it | CGST s.20; Rule 39 | `gstr3b.ts`; `providers/gsp/returns.ts` `parseGstr2b` | core `gstr3b` › *…an ISD invoice in 4A(4)* |
| 7.13 | **New.** A filed GSTR-1 keeps the rows it reported. A document from an earlier filed return that has changed since, or was cancelled, goes into the next return's amendment table (B2BA, B2CLA, EXPA, CDNRA, CDNURA) with its original number, date and period and its revised figures (nil when cancelled); consumer supplies are restated by original month, place and rate (B2CSA). The difference goes into that month's 3B 3.1(a). An amendment once filed isn't repeated | GSTR-1 tables 9A, 9C, 10 | `gstr1Amend.ts` `gstr1Amendments`; `gst/handlers.ts` `amendmentsFor`; `gst/gstn.ts` | core `gstr1Amend` |
| 7.14 | **New.** The dashboard's filing calendar (informational; it files nothing): GSTR-1 due the 11th of the next month; under QRMP the quarter's GSTR-1 the 13th after the quarter, IFF (optional) the 13th after each of its first two months, and PMT-06 the 25th after each of them; GSTR-3B as 7.5; TDS deposit as 4.10 (`tdsDepositDue`). A return counts as filed when it is recorded here as filed | CGST Rule 59(1), 59(2), 61(5); Notification 85/2020-CT | `dashboard.ts` `gstr1DueDate`, `filingCalendar` | core `dashboard` › *dates GSTR-1 and IFF*, *gives a QRMP filer IFF and PMT-06…* |

## 8. Advances, reimbursements, MSME

| # | Rule | Basis | Code | Test |
|---|---|---|---|---|
| 8.1 | An advance for services owes GST when received, at the rate and place of supply given, inside the amount received | CGST s.13(2); Rule 50 | `advanceTax.ts` `advanceTaxEvents` | core `extras` › *taxes the advance when received, inclusive of the tax* |
| 8.2 | Money applied to an invoice dated on or before the receipt was never an advance and carries none | — | same | core `extras` › *carries no tax on money settling an invoice already raised* |
| 8.3 | The advance's tax is taken back on the date of each invoice it is applied to, shared to the paisa | — | same | core `extras` › *takes the tax back on the date of each invoice…* |
| 8.4 | GSTR-1 11A: received in the period and not invoiced in it; 11B: earlier advances invoiced in it; 3B 3.1(a) carries the net | GSTR-1 table 11 | `advancesForPeriod`; `gstr3b.ts` | api `extras` › *reports the advance in table 11A when received and 11B when invoiced, and in 3B* |
| 8.5 | Advances for goods carry no GST | Notification 66/2017-CT | (the switch is for services only) | — |
| 8.6 | A billable expense is recovered once, only on an invoice to its customer, as a reimbursement line. **Changed:** a billable expense is debited to *Reimbursements recoverable* (an asset), not its category, and the invoice's reimbursement line credits it, so neither reaches P&L. Works on invoices for services and goods alike. Credit claimed on a billable expense is left on that account, which the screen warns against | Rule 33 | `documents/engine.ts` `checkRecoveredExpenses`; `ledger/postings.ts` `postExpense`, `postDocument` | api `extras` › *recovers a billable expense once…*; core `books` › *keeps a billable expense out of P&L…* |
| 8.7 | Micro and small suppliers are paid by the day agreed for the bill, at most 45 days after it, or within 15 days when nothing was agreed; a due date that only follows the supplier's standing payment terms counts as nothing agreed. Medium enterprises are outside it | MSMED Act s.15 | `msme.ts` `msmeDueDate` | core `extras` › *is due on the agreed day…*; *takes a due date that only follows the supplier's standing terms…* |
| 8.8 | Late interest at three times the bank rate (a company setting, 5.5% by default), compounded monthly (shown for information) | MSMED Act s.16 | `msme.ts` `msmeInterest` | core `extras` › *lists covered suppliers' unpaid bills…* |
| 8.9 | What wasn't paid within the limit is listed as not deductible this year | Income-tax Act s.43B(h) | `msme.ts` `sec43bh` | core `extras` › *lists for the CA what wasn't paid in time* |
| 8.10 | **New.** The receipt for a service advance is also its receipt voucher: recipient and GSTIN, place of supply, value of the advance, rate and CGST/SGST or IGST | CGST s.31(3)(d), Rule 50 | `payments/receipt.ts` | api `extras` › *reports the advance in table 11A…* |
| 8.11 | **New.** An advance paid back with no supply made is a refund: a payment out that settles nothing but that receipt's advance, no more than is left of it. It prints as the refund voucher (receipt voucher referred to, recipient, amount, rate and tax). On a service advance, the tax on what is refunded comes back on the refund date, reported with the adjustments (GSTR-1 11B; netted in 11A within the same month; 3B 3.1(a)) | CGST s.31(3)(e), s.34; Rule 51 | `advanceTax.ts` `advanceTaxEvents`; `payments/engine.ts`; `payments/receipt.ts` | core `extras` › *takes back the tax on what is refunded…* |

---

## Open questions for the reviewer

Each has the product owner's answer below it. The CA confirms or changes each one at sign-off.

1. **Late fee cap (7.6).** The code caps the late fee at ₹5,000 CGST + ₹5,000 SGST, the slab for turnover above ₹5 crore. Since notification 19/2021-CT the cap is lower for smaller businesses (₹1,000 + ₹1,000 up to ₹1.5 crore, ₹2,500 + ₹2,500 up to ₹5 crore). Should it follow the company's aggregate turnover?
   - **Answer (product owner, 5 Nov 2026):** Follow the company's aggregate turnover: ₹1,000 + ₹1,000 up to ₹1.5 crore, ₹2,500 + ₹2,500 up to ₹5 crore, ₹5,000 + ₹5,000 above.
2. **Bank rate (8.8).** `BANK_RATE_PERCENT` is 5.5%. Please confirm RBI's current bank rate.
   - **Answer (product owner, 5 Nov 2026):** A company setting, defaulting to 5.5%, that an admin changes when RBI revises the rate.
3. **Agreed day (8.7).** With no due date on a bill, the supplier's payment terms are taken as the written agreement. Is that acceptable, or should such bills get 15 days?
   - **Answer (product owner, 5 Nov 2026):** A bill with no due date of its own falls due 15 days after the bill date; payment terms are not taken as the agreement.
4. **Reimbursements (8.6).** The expense stays in its category, and the recovery goes to *Reimbursements recovered* (indirect income), so they net off in P&L. Would you rather they go through a *Reimbursements recoverable* asset account, keeping both out of P&L?
   - **Answer (product owner, 5 Nov 2026):** Through a *Reimbursements recoverable* asset account: the billable expense debits it and the invoice's reimbursement line clears it, so neither reaches P&L. This applies to invoices for services and goods alike.
5. **Cost centres (6.7).** A document goes to one cost centre as a whole; only voucher lines can split. Is that enough for your clients?
   - **Answer (product owner, 5 Nov 2026):** One cost centre per document is enough; a split is made with a voucher.
6. **Opening balances (6.4).** An opening with no date stands at the start of the books, as in Tally; one with an "as on" date posts the day before it. Please confirm both, and whether cash and bank openings should take their date too (today the form fills it with the day the account was added, so it isn't used).
   - **Answer (product owner, 5 Nov 2026):** Both confirmed. Cash and bank openings take their "as on" date too, and the form leaves it blank (start of the books) instead of filling in today.
7. **Advance refunds (8.11).** Refunds are now built as above: the tax comes back in the month of the refund, reported with the 11B adjustments. Please confirm that reporting, and that a refund of an advance for goods (no tax) needs only the voucher.
   - **Answer (product owner, 5 Nov 2026):** Agreed as built.
8. **ISD and imports of goods.** 3B 4A(1) imports of goods and 4A(4) ISD are always zero today. Bills of entry and ISD invoices aren't recorded.
   - **Answer (product owner, 5 Nov 2026):** Build both: bills of entry (filling 4A(1) and matched to 2B) and ISD invoices (filling 4A(4)).
9. **Amendments.** Corrections after filing go in a later period's ordinary tables. B2BA/CDNRA amendment tables aren't produced.
   - **Answer (product owner, 5 Nov 2026):** Build the GSTR-1 amendment tables: a document already reported in a filed return and changed afterwards goes into the matching amendment table of the next return, with its original number and date.
10. **2B tolerance (3, GSTR-2B matching).** A line whose amounts agree but whose date is up to 3 days off is now claimable without a person accepting it. Is 3 days right, or should any date difference wait for a person?
   - **Answer (product owner, 5 Nov 2026):** A company setting, defaulting to 3 days; 0 means only an exact date is claimable without a person.
11. **TDS on payments (4.12).** TDS kept back on a payment (rather than on its bill) is posted with no section, so it can't go into 26Q. Should the payment screen ask for the section?
   - **Answer (product owner, 5 Nov 2026):** Ask for the section on the payment, defaulting to the supplier's; the TDS posts to that section and goes into 26Q and the TDS payable report.

12. **Opening invoices and bills (6.12).** Outstanding invoices from before the books started are imported one by one and post Dr party / Cr Opening balances on each invoice's own date, with no GST or sales (they belong to the earlier books and returns). A party with an opening balance can't also take opening invoices. Please confirm the posting and the date (each invoice's own date, rather than the day before the books start), and that nothing about them should reach GSTR-1 or 3B.
   - **Answer (product owner, 5 Nov 2026):** Import only what is still outstanding, as built; no sales or GST postings.
13. **TCS (6.13).** Is TCS under s.206C(1) worked on the price including GST, as built, or on the value before GST? Is rounding to the rupee right? Should a credit note against an invoice with TCS give TCS back? The TCS return (27EQ) and challans are not built yet.

## Interim acceptance by the product owner

On 5 Nov 2026 Gowtham (product owner) accepted every rule above and the team's current answer to each open question, so that work can go on. **This is not a chartered accountant's review.** Nothing here has been checked by a CA. The CA sign-off below is still required before `GST_FILING_ENABLED` is switched on in production.

## Sign-off (chartered accountant)

| | |
|---|---|
| Reviewed by (name, membership no.) | |
| Firm | |
| Date | |
| Rules agreed | All / all except: |
| Signature | |
