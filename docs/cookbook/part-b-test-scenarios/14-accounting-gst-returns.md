# 14 — Accounting and GST returns

Tests for:
- the books: postings, vouchers, statements, cost centres, closing the books, and the Tally export;
- TDS, TCS, reverse charge and input credit;
- notes and settling without cash;
- reimbursements, advances for services and MSME;
- GSTR-2B, GSTR-3B, the GST challan and utilization entry, and filing.

Setup and demo data are in [00 — Test setup](00-test-setup.md). The user guide is in [19](../part-a-user-guide/19-books.md), [20](../part-a-user-guide/20-tds-rcm-itc.md) and [21](../part-a-user-guide/21-gst-returns.md). The rule each scenario checks is in [`docs/accounting/RULES.md`](../../accounting/RULES.md).

Portal calls go through the simulated returns provider in development, so 2B, saving and filing results are **[sim]**:
- OTP and EVC code: `575757`.
- Filing needs `GST_FILING_ENABLED=true` on the server. It is off by default and stays off in production until the CA sign-off of RULES.md; test G3B-003 to G3B-005 only on a local or staging server with it turned on.

Banking, fixed assets, budgets and the newer books screens are in [15](15-books-banking-assets.md).

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
| FX-101 | USD account opening | Owner | No USD rate | Add a bank account, **Currency** USD, US$1,000 opening | Refused: "No USD→INR rate on or before …" | validation |
| FX-102 | With a rate | | Rate ₹83 on the 1st | Add it again | Balance ₹83,000 in the trial balance and on **Payment accounts** | happy |
| FX-103 | Edit keeps the currency | | FX-102 | Open the USD account, change its name → **Save** | Still USD; opening US$1,000 | regression |
| FX-104 | Sales plans | Owner / Basic | | **Add account** | No **Currency** field; the account is in INR | plan |
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
| TDS-007 | Prompt for TAN | Owner | No TAN; supplier with 194C | New bill | "Add your TAN in the business profile to deduct TDS on bills…" with **Add TAN** | edge |
| TDS-008 | Lower deduction certificate | | Supplier 194J(b) with a s.197 certificate at 2% valid till next month | Bill ₹1 lakh | TDS at 2%, not 10%; after the valid-till date, 10% | edge |
| TDS-009 | 194Q over ₹50 lakh | | Year's purchases from the supplier ₹49 lakh | Bill ₹3 lakh, 194Q | TDS 0.1% on ₹2 lakh only | edge |
| TDS-010 | TDS on a payment needs a section | Accountant | Bill without TDS | Payment made with **TDS deducted** and no section | "Pick the TDS section to save"; with 194C, it shows in **Form 26Q deductees** and **TDS payable** | validation |
| TDS-011 | Kept back once | | Bill that kept back 194C TDS | Payment to it with TDS deducted under 194C | Refused (TDS already kept back on the bill) | validation |
| TDS-012 | Supplier credit note gives TDS back | | TDS-002 | Supplier credit note for half the bill | TDS payable 194C falls by half at the bill's rate | happy |
| TDS-013 | TDS payable report | | TDS-002, TDS-006 | **Reports › TDS & TCS › TDS payable** | Month deducted, deposited by the challan (oldest first), due by the 7th | happy |
| TDS-014 | Expected TDS on a sales invoice | Owner | Customer (also a supplier) with 194J(b) | Invoice ₹10,000 + 18%, **TDS the customer will deduct** 194J(b) | "TDS expected 194J(b), 10%" = ₹1,000; total stays ₹11,800; nothing posts | happy |
| TDS-015 | Receipt takes the expected TDS | | TDS-014 | Record payment ₹10,800 against it | **TDS deducted** prefilled ₹1,000; invoice paid; TDS receivable 194J(b) ₹1,000 | happy |
| TDS-016 | 26AS match | | TDS-015, and an invoice expecting ₹500 with no TDS recorded | **Reports › TDS receivable › 26AS match** | Rows by TAN or PAN and quarter: expected, recorded, difference ₹500 | happy |
| TCS-001 | TCS on scrap | Owner | Customer with **Collect TCS on sales**, 206C(1) scrap, has PAN | Invoice ₹1,00,000 + 18% | TCS 1% of ₹1,18,000 = ₹1,180 (**TCS collected**); total ₹1,19,180; TCS payable ₹1,180, not sales | happy |
| TCS-002 | No PAN or GSTIN | | Same customer without PAN and GSTIN | Same invoice | TCS at 5% (s.206CC) | edge |
| TCS-003 | Section required | | | Turn on **Collect TCS on sales** with no section → Save | "Pick the TCS section their sales fall under" | validation |
| TCS-004 | Credit note gives TCS back | | TCS-001 | Credit note for half | TCS payable falls by ₹590; **TCS register** shows −₹590 | happy |
| TCS-005 | TCS reports and deposit | Accountant | TCS-001 | **TCS payable**; then a **TDS challan** voucher Dr TCS payable ₹1,180, Cr bank | Collected by section and month, 27EQ quarter rows; challan clears it | happy |
| TCS-006 | Motor vehicle threshold | | Customer under 206C(1F) motor vehicle | Invoice ₹9 lakh, then ₹12 lakh | No TCS, then 1% | edge |
| RCM-001 | GTA from an unregistered supplier | | Supplier marked reverse charge, no GSTIN | Bill ₹10,000 at 5%, dated on or after 1 Nov 2026 | Supplier owed ₹10,000; "Self-invoice SI/…" shown; ₹500 credited to Output CGST/SGST (RULES 2.6), input GST ₹500 when eligible | happy |
| RCM-002 | Before the cutover | | Reverse-charge bill dated 31 Oct 2026 | Trial balance | Tax in *CGST/SGST payable on reverse charge*, not Output | edge |
| RCM-003 | Expense under reverse charge | | | Expense ₹5,000, **Reverse charge**, 18% | "GST under reverse charge (18%)"; paid to supplier ₹5,000; ₹900 to Output; 3B 3.1(d) | happy |
| RCM-004 | RCM never from credit | | RCM-001 and ample input credit | **GST returns** set-off | RCM ₹500 in **In cash**, never from credit | validation |
| RCM-005 | Sale under reverse charge | | | Invoice with **Reverse charge** on | No GST charged; GSTR-1 B2B row flagged reverse charge | edge |
| ITC-001 | 180 days unpaid | | Bill dated 181 days ago, unpaid | Wait for the daily job (or run `itc.reversal180`) | "Input tax credit reversed on …"; notification; Dr *Input tax credit reversed* / Cr Input in the trial balance (RULES 6.22); 3B 4B(2); reclaimed (entry runs back, 3B 4D(1)) once paid | edge |
| ITC-002 | Per-line credit | Owner / Pro | | Bill with three lines: **Eligible**, **Blocked (s.17(5))**, **Capital goods** | Detail shows credit by bucket; the blocked line's GST is in its cost; 3B 4A(5) and 4B(1) | happy |
| ITC-003 | Line choice kept | | ITC-002 | Change a line from Eligible to Not claimable, save, reopen | Stays **Not claimable**, not refilled from the item | edge |
| ITC-004 | Capital goods to the register | | ITC-002 | Bill detail | "Capital goods worth ₹… are in your fixed assets…"; **Add to fixed asset register** opens the asset form | happy |
| ITC-005 | Bill of entry | | Overseas supplier | Bill with bill of entry number, date, port, assessable value, IGST paid at customs ₹18,000 | Input IGST ₹18,000 (Cr *Customs IGST payable*); 3B 4A(1); matched to the 2B import line by number | happy |
| ITC-006 | ISD invoice | | Registered supplier | Bill with **Input Service Distributor invoice** on | Credit in 3B 4A(4), not 4A(5) | edge |
| ITC-007 | Blocked GST in stock cost | | Perpetual stock on | Stock line marked **Blocked** | Stock in hand at taxable value plus GST (RULES 6.27) | edge |

### Notes and settling without cash

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| NTE-001 | Discount credit note | Owner | Issued invoice ₹11,800 | **Sales › Credit notes › New** against it, ₹1,180, reason Discount | Invoice owes ₹10,620; no stock moves; GSTR-1 CDNR row type C | happy |
| NTE-002 | Too much | | NTE-001 | Another note for ₹11,000 | Refused (`NOTE_EXCEEDS_SOURCE`) | validation |
| NTE-003 | Time-barred | | Invoice from FY 2024-25 | Credit note dated after 30 Nov 2025 | Refused (`NOTE_TIME_BARRED`) | validation |
| NTE-004 | Direct note with GST | Owner | | **Credit notes › + › Without an invoice**, **With GST (s.34)**, no original number | Refused until **Original invoice number** and **Original date** are given; then GSTR-1 CDNR with them | validation |
| NTE-005 | Financial note | | | Direct credit note, **Financial note — no GST**, ₹5,000 | No tax on any line; Dr *Discount allowed*; not in GSTR-1 or 3B | happy |
| NTE-006 | Direct note time bar | | | Direct note With GST, original date in FY 2024-25, note dated after 30 Nov 2025 | Refused (`NOTE_TIME_BARRED`) | validation |
| NTE-007 | Note keeps the invoice's rate | | Invoice at 12% | Credit note against it | Lines at 12% | edge |
| NTE-008 | Source picker | | Many invoices | **Credit notes › +**, pick a party, then an invoice; tap twice fast | Only that party's issued invoices; one draft created ("Note draft created") | edge |
| ADJ-001 | Customer deducted TDS | | Invoice ₹11,800 | Record payment ₹11,600 + TDS deducted ₹200 | Invoice paid; TDS receivable ₹200 | happy |
| ADJ-002 | Write-off by a sales user | Sales | | Payment with a write-off | Refused | role |
| ADJ-003 | Apply a direct credit note | Owner / Pro | NTE-005 to Kumar; open invoice | **Money › Adjust advance** → Kumar, **As customer** → pick the note → apply ₹5,000 | "₹5,000 adjusted"; invoice owes less; no GST on advance, nothing posts | happy |
| ADJ-004 | Apply all, oldest first | | Two advances, two invoices | **Apply all, oldest first** | Oldest credit to the oldest document | happy |
| ADJ-005 | Service advance on a goods invoice | | ADV-001; goods-only invoice | Pick the advance → the goods invoice | Warning "This invoice has no service on it…" | edge |

### Reimbursements, advances, MSME

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| RMB-001 | Recover a billable expense | Owner | Expense ₹2,500 billable, bill to Kumar | New invoice to Kumar | Panel lists it; **Add** makes a "Reimbursement at cost" line, no GST, outside taxable value | happy |
| RMB-002 | Recovered twice | | RMB-001 issued | Another invoice with the same expense | 409 `EXPENSE_ALREADY_RECOVERED`; the panel no longer offers it | validation |
| RMB-003 | Credit claimed on it | | Billable expense with eligible GST | Open the panel | Warning about pure-agent credit | edge |
| RMB-004 | Books for a reimbursement | | RMB-001 issued | Trial balance | Expense in *Reimbursements recoverable* and cleared by the invoice; nothing in P&L | happy |
| ADV-001 | Advance for services | | | Record payment ₹11,800 from a customer, no invoices, **Advance for services** 18%, Maharashtra | "GST on the advance: ₹1,800"; GSTR-1 this month 11A ₹10,000 / ₹900 + ₹900 | happy |
| ADV-002 | Invoiced next month | | ADV-001 | Next month: invoice ₹10,000 + 18%, apply the advance | That month's GSTR-1 11B ₹10,000; 3B 3.1(a) carries the invoice less the advance | happy |
| ADV-003 | Paid, not received | | | Payment made with the switch | The switch isn't offered; the API refuses with 422 | validation |
| ADV-004 | Advance receipt menu | Owner / Pro | | **Money › Advance receipt**, ₹11,800, SAC 998314, 18%, place **Not known: another state (IGST)** | Live split IGST ₹1,800; 11A IGST row | happy |
| ADV-005 | Goods SAC refused | | | Advance receipt with HSN 8482 | "That is goods: an advance for goods carries no GST" | validation |
| ADV-006 | TDS on the advance | | | Advance receipt ₹10,620 + **TDS deducted by the customer** ₹1,000 (194J(b)) | Advance ₹11,620 against the customer; TDS receivable 194J(b) ₹1,000 | edge |
| ADV-007 | Refund | | ADV-001 not invoiced | Receipt → **Refund** ₹5,900 | "Advance refunded"; refund voucher; GSTR-1 11B shows the tax taken back this month | happy |
| ADV-008 | Refund too much | | ADV-007 | Refund ₹10,000 | "Only ₹5,900 of the advance is left" | validation |
| MSM-001 | Due dates | | Supplier marked Micro, no standing payment terms | Bills with no due date, a 30-day due date, a 90-day due date | Due in 15, 30 and 45 days (capped) | happy |
| MSM-002 | Report and reminder | | Bill 50 days old, unpaid | **Reports › MSME payments due**; run `msme.reminders` twice | Listed as late with interest; one notification only | happy |
| MSM-003 | 43B(h) list | | Bill paid after its due date in the same FY | Report as of 31 March | Listed under **Not paid in time this year** | edge |
| MSM-004 | Standing terms aren't an agreement | | Micro supplier with 30-day payment terms | Bill whose due date comes from those terms | Due in 15 days (RULES 8.7) | edge |
| MSM-005 | Bank rate setting | Admin | | **Business profile › RBI bank rate (%)** 6.5 | Interest on MSM-002 recalculated at 19.5% a year | edge |

### GSTR-2B, GSTR-3B, filing [sim]

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| G2B-001 | Connect | Owner | GSTIN set | **Settings › GST & e-invoicing › GST portal connection**: username, **Send OTP**, `575757`, **Connect** | "Connected to the GST portal"; "As <user>, renews on its own until <date>." | happy |
| G2B-002 | Not yet made | | Before the 14th | **Download GSTR-2B** | "Not generated yet" (`GSTR2B_NOT_GENERATED`) | edge |
| G2B-003 | Match and claim | | Simulator 2B with matching, differing and unknown lines | **GSTR-2B › Download GSTR-2B**; then **2B reconciliation**: **Accept** the differing one; **Not ours** the unknown; **Claim matched credit** → confirm | Statuses as decided; decisions kept after downloading again; "Credit claimed for the period" | happy |
| G2B-004 | Upload the 2B file | Owner | No portal session | **GSTR-2B › Upload 2B file** → the portal's JSON | "GSTR-2B file read and matched"; totals by status with **All lines in 2B** | happy |
| G2B-005 | Wrong file | | | Upload another GSTIN's or month's 2B; then a random PDF | Refused (`GSTR2B_WRONG_GSTIN` / `GSTR2B_WRONG_PERIOD`); "This is not a GSTR-2B file from the GST portal…" | validation |
| G2B-006 | Dates differ within tolerance | | Tolerance 3 days; 2B line 2 days off a bill, amounts equal | Reconcile | **Matched, dates differ**, claimable without accepting; with tolerance 0 → **Mismatch** "Differs in date" | edge |
| G2B-007 | Link to a bill | | A **Not in your books** line whose bill has another number | **Link to a bill** → pick it | **Linked by you**; claimable | happy |
| G2B-008 | Add the bill | | **Not in your books** line | **Add the bill** | New bill filled from the line | happy |
| G2B-009 | Chase suppliers | | A bill in the period not in 2B | **Ask the suppliers** | Share sheet with the list and the chase message | happy |
| G2B-010 | Credit not available | | 2B line marked ITC unavailable | Claim | "credit not available"; never claimed | edge |
| G2B-011 | Plan | Owner / Basic | Aurora | Open `/gst/gstr2b` | Upgrade page; not in the GST tab | plan |
| G2B-012 | Sales role | Sales | | Open GSTR-2B | Refused by the server | role |
| G2B-013 | Disconnect | Owner | G2B-001 | **Disconnect** → confirm | "Disconnected from the GST portal"; **Not connected** | happy |
| G3B-001 | 3B and set-off | | G2B-003 | **GST › GST returns** | Tables from the books; set-off uses credit before cash, never CGST for SGST; reverse charge in cash | happy |
| G3B-002 | 3B before GSTR-1 | | 3B saved and set off | **File the return** on 3B | "File the period's GSTR-1 first." | validation |
| G3B-003 | File both | | | GSTR-1: save, freeze, EVC, file; then 3B: save, set off, EVC, file | Both **Filed** with ARN; books closed through the month; GST journal for the credit used | happy |
| G3B-004 | Never twice | | G3B-003 | File GSTR-1 again via API | 409 `RETURN_FILED` | validation |
| G3B-005 | Lost answer | | Simulator `loseNext('file')` | File 3B | Settled as filed from the portal's tracker | edge |
| G3B-006 | Filing switched off | | `GST_FILING_ENABLED=false` (the default), portal connected | Open **GST returns**; save GSTR-1 and freeze it | "Filing through the app is not switched on yet. Save the returns here, then file them on the GST portal…"; **Save to the portal** and **Freeze for filing** work; no **Send the EVC**, **EVC code** or **File the return**; file via API → 503 `FILING_DISABLED` | edge |
| G3B-007 | Without a portal session | Owner / Basic | Not connected | **GST returns** | "Worked out from your books. Connect the GST portal to save and file it."; no save buttons | happy |
| G3B-008 | No GSTIN | | Business without GSTIN | **GST returns** | **No GSTIN yet** with a **Business profile** link | edge |
| G3B-009 | Detailed sheet and exports | | | **Detailed sheet** → **Export Excel**, **Export PDF**, **Export CSV** | Every portal row 3.1–6.1 (3.1.1 and 4D(2) nil) and the credit utilisation matrix; files download | happy |
| G3B-010 | Breakup | | | Tap **3.1(a) · N** | "What makes up 3.1(a)": documents, expenses and advances adding up to the row | happy |
| G3B-011 | Late fee cap | | Turnover ₹1.4 crore, period 60 days past due | Open | Late fee capped at ₹1,000 + ₹1,000; interest 18% on cash tax | edge |
| G3B-012 | Viewer | Viewer | | Open GST returns | Refused by the server | role |
| G3B-013 | Edit after GSTR-1 filed | Owner | GSTR-1 for the month filed | Open its latest invoice | "Can't edit: its GSTR-1 month is filed" | validation |
| G3B-014 | Filing calendar | | | Home; 🖥 sidebar | **Filing calendar** with GSTR-1, GSTR-3B, TDS deposit (and IFF, PMT-06 under QRMP); **Next filing** card | happy |
| UTL-001 | Record a GST challan | Accountant / Pro | Bank holds ₹50,000 | **GST › GST challan**: bank, CPIN 14 chars, paid on, CGST tax ₹10,000, SGST tax ₹10,000 → **Record challan** | "Challan recorded"; GST cash ledger CGST/SGST ₹10,000 each; bank down ₹20,000 | happy |
| UTL-002 | Challan checks | | | CPIN of 10 chars; then no amounts; then a future date | "The CPIN has 14 letters and digits"; "Enter what was paid under at least one head"; date refused | validation |
| UTL-003 | Set off a period | | UTL-001; 3B liability with credit short of it | **GST › Utilization entry**, period, date after month end → **Post set-off** | Prefilled in rule 88A order; "Set-off posted"; GST journal Dr Output / Cr Input and Cr GST cash ledger | happy |
| UTL-004 | Cash ledger short | | Cash ledger empty | Post set-off with cash due | "The GST cash ledger holds too little. Record a challan first."; API `CASH_LEDGER_SHORT` | validation |
| UTL-005 | Once a period | | UTL-003 | Post again | **Already set off**; API `SET_OFF_EXISTS`; **Reverse** → "Set-off reversed", then post afresh | validation |
| UTL-006 | Rules on edits | | | Move CGST credit to SGST; put RCM against credit | Refused; "Reverse charge of ₹… is paid in cash, in full." | validation |
| UTL-007 | Challan in use | | UTL-003 | Delete the challan voucher | Refused (`CHALLAN_USED`) until the set-off is reversed | validation |
| UTL-008 | Output mismatch | | A manual GST journal to Output CGST in the month | Open Utilization | "Output tax in the books does not match the return" with the difference | edge |
| UTL-009 | Filing doesn't double | | UTL-003 then G3B-003 | Trial balance | One set-off journal only | edge |
| UTL-010 | GST journal menu | Accountant | | **GST › GST journal** | Voucher form of kind GST journal; a line off the GST ledgers is refused | happy |
| UTL-011 | Plan | Owner / Basic | Aurora | Open `/gst/utilization` | Upgrade page | plan |
