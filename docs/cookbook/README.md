# Elixir Books Smart — Application Cookbook

How to use every feature of Elixir Books Smart, and how to test it.

- **[Part A — User guide](#part-a--user-guide)** shows how to get a job done: issuing an invoice, recording a payment, raising an e-way bill, and so on. It is written for business owners, accountants, sales and counter staff, and platform operators.
- **[Part B — Test scenarios](#part-b--test-scenarios)** lists, for each module, the scenarios to run with their expected results. It is written for QA and UAT, and runs on the demo account.

The cookbook describes the app as it is built today, using the words that appear on screen. Anything that isn't working yet is marked **Not available yet** rather than described as if it works. The full list is in [18 — Troubleshooting & FAQ](part-a-user-guide/18-troubleshooting-faq.md#not-available-yet).

---

## Part A — User guide

| # | Chapter | What it covers |
|---|---|---|
| 01 | [Getting started](part-a-user-guide/01-getting-started.md) | Try the demo, sign up, sign in by email or phone OTP, two-step sign-in, reset a password, accept an invitation, delete your account |
| 02 | [Onboarding](part-a-user-guide/02-onboarding.md) | Setting up your business in three steps: tax, business details, numbering |
| 03 | [Finding your way around](part-a-user-guide/03-navigation.md) | Tabs, the Money section, the More menu, the desktop sidebar, switching business or branch, search, notifications |
| 04 | [Home dashboard](part-a-user-guide/04-home-dashboard.md) | Period picker, tiles, charts, filing cards, Accounts & P&L, setup checklist |
| 05 | [Sales](part-a-user-guide/05-sales.md) | Quotes, proformas, sales orders, delivery notes, invoices, returns, notes, recurring and opening invoices, TCS, charges, sharing |
| 06 | [Purchases](part-a-user-guide/06-purchases.md) | Purchase orders, goods receipts, bills (incl. import and ISD), returns, opening bills |
| 07 | [Payments, receivables & payables](part-a-user-guide/07-payments.md) | Money in and out, allocation, advances and refunds, FX gain/loss, receipts, aging, reminders |
| 08 | [Customers & suppliers](part-a-user-guide/08-contacts.md) | Contacts, GST registration types, MSME, TDS and TCS fields, credit limits, statements, import |
| 09 | [Items & stock](part-a-user-guide/09-items-and-stock.md) | Products and services, categories and brands, opening stock, adjustments, transfers, low stock, FIFO and average costing |
| 10 | [Expenses & bill scanning](part-a-user-guide/10-expenses-and-ocr.md) | Expenses, recurring expenses, receipts, OCR |
| 11 | [GST compliance](part-a-user-guide/11-gst-compliance.md) | E-invoice (IRN), e-way bill, LUT and exports, compliance register, GSTR-1 |
| 12 | [Reports](part-a-user-guide/12-reports.md) | The 18 reports, filters, custom ranges, exports |
| 13 | [Settings](part-a-user-guide/13-settings.md) | Every settings page: profile, business, branches, numbering, modules, custom fields, integrations, backup, audit, AI usage, appearance |
| 14 | [Team, roles & plans](part-a-user-guide/14-team-roles-plans.md) | Inviting people, the role matrix, plan contents and limits, AI allowance |
| 16 | [Lixi assistant](part-a-user-guide/16-lixi-assistant.md) | Asking Lixi about your books, confirming the actions it proposes, AI usage |
| 17 | [Admin console (operators)](part-a-user-guide/17-admin-console.md) | Platform operators: two-step sign-in, accounts, plan overrides, users, AI cost, audit |
| 18 | [Troubleshooting & FAQ](part-a-user-guide/18-troubleshooting-faq.md) | Error messages, limits, features not available yet |
| 19 | [Books](part-a-user-guide/19-books.md) | Chart of accounts, vouchers, day book, trial balance, P&L, balance sheet, integrity check, cost centres, closing the books, Tally export |
| 20 | [TDS, TCS, reverse charge, credit & adjustments](part-a-user-guide/20-tds-rcm-itc.md) | TDS and TCS, reverse charge, input credit, credit and debit notes, reimbursements, advances for services, MSME payments |
| 21 | [GST returns](part-a-user-guide/21-gst-returns.md) | GST portal connection, GSTR-2B matching, GSTR-3B, set-off, challan, GST journal, saving and filing |
| 22 | [Banking & reconciliation](part-a-user-guide/22-banking-and-reconciliation.md) | Payment accounts, transfers, bank statement import, matching, reconciliation statement |
| 23 | [Fixed assets](part-a-user-guide/23-fixed-assets.md) | Asset register, depreciation, disposal, the schedule |
| 24 | [Budgets & cash-flow forecast](part-a-user-guide/24-budgets-and-forecasts.md) | Budgets, budget against actual, cash-flow forecast |
| 25 | [Approvals](part-a-user-guide/25-approvals.md) | Approval rules for documents and payments made; approving or sending back |
| 26 | [Imports & opening balances](part-a-user-guide/26-imports-and-opening-balances.md) | Where each opening balance goes; importing contacts, items, journals, outstanding invoices and bills |
| 27 | [Invoice design](part-a-user-guide/27-invoice-design.md) | Templates, logo, signature, copies, bank details and UPI QR, brands |
| 28 | [Company archive & your data](part-a-user-guide/28-company-archive-and-data.md) | Export, backups, downgrades, archiving and restoring a business, the 8-year purge, deleting your account |

## Part B — Test scenarios

| # | File | Scenario IDs |
|---|---|---|
| 00 | [Test setup & demo data](part-b-test-scenarios/00-test-setup.md) | — |
| 01 | [Auth & onboarding](part-b-test-scenarios/01-auth-onboarding.md) | `AUTH-`, `ONB-` |
| 02 | [Sales documents & invoice design](part-b-test-scenarios/02-sales-documents.md) | `SAL-`, `TPL-` |
| 03 | [Purchases](part-b-test-scenarios/03-purchases.md) | `PUR-` |
| 04 | [Payments, aging & approvals](part-b-test-scenarios/04-payments-aging.md) | `PAY-`, `APR-` |
| 05 | [Contacts, items & stock](part-b-test-scenarios/05-contacts-items-stock.md) | `CON-`, `ITM-`, `STK-` |
| 06 | [Expenses & OCR](part-b-test-scenarios/06-expenses-ocr.md) | `EXP-`, `OCR-` |
| 07 | [GST: e-invoice, e-way bill, GSTR-1](part-b-test-scenarios/07-gst-einvoice-eway.md) | `EIN-`, `EWB-`, `GST-`, `LUT-` |
| 08 | [Reports](part-b-test-scenarios/08-reports.md) | `RPT-` |
| 09 | [Settings, team & plans](part-b-test-scenarios/09-settings-team-plans.md) | `SET-`, `TEAM-`, `PLAN-`, `ROLE-` |
| 11 | [Language & theme](part-b-test-scenarios/11-localisation-theme.md) | `L10N-` |
| 12 | [Web desktop](part-b-test-scenarios/12-web-desktop.md) | `WEB-` |
| 13 | [Admin console](part-b-test-scenarios/13-admin-console.md) | `ADM-` |
| 14 | [Accounting & GST returns](part-b-test-scenarios/14-accounting-gst-returns.md) | `BKS-`, `CC-`, `CLS-`, `TLY-`, `TDS-`, `RCM-`, `ITC-`, `NTE-`, `ADJ-`, `RMB-`, `ADV-`, `MSM-`, `G2B-`, `G3B-`, `UTL-` |
| 15 | [Books, banking & assets](part-b-test-scenarios/15-books-banking-assets.md) | `BKS-011`+, `BNK-`, `REC-`, `FA-`, `BUD-`, `CF-`, `IMP-`, `OPN-` |
| 16 | [Settings & your data](part-b-test-scenarios/16-settings-data.md) | `SET-052`+, `ARC-`, `PRV-` |
| 17 | [Lixi assistant](part-b-test-scenarios/17-lixi.md) | `LIXI-` |

---

## Conventions

- **Bold text** is a label you see on screen, for example **Finalise** or **Record payment**.
- **›** separates menu steps, for example **More › Settings › Numbering**.
- 📱 **Phone** and 🖥 **Desktop** mark steps that differ between the phone app and the web app. "Desktop" means a browser window 768 px or wider; a narrower browser window behaves like the phone app.
- Examples use the demo businesses **Vertex Traders** (Mumbai, Maharashtra, state 27) and **Aurora Design Studio** (Bengaluru, Karnataka, state 29). See [Test setup & demo data](part-b-test-scenarios/00-test-setup.md#4-demo-data-cheat-sheet).
- Amounts are in ₹ unless shown otherwise. Document numbers follow `PREFIX/FY/SEQ` with the short year, for example `INV/26-27/0042`.

Every Part A recipe has the same shape:

> **Goal** · **Who / plan** · **Before you start** · **Steps** · **What happens** · **Rules & gotchas** · **Related**

### Plans at a glance

| | Free | Smart Basic | Smart Pro | Smart Business |
|---|---|---|---|---|
| Price (monthly / yearly, web only) | ₹0 | ₹399 / ₹3,990 | ₹899 / ₹8,990 | ₹1,799 / ₹17,990 |
| Users per business (owner included) | 1 | 2 | 6 | Unlimited |
| Invoices | 20 a month | Unlimited | Unlimited | Unlimited |
| AI actions a month (Lixi and bill scans) | 30 | 300 | 1,500 | 5,000 |
| Sales, receipts, customers, receivables, e-invoice, e-way bill, GSTR-1, GSTR-3B | ✓ | ✓ | ✓ | ✓ |
| Purchases, suppliers, payables, payments made | — | — | ✓ | ✓ |
| Stock, adding branches, transfers | — | — | ✓ | ✓ |
| Expenses and bill scanning (OCR) | — | — | ✓ | ✓ |
| Choosing a document's currency | — | — | ✓ | ✓ |
| Books, budgets, fixed assets, bank reconciliation | — | — | ✓ | ✓ |
| GSTR-2B matching; GST set-off, challans and journals | — | — | ✓ | ✓ |
| Reports | 7 of 18 | 7 of 18 | All 18 | All 18 |

Free and Basic are the **sales plans**; Pro and Business are the **full plans**. Opening a module your plan doesn't include takes you to the upgrade page. Plans can't be changed in the app yet: a platform operator changes them on request. Moving to a smaller plan hides data but never deletes it. Role-based access, backups and audit export work on every plan; Google Drive backup is **Coming soon**. The details are in [14 — Team, roles & plans](part-a-user-guide/14-team-roles-plans.md#plans).

### Roles at a glance

| Role | In short |
|---|---|
| **Owner** | Everything, including billing, archiving the business, locking the books, switching modules on or off, approval rules and stock costing |
| **Admin** | Everything except the owner-only settings above: team, company settings, numbering, integrations, exports, deletes, and approving held documents and payments |
| **Accountant** | Everything Sales can do, plus masters, items, expenses, stock, e-invoice and e-way bill, the books, GST returns, bank reconciliation, fixed assets, budgets, imports and the audit log |
| **Sales** | Create, finalise, convert, cancel and send documents; contacts; record payments |
| **Viewer** | Read only |

The server enforces roles on every action; the app does not hide every button by role. The full matrix is in [14 — Team, roles & plans](part-a-user-guide/14-team-roles-plans.md#role-matrix).

## Glossary

| Term | Meaning |
|---|---|
| **GSTIN** | 15-character GST identification number. The first two digits are the state code. |
| **Place of supply** | The state where a supply is taxed. If it differs from your state the line takes IGST; if it is the same, CGST + SGST. Exports use state code 96. |
| **HSN / SAC** | Classification codes for goods (HSN) and services (SAC), 4, 6 or 8 digits. Required on GST documents. |
| **IRN** | Invoice Reference Number, issued by the e-invoice portal (IRP) for a B2B invoice or credit note. |
| **E-way bill (EWB)** | Permit for moving goods worth more than the threshold (default ₹50,000). Part-A is the document; Part-B is the vehicle. |
| **LUT** | Letter of Undertaking. With one on file, exports and SEZ supplies are zero-rated without paying IGST. |
| **GSTR-1** | Monthly or quarterly return of outward supplies. The app prepares it; filing is done on the GST portal. |
| **Finalise** | Turn a draft into a permanent document. The number is assigned and the document can't be edited afterwards. |
| **Advance** | The part of a payment not applied to any document. It is held against the contact. |
| **Aging** | Outstanding amounts grouped by how late they are: current, 1–30, 31–60, 61–90 and 90+ days. |
| **Lixi** | The in-app assistant that answers questions from your books. |
| **GSTR-2B / GSTR-3B** | 2B is the portal's statement of input credit from your suppliers; 3B is the monthly summary return where tax is set off and paid. |
| **TDS / TCS** | Tax deducted at source on payments, and tax collected at source on sales, under the Income-tax Act. |
| **Reconciliation** | Matching the lines of a bank statement to the payments and receipts in your books. |
| **FIFO** | First in, first out: stock is costed at the price of the oldest units still on hand. The other option is weighted average. |
