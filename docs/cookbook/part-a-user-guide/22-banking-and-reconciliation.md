# 22 — Banking & reconciliation

Your cash, bank and wallet accounts, moving money between them, and matching your bank's statement to the books.

- **Plan:** payment accounts on every plan. **Transfer** and **Bank reconciliation** need a full plan (Pro or Business), as they post to the books ([19](19-books.md)).
- **Roles:**
  - Adding and editing payment accounts, transfers, importing statements, matching, recording from a line, excluding and undoing an import: **owner, admin or accountant**.
  - Reading balances, lines and the reconciliation statement: every role.
- **Online only:** the buttons are greyed out while you are offline.

Where to find it:
- **Payment accounts:** **More › Business setup › Payment accounts**.
- **Transfer** and **Bank reconciliation:** 📱 **More › Money**. 🖥 **Money** in the sidebar (Transfer under **Cash flow**, Bank reconciliation under **Accounts**).

---

## Add a bank, cash or wallet account

**Goal:** set up each account money goes in or out of, with its opening balance.

**Who / plan:** owner, admin or accountant. Every plan.

**Steps**
1. **More › Business setup › Payment accounts**, then **Add account**.
2. Choose the type: **Bank**, **Cash** or **Wallet**.
3. Enter the **Account name** (for example *HDFC Current*). A bank account also takes an **Account number**.
4. Enter the **Opening balance**. Turn on **Balance as on a date** to give the day it was counted (**Opening balance as on**; never a future day). Off, it stands at the start of the books.
5. Turn on **Use as default** if it should be pre-selected when you record payments and expenses.
6. Tap **Save**. You see **Account added**.

**What happens:** the account is in the chart of accounts under **Cash in hand** or **Bank accounts**. The top card shows the **Cash and bank balance**: opening balances plus everything recorded since. Each account shows its own **Balance**. Tap a bank account in **Books › Chart of accounts** to see its statement.

**Rules & gotchas**
- **The type decides which payment methods can use it:** cash takes Cash; a bank takes bank, cheque, card and UPI; a wallet takes UPI and Wallet. See [13](#add-a-bank-cash-or-wallet-account).
- **An account with payments or expenses** can't change type and can't be deleted: "This account has payments or expenses, so its type can’t change and it can’t be deleted." The last account can't be deleted either.
- **On invoices:** the bank account linked under **Business profile › Bank & signature › Account in your books** shows an **On invoices** badge. Money customers pay against your invoices goes into it by default ([13](13-settings.md)).
- **Accounts are in your base currency.** A foreign-currency bank account is **Not available yet** in the app.
- **No account can pay out more than it holds** (RULES 6.26). A payment, expense or voucher that would take it below zero is refused (`INSUFFICIENT_BALANCE`).

## Transfer money between cash and bank

**Goal:** record a cash deposit, a withdrawal or a bank-to-bank transfer.

**Who / plan:** owner, admin or accountant. Full plans.

**Steps**
1. **Money › Transfer**.
2. Pick the **From account** and the **To account** (cash, bank or wallet accounts in your base currency).
3. Enter the **Amount**, the **Date** and, if you like, a **Reference** (a cheque, UTR or slip number) and a **Narration**.
4. Tap **Record transfer**. You see **Transfer recorded**.

**What happens:** it is posted as a **Contra** voucher. With no narration, it reads "Transfer from [from] to [to]". **Recent transfers** lists the last ones; **All contra vouchers** opens the voucher list filtered to contras.

**Rules & gotchas**
- "Pick two different accounts" if both are the same; "Enter the amount moved" if the amount is empty.
- The from account can't go below zero (`INSUFFICIENT_BALANCE`), and the date can't be in a closed period (`PERIOD_LOCKED`).
- To split one transfer over more than two accounts, use **New voucher › Contra** ([19](19-books.md#vouchers)).

## Bank reconciliation: the accounts

**Money › Bank reconciliation** lists your bank accounts (cash and wallets don't take statements). Each row shows:
- **No statement imported yet**, or how many lines are **to explain**, **matched** and **excluded**;
- **Bank balance ₹… on [date]**, the last running balance on the statement, or **No running balance on the statement**;
- a badge: **N to explain**, or **All explained**.

With no bank accounts you see **No bank accounts yet** and **Open payment accounts**.

Tap an account. The top shows **Last statement [from] to [to] · bank balance ₹…**, the **Import statement** button, and five tabs: **To explain**, **Matched**, **Excluded**, **Reconciliation** and **Imports**.

## Import a bank statement

**Goal:** bring your bank's lines into the app so each can be matched to the books.

**Who / plan:** owner, admin or accountant. Full plans.

**Before you start:** download the statement from your net banking as Excel (.xlsx) or CSV. At most 5 MB and 10,000 rows.

**Steps**
1. Open the bank account and tap **Import statement**.
2. **Choose a file**. The app finds the heading row ("headings on row N, M rows under them"). If it finds none, you choose each column.
3. **Match the columns:** **Date**, **Narration**, **Reference / cheque no.**, then either **Debit (withdrawal)** and **Credit (deposit)**, or one **Amount (one column)** with an optional **Debit or credit marker**, and the **Running balance**. Choose **Not in this file** for a column the file lacks. Tap **Next**.
4. **Check and import:** tap **Check**. You see "N new, N already imported, N will match on their own." Lines already imported are marked **Already imported**; rows that can't be read are **Left out** with the reason.
5. Tap **Import N lines**.

**What happens:** you see **N lines imported** ("N already there, N matched on their own"). Lines that clearly match a payment, expense or voucher on this account are matched for you. The rest wait in **To explain**.

**Rules & gotchas**
- **Dates are read day first** (03/04/2026 is 3 April), as Indian banks print them.
- **Importing the same file again adds nothing.** Overlapping statements are fine: only lines not already there are added.
- **A line is matched on its own** only when there is no doubt: one record on this account with the same amount within 3 days, or one whose reference (UTR, cheque number) is in the line.
- **The statement's amounts must be in the account's currency** (`CURRENCY_MISMATCH`). A line can't be zero.
- **A big statement** is sent in parts, cut where the date changes. Each part shows in **Imports** as "file (1/3)" and so on.

## Explain each line

**Goal:** match every line on the statement to what the books recorded, or record what is missing.

**Who / plan:** owner, admin or accountant. Full plans.

**Steps**: on **To explain**, each line shows its date, narration, amount (green in, red out), running balance and a **Likely match**. For each line choose one of:

| Action | When | What happens |
|---|---|---|
| **Match [record]** (tap the likely match) | The suggested payment, expense or voucher is the right one | You see **Matched**; the line moves to **Matched** |
| **Find…** | The right record isn't suggested | Lists payments, expenses and vouchers on this account within a month of the line. Search by **Number, reference or name**. Only the same amount can be matched. |
| **Record payment** | Money in from a customer, or out to a supplier, not yet recorded | See below |
| **Record expense** | Money out that is an expense (bank charges, rent) | Pick an **Expense category**, optionally a **Supplier** and **Notes**, then **Record and match** |
| **Record to an account** | Money in or out that is neither: interest, a loan, capital brought in, drawings, tax paid | Pick the account (**Credit to** for money in, **Debit to** for money out) and a **Narration**, then **Record and match**. Money in becomes a receipt voucher; money out a journal. |
| **Exclude** | The line needs nothing in the books: a transfer already recorded, a bank's own reversal | Give an optional **Reason**, then **Exclude**. You see **Line excluded**. |

**Record payment** (**Record payment received** or **Record payment made**):
1. Choose the **Customer** (money in) or **Supplier** (money out).
2. Their open invoices (or bills) are listed oldest first under **Settles** (or **Pays**), ticked until the line's amount runs out: "₹X of ₹Y due". Untick any you don't want settled.
3. What is left over is shown: "₹… left over is held as an advance from the customer" (or "to the supplier"), or **All of it settles what is due**.
4. Pick **Paid by** (default bank) and add **Notes** if you like. Tap **Record and match**.

The payment takes the line's date, amount and reference, through this bank account, and is matched to it.

**Rules & gotchas**
- **Undo a match:** on **Matched**, open the line's menu and tap **Unmatch**, then confirm **Undo this match?**. The line goes back to **To explain**; the record stays in the books. **Open record** opens the payment, expense or voucher.
- **Bring back an excluded line:** on **Excluded**, tap **Include**. You see **Line back in To explain**.
- **A record can be matched to one line only** (`ALREADY_MATCHED`). A line already matched must be unmatched first.
- **When a matched record is deleted, or edited to another amount or account, its line goes back to To explain** on its own.
- **A contra between two of your banks** can be matched on each bank's statement.
- **Record payment made** needs Payables to be on; **Record expense** needs Expenses. **Record to an account** works only for an account in your base currency, and can't pick a cash or bank account: record that as a transfer, then match it (`CONTRA_NOT_HERE`).
- **The record can't be dated in a closed period** (`PERIOD_LOCKED`), and money out can't take the bank below zero.

## The reconciliation statement

**Goal:** show the books' bank balance and the bank's balance, and what explains the difference.

**Steps**
1. Open the bank account, then the **Reconciliation** tab.
2. Pick **As of** (today by default).

**What happens:** three figures at the top: **Balance as per books**, **Balance as per bank statement** and **Difference** (**Nil, they agree** when everything is explained). Under them:
- **As per the books:** the book balance, **Add: credited by the bank, not yet in the books**, **Less: debited by the bank, not yet in the books**, then the **Adjusted balance as per books**.
- **As per the bank statement:** the statement balance, **Add: deposited, not yet credited by the bank**, **Less: paid, not yet debited by the bank**, then the **Adjusted balance as per bank**.

**Export CSV** saves it, section by section.

**Rules & gotchas**
- "The statement has no running balance, so the bank side can't be totalled." Import a statement with a balance column to compare.
- **Records dated before the first imported statement** are taken as cleared.
- A difference that isn't nil means "a line matched to the wrong record, an amount typed differently, or an entry before the first imported statement".

## Undo an import

**Goal:** take away a statement imported by mistake.

**Steps**
1. Open the bank account, then the **Imports** tab. Each import shows its file name, the dates it covers, "imported [date]" and its counts.
2. Tap **Undo import** and confirm **Undo the import of [file]?**. You see **Import undone**.

**What happens:** its lines are taken away. Payments, expenses and vouchers they were matched to, or recorded from, stay in the books and can be matched again.

**Rules & gotchas:** if a later import covers some of the same days, undo that one first (`LATER_IMPORT_OVERLAPS`).

---

**Related:** [07 Payments](07-payments.md) · [10 Expenses](10-expenses-and-ocr.md) · [13 Settings](#add-a-bank-cash-or-wallet-account) · [19 Books](19-books.md) · [24 Budgets & forecasts](24-budgets-and-forecasts.md)
