# 12 — Reports

There are 18 reports: 11 business reports and 7 TDS & TCS reports. Each one states its basis (what it counts and how) and can be exported as PDF, Excel or CSV.

- **Plan:** Free and Basic get 7 of the 18 reports; Pro and Business get all 18. The table below shows which.
- **Modules:** a report also leaves the list when an owner switches off the module it reads ([13 › Modules](13-settings.md#modules)).
- **Roles:** every role, including viewer, can open reports. Someone limited to some branches can't open the three reports that read the whole set of books (see [A report says "Limited to some branches"](#a-report-says-limited-to-some-branches)).

Where to find them: 📱 **More › More sections › Reports**, on every plan. 🖥 **Manage › Reports** in the sidebar.

The figures come from the server each time you open a report or change a filter, so they are always current. The app needs a connection to show them.

---

### Read the Reports hub

**Goal:** see the year so far at a glance, then open a report.
**Who / plan:** every role. The figures at the top are on Pro and Business only.

On Pro and Business the hub opens with the **Financial year to date**, in your base currency:

| Tile | Meaning |
|---|---|
| **Revenue (FY)** | Taxable value invoiced this financial year. Tax collected is not counted. |
| **Net profit** | Revenue less cost of goods and expenses, with the **margin** % |
| **Receivable** | What customers still owe you |
| **Payable** | What you still owe suppliers |
| **Monthly profit** | Chart of the last six months' profit. **Open** goes to the Profit snapshot. |
| **Snapshot** | **Gross profit**, **Cost of goods sold**, **Operating expenses** and **Stock on hand** |

On Free and Basic the hub starts at the list, because profit and stock need the buying side of the books.

Below that:
- **All reports** lists the business reports your plan includes.
- **TDS & TCS** lists the tax-deduction reports, kept together so they are easy to find.

Tap a report to open it.

**Rules & gotchas**
- A tile shows while it loads. If a figure can't load, it shows **—**, never ₹0, and a card **Couldn't load this** offers **Retry**.
- A tile for a report you can't open is left out.
- 🖥 The chart and the snapshot sit side by side on a wide screen, and the reports show as cards, three to a row.

---

### The 18 reports

**Business reports**

| Report | What it answers | Basis | Default period | Plan |
|---|---|---|---|---|
| **Sales summary** | Sales by month, customer, item and branch | Invoiced value, discounts given | Last 90 days | All |
| **Purchase summary** | What you bought and from whom | Purchase bills, discounts received | Last 90 days | Pro+ |
| **Expense summary** | Spend by category over time | Expenses and their input tax | Last 90 days | Pro+ |
| **Receivable report** | Who owes you, and for how long | *Outstanding = document total less allocated payments.* Aged as of the period's last day | Last 90 days | All |
| **Payables** | Supplier dues and aging | *Outstanding = bill total less payments made.* | Last 90 days | Pro+ |
| **Stock report** | On-hand quantity and valuation | *Quantity derived from every stock movement; value at weighted average cost* (or FIFO, if the business uses it) | Last 90 days | Pro+ |
| **Tax summary** | Output vs input tax, ready to file | *Output tax on sales less input tax on purchases*, plus input tax on expenses | **This financial year** | All |
| **Payments & cash** | Money in and out, by method and by account | Payments recorded | Last 90 days | All |
| **Advances** | Advance receipts and payments still to adjust | Payments dated in the period with money not yet set against an invoice or bill | Last 90 days | All |
| **Profit snapshot** | Revenue less cost and expenses | From the books' profit and loss ([19](19-books.md)), so the two always agree. Revenue is **taxable value**; cost of goods counts the change in stock | **This financial year** | Pro+ |
| **MSME payments due** | Micro and small suppliers' unpaid bills against the 45-day limit, and what wasn't paid in time this year (s.43B(h)) | Unpaid on the period's last day ([20](20-tds-rcm-itc.md#paying-micro-and-small-suppliers-on-time)) | Last 90 days | Pro+ |

**TDS & TCS reports** (all default to **This financial year**)

| Report | What it answers | Plan |
|---|---|---|
| **TDS deducted** | TDS kept back on supplier bills, by section, quarter and deductee: the figures for Form 26Q | Pro+ |
| **TDS payable** | TDS deducted, deposited and still to deposit, by section and month, with the due date (the 7th of the next month; 30 April for March) | Pro+ |
| **TDS receivable** | TDS your customers kept back, by customer and quarter, with a **26AS match** against what your invoices expected | All |
| **Form 26Q deductees** | Deductee-wise TDS with PAN and challan, ready for the return | Pro+ |
| **TDS challans** | Challans deposited, with BSR code and serial | Pro+ |
| **TCS register** | TCS collected on each invoice and given back on its credit notes | All |
| **TCS payable** | TCS collected, deposited and still to deposit, by section and month, with the 27EQ quarter rows | Pro+ |

So Free and Basic get **Sales summary**, **Receivable report**, **Tax summary**, **Payments & cash**, **Advances**, **TDS receivable** and **TCS register**.

How TDS and TCS are worked out is in [20 — TDS, reverse charge, credit & adjustments](20-tds-rcm-itc.md).

---

### Run a report with filters

**Goal:** narrow a report to a period, a branch or a contact.
**Who / plan:** every role, on any plan that includes the report.

**Steps**
1. Open the report.
2. Tap the date chip and pick a range: **Today**, **Yesterday**, **Last 7 days**, **Last 30 days**, **This month**, **Last month**, **Last 90 days**, **This financial year**, **Last financial year** or **All time**.
3. For any other period, tap **Custom range**, set **From** and **To**, then tap **Show this range**. If the end is before the start you see **Ends before it starts**.
4. Tap the branch chip to limit the report to one branch. It only shows when the business has more than one branch. The default is all branches.
5. On **Sales summary**, **Purchase summary**, **Payments & cash** and **Advances**, tap the contact chip to limit it to one customer or supplier. The default is **All contacts**.
6. To remove a branch or contact filter, tap the **×** on its chip (**Clear 〈filter〉**).

**What happens**
- The **Report basis** card restates exactly what you're looking at, for example: *"Vertex Traders · 1 Apr 2026 to 31 Oct 2026 · all branches · presented in INR, foreign-currency documents converted at the rate stored on each document."*
- Under it, **Generated 〈date and time〉** shows when the figures were fetched, and then the report's own basis sentence.
- While new figures load, the last ones stay on screen.
- 🖥 Filters are kept in the page address, so you can bookmark a filtered report or share it with a colleague who has access.

**Rules & gotchas**
- Drafts and cancelled documents are never counted.
- Foreign-currency documents are converted at the rate **saved on each document**, so past totals never shift when rates change.
- If the figures can't load, you see **Couldn't load this · Check your connection and try again.** with **Retry**. You never see a report of zeros instead.
- Receivables, payables and MSME dues are worked out as of the **last day** of the range.

---

### Export a report

**Goal:** take a report out as a file.
**Who / plan:** every role, including viewer.

**Steps**
1. Open the report and set its filters.
2. Tap **Export** (📱 the bar at the foot of the screen; 🖥 the button at the top right), then pick **PDF**, **Excel (.xlsx)** or **Export as CSV**.
3. 📱 The phone's share sheet opens, so you can save the file or send it on. 🖥 Excel and CSV download. A PDF opens the browser's print dialog, where you can save it as PDF.

**What happens**
- The file covers exactly what's on screen: the same period, branch and contact.
- The PDF carries the report basis line and the time it was generated.
- If you close the share sheet, or the file can't be made, you see **Export was cancelled**.

*Example (accountant):* Meera wants the tax position for Q2.
- She opens **Tax summary**, taps **Custom range**, sets 1 Jul – 30 Sep and exports **Excel (.xlsx)**.
- The file lists outward and inward supplies by rate, with taxable value, CGST, SGST, IGST and total.

---

### Inside each report

- **Sales summary / Purchase summary:**
  - **Total invoiced** (or **Total purchased**), with the number of documents and the average.
  - **By month** chart, then a **Breakdown**: **Taxable value**, **Tax**, **Discounts given** (or **Discounts received**) and **Grand total**.
  - **Top customers** (or **Top suppliers**), **Top items**, and **By branch** when there is more than one branch.
  - 🖥 A sortable table of every invoice or bill.
- **Expense summary:** **Total spent** with the input tax, **By category** (donut chart), **By month**, then a **Detail** table by category.
- **Receivable report / Payables:**
  - **Total receivable** (or **Total payable**), with how many are open and how much is overdue.
  - An **Aging** chart: current, then 1–30, 31–60, 61–90 and 90+ days.
  - A **Detail** list of each document with how many days late it is.
  - To chase or pay, use the **Receivables** or **Payables** screens ([07](07-payments.md)).
- **Stock report:** **Stock value** with tracked, low and out-of-stock counts; **Most valuable** items; then **All tracked items**. Low stock means at or below the reorder level.
- **Tax summary:** **Net tax payable** (output less input), **Outward supplies (sales)** and **Inward supplies (purchases)** by rate, then a **Summary**: **Output tax on sales**, **Input tax credit**, **Net payable**.
- **Payments & cash:** **Net cash movement** (in less out), **By month**, **By method**, **By account**.
- **Advances:** **Advance receipts** and **Advance payments**, then **Open advances**, each with the amount **To adjust**. With none, you see **No open advances**.
- **Profit snapshot:** **Net profit** and its share of revenue, **By month**, then **How it adds up**: **Revenue (taxable value)** − **Cost of goods sold** = **Gross profit** (+ **Other income**, when there is any) − **Operating expenses** = **Net profit**. Then a **Monthly detail** table.
- **MSME payments due:** **Owed to micro and small suppliers**, **Past the legal limit**, the **Unpaid bills** with days left or late and the interest the law adds, then **Not paid in time this year** for your CA.
- **TDS and TCS reports:** headline figures (deducted or collected, deposited, **To deposit**, **Overdue**, deductees **Without a PAN**), then the rows by section, month, quarter or invoice. An empty report tells you what to set up, for example **No TDS kept back** asks for a TAN in the business profile and a TDS section on the supplier.

---

### A report is locked

On Free or Basic, opening a Pro report (for example by a saved link to `/reports/profit`) shows the upgrade page.
- An owner can upgrade from there ([14](14-team-roles-plans.md#change-the-plan)).
- The server refuses the figures too, so the report can't be fetched another way.
- Anything recorded on a higher plan earlier is kept, and comes back after an upgrade ([28](28-company-archive-and-data.md#what-happens-to-your-data-when-you-downgrade)).

### A report says "Limited to some branches"

**TDS payable**, **TDS receivable** and **TCS payable** read the books, and the books cover every branch. Someone whose access is limited to some branches sees **Limited to some branches** with *"The books cover every branch. Ask an owner or admin to see the balance sheet and accounts."* Their other reports show only their branches.

---

**Related:** [07 Payments & aging](07-payments.md) · [11 GSTR-1](11-gst-compliance.md#gstr-1) · [09 Stock](09-items-and-stock.md) · [20 TDS & TCS](20-tds-rcm-itc.md) · [28 Data export](28-company-archive-and-data.md)

The books' own statements (trial balance, profit and loss, balance sheet, day book, profit by cost centre) are under **More › Books** ([19](19-books.md)). GST returns are in [21](21-gst-returns.md).
