# 12 — Reports

There are nine reports. Each one states its basis (what it counts and how) and can be exported as PDF, Excel or CSV.

- **Plan:** Free and Basic get four of the nine reports; Pro and Business get all nine.
- **Roles:** every role, including viewer, can open reports.

Where to find them: 📱 **Reports** tab on the sales plans, or **More › People & reports › Reports** on the full plans. 🖥 **Manage › Reports** in the sidebar.

---

### Read the Reports hub

The hub opens on a **Snapshot** of the **financial year to date**, in your base currency:

| Tile | Meaning |
|---|---|
| **Revenue (FY)** | Taxable value invoiced this financial year. Tax collected is not counted. |
| **Net profit** | Revenue less cost of goods and expenses, with the **margin** % |
| **Receivable** | What customers still owe you |
| **Payable** | What you still owe suppliers |
| **Monthly profit** | Chart of revenue less cost of goods and expenses, by month |

Below the snapshot, **All reports** lists every report your plan includes. Tap one to **Open** it.

---

### The nine reports

| Report | What it answers | Basis | Default period | Plan |
|---|---|---|---|---|
| **Sales summary** | Sales by month, customer, item and branch | Invoiced value, discounts given | Last 90 days | All |
| **Receivables** | Who owes you, and for how long | Outstanding = document total less allocated payments; aging buckets | Last 90 days | All |
| **Tax summary** | Output vs input tax, ready to file | Output tax on sales less input tax on purchases and expenses | **This financial year** | All |
| **Payments & cash** | Money in and out, by method and by account | Payments recorded | Last 90 days | All |
| **Purchase summary** | What you bought and from whom | Purchase value, discounts received | Last 90 days | Pro+ |
| **Expense summary** | Spend by category over time | Expenses and input tax | Last 90 days | Pro+ |
| **Payables** | Supplier dues and aging | Outstanding = bill total less payments made | Last 90 days | Pro+ |
| **Stock report** | On-hand quantity and valuation | Quantity from every stock movement; value at weighted average cost | Last 90 days | Pro+ |
| **Profit snapshot** | Revenue less cost and expenses | Revenue is **taxable value**, so tax collected is not income | **This financial year** | Pro+ |
| **TDS deducted** | TDS kept back on supplier bills, by quarter, section and deductee (for Form 26Q) | Supplier bills and notes dated in the period | **This financial year** | Pro+ |
| **MSME payments due** | Micro and small suppliers' unpaid bills against the 45-day limit, and what wasn't paid in time this year (s.43B(h)) | Unpaid on the period's last day ([20](20-tds-rcm-itc.md#paying-micro-and-small-suppliers-on-time)) | Last 90 days | Pro+ |

---

### Run a report with filters

**Goal:** narrow a report to a period, a branch or a contact.

**Steps**
1. Open the report.
2. Tap the date chip to pick a **Date range**: **Today**, **Yesterday**, **Last 7 days**, **Last 30 days**, **This month**, **Last month**, **Last 90 days**, **This financial year**, **Last financial year**, **All time** or **Custom**.
3. Tap **Branch** to limit it to one branch. The default is **all branches**.
4. Tap **Contact** to limit it to one customer or supplier. The default is **All contacts**.
5. To remove a filter, tap **Clear 〈filter〉**.

**What happens**
- The **Report basis** line restates exactly what you're looking at, for example: *"Vertex Traders · 1 Apr 2026 to 31 Oct 2026 · all branches · presented in INR, foreign-currency documents converted at the rate stored on each document."*
- 🖥 Filters are kept in the page address, so you can bookmark or share a filtered report with a colleague who has access.

**Rules & gotchas**
- Drafts and cancelled documents are never counted.
- Foreign-currency documents are converted at the rate **saved on each document**, so past totals never shift when rates change.
- Reports are loaded from the server when you open them, so they are current. Without a connection you see *You're offline. These figures are from your last visit.*

---

### Export a report

1. Open the report and set its filters.
2. Tap **Export**, then pick **PDF**, **Excel (.xlsx)** or **Export as CSV**.
3. 📱 The phone's share sheet opens, so you can save the file or send it on. 🖥 The browser downloads the file. A PDF opens the print dialog, where you can save it as PDF.

The export covers exactly what's on screen: the same period, branch and contact.

*Example (accountant):* Meera wants the tax position for Q2.
- She opens **Tax summary**, sets **Custom** to 1 Jul – 30 Sep and exports **Excel (.xlsx)**.
- The file shows **Output tax on sales**, **Input tax credit** and **Net payable**, broken down by rate.

---

### Inside each report

- **Sales summary:** **Total invoiced**, **Discounts given**, **By month**, **Top customers**, **Top items**, **By branch**.
- **Receivables / Payables:**
  - **Outstanding**, **Overdue** and **Open documents**.
  - An **Aging** table: **Current**, then 1–30, 31–60, 61–90 and 90+ days.
  - A **Detail** list of each document with **Days overdue**.
  - To chase or pay, use the **Receivables** or **Payables** screens ([07](07-payments.md)).
- **Tax summary:** **Outward supplies (sales)** and **Inward supplies (purchases)** by rate, then **Net tax payable**.
- **Payments & cash:** **Money in**, **Money out**, **Net cash movement**, **By method**, **By account**.
- **Stock report:**
  - **Stock on hand** value, **Tracked items**, **Low stock** (at or below reorder level) and **Out of stock**.
  - **Most valuable** items, then **All tracked items**.
- **Profit snapshot:** **How it adds up**: **Revenue (taxable value)** − **Cost of goods sold** = **Gross profit** − **Operating expenses** = **Net profit**. Then a **Monthly detail** table.
- **Expense summary:** **Total spent**, **Largest category**, **By category**, **Input tax**.

---

### A report is locked

On Free or Basic, opening **Purchase summary**, **Expense summary**, **Payables**, **Stock report** or **Profit snapshot** shows the upgrade page.
- An owner can upgrade from there ([14](14-team-roles-plans.md#upgrade-or-downgrade-the-plan)).
- Anything recorded on a higher plan earlier is kept, and comes back after an upgrade.

---

**Related:** [07 Payments & aging](07-payments.md) · [11 GSTR-1](11-gst-compliance.md#gstr-1) · [09 Stock](09-items-and-stock.md) · [13 Backup & export](13-settings.md#backup--export)

The books' own statements (trial balance, profit and loss, balance sheet, day book, profit by cost centre) are under **More › Books** ([19](19-books.md)).
