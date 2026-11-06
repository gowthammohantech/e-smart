# 06 — Expenses & OCR

Tests for expenses, categories, recurring expenses, receipts and bill scanning (OCR). Setup and demo data are in [00 — Test setup](00-test-setup.md).

Default: owner or accountant, **Vertex Traders** (Pro).

### Expenses

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| EXP-001 | Record an expense | Accountant / Pro | | **More › Expenses › +** → ₹1,180, category Rent, **Paid from** HDFC, method Bank → **Record expense** | "Expense recorded"; `EXP/<FY>/NNNN`; listed | happy |
| EXP-002 | Category required | | | No category | "Pick a category for this expense" | validation |
| EXP-003 | Account required | | | No paid-from account | "Choose the account this was paid from" | validation |
| EXP-004 | Cash short | | Cash in hand ₹2,000 | ₹5,000 paid from cash | "Cash in hand has only ₹2,000.00" | validation |
| EXP-005 | Inline category | | | **Add category** → name → **Save category** | New category selected; listed under **Settings › Expense categories** | happy |
| EXP-006 | Tax-inclusive amount | | | ₹1,180, Tax 18%, **Amount includes tax** on | Summary: taxable ₹1,000, "Input tax (18%)" ₹180, "Total paid" ₹1,180 | happy |
| EXP-007 | Tax-exclusive amount | | | ₹1,000, 18%, inclusive off | Input tax ₹180; total paid ₹1,180 | happy |
| EXP-008 | Recurring | | | **Repeats** Monthly | "Next due" shown on the detail. Nothing creates the next one automatically: **Blocked** (no scheduler) | edge |
| EXP-009 | Billable | | | Turn on **Billable to a customer** and pick a customer | "Billable" badge on the expense | happy |
| EXP-010 | Supplier | | | Supplier Urban Logistics | Shown on the detail | happy |
| EXP-011 | Receipt online | | | **Attach a receipt** → photo → save | "Receipt attached"; "1 attachment" on the detail; file in MinIO | happy |
| EXP-012 | Receipt offline | | Network off | Attach a receipt → save | "Receipt will upload when you are back online. Expense saved." | offline |
| EXP-013 | Receipt upload fails | | Upload refused | Save | "The receipt couldn't be uploaded: … Remove it to save without it, or try again when you're online." | edge |
| EXP-014 | File limits | | | Attach an 11 MB PDF, or a GIF | Refused (limit 10 MB; JPEG, PNG, HEIC or PDF) | validation |
| EXP-015 | List | | Demo expenses | Open the list | "Total spent", "Input tax", filter "All categories", search | happy |
| EXP-016 | Filter by category | | | Pick Rent | Only rent, e.g. "Godown rent — Bhosari" ₹55,000 | happy |
| EXP-017 | Edit | | | **Edit** → change the amount → save | "Expense updated" | happy |
| EXP-018 | Delete | Owner | | **Delete** → confirm | "It will be removed from your reports and tax summary." → "Expense deleted" | happy |
| EXP-019 | Accountant can't delete | Accountant | | Delete | Refused (owner or admin only) | permission |
| EXP-020 | Sales can't record | Sales | | Record an expense | Refused (owner, admin or accountant) | permission |
| EXP-021 | Expenses on Basic | Owner / Basic | Aurora | Open `/expenses` | Upgrade page; no **Add expense** quick action on Home | plan |
| EXP-022 | Expenses in reports | | EXP-001 | Expense summary and Profit snapshot | The amount appears; input tax in the Tax summary | happy |

### OCR (bill scanning)

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| OCR-001 | Browser | Owner / Pro | Web | Open **Scan with OCR instead** | "Bill scanning works in the installed Elixir Books app on Android or iPhone. It is not available in the browser or in Expo Go." | edge |
| OCR-002 | Expo Go | | Expo Go | Open capture | Same unavailable message | edge |
| OCR-003 | Camera permission denied | | Installed app, permission denied | Capture | "Allow camera access in Settings to scan a bill." | edge |
| OCR-004 | Capture a receipt | Accountant / Pro | Installed app; OCR provider configured | Capture → "Reading the bill…" → review | Fields with confidence %; "N fields need a quick check before saving." | happy |
| OCR-005 | Create an expense or bill | | OCR-004 | **Create expense**, or **Create bill** | A prefilled form opens; nothing saved until you finish it | happy |
| OCR-006 | Nothing scanned | | | Open review directly | "Nothing scanned yet" + **Scan a bill** | edge |
| OCR-007 | Production with no adapter | | `NODE_ENV=production`, OCR disabled | Capture | 503 `FEATURE_UNAVAILABLE`. **Blocked**: no real OCR adapter | edge |
| OCR-008 | Offline | | Network off | Capture | Upload fails with a connection message | offline |
| OCR-009 | Sales role | Sales | | Upload for OCR | Refused (owner, admin or accountant) | permission |
| OCR-010 | Sales plan | Owner / Basic | Aurora | Open `/ocr/capture` | Upgrade page | plan |
