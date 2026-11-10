# 15 — Books, banking, fixed assets, budgets and imports

Tests for:
- the books screens added or changed since the last pass: chart of accounts, vouchers, drafts, templates, statements, integrity, stock in the books;
- payment accounts, transfers and bank reconciliation;
- the fixed asset register;
- budgets and the cash-flow forecast;
- every import, and opening balances.

The earlier book scenarios (`BKS-001`–`BKS-010`, `CC-`, `CLS-`, `TLY-`) are in [14](14-accounting-gst-returns.md). The user guide is in [19](../part-a-user-guide/19-books.md), [22](../part-a-user-guide/22-banking-and-reconciliation.md), [23](../part-a-user-guide/23-fixed-assets.md), [24](../part-a-user-guide/24-budgets-and-forecasts.md) and [26](../part-a-user-guide/26-imports-and-opening-balances.md). Rule numbers refer to [`docs/accounting/RULES.md`](../../accounting/RULES.md).

Default: owner, **Vertex Traders**, Smart Pro, online. Payment accounts: Cash in hand, HDFC Current — 8842, ICICI Current — 3310, UPI wallet.

- **Accountant tests:** Meera is limited to the Mumbai branch, so she can't open the statements (`BOOKS_ALL_BRANCHES`). For accountant tests of statements, budgets against actual and the forecast, give an accountant every branch first.
- **The QA seed has no bank statements, fixed assets or budgets.** Each scenario makes its own.
- **Bank statement CSV** for BNK/REC tests (HDFC, oldest first):

```
Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
02/11/2026,NEFT CR SUNRISE RETAIL UTR123456,UTR123456,,11800.00,511800.00
03/11/2026,BANK CHARGES,,236.00,,511564.00
04/11/2026,INTEREST CREDIT,,,450.00,512014.00
05/11/2026,CHQ 000771 PRECISION COMPONENTS,000771,25000.00,,487014.00
```

### Books

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| BKS-011 | Books hub | Owner | | 📱 **More › Money › Books**; 🖥 **Money › Books** | Nine entries: Chart of accounts, Journal and contra, Cost centres, Trial balance, Profit and loss, Balance sheet, Day book, Integrity check, Close the books | happy |
| BKS-012 | Money pages | Owner | | Open the **Money** section | Under Accounts: Accounts & P&L, Books, Bank reconciliation, Cash-flow forecast, Fixed assets, Budgets, Cost centres; Transfer under Cash flow | happy |
| BKS-013 | Books switched off | Owner | **Settings › Modules**, turn Books off | Open the Money section | Books, reconciliation, fixed assets, budgets, forecast and transfer are gone; `/books` opens the upgrade or unavailable page | plan |
| BKS-014 | Branch-limited user | Accountant (Meera, Mumbai only) | | **Books › Trial balance** | "The books cover every branch; ask an owner or admin" (403 `BOOKS_ALL_BRANCHES`) | role |
| BKS-015 | Add an account with a Cr opening | Owner | | **Chart of accounts › Add an account**: "Loan from HDFC", group Loans, ₹2,00,000, **Credit (Cr)** | **Account saved**; under Liabilities › Loans with **Added by you**; trial balance still balances via *Opening balances* | happy |
| BKS-016 | Dated opening | Owner | | Add "Rent deposit", Loans and advances, ₹50,000 Dr, **Opening balance as on a date** = 1 Oct 2026 | Trial balance for Apr–Sep doesn't show it; Oct–Nov shows it as opening | edge |
| BKS-017 | Future opening date | Owner | | Try an **As on** date after today | Date picker doesn't allow it; API refuses "The opening balance date cannot be in the future" | validation |
| BKS-018 | Duplicate account name | Owner | BKS-015 | Add another "Loan from HDFC" | Refused: "There is already an account called Loan from HDFC" | validation |
| BKS-019 | Group locked once used | Owner | Journal posted to Loan from HDFC | Edit it, change group to Capital | Refused (409 `ACCOUNT_GROUP_LOCKED`) | validation |
| BKS-020 | Party groups not offered | Owner | | Open **Group** in the add sheet | Sundry debtors, Sundry creditors and Stock in hand are not listed | edge |
| BKS-021 | Account statement | Viewer | | Tap HDFC Current in the chart | Opening, postings with running balance, closing, **Balance trend**; **Reconcile with the bank statement** button | happy |
| BKS-022 | Save a draft | Accountant (all branches) | | **New voucher › Journal**, one line Dr Rent ₹1,000 only, **Save as draft** | **Draft saved**; listed as **Draft voucher** with **Draft** badge; trial balance unchanged | happy |
| BKS-023 | Post a draft | | BKS-022 | Add Cr Cash ₹1,000, save, open it, **Post** | **Voucher posted**; takes the next number; Rent and Cash move | happy |
| BKS-024 | Post an unbalanced draft | | Draft with Dr ₹1,000, Cr ₹900 | **Post** | Refused (`VOUCHER_UNBALANCED`); stays a draft | validation |
| BKS-025 | Posted can't go back to draft | | A posted journal | API: save it with status draft | 422 "A posted voucher cannot go back to draft…" | validation |
| BKS-026 | Draft filter | | BKS-022 and a posted voucher | **Drafts**, **Posted**, **All** | Each shows only its kind | happy |
| BKS-027 | Short side shown | | | Journal Dr ₹500, Cr ₹300 | "Credits short by ₹200"; **Add a line** adds a Cr line; **Save voucher** disabled | happy |
| BKS-028 | Template | | | Journal Rent / Cash, **Save as template** "Monthly rent"; next **New voucher › Use a template** | **Template saved**; the template fills kind, accounts and sides | happy |
| BKS-029 | Kind can't change | | A posted contra | API: save it as journal | 422 "A voucher keeps its kind…" | validation |
| BKS-030 | Move to another FY | | Posted voucher dated 2026-27 | Edit, date 31 Mar 2026 | Refused (`VOUCHER_YEAR_LOCKED`) | validation |
| BKS-031 | Earlier years' profit by accountant | Accountant | | Journal Dr Profit and loss of earlier years / Cr Capital, **Save voucher** | Refused (403 `RETAINED_EARNINGS_ROLE`); **Save as draft** works | role |
| BKS-032 | Earlier years' profit needs narration | Owner | | Same journal with no narration | "Say why earlier years’ profit changes: add a narration" | validation |
| BKS-033 | Books-only accounts | Owner | | Journal: look for Stock in hand, Accumulated depreciation, Goods received not billed; API post to `sys:accumulatedDepreciation` | Not offered; API refuses "…is worked out by the books" | validation |
| BKS-034 | TDS challan details | Owner | TDS payable ₹1,000 | **TDS challan**, BSR "12345", serial 1 | "A BSR code has 7 digits and a challan serial up to 5" | validation |
| BKS-035 | Delete a voucher | Owner | Posted journal | **Delete voucher**, confirm | **Voucher removed**; postings gone from the day book | happy |
| BKS-036 | P&L by month | Owner | Demo data | **Profit and loss**, **Monthly** | One column per month; export has the same columns | happy |
| BKS-037 | Balance sheet vs last year | Owner | | **Balance sheet**, **vs last year** | Two columns and **Change**; sides agree in each | happy |
| BKS-038 | Balance sheet month ends | Owner | | **Balance sheet** view picker | Shows **Month ends** and **Quarter ends** instead of Monthly/Quarterly | edge |
| BKS-039 | Integrity check | Owner | Demo data | **Integrity check**, this FY | **Everything agrees**; six checks each **Agrees** | happy |
| BKS-040 | Day book | Viewer | | **Day book**, this month | Every entry with debits and credits; export works | happy |
| BKS-041 | Turn on perpetual stock | Owner | Periodic, books open | **Close the books › Keep stock perpetually · 1 Apr 2026**, confirm | **Stock is perpetual from 01 Apr 2026**; P&L shows Cost of goods sold; integrity **Stock ledger matches stock in hand** agrees | happy |
| BKS-042 | Back to periodic | Owner | BKS-041 | **Go back to periodic** | **Stock is periodic again**; P&L shows opening and closing stock | happy |
| BKS-043 | Perpetual not at year start | Owner | | API: set perpetualStockFrom to 15 Apr 2026 | 422 `PERPETUAL_NOT_YEAR_START` | validation |
| BKS-044 | Costing with a closed period | Owner | Books closed through 31 Oct | Change **Stock costing** | "Stock costing values every period's stock, so it can be changed only while no period is closed." | validation |
| BKS-045 | FIFO | Owner | Books open; item bought 10 @ ₹100 then 10 @ ₹120, sold 12 | **First in, first out**, confirm | **Stock is costed first in, first out**; cost of goods sold ₹1,240 (10×100 + 2×120) | happy |
| BKS-046 | Not an owner | Admin | | **Close the books** | Close, perpetual and costing controls hidden; "Only an owner can close or reopen the books." | role |
| BKS-047 | Purchase line cost centre | Owner | Two cost centres | Bill with a service line on centre B, bill centre A | **Profit by cost centre**: that line's purchase cost under B | happy |
| BKS-048 | Offline | Owner | Network off | Open a voucher form | Save buttons greyed out; nothing saved | edge |

### Payment accounts and transfers

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| BNK-001 | Add a bank account | Accountant | | **Payment accounts › Add account**, Bank, "Axis Current", number 4455, opening ₹10,000 | **Account added**; Cash and bank balance up ₹10,000; listed under Bank accounts in the chart | happy |
| BNK-002 | Dated opening | Owner | | Add a cash account with **Balance as on a date** = 1 Nov 2026 | Saved; a future date can't be picked | edge |
| BNK-003 | In-use account | Owner | HDFC has payments | Edit HDFC | Type locked; "This account has payments or expenses, so its type can’t change and it can’t be deleted."; no Delete | validation |
| BNK-004 | Viewer | Viewer | | Try **Add account** | Refused by the server | role |
| BNK-005 | On invoices badge | Owner | **Business profile › Bank & signature › Account in your books** = HDFC | Open Payment accounts | HDFC shows **On invoices** | happy |
| BNK-006 | Transfer | Owner | Cash ≥ ₹5,000 | **Money › Transfer**, Cash → HDFC ₹5,000 | **Transfer recorded**; contra "Transfer from Cash in hand to HDFC Current" in **Recent transfers** | happy |
| BNK-007 | Same account | Owner | | From and To both HDFC | "Pick two different accounts"; the To list leaves out the From account | validation |
| BNK-008 | More than it holds | Owner | Cash ₹1,000 | Transfer ₹5,000 from Cash | Refused (`INSUFFICIENT_BALANCE`) | validation |
| BNK-009 | All contras | Owner | BNK-006 | **All contra vouchers** | Voucher list titled "Journal and contra · Contra", contras only | happy |
| BNK-010 | Sales plan | Owner / Basic | | Open `/books/transfer` | Upgrade page | plan |

### Bank reconciliation

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| REC-001 | Accounts list | Owner | | **Money › Bank reconciliation** | HDFC and ICICI only (no cash or wallet), each "No statement imported yet" | happy |
| REC-002 | No bank accounts | Owner | New business with only cash | Open it | **No bank accounts yet**, **Open payment accounts** | edge |
| REC-003 | Import a CSV | Accountant | Payment received ₹11,800 from Sunrise Retail on 2 Nov, reference UTR123456 | HDFC › **Import statement**, the CSV above, map columns, **Check**, **Import 4 lines** | Dry run "4 new, 0 already imported, 1 will match on their own"; **4 lines imported**; the ₹11,800 line on **Matched** | happy |
| REC-004 | Same file again | Accountant | REC-003 | Import it again | "0 new, 4 already imported"; each row **Already imported**; nothing added | edge |
| REC-005 | Excel | Owner | Statement saved as .xlsx | Import it | Rows read by the server; same flow | happy |
| REC-006 | Wrong file | Owner | | Choose a .pdf | "That kind of file can't be imported here. Use .csv, .xlsx." | validation |
| REC-007 | Too large | Owner | 6 MB CSV | Choose it | "The file is too large. It can be at most 5 MB." | validation |
| REC-008 | No amount column | Owner | | Map no debit, credit or amount | "Choose an amount column, or a debit or credit column." | validation |
| REC-009 | Bad amount | Owner | A row with "abc" as withdrawal | Check | That row **Left out**: "Can't read the amount "abc"" | validation |
| REC-010 | Day-first dates | Owner | | Import 03/04/2026 | Read as 3 April 2026 | edge |
| REC-011 | Account summary | Owner | REC-003 | Back to the list | HDFC: "3 to explain, 1 matched, 0 excluded · Bank balance ₹4,87,014.00 on 05 Nov 2026"; **3 to explain** badge | happy |
| REC-012 | Match a suggestion | Owner | Payment made ₹25,000 to Precision Components on 5 Nov, no reference | On the cheque line tap the likely match | **Matched**; line moves to Matched | happy |
| REC-013 | Find | Owner | | **Find…** on a line; search "Precision" | Payments, expenses and vouchers on HDFC within a month; one with another amount says "Only the same amount can be matched" | happy |
| REC-014 | Record payment with allocation | Accountant | Sunrise has two open invoices ₹10,000 and ₹5,000; a ₹12,000 credit line | **Record payment**, customer Sunrise Retail | Oldest invoice ticked ₹10,000, the next ₹2,000 ("₹2,000 of ₹5,000 due"); **Record and match** → **Payment received recorded and matched** | happy |
| REC-015 | Left over as advance | Accountant | Customer with no open invoices | **Record payment** on a ₹5,000 credit | "₹5,000 left over is held as an advance from the customer" | edge |
| REC-016 | Wrong side party | Owner | | API: payment from a credit line with a supplier-only party | 422 "Money came in: … needs to be a customer" | validation |
| REC-017 | Record expense | Accountant | | Bank charges ₹236 line › **Record expense**, category Bank charges | **Expense recorded and matched**; expense dated 3 Nov from HDFC | happy |
| REC-018 | Expense on money in | Owner | | API: expense from the interest line | 422 `NOT_MONEY_OUT` | validation |
| REC-019 | Record to an account | Accountant | | Interest ₹450 › **Record to an account**, Credit to "Interest received" | **Voucher recorded and matched**; a receipt voucher on 4 Nov | happy |
| REC-020 | Record to cash | Owner | | API: voucher from a line to a cash account | 422 `CONTRA_NOT_HERE` | validation |
| REC-021 | Exclude and include | Owner | | **Exclude** a line, reason "Reversal"; then **Excluded › Include** | **Line excluded**, shows "Reversal"; then **Line back in To explain** | happy |
| REC-022 | Unmatch | Owner | REC-012 | **Matched**, **Unmatch**, confirm | "Match undone; the line is back in To explain"; the payment stays | happy |
| REC-023 | Double match | Owner | REC-012 | API: match the same payment to another line | 409 `ALREADY_MATCHED` | validation |
| REC-024 | Edited record unmatches | Owner | REC-012 | Edit that payment to ₹24,000 | Its line is back in **To explain** | edge |
| REC-025 | Contra on both banks | Owner | Contra HDFC → ICICI ₹10,000; both statements imported with that line | Match on each account | Both lines can match the same contra | edge |
| REC-026 | Reconciliation agrees | Owner | Every line matched or excluded | **Reconciliation** tab, as of 5 Nov | **Difference**: **Nil, they agree** | happy |
| REC-027 | Reconciliation differs | Owner | One line still to explain | Same | Book side lists it under Add/Less: …not yet in the books; difference shown | happy |
| REC-028 | No running balance | Owner | Statement without the balance column | **Reconciliation** | "The statement has no running balance, so the bank side can't be totalled…" | edge |
| REC-029 | Export | Owner | REC-026 | **Export CSV** | File "Bank reconciliation HDFC Current 2026-11-05" with section, date, details, amount | happy |
| REC-030 | Undo import | Owner | REC-003 | **Imports › Undo import**, confirm | **Import undone**; its lines gone; the payments, expense and voucher remain and can be matched again | happy |
| REC-031 | Undo an earlier overlapping import | Owner | Two imports over overlapping days | Undo the first | 409 `LATER_IMPORT_OVERLAPS`; undo the later one first | validation |
| REC-032 | Viewer | Viewer | REC-003 | Open lines | Lines and reconciliation visible; no match, record or exclude actions | role |
| REC-033 | Sales plan | Owner / Basic | | Open Bank reconciliation | Upgrade page | plan |
| REC-034 | Big statement | Owner | CSV of 3,000 lines over three months | Import | Sent in parts; **Imports** shows "file (1/N)"…; counts add up | edge |

### Fixed assets

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| FA-001 | From a bill | Accountant | Finalised bill from Apex Steel Works, line "Lathe" ₹1,20,000 + GST marked **Capital goods** | Open the bill › **Add to fixed asset register** | Form filled: name Lathe, cost ₹1,20,000, bill date, "Bought on bill …"; **Add asset** → **Asset added to the register** | happy |
| FA-002 | Prompt goes | | FA-001 | Reopen the bill | No add-to-register prompt | edge |
| FA-003 | Straight line | Owner | Asset cost ₹1,20,000, residual 0, 5 years, in use 1 Apr 2026 | Open it on 10 Nov | Written off to 31 Oct about ₹14,000 (by the day); day book shows **Fixed asset** entries each month end: Dr Depreciation, Cr Accumulated depreciation | happy |
| FA-004 | Written down value | Owner | Cost ₹1,00,000, WDV 15%, in use 1 Apr 2026 | **Depreciation by year** | 2026-27 depreciation ₹15,000 at year end, worked by days | happy |
| FA-005 | Brought forward | Owner | | Add by hand, **Bought before the books began here**, written off ₹40,000 as of 31 Mar 2026 | Dr Opening balances / Cr Accumulated depreciation ₹40,000 on that day; depreciates from 1 Apr | happy |
| FA-006 | Validation | Owner | | Put to use before acquired; cost 0; WDV rate 120; residual ≥ cost | "It is put to use on or after…", "Enter what it cost", "Enter a rate from 0 to 100"; server refuses residual | validation |
| FA-007 | Wrong account | Owner | | API: asset with account Rent | 422 "Choose a fixed-asset account…" | validation |
| FA-008 | Duplicate code | Owner | Asset PM-001 | Another with PM-001 | 422 "Another asset is PM-001" | validation |
| FA-009 | Dispose | Owner | FA-003 | **Edit**, **Disposed of** on 10 Nov, "Sold for ₹90,000" | **Asset saved**; under **Disposed of**; cost and depreciation leave the books; book value to *Profit or loss on assets sold* | happy |
| FA-010 | Future disposal | Owner | | Disposal date after today | Not pickable; API "A disposal is recorded once it has happened" | validation |
| FA-011 | Remove | Owner | An asset | **Remove from register**, confirm | **Asset removed from the register**; depreciation gone; cost still in Plant and machinery | happy |
| FA-012 | Closed period | Owner | FA-003; books closed through 31 Oct | Change useful life | 409 `PERIOD_LOCKED` "…this changes the asset's depreciation from …" | validation |
| FA-013 | Schedule | Viewer | FA-001, FA-009 | **Fixed asset schedule**, this FY | Cost: Bought, Disposed of; depreciation For the period, On disposals; totals; export | happy |
| FA-014 | Viewer can't add | Viewer | | **Add asset** | Refused by the server | role |
| FA-015 | Filter | Owner | Active and disposed assets | **In use**, **Disposed of**, **All** | Totals of Cost, Written off, Book value follow the filter | happy |

### Budgets and cash-flow forecast

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| BUD-001 | Make a budget | Accountant | | **Budgets › New budget**, "Budget 2026-27", Sales ₹1,20,00,000, Rent ₹6,00,000 | **Budget saved**; Sales ₹10,00,000 a month | happy |
| BUD-002 | Month by month | Owner | BUD-001 | **Set month by month**, October Sales ₹20,00,000 | Saved; the year total follows | happy |
| BUD-003 | Even spread to the paisa | Owner | | Annual ₹100.00 | Months 8.34 ×4, 8.33 ×8 | edge |
| BUD-004 | Duplicate name | Owner | BUD-001 | Another "Budget 2026-27" | "There is already a budget called Budget 2026-27" | validation |
| BUD-005 | Non-P&L account | Owner | | API: budget line on HDFC | 422 "…isn't an income or expense account" | validation |
| BUD-006 | Against actual | Owner | BUD-001, demo sales | Open the budget, this FY | Income, Expenses, Profit tiles actual / planned; table with Planned, Actual, Difference, Of plan; period counted to today | happy |
| BUD-007 | Part month | Owner | BUD-001 | Period 1–15 Nov | November planned at 15/30 | edge |
| BUD-008 | Delete | Owner | BUD-001 | **Edit budget › Delete budget**, confirm | **Budget deleted**; books unchanged | happy |
| BUD-009 | Branch-limited | Accountant (Meera) | BUD-001 | Open the budget | Refused (`BOOKS_ALL_BRANCHES`) | role |
| CF-001 | Forecast | Owner | Demo data | **Money › Cash-flow forecast**, 13 weeks | Cash and bank today; weekly rows "In … · out …"; **Cash on [date]** | happy |
| CF-002 | Week detail | Owner | | Tap a week | **To receive**, **To pay**, **Recurring invoice**, **Recurring expense** rows; overdue in week one marked **overdue** | happy |
| CF-003 | Shortfall | Owner | A large bill due next week, little cash | Open | **Runs short in the week from …**; closing red | edge |
| CF-004 | Horizons | Owner | | 4 and 26 weeks | Rows follow | happy |
| CF-005 | Sales role | Sales | | Open it | Refused (403); error state | role |

### Imports and opening balances

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| IMP-001 | Journal import | Accountant | | **Journal and contra › Import**, paste the sample in [26](../part-a-user-guide/26-imports-and-opening-balances.md#import-journals) | "1 journals, 1 ready"; **Check**, **Import 1 journal** → **1 journal imported** | happy |
| IMP-002 | Same sheet twice | | IMP-001 | Import again | "Already in the books as JV/…; change its narration to import it again" | validation |
| IMP-003 | Unknown account | | | Row with account "Rentt" | **Needs fixing**: no account called "Rentt" | validation |
| IMP-004 | Unbalanced as drafts | | | Dr 100 / Cr 90, **Keep as drafts** on | Imported as a draft | edge |
| IMP-005 | No Date column | | | Sheet without Date | "The sheet needs Date and Account columns." | validation |
| IMP-006 | Over 500 | | 501 journals | Paste | "Up to 500 journals at a time."; import disabled | validation |
| IMP-007 | Shared balance | | Cash ₹1,000 | Two journals each crediting Cash ₹800 | The second refused (`INSUFFICIENT_BALANCE`) | edge |
| IMP-008 | Contacts import | Owner | | **Contacts › Import**, CSV with Name, GSTIN, Opening balance | **N contacts imported**; existing ones **Already there** | happy |
| IMP-009 | Items import | Owner | | **Items & services › Import**, CSV with Name, GST %, Opening stock | **N items imported** | happy |
| OPN-001 | Import outstanding | Accountant | Customer "Metro Mart" with no opening balance | **Receivables › Import outstanding**, Owed to us; rows MM/101 ₹20,000 and MM/102 ₹5,000 | Dry run "2 ready, 0 already imported, 0 to fix"; **2 imported**; in aging; trial balance: Metro Mart Dr, Opening balances Cr | happy |
| OPN-002 | Not in sales or GST | | OPN-001 | Sales register and GSTR-1 | The opening invoices aren't there | edge |
| OPN-003 | Pay one | | OPN-001 | Record a payment from Metro Mart ₹20,000 | Allocates to MM/101 like any invoice | happy |
| OPN-004 | Party has an opening | | Customer with an opening balance | Import a row for them | "…already has an opening balance; clear it, or leave these rows out" | validation |
| OPN-005 | Unknown or ambiguous party | | | Row with an unknown name; then a name two contacts share | "No contact …; add it first…"; "More than one contact is called …; give the GSTIN" | validation |
| OPN-006 | Wrong side | | | Supplier name under Owed to us | "… is not a customer" | validation |
| OPN-007 | Again | | OPN-001 | Import the same file | Rows **Already imported** | edge |
| OPN-008 | Closed period | | Books closed through 31 Oct | Row dated 15 Oct | "The books are closed through …" | validation |
| OPN-009 | Sales plan | Owner / Basic | | **Receivables › Import outstanding** | Upgrade page | plan |
| OPN-010 | Opening balances line | Owner | Openings entered for parties, cash, bank, own accounts | **Trial balance** on day one | Balances; the difference sits in *Opening balances* | happy |
