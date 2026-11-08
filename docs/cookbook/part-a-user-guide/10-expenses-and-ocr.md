# 10 — Expenses & bill scanning

Expenses cover what the business spends that isn't a purchase of stock: rent, salaries, fuel, fees. Each expense records:
- how much was spent and on what (category);
- the account it was paid from;
- the GST paid on it, if any. This counts as input tax in the tax summary.

Bill scanning (OCR) reads a photo of a receipt or supplier bill and opens a filled-in expense or purchase bill for you to check.

**Plan:** both features need **Smart Pro** or **Smart Business**. On a sales plan, opening them takes you to the upgrade page ([14](14-team-roles-plans.md#a-module-is-locked)).
**Roles:** owner, admin and accountant can record and edit expenses. Only owner and admin can delete them.

Where to find them: 📱 **More › Money › Expenses**, or **Buy › Expenses**. 🖥 **Buy** section in the sidebar.

---

### Record an expense

**Goal:** record money spent, with its category, tax and receipt.
**Who / plan:** owner, admin or accountant · Pro or Business.
**Before you start:** at least one payment account exists (**Settings › Payment accounts**). Categories can be added while you record.

**Steps**
1. Open **Expenses** and tap **Add expense**. On Home you can also use the quick action **Add expense**.
2. Enter the **Amount**.
3. Pick a **Category**. If the one you need doesn't exist, tap **Add category**, type a **Category name** and tap **Save category**.
4. Check the **Date**. It defaults to today.
5. Choose **Paid from**, the account the money left (for example *HDFC Current — 8842*), and the **Payment method**.
6. *Optional:* **Supplier**: who you paid.
7. *Optional:* **Tax**: pick the GST rate charged on the bill.
   - Switch on **Amount includes tax** if the amount you typed is the bill total; the app works out the tax inside it.
   - Leave it off if the tax is on top.
   - The **Summary** shows **Input tax** and **Total paid**.
8. *Optional:* **Reference** (bill or voucher number) and **Notes** ("What was this for?").
9. *Optional:* **Repeats**: **Every week**, **Every month**, **Every quarter** or **Every year**. See [Recurring expenses](#make-an-expense-repeat).
10. *Optional:* **Billable to a customer**: flag it so you can re-charge it later.
11. *Optional:* **Attach receipt**: a photo or scan of the bill.
12. Tap **Record expense**.

**What happens**
- You see **Expense recorded**, and the expense appears in the list.
- The amount comes out of the chosen account's balance.
- Any tax is counted as input tax in the **Tax summary** and **Expense summary** reports ([12](12-reports.md)).

**Rules & gotchas**
- **Category** and **Paid from** are required. Without them you see **Pick a category for this expense** or **Choose the account this was paid from**.
- Paying from **Cash in hand** is blocked if it would take cash below zero: **Cash in hand has only ₹…**.
- **Receipts upload when you save.** You need a connection. If the upload fails, the expense is not saved and you see **The receipt couldn't be uploaded…**. Remove it to save without it, or try again.
- Receipts can be JPEG, PNG, HEIC or PDF, up to 10 MB.

**Example:** Vertex Traders pays "Godown rent — Bhosari" of ₹55,000.
- Category *Rent*; paid from *HDFC Current — 8842* by bank transfer.
- Tax *GST 18%* with **Amount includes tax** off.
- Result: input tax ₹9,900, total paid ₹64,900.

---

### Find, filter and review expenses

1. Open **Expenses**. The header shows **Total spent** and **Input tax** for what is listed.
2. Search with **Search expenses**, or filter by category. **All categories** clears the filter.
3. Tap an expense to open **Expense details**: amount, tax, account, supplier, **Attachments**, and **Next due** if it repeats.

---

### Edit or delete an expense

- **Edit:** open the expense, tap **Edit**, change the fields and save. You see **Expense updated**.
- **Delete:** tap **Delete** and confirm **Delete this expense?**.
  - The expense leaves your reports and tax summary, and it can't be undone.
  - Only owner and admin can delete.

---

### Make an expense repeat

**Goal:** mark rent, salaries or retainers as recurring.

**Steps**
1. Record or edit the expense.
2. Set **Repeats** to the interval you want.
3. Save. The detail screen shows **Next due**.

> **Not available yet.** The schedule is saved, but nothing creates the next expense automatically yet; record each one yourself until scheduling ships. See [18](18-troubleshooting-faq.md#not-available-yet).

---

### Manage expense categories

**More › Business setup › Expense categories.** Requires Pro or Business, and owner, admin or accountant.
- **Add category:** a **Category name**, for example *Fuel*. Then **Save**.
- **Edit:** tap a category to rename it.
- **Delete:** expenses already in that category keep it as a reference, but show as **Uncategorised**.
- Each row shows how many entries use it, or **Not used yet**.

---

### Scan a bill or receipt (OCR)

**Goal:** turn a photo of a bill into an expense or a purchase bill without typing it in.
**Who / plan:** owner, admin or accountant · Pro or Business.
**Before you start:** use the **installed Elixir Books app on Android or iPhone**. Scanning is not available in a web browser or in Expo Go; there you see *"Bill scanning works in the installed Elixir Books app on Android or iPhone…"*.

**Steps**
1. Open the scanner: **More › Tools › Scan a bill or receipt**, or **Scan with OCR instead** on the expense form.
2. Choose what you are scanning: **Expense receipt** or **Supplier bill**.
3. Tap **Take a photo** or **Choose from gallery**. Lay the bill flat in good light.
   - The first time, allow camera or photo access when asked. If you said no, you see **Allow camera access in Settings to scan a bill**.
4. Wait while the app shows **Reading the bill…**. It extracts the vendor, date, totals, tax and line items.
5. On **Review extraction**, check each field. Every field shows how sure the app is, for example **82% sure**.
   - Fields flagged as needing a check appear as **N fields need a quick check before saving**.
   - Correct any that are wrong.
6. Tap **Create expense** or **Create bill**.

**What happens**
- A **filled-in form** opens: a new expense, or a new purchase bill ([06](06-purchases.md)).
- **Nothing is written to your books until you finish and save that form yourself.**
- To start over, tap **Rescan**.

**Rules & gotchas**
- **No text found** means the photo was unreadable. Retake it flat and in good light.
- Text is read on the phone. The server-side reader isn't switched on, so scanning in the browser returns nothing (see [18](18-troubleshooting-faq.md#not-available-yet)).

---

**Related:** [06 Purchases](06-purchases.md) · [07 Payments](07-payments.md) · [12 Reports](12-reports.md) · [13 Settings › Payment accounts](13-settings.md#payment-accounts)
