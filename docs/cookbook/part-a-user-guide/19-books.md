# 19 — Books: accounts, vouchers, statements

The app keeps a double-entry ledger worked out from everything you record. Every invoice, bill, note, payment, expense, voucher and fixed asset posts to accounts. The trial balance, profit and loss, balance sheet and day book are read from those postings. The postings are not stored: the app and the server work them out with the same code, so they always agree (RULES 6.1).

- **Plan:** full plans (Pro and Business). On Free and Basic, opening any Books page takes you to the upgrade page. An owner can also switch Books off under **Settings › Modules**; its pages are then hidden.
- **Roles:**
  - Reading the books: every role, if they can see every branch (see below).
  - Adding accounts, cost centres, vouchers and voucher templates: **owner, admin or accountant**.
  - Posting to *Profit and loss of earlier years*: **owner or admin** only (an accountant can save it as a draft).
  - Closing and reopening the books, perpetual stock and stock costing: **owner** only.
  - The Tally export: **owner or admin**.
- **Branches:** the books cover every branch. A user limited to some branches can't open the statements; they see "The books cover every branch; ask an owner or admin" and use the branch reports in [12](12-reports.md) instead.
- **Online only:** every change is saved straight to the server. The buttons are greyed out while you are offline.

Where to find it: 📱 **More › Money › Books**. 🖥 **Money › Books** in the sidebar.

The **Books** page lists: **Chart of accounts**, **Journal and contra**, **Cost centres**, **Trial balance**, **Profit and loss**, **Balance sheet**, **Day book**, **Integrity check** and **Close the books**. The other pages under **Money › Accounts** have their own chapters:

| Page | Chapter |
|---|---|
| **Accounts & P&L** (profit, cash movement and GST position for a period) | [04 Home dashboard](04-home-dashboard.md) |
| **Bank reconciliation**, **Transfer**, payment accounts | [22 Banking & reconciliation](22-banking-and-reconciliation.md) |
| **Cash-flow forecast**, **Budgets** | [24 Budgets & forecasts](24-budgets-and-forecasts.md) |
| **Fixed assets** | [23 Fixed assets](23-fixed-assets.md) |
| Journal import, opening balances, opening invoices and bills | [26 Imports & opening balances](26-imports-and-opening-balances.md) |

---

## How things post

| You record | Debit | Credit |
|---|---|---|
| Invoice | Customer | Sales, output GST, TCS payable, charges recovered, reimbursements recovered |
| Purchase bill | Purchases (or *Plant and machinery* for capital goods), input GST you can claim | Supplier; TDS payable when you kept TDS back; GST payable on reverse charge |
| Credit or debit note, return | The reverse of its invoice or bill | |
| Payment received | Cash or bank; TDS receivable, discount allowed, bad debts for adjustments | Customer |
| Payment made | Supplier | Cash or bank; discount received |
| Expense | Its expense category, input GST you can claim | The account it was paid from |
| Opening invoice or bill ([26](26-imports-and-opening-balances.md)) | Customer (or *Opening balances*) | *Opening balances* (or supplier) |
| Fixed asset, at each month end ([23](23-fixed-assets.md)) | Depreciation | Accumulated depreciation |
| Voucher | As entered | As entered |

- **Stock: periodic or perpetual.** See [Stock in the books](#stock-in-the-books) below. Periodic is the default for an existing business; a new business starts perpetual.
- **Credit you can't claim** (blocked under s.17(5), or ineligible) is added to the cost; it never reaches input GST (RULES 6.27).
- **Opening balances** of customers, suppliers, cash and bank, and your own accounts sit at the start of the books, or on their **As on** date when you give one. Whatever doesn't balance goes to *Opening balances* under capital (RULES 6.4).
- **Last year's profit** moves to *Profit and loss of earlier years* on the first day of the new financial year (RULES 6.3).

## Chart of accounts

**Goal:** see every account and its balance, and add accounts of your own.

**Who / plan:** everyone can read it; owner, admin or accountant can add or edit. Full plans.

**Steps**
1. **Books › Chart of accounts**. Accounts are grouped by **Assets**, **Liabilities**, **Income** and **Expenses**, then by group (for example **Duties and taxes**, **Bank accounts**). Tap a group to open or close it, or use **Expand all** / **Collapse all**. **Search accounts** finds one by name.
2. Each row shows the account's opening, debits, credits and closing for the period at the top. A desktop shows them in columns; the **Total** row shows ✓ when debits equal credits.
3. To add your own account (a loan from a director, rent deposit, furniture), tap **Add an account**:
   - **Name**, for example *Loan from HDFC*.
   - **Group**: any group except Sundry debtors, Sundry creditors and Stock in hand (those come from contacts and the stock ledger).
   - **Opening balance** and its side, **Debit (Dr)** or **Credit (Cr)**.
   - **Opening balance as on a date**: off, the balance stands at the start of your books; on, pick the **As on** day. It can't be in the future.
4. Tap **Save account**. You see **Account saved**.
5. To edit one of yours, tap the pencil beside it (🖥) or long-press it (📱). Accounts you added show **Added by you**.

**What happens:** tap any account to open its statement: **Opening balance**, every posting with a running balance, **Closing balance**, and a **Balance trend** chart (balance at each month end). A bank account's statement also has **Reconcile with the bank statement** ([22](22-banking-and-reconciliation.md)). The chart and each statement can be exported.

**Rules & gotchas**
- **System accounts** such as Sales, Output CGST, TDS payable and Round off appear only once something posts to them.
- **Parties, cash and bank accounts, and expense categories are accounts too.** Their names and openings are edited where they are kept: contacts ([08](08-contacts.md)), **Payment accounts** ([22](22-banking-and-reconciliation.md#add-a-bank-cash-or-wallet-account)) and expense categories ([10](10-expenses-and-ocr.md)).
- **No two accounts can have the same name.**
- **An account that has postings can't change group** (`ACCOUNT_GROUP_LOCKED`). Make a new account in the right group and move the balance with a journal.
- **Removing or deactivating an account is Not available yet in the app.** The server refuses to delete an account that is used (`ACCOUNT_IN_USE`) and refuses new postings to an inactive one.

## Vouchers

**Goal:** record an adjustment, a cash deposit, a GST adjustment or TDS paid, that isn't an invoice, bill, payment or expense.

**Who / plan:** owner, admin or accountant. Full plans.

**Steps**
1. **Books › Journal and contra**, then **New voucher** (📱 the **+** button).
2. Pick the kind:

   | Kind | Use it for | Rule |
   |---|---|---|
   | **Journal** | Any adjustment: depreciation, provisions, a refund, a correction | Debits equal credits |
   | **Contra** | Money between cash and bank: a deposit, a withdrawal, a transfer | Cash and bank accounts only |
   | **GST journal** | Adjustments to the GST ledgers: a credit reversed, interest, a set-off | Must touch a Duties and taxes account |
   | **TDS challan** | TDS paid to the government, from the challan | Debits TDS or TCS payable, credits cash or bank |

3. Fill in **Date**, **Narration** and, if you like, **Reference** (a challan number and BSR code, or a cheque number). A TDS challan also asks for **BSR code** (7 digits), **Challan serial number** (up to 5 digits) and **Deposited on**.
4. Fill the lines. Each line has **Dr/Cr**, an **Account**, an amount and an optional **Line narration**. Once you have cost centres, each line also has a **Cost centre**. 🖥 Type the account name into its cell. 📱 Tap the account to pick it.
5. Watch the totals under the lines: **Debits equal credits**, or **Credits short by ₹…** / **Debits short by ₹…**. **Add a line** adds a line on the side that is short.
6. Tap **Save voucher** to post it, or **Save as draft** to finish later.

**What happens:** a posted voucher takes the next number for its date and posts at once. You see **Voucher saved** and its page opens, with debits and credits in their own columns and **Totals** under them.

**Rules & gotchas**
- **Drafts** (RULES 6.9) have no number, may be unbalanced or one line, and post nothing. They show as **Draft voucher** with a **Draft** badge. Open one and tap **Post** to check it in full and number it; you see **Voucher posted**. A posted voucher can't go back to draft.
- **Filter** the list by **All**, **Drafts** or **Posted**.
- **Templates:** tap **Save as template** on a voucher you use often (monthly rent, salary provision) and give it a **Template name**. Next time, **Use a template** fills in the kind, accounts and sides.
- **Edit a posted voucher** with **Edit voucher**. Its kind can't change, and it can't move to another financial year (`VOUCHER_YEAR_LOCKED`). Delete it and post again instead.
- **Delete voucher** takes its entries off the books.
- **A voucher can't take more out of a cash or bank account than it holds** (`INSUFFICIENT_BALANCE`, RULES 6.26).
- **A voucher can't be dated in a closed period** (`PERIOD_LOCKED`).
- **Some accounts are worked out by the books** and can't be picked: Stock in hand, Accumulated depreciation and Goods received, not billed.
- **Profit and loss of earlier years** (RULES 6.25) is for appropriations and prior-year corrections only. Only an owner or admin can post to it, and it needs a narration ("Say why earlier years’ profit changes: add a narration"). An accountant can save it as a draft for them.
- **An inactive account or contact can't take new lines.**
- **Other vouchers in the list:** **Receipt** (money in that isn't from an invoice, [07](07-payments.md)), **GST challan** and GST set-offs ([21](21-gst-returns.md)), and transfers ([22](22-banking-and-reconciliation.md#transfer-money-between-cash-and-bank)) all show here too. A GST set-off is changed by reversing it from **Utilization**, not by editing it (`SET_OFF_LOCKED`).
- **Importing journals from a spreadsheet:** the **Import** button on this page. See [26](26-imports-and-opening-balances.md#import-journals).

## Cost centres

**Books › Cost centres** (also **Money › Cost centres**) holds projects, departments or sites.

1. Tap **Add cost centre**. Give it a **Name** (for example *Thane site*), a **Kind** (for example *Project*) and, optionally, **Under** another centre. **In use** is on by default.
2. Tap **Save cost centre**. You see **Cost centre saved**.

Once you have one, a **Cost centre** field appears on invoices and bills, on expenses, and on each voucher line. **Profit by cost centre** then shows each centre's income, expenses and profit for a period.

- **A purchase bill line can have its own cost centre** if it isn't a stock item (RULES 6.20). A line without one takes the bill's centre. A sales invoice goes to one centre as a whole. Journal lines each take their own.
- **Stock under periodic stock isn't split by cost centre**, so the rows add up to profit before the change in stock. Under perpetual stock, the goods sold post under each document's centre, so the centres add up to the profit (RULES 6.7).
- **A centre in use, or with centres under it, can't be deleted.** Turn **In use** off instead.

## Statements

All statements use the period picker at the top and can be exported from their screen.

| Screen | What it shows |
|---|---|
| **Trial balance** | Every account's opening, debits, credits and closing for the period. Income and expenses start each financial year at zero. Debits equal credits; if they ever don't, it says "Out by ₹…: report this to support". |
| **Profit and loss** | The **Trading account** (sales, purchases, direct costs, and opening and closing stock or cost of goods sold), **Gross profit**, then indirect income and expenses, and **Net profit** |
| **Balance sheet** | **Assets** against **Liabilities and capital** on the last day of the period. This year's profit is shown as **Profit for the year so far** under capital; earlier years' under *Profit and loss of earlier years*. |
| **Day book** | Every entry in the period, day by day, with its debits and credits |
| **Integrity check** | See [below](#integrity-check) |

**Columns:** the profit and loss and the balance sheet can be shown as **Single**, **Monthly** (balance sheet: **Month ends**), **Quarterly** (**Quarter ends**), **vs previous** or **vs last year**. The comparisons add a **Change** column. The export has the same columns.

### Integrity check

**Books › Integrity check** checks the ledger against what it comes from, as of the last day of the period. Each check shows **Agrees** or how many need fixing:

| Check | What it compares |
|---|---|
| **Every entry balances** | Debits equal credits for each invoice, bill, payment, expense and voucher |
| **Round-off under ₹1** | No document rounds off by a rupee or more |
| **Trial balance agrees** | Total debits equal total credits |
| **Party statements match their ledgers** | Each party billed in rupees: its statement against its account in the books |
| **Stock ledger matches stock in hand** | Under perpetual stock: the stock account against the stock ledger's value |
| **No document paid more than its total** | Money set against each invoice or bill is no more than it is for |

At the top you see **Everything agrees** or **N checks need a look**. A failing check lists each record with **Records say** and **Ledger says**.

## Stock in the books

The **Close the books** page also holds how stock is kept. An owner changes it; everyone else can read it.

**Periodic** (the default for an existing business): purchases go to *Purchases*, and closing stock is valued from the stock ledger at the end of each period, as in Tally. Profit uses opening stock + purchases − closing stock.

**Perpetual** (RULES 6.2, 6.10): goods are posted to *Stock in hand* at cost as they come in and go out, and what is sold goes to *Cost of goods sold*. Goods received on a goods receipt before their bill sit in *Goods received, not billed*.

1. Tap **Keep stock perpetually · [date]**. The date is the first day of this financial year, or of the next one if this one is closed.
2. Confirm **Keep stock perpetually from [date]?**. You see **Stock is perpetual from [date]**.
3. **Go back to periodic** works while that year is still open.

The stock earlier years closed with is brought onto the books on the first perpetual day, against *Profit and loss of earlier years*, so earlier years keep their profit. Reports from that day change.

**Stock costing:** **Weighted average** (the default) or **First in, first out**. Changing it values every period's stock again from when the books began, so it can be changed only while no period is closed. Keep the method you choose year after year (AS 2).

## Close the books

**Goal:** lock a period once it is filed or audited, so nothing in it changes.

**Who / plan:** owner only. Others see "Only an owner can close or reopen the books." Full plans.

**Steps**
1. **Books › Close the books**. The top says **The books are open** or **The books are closed through [date]**.
2. Pick **Close through**, usually the last day of a filed month or of the audited year.
3. Tap **Close the books** and confirm. You see **Books closed through [date]**.

**What happens:** nothing dated on or before that day can be added, changed or removed: invoices, bills, notes, payments, expenses, vouchers, fixed-asset changes and imported openings. Trying it gives `PERIOD_LOCKED` (RULES 6.6).

**Rules & gotchas**
- **Filing GSTR-3B through the app closes its month on its own** ([21](21-gst-returns.md)).
- **Reopen the books** clears the close. Anything you then change may no longer match what was filed or audited.
- **Stock costing can't change while any period is closed.**

## Export for Tally

**More › Settings › Backup & export › Tally XML** (owner or admin) writes the books for import into Tally Prime:
- **Ledger masters:** one for every account, under Tally's own groups (Sundry Debtors, Duties & Taxes, Bank Accounts…). Each carries its GSTIN and state, and its opening balance as at the start of the range.
- **Vouchers:** every sale, purchase, credit and debit note, receipt, payment, contra and journal in the range. Each voucher balances, and the voucher numbers are the app's. Draft vouchers are left out.

In Tally, use **Import › Masters** and **Import › Transactions** with the same file. The trial balance in Tally should then equal the app's.

---

**Related:** [20 TDS, reverse charge, credit and adjustments](20-tds-rcm-itc.md) · [21 GST returns](21-gst-returns.md) · [22 Banking & reconciliation](22-banking-and-reconciliation.md) · [23 Fixed assets](23-fixed-assets.md) · [24 Budgets & forecasts](24-budgets-and-forecasts.md) · [26 Imports & opening balances](26-imports-and-opening-balances.md) · [12 Reports](12-reports.md)
