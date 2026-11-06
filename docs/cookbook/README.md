# Elixir Books Smart — Application Cookbook

How to use every feature of Elixir Books Smart, and how to test it.

- **[Part A — User guide](#part-a--user-guide)** shows how to get a job done: issuing an invoice, recording a payment, raising an e-way bill, and so on. It is written for business owners, accountants, sales and counter staff, and platform operators.
- **[Part B — Test scenarios](#part-b--test-scenarios)** lists, for each module, the scenarios to run with their expected results. It is written for QA and UAT, and runs on the demo account.

The cookbook describes the app as it is built today, using the words that appear on screen. Anything that isn't working yet is marked **Not available yet** rather than described as if it works. The full list is in [18 — Troubleshooting & FAQ](part-a-user-guide/18-troubleshooting-faq.md#not-available-yet).

---

## Part A — User guide

| # | Chapter | What it covers |
|---|---|---|
| 01 | [Getting started](part-a-user-guide/01-getting-started.md) | Sign up, sign in by email or phone OTP, reset a password, accept an invitation, manage devices |
| 02 | [Onboarding](part-a-user-guide/02-onboarding.md) | Setting up your business: country, business details, tax, numbering, branches |
| 03 | [Finding your way around](part-a-user-guide/03-navigation.md) | Tabs, the More menu, switching business or branch, search, notifications, the web desktop layout |
| 04 | [Home dashboard](part-a-user-guide/04-home-dashboard.md) | Tiles, trend, "Needs your attention", quick actions |
| 05 | [Sales](part-a-user-guide/05-sales.md) | Quotes, sales orders, delivery notes, invoices, sales returns, sharing, foreign-currency invoices |
| 06 | [Purchases](part-a-user-guide/06-purchases.md) | Purchase orders, goods receipts, purchase bills, purchase returns |
| 07 | [Payments, receivables & payables](part-a-user-guide/07-payments.md) | Money in and out, allocation, advances, FX gain/loss, aging, reminders |
| 08 | [Customers & suppliers](part-a-user-guide/08-contacts.md) | Contacts, GST registration types, credit limits |
| 09 | [Items & stock](part-a-user-guide/09-items-and-stock.md) | Products and services, opening stock, adjustments, transfers, low stock |
| 10 | [Expenses & bill scanning](part-a-user-guide/10-expenses-and-ocr.md) | Expenses, recurring expenses, receipts, OCR |
| 11 | [GST compliance](part-a-user-guide/11-gst-compliance.md) | E-invoice (IRN), e-way bill, compliance register, GSTR-1 (returns are in [21](part-a-user-guide/21-gst-returns.md)) |
| 12 | [Reports](part-a-user-guide/12-reports.md) | The nine reports, filters, exports |
| 13 | [Settings](part-a-user-guide/13-settings.md) | Business profile, branches, taxes, numbering, accounts, integrations, backup, audit, appearance |
| 14 | [Team, roles & plans](part-a-user-guide/14-team-roles-plans.md) | Inviting people, roles, plan limits, upgrading |
| 15 | [Working offline & sync](part-a-user-guide/15-offline-and-sync.md) | What works offline, provisional numbers, conflicts |
| 16 | [Lixi assistant](part-a-user-guide/16-lixi-assistant.md) | Asking Lixi about your books, confirming the actions it proposes |
| 17 | [Admin console (operators)](part-a-user-guide/17-admin-console.md) | Platform operators: accounts, plan overrides, users, audit |
| 18 | [Troubleshooting & FAQ](part-a-user-guide/18-troubleshooting-faq.md) | Error messages, limits, features not available yet |
| 19 | [Books](part-a-user-guide/19-books.md) | Chart of accounts, vouchers, trial balance, P&L, balance sheet, cost centres, closing the books, Tally export |
| 20 | [TDS, reverse charge, credit & adjustments](part-a-user-guide/20-tds-rcm-itc.md) | TDS, reverse charge, input credit, credit and debit notes, reimbursements, advances for services, MSME payments |
| 21 | [GST returns](part-a-user-guide/21-gst-returns.md) | GST portal connection, GSTR-2B matching, GSTR-3B, saving and filing GSTR-1 and 3B |

## Part B — Test scenarios

| # | File | Scenario IDs |
|---|---|---|
| 00 | [Test setup & demo data](part-b-test-scenarios/00-test-setup.md) | — |
| 01 | [Auth & onboarding](part-b-test-scenarios/01-auth-onboarding.md) | `AUTH-`, `ONB-` |
| 02 | [Sales documents](part-b-test-scenarios/02-sales-documents.md) | `SAL-` |
| 03 | [Purchases](part-b-test-scenarios/03-purchases.md) | `PUR-` |
| 04 | [Payments & aging](part-b-test-scenarios/04-payments-aging.md) | `PAY-` |
| 05 | [Contacts, items & stock](part-b-test-scenarios/05-contacts-items-stock.md) | `CON-`, `ITM-`, `STK-` |
| 06 | [Expenses & OCR](part-b-test-scenarios/06-expenses-ocr.md) | `EXP-`, `OCR-` |
| 07 | [GST: e-invoice, e-way bill, GSTR-1](part-b-test-scenarios/07-gst-einvoice-eway.md) | `EIN-`, `EWB-`, `GST-` |
| 08 | [Reports](part-b-test-scenarios/08-reports.md) | `RPT-` |
| 09 | [Settings, team & plans](part-b-test-scenarios/09-settings-team-plans.md) | `SET-`, `TEAM-`, `PLAN-`, `ROLE-` |
| 10 | [Offline & sync](part-b-test-scenarios/10-offline-sync.md) | `OFF-` |
| 11 | [Language & theme](part-b-test-scenarios/11-localisation-theme.md) | `L10N-` |
| 12 | [Web desktop](part-b-test-scenarios/12-web-desktop.md) | `WEB-` |
| 13 | [Admin console](part-b-test-scenarios/13-admin-console.md) | `ADM-` |
| 14 | [Accounting & GST returns](part-b-test-scenarios/14-accounting-gst-returns.md) | `BKS-`, `CC-`, `CLS-`, `TLY-`, `TDS-`, `RCM-`, `ITC-`, `NTE-`, `ADJ-`, `RMB-`, `ADV-`, `MSM-`, `G2B-`, `G3B-` |

---

## Conventions

- **Bold text** is a label you see on screen, for example **Finalise** or **Record payment**.
- **›** separates menu steps, for example **More › Settings › Numbering**.
- 📱 **Phone** and 🖥 **Desktop** mark steps that differ between the phone app and the web app. "Desktop" means a browser window 768 px or wider; a narrower browser window behaves like the phone app.
- Examples use the demo businesses **Vertex Traders** (Mumbai, Maharashtra, state 27) and **Aurora Design Studio** (Bengaluru, Karnataka, state 29). See [Test setup & demo data](part-b-test-scenarios/00-test-setup.md#3-demo-data-cheat-sheet).
- Amounts are in ₹ unless shown otherwise. Document numbers follow `PREFIX/FY/SEQ`, for example `INV/2026-27/0042`.

Every Part A recipe has the same shape:

> **Goal** · **Who / plan** · **Before you start** · **Steps** · **What happens** · **Rules & gotchas** · **Related**

### Plans at a glance

| | Free | Smart Basic | Smart Pro | Smart Business |
|---|---|---|---|---|
| Price (monthly / yearly) | ₹0 | ₹399 / ₹3,990 | ₹899 / ₹8,990 | ₹1,799 / ₹17,990 |
| Users per business | 1 | 2 | 6 | Unlimited |
| Invoices per month | 20 | Unlimited | Unlimited | Unlimited |
| Sales, payments received, customers, e-invoice, e-way bill, GSTR-1 | ✓ | ✓ | ✓ | ✓ |
| Purchases, suppliers, payables, payments made | — | — | ✓ | ✓ |
| Stock, expenses, OCR, multi-currency, branches | — | — | ✓ | ✓ |
| All 9 reports (Free and Basic get 4) | — | — | ✓ | ✓ |
| Priority support, Google Drive backup | — | — | — | ✓ |

The plan page also lists role-based access and audit export under Business, but today the app doesn't limit either by plan. Roles work on every plan, up to that plan's seat limit.

Free and Basic are the **sales plans**; Pro and Business are the **full plans**. Opening a module your plan doesn't include takes you to the upgrade page. Downgrading hides data but never deletes it.

### Roles at a glance

| Role | In short |
|---|---|
| **Owner** | Everything, including billing and subscriptions, creating businesses, and locking the books |
| **Admin** | Everything except billing: team, company settings, numbering, integrations, exports, deletes |
| **Accountant** | Everything Sales can do, plus masters (taxes, accounts, rates, transporters), items, expenses, stock, e-invoice and e-way bill, audit log |
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
| **Provisional number** | A number shown on a document finalised offline, until the server confirms it. |
| **Advance** | The part of a payment not applied to any document. It is held against the contact. |
| **Aging** | Outstanding amounts grouped by how late they are: current, 1–30, 31–60, 61–90 and 90+ days. |
| **Lixi** | The in-app assistant that answers questions from your books. |
