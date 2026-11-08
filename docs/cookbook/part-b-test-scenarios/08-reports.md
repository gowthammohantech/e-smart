# 08 — Reports

Tests for the reports hub, the nine reports, their filters, basis lines, exports and plan gating. Setup and demo data are in [00 — Test setup](00-test-setup.md).

Reports are worked out in the app from the records the server sends when the report opens. Without a connection, a report already on screen stays readable but doesn't refresh.

### Hub

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| RPT-001 | Hub tiles | Owner / Pro | Vertex | **Reports** (📱 under More on Pro) | "Financial year to date · INR"; Revenue, Net profit, Receivable, Payable; monthly profit chart | happy |
| RPT-002 | All 9 on Pro | Owner / Pro | | List | Sales summary, Purchase summary, Expense summary, Receivables, Payables, Stock report, Tax summary, Payments & cash, Profit snapshot | happy |
| RPT-003 | 4 on Basic | Owner / Basic | Aurora | List | Sales summary, Receivables, Tax summary, Payments & cash. The other five need Pro | plan |
| RPT-004 | Deep link to a gated report | Owner / Basic | Aurora | Open `/reports/profit` | Upgrade page | plan |

### Each report

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| RPT-010 | Default range | | | Open Sales summary | Last 90 days; basis line "<company> · <from> to <to> · <branch> · INR" | happy |
| RPT-011 | FY default | | | Open Profit snapshot and Tax summary | Range defaults to the financial year | happy |
| RPT-012 | Revenue is taxable value | | Reference invoice ₹2,124 (taxable ₹1,800) | Sales summary for that day | Revenue ₹1,800, not ₹2,124 ("Revenue is taxable value, so tax collected is not counted as income.") | happy |
| RPT-013 | Receivables basis | | | Receivables | "Outstanding = document total less allocated payments."; matches the aging screen | happy |
| RPT-014 | Payables basis | Owner / Pro | | Payables | "Outstanding = bill total less payments made." | happy |
| RPT-015 | Stock basis | Owner / Pro | | Stock report | "Quantity derived from every stock movement; value at weighted average cost." | happy |
| RPT-016 | Tax summary | | | Tax summary | "Output tax on sales less input tax on purchases."; includes expense input tax | happy |
| RPT-017 | Payments & cash | | | Payments & cash | In and out by account and method | happy |
| RPT-018 | Profit snapshot | Owner / Pro | | Profit | Revenue − purchases − expenses for the FY | happy |
| RPT-019 | Branch filter | Owner / Pro | | Branch = Pune | Only PUN documents; basis line names the branch | happy |
| RPT-020 | Contact filter | | | Contact = Kumar Electronics | Only their documents | happy |
| RPT-021 | Foreign currency converted | | AED invoice | Sales summary | Converted at the rate stored on the document; basis "…foreign-currency documents converted at the rate stored on each document" | edge |
| RPT-022 | Drafts and cancelled left out | | One draft and one cancelled invoice in range | Sales summary | Neither counted | edge |
| RPT-023 | Offline | | Report open; then network off | Change a filter | "You're offline. These figures are from your last visit."; the figures on screen stay readable | offline |

### Export

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| RPT-030 | PDF | Owner | Online | **Export › PDF** | PDF of the report as filtered [sim] | happy |
| RPT-031 | Excel | | | **Excel (.xlsx)** | .xlsx downloads | happy |
| RPT-032 | CSV | | | **Export as CSV** | CSV downloads | happy |
| RPT-033 | Cancel the export | | | Dismiss the share sheet | "Export was cancelled" | edge |
| RPT-034 | Export offline | | Network off | PDF | Fails with a connection message ("The export failed. Try again.") | offline |
| RPT-035 | Viewer can read and export | Viewer | | Open and export | Read allowed | permission |
