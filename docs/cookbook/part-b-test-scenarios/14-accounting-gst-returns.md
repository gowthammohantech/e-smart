# 14 — Accounting and GST returns

Tests for:
- the books: postings, vouchers, statements, cost centres, closing the books, and the Tally export;
- TDS, reverse charge and input credit;
- notes and settling without cash;
- reimbursements, advances for services and MSME;
- GSTR-2B, GSTR-3B and filing.

Setup and demo data are in [00 — Test setup](00-test-setup.md). The user guide is in [19](../part-a-user-guide/19-books.md), [20](../part-a-user-guide/20-tds-rcm-itc.md) and [21](../part-a-user-guide/21-gst-returns.md). The rule each scenario checks is in [`docs/accounting/RULES.md`](../../accounting/RULES.md).

Portal calls go through the simulated returns provider in development, so 2B, saving and filing results are **[sim]**:
- OTP and EVC code: `575757`.
- Filing needs `GST_FILING_ENABLED=true` on the server.

Default: owner, **Vertex Traders** (Maharashtra, GSTIN `27…`), full plan.

### Books

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| BKS-001 | Trial balance balances | Owner | Demo data | **Books › Trial balance**, this FY | Debits equal credits; every party, cash and bank account and system account listed | happy |
| BKS-002 | Invoice posts | | Issue a ₹10,000 + 18% invoice to Kumar Electronics | Open Kumar's account statement | Dr ₹11,800; Sales Cr ₹10,000; Output CGST and SGST Cr ₹900 each | happy |
| BKS-003 | Blocked credit is a cost | | Bill with a line marked blocked | Trial balance | Its GST is in Purchases, not Input CGST/SGST | edge |
| BKS-004 | Contra | Accountant | Cash holds ₹5,000 | New voucher › Contra, cash ₹5,000 to bank | Saved; cash down, bank up | happy |
| BKS-005 | Contra through a non-cash account | | | Contra with an expense account on one line | Refused: "A contra moves money between cash and bank accounts only" | validation |
| BKS-006 | Unbalanced voucher | | | Journal ₹100 debit, ₹90 credit | Refused (`VOUCHER_UNBALANCED`) | validation |
| BKS-007 | Voucher takes more than the cash holds | | Cash ₹0 | Journal crediting cash ₹100 | Refused (`INSUFFICIENT_BALANCE`) | validation |
| BKS-008 | P&L and balance sheet agree | | Demo data | Open both for this FY | Net profit in P&L equals current-year profit under capital; balance sheet sides agree | happy |
| BKS-009 | Viewer reads, can't post | Viewer | | Open Books; try **New voucher** | Statements visible; saving refused | role |
| BKS-010 | Sales plan | Owner / Basic | | More menu | No Books entry | plan |

### Cost centres and closing the books

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| CC-001 | Add and tag | Owner | | **Books › Cost centres › Add** "Thane site"; tag an invoice and an expense with it | **Cost centre** field appears on invoice, expense and voucher line | happy |
| CC-002 | Profit by centre | | CC-001 | **Profit by cost centre** | Thane site: the invoice's sales as income, the expense as expense | happy |
| CC-003 | Centre under itself | | Centre B under A | Edit A, set parent B | B isn't offered; the server refuses a loop with 422 | validation |
| CC-004 | Delete one in use | | CC-001 | Delete via API | 409 `COST_CENTRE_IN_USE` | validation |
| CLS-001 | Close the books | Owner | | **Books › Close the books**, through last month's end | "Books closed through …" | happy |
| CLS-002 | Change in a closed period | | CLS-001 | Edit an invoice, payment, expense or voucher dated in it | Refused (`PERIOD_LOCKED`) | validation |
| CLS-003 | Not an owner | Admin | | Open the screen | "Only an owner can close or reopen the books." | role |
| CLS-004 | Reopen | Owner | CLS-001 | **Reopen the books** | The period can be changed again | happy |

### Foreign-currency account and Tally

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| FX-101 | USD account opening | Owner | No USD rate | Add a USD bank account with US$1,000 opening | Refused: "No USD→INR rate on or before …" | validation |
| FX-102 | With a rate | | Rate ₹83 on the 1st | Add it again | Balance ₹83,000 in the trial balance and on **Payment accounts** | happy |
| TLY-001 | Tally export | Owner | Demo data | **Backup & export › Tally XML** | Ledgers under Tally groups with GSTINs and openings; Sales, Purchase, Receipt, Payment, Journal vouchers, each balancing | happy |
| TLY-002 | Import into Tally | | TLY-001 | Tally Prime (education mode): Import masters, then transactions | Imports cleanly; Tally's trial balance equals the app's | happy |

### TDS, reverse charge, credit

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| TDS-001 | No TAN | Owner | Company without TAN | Bill a 194C supplier ₹50,000 | No TDS | edge |
| TDS-002 | 194C over ₹30,000 | | TAN set; supplier 194C, company PAN | Bill ₹50,000 + GST | "₹1,000 kept back at 2%"; the supplier is owed the total less ₹1,000 | happy |
| TDS-003 | Annual catch-up | | Three ₹25,000 bills, then a ₹35,000 one | Fourth bill | TDS on all four bills' value (₹1.1 lakh), kept back on the fourth | edge |
| TDS-004 | No PAN | | Supplier without PAN or GSTIN | Bill over threshold | 20% | edge |
| TDS-005 | Register | | TDS-002 | **Reports › TDS deducted** | Row by quarter, 194C, supplier, ₹1,000 | happy |
| TDS-006 | Challan | Accountant | TDS-002 | Voucher › TDS challan, TDS payable 194C ₹1,000 from bank | Saved; TDS payable clears | happy |
| RCM-001 | GTA from an unregistered supplier | | Supplier marked reverse charge, no GSTIN | Bill ₹10,000 at 5% | Supplier owed ₹10,000; self-invoice number shown; GST payable on reverse charge ₹500 | happy |
| ITC-001 | 180 days unpaid | | Bill dated 181 days ago, unpaid | Wait for the daily job (or run `itc.reversal180`) | "Input tax credit reversed on …"; notification; reclaimed once paid | edge |

### Notes and settling without cash

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| NTE-001 | Discount credit note | Owner | Issued invoice ₹11,800 | **Sales › Credit notes › New** against it, ₹1,180, reason Discount | Invoice owes ₹10,620; no stock moves; GSTR-1 CDNR row type C | happy |
| NTE-002 | Too much | | NTE-001 | Another note for ₹11,000 | Refused (`NOTE_EXCEEDS_SOURCE`) | validation |
| NTE-003 | Time-barred | | Invoice from FY 2024-25 | Credit note dated after 30 Nov 2025 | Refused (`NOTE_TIME_BARRED`) | validation |
| ADJ-001 | Customer deducted TDS | | Invoice ₹11,800 | Record payment ₹11,600 + TDS deducted ₹200 | Invoice paid; TDS receivable ₹200 | happy |
| ADJ-002 | Write-off by a sales user | Sales | | Payment with a write-off | Refused | role |

### Reimbursements, advances, MSME

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| RMB-001 | Recover a billable expense | Owner | Expense ₹2,500 billable, bill to Kumar | New invoice to Kumar | Panel lists it; **Add** makes a "Reimbursement at cost" line, no GST, outside taxable value | happy |
| RMB-002 | Recovered twice | | RMB-001 issued | Another invoice with the same expense | 409 `EXPENSE_ALREADY_RECOVERED`; the panel no longer offers it | validation |
| RMB-003 | Credit claimed on it | | Billable expense with eligible GST | Open the panel | Warning about pure-agent credit | edge |
| ADV-001 | Advance for services | | | Record payment ₹11,800 from a customer, no invoices, **Advance for services** 18%, Maharashtra | "GST on the advance: ₹1,800"; GSTR-1 this month 11A ₹10,000 / ₹900 + ₹900 | happy |
| ADV-002 | Invoiced next month | | ADV-001 | Next month: invoice ₹10,000 + 18%, apply the advance | That month's GSTR-1 11B ₹10,000; 3B 3.1(a) carries the invoice less the advance | happy |
| ADV-003 | Paid, not received | | | Payment made with the switch | The switch isn't offered; the API refuses with 422 | validation |
| MSM-001 | Due dates | | Supplier marked Micro | Bills with no terms, 30-day terms, 90-day terms | Due in 15, 30 and 45 days | happy |
| MSM-002 | Report and reminder | | Bill 50 days old, unpaid | **Reports › MSME payments due**; run `msme.reminders` twice | Listed as late with interest; one notification only | happy |
| MSM-003 | 43B(h) list | | Bill paid after its due date in the same FY | Report as of 31 March | Listed under **Not paid in time this year** | edge |

### GSTR-2B, GSTR-3B, filing [sim]

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| G2B-001 | Connect | Owner | GSTIN set | **GST portal connection**: username, **Send OTP**, `575757`, **Connect** | Connected, with the renewal date | happy |
| G2B-002 | Not yet made | | Before the 14th | **Download GSTR-2B** | "Not generated yet" (`GSTR2B_NOT_GENERATED`) | edge |
| G2B-003 | Match and claim | | Simulator 2B with matching, differing and unknown lines | Download; **Accept** the differing one; **Not ours** the unknown; **Claim matched credit** | Statuses as decided; decisions kept after downloading again; bills claimed for the period | happy |
| G3B-001 | 3B and set-off | | G2B-003 | **GSTR-1 and 3B filing** | Tables from the books; set-off uses credit before cash, never CGST for SGST | happy |
| G3B-002 | 3B before GSTR-1 | | 3B saved and set off | **File the return** on 3B | "File the period's GSTR-1 first." | validation |
| G3B-003 | File both | | | GSTR-1: save, freeze, EVC, file; then 3B: save, set off, EVC, file | Both **Filed** with ARN; books closed through the month; GST journal for the credit used | happy |
| G3B-004 | Never twice | | G3B-003 | File GSTR-1 again via API | 409 `RETURN_FILED` | validation |
| G3B-005 | Lost answer | | Simulator `loseNext('file')` | File 3B | Settled as filed from the portal's tracker | edge |
| G3B-006 | Filing switched off | | `GST_FILING_ENABLED=false` | Open the screen | Notice to file on the portal; no EVC or File buttons; API 503 `FILING_DISABLED` | edge |
