# 19 — Books: accounts, vouchers, statements

The app keeps a double-entry ledger worked out from everything you record. Every invoice, bill, note, payment, expense and voucher posts to accounts. The trial balance, profit and loss, balance sheet and day book are read from those postings. The postings are not stored: the app and the server work them out with the same code, so they agree once synced, and the books work offline.

- **Plan:** full plans (Pro and Business).
- **Roles:**
  - Reading the books: every role.
  - Adding accounts, cost centres and vouchers: **owner, admin or accountant**.
  - Closing and reopening the books: **owner** only.
- **Branches:** the books cover every branch. A user limited to some branches sees the branch reports instead.

Where to find it: **More › Books**. 🖥 **Books** in the sidebar.

---

## How things post

| You record | Debit | Credit |
|---|---|---|
| Invoice | Customer | Sales, output GST, charges recovered, reimbursements recovered |
| Purchase bill | Purchases (or fixed assets for capital goods), input GST you can claim | Supplier; TDS payable when you kept TDS back; GST payable on reverse charge |
| Credit or debit note, return | The reverse of its invoice or bill | |
| Payment received | Cash or bank; TDS receivable, discount allowed, bad debts for adjustments | Customer |
| Payment made | Supplier | Cash or bank; discount received |
| Expense | Its expense category, input GST you can claim | The account it was paid from |
| Voucher | As entered | As entered |

- **Stock** is valued periodically, as in Tally. Purchases go to *Purchases*, and profit uses opening stock + purchases − closing stock. Closing stock is the stock ledger's weighted-average value on the day.
- **Credit you can't claim** (blocked under s.17(5), or ineligible) is added to the cost; it never reaches input GST.
- **Opening balances** of customers, suppliers, cash and bank, and your own accounts all sit at the start of the books. Whatever doesn't balance goes to *Opening balances* under capital.
- **A foreign-currency account's** opening balance is counted in rupees at the rate on its opening date, taken from **Currencies & rates**. Saving such an account needs a rate on or before that date.

## Chart of accounts

**Books › Chart of accounts** lists every account by group with its balance today (Dr or Cr):
- **System accounts** such as Sales, Output CGST, TDS payable and Round off appear once something posts to them.
- **Parties, cash and bank accounts and expense categories** are accounts too.
- **Your own accounts:** tap **Add account** for one of your own, such as a loan from a director, rent deposit or machinery. Give it a name, a group, and an opening balance (debit positive). Long-press one of your own to edit it. An account a voucher uses can't be deleted; mark it inactive.

Tap any account for its statement: every posting with a running balance.

## Vouchers

**Books › Journal and contra › New**:

| Kind | Use it for | Rule |
|---|---|---|
| **Journal** | Any adjustment: depreciation, provisions, corrections | Debits equal credits |
| **Contra** | Cash deposited in the bank, cash withdrawn | Cash and bank accounts only |
| **GST journal** | Adjusting the GST ledgers | Must touch a Duties & Taxes account |
| **TDS challan** | TDS you kept back, paid to the government | Debits TDS payable, credits cash or bank |

- Each line has an account, a debit or a credit, and optionally a cost centre.
- The last line offers a button that balances the voucher.
- A voucher can't take more out of a cash or bank account than it holds.
- A voucher can't be dated in a closed period.

## Cost centres

**Books › Cost centres** holds projects, departments or sites. Each centre has a name, a kind (for example "Project") and, optionally, a parent centre.

Once you have one, a **Cost centre** field appears on invoices and bills, on expenses, and on each voucher line. **Books › Cost centres › Profit by cost centre** then shows each centre's income, expenses and profit for a period, and what makes it up.

- **Stock isn't split by cost centre**, so the rows add up to profit before the change in stock.
- **The whole document goes to one cost centre:** an invoice or bill can't be split across centres line by line; journal lines can.
- **Deleting:** a centre in use, or with centres under it, can't be deleted. Mark it inactive instead.

## Statements

| Screen | What it shows |
|---|---|
| **Trial balance** | Every account's opening, debits, credits and closing for a period. Debits equal credits. |
| **Profit and loss** | The trading account (sales, purchases, direct costs, stock), gross profit, then indirect income and expenses, and net profit |
| **Balance sheet** | Assets against liabilities and capital as of a date. This year's profit is shown under capital; earlier years' under *Profit and loss of earlier years*. |
| **Day book** | Every entry, day by day, as postings |

Each one can be exported from its screen.

## Close the books

**Books › Close the books** (owner only):
1. Pick **Close through**, usually the last day of a filed month or the audited year.
2. Tap **Close the books**.

Nothing dated on or before that day can then be added, changed or removed: invoices, bills, notes, payments, expenses and vouchers. Trying it gives `PERIOD_LOCKED`.

- **Filing GSTR-3B through the app closes its month on its own** ([21](21-gst-returns.md)).
- **Reopen the books** clears the close. Anything you then change may no longer match what was filed or audited.

## Export for Tally

**More › Settings › Backup & export › Tally XML** writes the books for import into Tally Prime:
- **Ledger masters:** one for every account, under Tally's own groups (Sundry Debtors, Duties & Taxes, Bank Accounts…). Each carries its GSTIN and state, and its opening balance as at the start of the range.
- **Vouchers:** every sale, purchase, credit and debit note, receipt, payment, contra and journal in the range. Each voucher balances, and the voucher numbers are the app's.

In Tally, use **Import › Masters** and **Import › Transactions** with the same file. The trial balance in Tally should then equal the app's.

---

**Related:** [20 TDS, reverse charge, credit and adjustments](20-tds-rcm-itc.md) · [21 GST returns](21-gst-returns.md) · [12 Reports](12-reports.md)
