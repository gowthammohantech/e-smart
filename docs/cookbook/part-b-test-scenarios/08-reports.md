# 08 — Reports

Tests for the reports hub, the 18 reports, their filters, basis lines, exports, plan and module gating. Setup and demo data are in [00 — Test setup](00-test-setup.md). User guide: [12 — Reports](../part-a-user-guide/12-reports.md).

Each report is worked out on the server when it opens or a filter changes. The app is online-only: with no connection a report shows **Couldn't load this** with **Retry**, never a report of zeros.

### Hub

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| RPT-001 | Hub tiles | Owner / Pro | Vertex | 📱 **More › More sections › Reports**; 🖥 **Manage › Reports** | "Financial year to date · INR"; **Revenue (FY)**, **Net profit** with margin, **Receivable**, **Payable**; **Monthly profit** chart (last 6 months); **Snapshot**: Gross profit, Cost of goods sold, Operating expenses, Stock on hand | happy |
| RPT-002 | All 18 on Pro | Owner / Pro | No module switched off | List | **All reports**: Sales summary, Purchase summary, Expense summary, Receivable report, Payables, Stock report, Tax summary, Payments & cash, Advances, Profit snapshot, MSME payments due. **TDS & TCS**: TDS deducted, TDS payable, TDS receivable, Form 26Q deductees, TDS challans, TCS register, TCS payable | happy |
| RPT-003 | 7 on Basic | Owner / Basic | Aurora | List | No tiles or chart; the hub starts at the list. **All reports**: Sales summary, Receivable report, Tax summary, Payments & cash, Advances. **TDS & TCS**: TDS receivable, TCS register | plan |
| RPT-004 | Deep link to a gated report | Owner / Basic | Aurora | Open `/reports/profit` | Upgrade page; the API also refuses the figures (plan upgrade required) | plan |

### Each report

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| RPT-010 | Default range | | | Open Sales summary | Last 90 days; **Report basis** "<company> · <from> to <to> · all branches · presented in INR, foreign-currency documents converted at the rate stored on each document."; then "Generated <date time>" | happy |
| RPT-011 | FY default | | | Open Profit snapshot, Tax summary and any TDS or TCS report | Range defaults to **This financial year** | happy |
| RPT-012 | Revenue is taxable value | Owner / Pro | Reference invoice ₹2,124 (taxable ₹1,800) | Profit snapshot for that day | Revenue (taxable value) ₹1,800, not ₹2,124 ("Revenue is taxable value, so tax collected is not counted as income…") | happy |
| RPT-013 | Receivables basis | | | Receivable report | "Outstanding = document total less allocated payments."; total matches the Receivables screen and the home dashboard | happy |
| RPT-014 | Payables basis | Owner / Pro | | Payables | "Outstanding = bill total less payments made." | happy |
| RPT-015 | Stock basis | Owner / Pro | | Stock report | "Quantity derived from every stock movement; value at weighted average cost."; stock value, tracked / low / out counts | happy |
| RPT-016 | Tax summary | | | Tax summary | "Output tax on sales less input tax on purchases."; **Net tax payable**; outward and inward by rate with CGST, SGST, IGST; includes expense input tax | happy |
| RPT-017 | Payments & cash | | | Payments & cash | **Net cash movement**; By month, **By method**, **By account** | happy |
| RPT-018 | Profit snapshot agrees with the books | Owner / Pro | | Profit snapshot, then **Books › Profit and loss** for the same range | Same net profit. "How it adds up": Revenue − Cost of goods sold = Gross profit (+ Other income if any) − Operating expenses = Net profit | happy |
| RPT-019 | Branch filter | Owner / Pro | Vertex (2 branches) | Branch = Pune | Only PUN figures; basis line names the branch | happy |
| RPT-020 | Contact filter | | | Sales summary → Contact = Kumar Electronics | Only their documents | happy |
| RPT-021 | Foreign currency converted | | AED invoice | Sales summary | Converted at the rate stored on the document | edge |
| RPT-022 | Drafts and cancelled left out | | One draft and one cancelled invoice in range | Sales summary | Neither counted | edge |
| RPT-023 | Connection lost | | Report open; then network off | Change the range | **Couldn't load this** · "Check your connection and try again." with **Retry**; no zeros shown. Network on → **Retry** loads | negative |

### Export

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| RPT-030 | PDF | Owner | | **Export › PDF** | 📱 share sheet with the PDF; 🖥 print dialog. Shows the basis line and "Generated…" | happy |
| RPT-031 | Excel | | | **Excel (.xlsx)** | .xlsx downloads / shares, same rows as on screen | happy |
| RPT-032 | CSV | | | **Export as CSV** | CSV downloads / shares | happy |
| RPT-033 | Cancel the export | | 📱 | Dismiss the share sheet | "Export was cancelled" | edge |
| RPT-034 | Export after the connection drops | | Report loaded; network off | Export PDF | The file is made from the figures already on screen (export is built in the app) | edge |
| RPT-035 | Viewer can read and export | Viewer | | Open and export | Allowed | permission |

### New since 8 Nov

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| RPT-040 | Custom range | | | Date chip → **Custom range** → From 1 Jul, To 30 Sep → **Show this range** | Chip reads "01 Jul 2026 – 30 Sep 2026"; figures for that range | happy |
| RPT-041 | Custom range back to front | | | From after To | "Ends before it starts"; can't apply | validation |
| RPT-042 | Range presets | | | Open the date chip | Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, Last 90 days, This financial year, Last financial year, All time, Custom range | happy |
| RPT-043 | Clear a filter | | Branch filter set | Tap the × on the branch chip | Back to all branches | happy |
| RPT-044 | No branch chip with one branch | Owner / Basic | Aurora (one branch) | Open Sales summary | No branch chip | edge |
| RPT-045 | Contact chip only where it applies | | | Open Tax summary and Stock report | No contact chip. It shows on Sales summary, Purchase summary, Payments & cash, Advances | edge |
| RPT-046 | Advances | | A receipt with ₹5,000 unallocated | Advances | **Advance receipts** includes it; listed under **Open advances** with **To adjust** ₹5,000. With none: "No open advances" | happy |
| RPT-047 | MSME payments due | Owner / Pro | Micro supplier with an unpaid bill 50 days old | MSME payments due | Under **Past the legal limit**; "N days late"; interest at 3 × the RBI bank rate; **Not paid in time this year** lists it | happy |
| RPT-048 | TDS payable | Owner / Pro | TAN set; bill with 194C TDS; no challan | TDS payable | **Deducted**, **To deposit**; due by the 7th of next month; **Overdue** once past | happy |
| RPT-049 | TDS receivable and 26AS match | Owner / Basic | Receipt with TDS deducted by the customer | TDS receivable | **Kept back by customers**; **26AS match** row with Expected, Recorded, Difference | happy |
| RPT-050 | Form 26Q deductees | Owner / Pro | Supplier without PAN, with TDS | Form 26Q deductees | **Without a PAN** counts 1; **Not yet deposited** counts rows with no challan | edge |
| RPT-051 | TDS challans | Owner / Pro | TDS challan voucher in Books | TDS challans | Row with BSR code and serial. With none: "No TDS challans in this period" | happy |
| RPT-052 | TCS register | Owner / Basic | Invoice under a TCS section, then a credit note on it | TCS register | Invoice row with base, rate, TCS; credit note negative in proportion. With none: "No TCS in this period" | happy |
| RPT-053 | TCS payable with 27EQ rows | Owner / Pro | As RPT-052 | TCS payable | By section and month; **27EQ quarter rows** | happy |
| RPT-054 | Branch-limited user and the books | Accountant limited to Pune / Pro | | Open TDS payable, TDS receivable, TCS payable | **Limited to some branches** · "The books cover every branch. Ask an owner or admin…" Other reports show Pune only | permission |
| RPT-055 | Module switched off hides its reports | Owner / Pro | Switch off **Expenses** in Settings › Modules | Reports hub | Expense summary and Profit snapshot leave the list; the hub's profit tiles go. Switch back on → they return | edge |
| RPT-056 | Hub figure fails | Owner / Pro | Make the profit request fail (e.g. network off during load) | Open hub | Tiles show "—", not ₹0; **Couldn't load this** card with **Retry** | negative |
| RPT-057 | Hub on desktop | Owner / Pro | 🖥 wide window | Open hub | Chart and Snapshot side by side; report cards three to a row | happy |
| RPT-058 | Desktop table | Owner / Pro | 🖥 | Sales summary | Headline figures in a row; sortable table of every invoice | happy |
| RPT-059 | Receivables as of range end | | Invoice paid on 5 Nov | Receivable report, range ending 31 Oct | Invoice still outstanding as of 31 Oct | edge |
| RPT-060 | Unknown report | | | Open `/reports/xyz` | "Unknown report" · "Pick a report from the Reports tab." | negative |
