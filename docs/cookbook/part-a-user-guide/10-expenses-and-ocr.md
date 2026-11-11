# 10 — Expenses & bill scanning

Expenses cover what the business spends that isn't a purchase of stock: rent, salaries, fuel, fees. Each expense records:
- how much was spent and on what (category);
- the account it was paid from;
- the GST paid on it, if any, and whether that GST can be claimed.

Bill scanning (OCR) reads a photo of a receipt or supplier bill and opens a filled-in expense or purchase bill for you to check.

**Plan:** both features need **Smart Pro** or **Smart Business**. On a sales plan, opening them takes you to the upgrade page ([14](14-team-roles-plans.md#a-module-is-locked)). An owner can also switch either off in **Settings › Modules**; bill scanning needs Expenses on.
**Roles:** owner, admin and accountant can record and edit expenses. Only owner and admin can delete them.

Where to find them:
- **Expenses:** 📱 **More › Money › Expenses**. 🖥 **Money › Expenses** in the sidebar. Also **Home › Add expense**.
- **Scan a bill:** 📱 **Buy › Scan a bill**, or **Scan with OCR instead** on the expense form. 🖥 **Buy › Scan a bill**. With OCR switched off in **Settings › Modules**, both are hidden.

---

### 10.1 Record an expense

**Goal:** record money spent, with its category, tax and receipt.
**Who / plan:** owner, admin or accountant · Pro or Business.
**Before you start:** at least one payment account exists (**Settings › Payment accounts**). A new business starts with ten categories (Rent, Salaries & wages, Transport & freight, Utilities, Marketing, Office supplies, Travel, Professional fees, Repairs & maintenance, Bank charges); you can add more while you record.

**Steps**
1. Open **Expenses** and tap **Add expense**.
2. Enter the **Amount**.
3. Pick a **Category**. If the one you need doesn't exist, tap **Add category**, type a **Category name** and tap **Save category**.
4. Check the **Date**. It defaults to today.
5. Choose **Paid by** (Cash, Bank transfer, UPI, Card, Cheque, Wallet or Other), then **Paid from**, the account the money left (for example *HDFC Current — 8842*). The accounts offered fit the method.
6. *Optional:* **Supplier**: who you paid.
7. *Optional:* **Tax**: pick the GST rate charged on the bill (default **No tax**). With a rate picked:
   - **Amount includes tax** is on by default: the amount is the bill total and the app works out the tax inside it. Turn it off if the tax is on top.
   - **Reverse charge**: *You pay this GST to the government yourself; the amount is the supplier's price without it.*
   - **Input tax credit**: **Can be claimed**, **Blocked, section 17(5)** or **Not claimable**.
   - **Supplier's GSTIN**: asked only when no supplier is picked, so the GST returns can match it.
   - The **Summary** shows **Net amount**, **Input tax (18%)** and **Total paid**.
8. *Optional:* **Reference** (*Bill or voucher number*) and **Notes** (*What was this for?*).
9. *Optional:* **Repeats**: **Every week**, **Every month**, **Every quarter** or **Every year** (10.5).
10. *Optional:* **Billable to a customer** (*Flag it so you can re-charge it later.*), then **Bill to** a customer or leave **Any customer** (10.6).
11. *Optional:* **Cost centre** and **Vehicle**. These show only when you have cost centres ([19](19-books.md)) or vehicles (10.8).
12. *Optional:* **Attach a receipt**: **Take photo** (📱) or **Choose photo**. A new photo replaces the one there; **Remove receipt** takes it off.
13. Tap **Record expense**.

**What happens**
- You see **Expense recorded** (*· Receipt attached* when there is one), and the expense opens. It is numbered `EXP/<FY>/NNNN`.
- The amount comes out of the chosen account's balance, and is posted to the category's expense account in the books.
- Claimable tax counts as input tax in the **Tax summary** and **Expense summary** reports ([12](12-reports.md)).
- The expense belongs to the branch picked in the top bar.

**Rules & gotchas**
- **Category** and **Paid from** are required: **Pick a category for this expense**, **Choose the account this was paid from**.
- No account pays out more than it holds (RULES 6.26): **Cash in hand has only ₹2,000.00**, or **HDFC Current — 8842 has only ₹…** for a bank or wallet.
- The date can't fall in a closed period ([19](19-books.md)).
- **Receipts upload when you save.** If the upload fails, the expense is not saved and you see **The receipt couldn't be uploaded: … Remove it to save without it, or try again when you're online.**
- The receipt is a photo (an image). Attachments are up to 10 MB.
- An expense can name only a supplier (or a contact that is Both), not a customer.

**Example:** Vertex Traders pays "Godown rent — Bhosari" of ₹55,000 plus GST.
- Category *Rent*; paid by Bank transfer from *HDFC Current — 8842*.
- Tax *GST 18%* with **Amount includes tax** off.
- Result: input tax ₹9,900, total paid ₹64,900.

### 10.2 Record an expense from a bank statement line

In bank reconciliation, an unmatched bank line can be turned into an expense with **Record expense**. See [22 — Banking & reconciliation](22-banking-and-reconciliation.md).

---

### 10.3 Find, filter and review expenses

1. Open **Expenses**. It shows the **Last 30 days** by default; pick another range with the date filter.
2. The tiles show **Total spent** (*N entries*) and **Input tax** (*Claimable*), with a chart split by category.
3. Search with **Search expenses**, filter by category (**All categories** clears it), or by branch. The branch filter follows the top-bar branch.
4. A repeating expense shows its interval, e.g. **Every month**.
5. Tap an expense to open **Expense details**: amount, net amount and tax, **Paid by**, **Paid from**, supplier, reference, notes, **Attachments** (tap **Attachment 1** to open it), **Next due** if it repeats, and **Billable** / *Bill to 〈customer〉* / *Recovered on INV/…* if it is billable.

🖥 On a desktop the list is a table; tick rows and use **Export CSV**.

---

### 10.4 Edit or delete an expense

- **Edit:** open the expense, tap **Edit**, change the fields and tap **Save changes**. You see **Expense updated**.
- **Delete:** tap **Delete** and confirm **Delete this expense?** (*It will be removed from your reports and tax summary. This cannot be undone.*). You see **Expense deleted**. Only owner and admin can delete.

**Rules & gotchas**
- Neither works on an expense dated in a closed period.
- A billable expense already billed on an invoice is locked: *This expense is billed on invoice INV/…; cancel that invoice before changing its amount, currency, customer or billable flag*. It can't be deleted until that invoice is cancelled.
- Deleting a repeating expense stops the series; the expenses it already created stay.

---

### 10.5 Make an expense repeat

**Goal:** have rent, salaries or retainers recorded for you on schedule.

**Steps**
1. Record or edit the expense.
2. Set **Repeats** to the interval you want.
3. Save. The detail screen shows **Next due**.

**What happens**
- Every night (just after midnight, India time) the server records each repeating expense that has fallen due, on its own date, with the next number. It copies the category, supplier, amount, tax, account, method, reference, notes, **Bill to** customer, cost centre and vehicle. Missed periods are caught up.
- If the account doesn't hold enough, that one isn't recorded. You get a notification, *Recurring expense EXP/… not recorded*, and it is recorded on the next run once the account has the money.
- Changing the expense's date or interval restarts the schedule from the new date.

**Rules & gotchas**
- The copies don't carry the receipt. Attach one to each copy if you need it.
- Nothing repeats for a demo account or an archived business.

---

### 10.6 Re-charge an expense to a customer

Turn on **Billable to a customer** and pick the customer under **Bill to** (or leave **Any customer**). *It shows on their next invoice, to add as a reimbursement at cost.* Once added, the expense shows *Recovered on INV/…*. The full flow, through *Reimbursements recoverable*, is in [20](20-tds-rcm-itc.md).

---

### 10.7 Manage expense categories

**More › Business setup › Expense categories.** Requires Pro or Business, and owner, admin or accountant.
- **Add category:** a **Category name**, for example *Fuel*. Then **Save**. You see *Category saved*.
- **Edit:** tap a category to rename it (**Edit category**).
- Each row shows how many entries use it (*N entries*), or **Not used yet**, and the total.
- **Delete:** only a category no expense, journal or budget uses. A category with expenses has no **Delete** in its sheet; one only a journal or budget uses is refused on confirm (*This category is on 〈what〉; it can't be deleted*). The confirmation says: *Only a category no expense, journal or budget uses can be deleted.*

Each category is an expense account in your chart of accounts ([19](19-books.md)).

### 10.8 Vehicles

**More › Business setup › Vehicles.** Owner, admin or accountant. *Tag fuel, repairs and other expenses, and deliveries, with the vehicle.*
- **Add vehicle**: **Registration number** and **Name (optional)**, then **Save**. You see *Vehicle saved*.
- Each vehicle shows **Spent this year**: *₹… on N expenses · N documents*.
- Turn off **In use** to hide it from pickers (shows *Not in use*).
- **Delete vehicle**: *Only a vehicle on no expense or document can be deleted; mark it not in use instead.*

Once you have a vehicle, the expense form shows a **Vehicle** field (**No vehicle** by default).

---

### 10.9 Scan a bill or receipt (OCR)

**Goal:** turn a photo of a bill into an expense or a purchase bill without typing it in.
**Who / plan:** owner, admin or accountant · Pro or Business.
**Before you start:** use the **installed Elixir Books app on Android or iPhone**. The app reads the text on the phone. In a web browser or Expo Go there is no reader today (see Rules & gotchas).

**Steps**
1. Open **Scan a bill** (from **Buy**, or **Scan with OCR instead** on the expense form).
2. Choose what you are scanning: **Expense receipt** or **Supplier bill**.
3. Tap **Take a photo** or **Choose from gallery**. *Lay the bill flat with good light for the best result.*
   - The first time, allow camera or photo access. If you said no, you see **Allow camera access in Settings to scan a bill.** or **Allow photo access in Settings to pick a bill.**
4. Wait while the app shows **Reading the bill…**. The photo is kept with your books, and the vendor, GSTIN, date, amount, tax, reference and line items are read. For a receipt, a matching expense category is suggested. You see **Bill read. Check the details**.
5. On **Review extraction**, check each field. Each shows how sure the app is, for example **82% sure**.
   - **N fields need a quick check before saving.** Tap **Looks right** on each one you've checked, or correct it.
   - A date must be typed as YYYY-MM-DD, or it won't carry into the form.
   - **Line items** shows each line's **Item**, **Qty**, **Rate** and **Sure**, and the **Extracted total**.
   - **View the bill full screen** shows the photo.
6. Tap **Create expense** or **Create bill**. If fields are still unchecked you're asked once more (**Check them**, or go on).

**What happens**
- A **filled-in form** opens (*Fields carried into the form*):
  - an expense with the amount, date, reference, supplier (matched by GSTIN, then by name), suggested category and the photo as its receipt; or
  - a purchase bill ([06](06-purchases.md)) with the supplier and lines; lines matched to your catalogue items move their stock.
- **Nothing is written to your books until you finish and save that form yourself.**
- To start over, tap **Rescan**.

**Rules & gotchas**
- **No text found. Retake the photo flat and in good light.** means the phone found no text in the photo.
- Opening **Review extraction** with nothing scanned shows **Nothing scanned yet** and **Scan a bill**.
- Text read on the phone doesn't use your monthly AI allowance.

**Not available yet:** **Reading bills on the web.** The browser page lets you **Upload a photo of the bill**, but the server has no reader for photos yet, so you see *Bill scanning works in the installed Elixir Books app on Android or iPhone. It is not available in the browser or in Expo Go.* Use the phone app. See [18](18-troubleshooting-faq.md#not-available-yet).

---

**Related:** [06 Purchases](06-purchases.md) · [07 Payments](07-payments.md) · [12 Reports](12-reports.md) · [13 Settings › Payment accounts](22-banking-and-reconciliation.md#add-a-bank-cash-or-wallet-account) · [19 Books](19-books.md) · [20 Reimbursements](20-tds-rcm-itc.md) · [22 Banking](22-banking-and-reconciliation.md)
