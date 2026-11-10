# 26 — Imports & opening balances

Moving to Elixir Books Smart from Tally, Excel or another app: how to bring in your contacts, items, journals and what was owed, and where each opening balance goes.

- **Roles:** every import needs **owner, admin or accountant**.
- **Check first:** every import has a **Check** step that shows what will happen. Nothing is saved until you import.
- **Online only.**

| What | Where | File | Plan |
|---|---|---|---|
| Contacts | **Contacts › Import** | CSV | Every plan |
| Items | **Items & services › Import** | CSV | Every plan |
| Journals | **Books › Journal and contra › Import** | CSV, or pasted | Full plans |
| Opening invoices and bills | **Receivables** or **Payables › Import outstanding** | CSV | Full plans |
| Bank statements | **Bank reconciliation › [account] › Import statement** | CSV or Excel | Full plans, see [22](22-banking-and-reconciliation.md#import-a-bank-statement) |

---

## Where opening balances go

Decide one day your books begin here, usually the first day of a financial year. Then enter what stood on that day:

| Opening | Where you enter it | Chapter |
|---|---|---|
| What a customer owes, or you owe a supplier, as one figure | The contact's **Opening balance** and **Dr/Cr**, or the contact import | [08](08-contacts.md) |
| The same, invoice by invoice (so aging and allocation work) | **Import outstanding** (below) | this chapter |
| Cash, bank and wallet balances | **Payment accounts › Opening balance** | [22](22-banking-and-reconciliation.md#add-a-bank-cash-or-wallet-account) |
| Stock on hand | The item's **Opening stock**, or the item import | [09](09-items-and-stock.md) |
| Loans, capital, deposits, furniture and other accounts | **Chart of accounts › Add an account › Opening balance** | [19](19-books.md#chart-of-accounts) |
| Depreciation already written off on an old asset | **Fixed assets › Bought before the books began here** | [23](23-fixed-assets.md) |
| Anything else | A journal on the first day | [19](19-books.md#vouchers) |

**What happens:** every opening sits at the start of the books, or on its **As on** date when you give one. Whatever doesn't balance goes to *Opening balances* under capital (RULES 6.4). Check **Books › Trial balance** on your first day: the *Opening balances* line should equal your capital as per the last balance sheet.

**Rules & gotchas**
- **Don't enter a party's debt twice.** A contact with an opening balance can't also have opening invoices imported, and the other way round.
- **A dated opening in a closed period can't be changed.**

## Import contacts

**Goal:** bring in customers and suppliers from a spreadsheet.

**Steps**
1. **Contacts**, then **Import**.
2. Choose a CSV saved from Excel, Google Sheets, Tally or another app, then match its columns: **Name** (required), **Display name**, **Code**, **Type**, **GSTIN**, **PAN**, **Email**, **Phone**, address, **City**, **State**, **PIN code**, **Country**, **Opening balance**, **Dr/Cr**, **Credit limit**, **Credit days**, **Notes**.
3. Tap **Check**, then **Import N**. You see **N contacts imported**.

Rows already there are marked **Already there**; up to 1,000 at a time. Details are in [08 Contacts](08-contacts.md).

## Import items

**Goal:** bring in products and services.

**Steps**
1. **Items & services**, then **Import**.
2. Choose a CSV and match: **Name** (required), **SKU**, **Goods or service**, **Unit**, **Sale price**, **Purchase price**, **GST rate**, **HSN/SAC**, **Barcode**, **Opening stock**, **Reorder level**, **Description**, plus columns for your own custom fields, headed by their names.
3. Tap **Check**, then **Import N**. You see **N items imported**.

Up to 1,000 at a time. Details are in [09 Items & stock](09-items-and-stock.md).

## Import journals

**Goal:** bring in journal entries from Tally or a spreadsheet, for example a year's adjustments.

**Who / plan:** owner, admin or accountant. Full plans.

**Before you start:** the sheet has one row per line, with columns **Date**, **Reference**, **Account**, **Debit**, **Credit** and **Narration**. For example:

```
Date,Reference,Account,Debit,Credit,Narration
31/03/2026,JV-1,Rent,25000,,March rent
31/03/2026,JV-1,Cash,,25000,
```

**Steps**
1. **Books › Journal and contra**, then **Import** (top right).
2. Tap **Choose a CSV file**, or paste the sheet into **Or paste the sheet here**.
3. Turn on **Keep as drafts** if they should wait for a check ("Drafts can be unbalanced and don't reach the books until posted").
4. The app shows "N journals, N ready". Each journal shows its first line, its number of lines and **Ready** or **Needs fixing** with the reason.
5. Tap **Check** to have the server check them, then **Import N journals**. You see **N journals imported** and the voucher list opens.

**Rules & gotchas**
- **Rows with the same reference make one journal.** Rows without a reference run on as one journal until the date changes.
- **Accounts are matched by name**, as the chart of accounts shows them. "No account called …" means add the account first ([19](19-books.md#chart-of-accounts)).
- **Dates** may be 31/03/2026, 31-03-2026 or 2026-03-31. A journal has one date.
- **Each line is a debit or a credit**, and amounts can't be negative. Posted journals must balance; drafts needn't.
- **The sheet needs Date and Account columns** ("The sheet needs Date and Account columns.").
- **Up to 500 journals at a time.**
- **The same sheet twice:** a journal already in the books (same date, narration, reference and lines) is refused with its number: "Already in the books as JV/…; change its narration to import it again".
- **Each journal is checked as one entered by hand:** closed periods, cash or bank going below zero (counting earlier journals in the same sheet), *Profit and loss of earlier years* for owners and admins only, and accounts the books work out themselves. All the ready ones are saved together.

## Import what was outstanding

**Goal:** bring in customer invoices and supplier bills still unpaid on the day your books begin, one by one, so they can be paid, aged and allocated against (RULES 6.12).

**Who / plan:** owner, admin or accountant. Full plans.

**Before you start**
- The customers and suppliers exist ([08](08-contacts.md)) and have **no opening balance**.
- The business has a 0% tax rate under **Settings › Taxes** (it carries the amount).

**Steps**
1. **Money › Receivables** (or **Payables**), then **Import outstanding**.
2. **These are**: **Owed to us (customer invoices)** or **Owed by us (supplier bills)**.
3. Choose a CSV with one row per invoice or bill, and match the columns: **Party (name or GSTIN)**, **Invoice or bill number**, **Date**, **Due date** (optional) and **Amount outstanding**.
4. Tap **Check**. You see "N ready, N already imported, N to fix". Rows already imported are marked **Already imported**; a row to fix shows why.
5. Tap **Import N**. You see **N imported** and Receivables (or Payables) opens.

**What happens:** each row becomes an issued **opening invoice** (or **opening bill**) under its own number, date and due date, for the amount still outstanding. It is on the party's account and in aging, and can be paid and allocated against like any invoice or bill. It posts only Dr the party / Cr *Opening balances* (the other way for a bill), never sales, purchases, GST, TDS or stock, and is in no return.

**Rules & gotchas**
- **The party is found by GSTIN, else by its one exact name.** "More than one contact is called …; give the GSTIN", or "No contact …; add it first (import contacts), then these".
- **The party must be on that side**: a customer for invoices, a supplier for bills.
- **"… already has an opening balance; clear it, or leave these rows out"**, so a debt is never counted twice.
- **A row is refused** if it has no number, nothing outstanding, a future date, a due date before its date, or a date in a closed period.
- **An opening invoice can be cancelled if entered wrongly**, but not converted or deleted.
- **On Free and Basic**, the button opens the upgrade page.

---

**Related:** [08 Contacts](08-contacts.md) · [09 Items & stock](09-items-and-stock.md) · [05 Sales](05-sales.md) · [07 Payments & aging](07-payments.md) · [19 Books](19-books.md) · [22 Banking & reconciliation](22-banking-and-reconciliation.md)
