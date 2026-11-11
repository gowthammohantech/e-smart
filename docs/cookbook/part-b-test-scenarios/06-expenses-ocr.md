# 06 — Expenses & OCR

Tests for expenses, categories, recurring expenses, receipts, vehicles and bill scanning (OCR). Setup and demo data are in [00 — Test setup](00-test-setup.md).

Default: owner or accountant, **Vertex Traders** (Pro). The app is online-only: every save needs a connection.

### Expenses

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| EXP-001 | Record an expense | Accountant / Pro | | **More › Money › Expenses › Add expense** → ₹1,180, category Rent, **Paid by** Bank transfer, **Paid from** HDFC → **Record expense** | "Expense recorded"; `EXP/<FY>/NNNN`; detail opens; listed | happy |
| EXP-002 | Category required | | | No category | "Pick a category for this expense" | validation |
| EXP-003 | Account required | | | No paid-from account | "Choose the account this was paid from" | validation |
| EXP-004 | Cash short | | Cash in hand ₹2,000 | ₹5,000 paid from cash | "Cash in hand has only ₹2,000.00" | validation |
| EXP-005 | Inline category | | | **Add category** → name → **Save category** | New category selected; listed under **Expense categories** | happy |
| EXP-006 | Tax-inclusive amount | | | ₹1,180, Tax 18%, **Amount includes tax** on (default) | Summary: Net amount ₹1,000, "Input tax (18%)" ₹180, "Total paid" ₹1,180 | happy |
| EXP-007 | Tax-exclusive amount | | | ₹1,000, 18%, inclusive off | Input tax ₹180; total paid ₹1,180 | happy |
| EXP-008 | Recurring expense created | | Monthly expense dated 10 Oct; account has funds | Wait for (or run) the nightly `expenses.recur` job on/after 10 Nov | A new expense dated 10 Nov with the next number; template's **Next due** moves to 10 Dec | happy |
| EXP-009 | Billable | | | Turn on **Billable to a customer**, **Bill to** Kumar Electronics | "Billable" and "Bill to Kumar Electronics" on the detail; offered on their next invoice | happy |
| EXP-010 | Supplier | | | Supplier Urban Logistics | Shown on the detail | happy |
| EXP-011 | Receipt attached | | | **Attach a receipt** → **Take photo** / **Choose photo** → save | "Receipt attached"; "1 attachment" on the detail; **Attachment 1** opens the file | happy |
| EXP-012 | Receipt with no connection | | Network off | Attach a receipt → **Record expense** | Upload fails with a connection message; no expense is saved | edge |
| EXP-013 | Receipt upload fails | | Upload refused | Save | "The receipt couldn't be uploaded: … Remove it to save without it, or try again when you're online."; the expense is not saved | edge |
| EXP-014 | File limits | | | Upload an 11 MB file (API) | Refused: "Attachments are up to 10 MB"; the form only offers photos | validation |
| EXP-015 | List | | Demo expenses | Open the list | "Last 30 days"; "Total spent" (N entries), "Input tax" (Claimable), category chart, "All categories", search | happy |
| EXP-016 | Filter by category | | | Pick Rent | Only rent, e.g. "Godown rent — Bhosari" ₹55,000 | happy |
| EXP-017 | Edit | | | **Edit** → change the amount → **Save changes** | "Expense updated" | happy |
| EXP-018 | Delete | Owner | | **Delete** → confirm | "It will be removed from your reports and tax summary…" → "Expense deleted" | happy |
| EXP-019 | Accountant can't delete | Accountant | | Delete | Refused (owner or admin only) | permission |
| EXP-020 | Sales can't record | Sales | | Record an expense | Refused (owner, admin or accountant) | permission |
| EXP-021 | Expenses on Basic | Owner / Basic | Aurora | Open `/expenses` | Upgrade page; no **Add expense** quick action on Home | plan |
| EXP-022 | Expenses in reports | | EXP-001 | Expense summary and Profit snapshot | The amount appears; input tax in the Tax summary | happy |
| EXP-023 | Bank account short | | HDFC holds ₹10,000 | ₹12,000 from HDFC | "HDFC Current — 8842 has only ₹10,000.00" | validation |
| EXP-024 | Recurring held when short | | Monthly template; account empty on due date | Run `expenses.recur` | Nothing created; notification "Recurring expense EXP/… not recorded"; created on a later run once funded | edge |
| EXP-025 | Recurring catch-up | | Weekly template, 3 weeks missed | Run `expenses.recur` once | 3 expenses created, one per due date; no duplicates on a rerun | edge |
| EXP-026 | Delete a recurring template | Owner | EXP-008 | Delete the template | Series stops; occurrences already made stay | happy |
| EXP-027 | Copies of a recurring expense | | Template with Bill to customer, cost centre and vehicle | Check an occurrence | Category, supplier, amount, tax, account, Bill to, cost centre and vehicle carried; the receipt is not | edge |
| EXP-028 | Reverse charge | | | Tax 18%, **Reverse charge** on, ₹1,000 | "Amount includes tax" hidden; "GST under reverse charge (18%)" on the detail; total paid ₹1,000 | happy |
| EXP-029 | ITC eligibility | | | Tax 18%, **Input tax credit** "Blocked, section 17(5)" | Saved; tax not counted as claimable input credit | happy |
| EXP-030 | Supplier GSTIN without a supplier | | | Tax 18%, no supplier | **Supplier's GSTIN** field shown and saved; hidden once a supplier is picked | happy |
| EXP-031 | Closed period | | Books closed through 31 Oct | Record, edit or delete an expense dated 30 Oct | Refused (closed period) | validation |
| EXP-032 | Billed expense locked | | EXP-009 added to an issued invoice | Change the amount; delete it | Refused: "This expense is billed on invoice INV/…; cancel that invoice…"; detail shows "Recovered on INV/…" | edge |
| EXP-033 | Customer can't be the supplier | | | Pick a customer-only party as supplier (API) | "An expense can only name a supplier" | validation |
| EXP-034 | Branch filter | | Two branches; top bar on PUN | Open Expenses | List follows PUN; branch filter can widen it | happy |
| EXP-035 | Cost centre and vehicle | | One cost centre and one vehicle exist | New expense | **Cost centre** and **Vehicle** fields appear and are saved; absent when none exist | happy |
| EXP-036 | Categories screen | Accountant | | **More › Business setup › Expense categories** | Starter categories (Rent, Salaries & wages…); "N entries" or "Not used yet"; add and rename work ("Category saved") | happy |
| EXP-037 | Delete a used category | | Rent has expenses | Open Rent | No **Delete** in the sheet. A category only a journal or budget uses is refused on confirm: "This category is on 〈what〉; it can't be deleted" | edge |
| EXP-038 | Vehicles | Accountant | | **More › Business setup › Vehicles › Add vehicle** `MH12AB1234` → Save; tag a fuel expense | "Vehicle saved"; "Spent this year" shows the expense; delete refused while used | happy |
| EXP-039 | Expenses switched off | Owner | **Settings › Modules › Expenses** off | Open Money, Buy, Home | Expenses and Scan a bill gone from menus; creating one is refused | edge |
| EXP-040 | Desktop export | | 🖥 Desktop | Tick rows → **Export CSV** | CSV of the chosen expenses | happy |

### OCR (bill scanning)

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| OCR-001 | Browser | Owner / Pro | Web, production (`OCR_PROVIDER=disabled`) | **Buy › Scan a bill** → **Upload a photo of the bill** | "Bill scanning works in the installed Elixir Books app on Android or iPhone. It is not available in the browser or in Expo Go." **Blocked** | edge |
| OCR-002 | Expo Go | | Expo Go | Capture a photo | Same unavailable message | edge |
| OCR-003 | Camera permission denied | | Installed app, permission denied | **Take a photo** | "Allow camera access in Settings to scan a bill." | edge |
| OCR-004 | Capture a receipt | Accountant / Pro | Installed app | **Expense receipt** → photo → "Reading the bill…" → review | "Bill read. Check the details"; fields with "N% sure"; "N fields need a quick check before saving." | happy |
| OCR-005 | Create an expense or bill | | OCR-004 | **Create expense**, or **Create bill** | "Fields carried into the form"; prefilled form opens with the photo as receipt; nothing saved until you finish it | happy |
| OCR-006 | Nothing scanned | | | Open `/ocr/review` directly | "Nothing scanned yet" + **Scan a bill** | edge |
| OCR-007 | Server with no reader | | `OCR_PROVIDER=disabled`, image without phone text | Capture | 503 `FEATURE_UNAVAILABLE`; unavailable message; no extraction row left; AI allowance given back | edge |
| OCR-008 | No connection | | Network off | Capture | Upload fails with a connection message | edge |
| OCR-009 | Sales role | Sales | | Upload for OCR | Refused (owner, admin or accountant) | permission |
| OCR-010 | Sales plan | Owner / Basic | Aurora | Open `/ocr/capture` | Upgrade page | plan |
| OCR-011 | No text found | | Installed app | Photograph a blank page | "No text found. Retake the photo flat and in good light." | edge |
| OCR-012 | Supplier matched | | Supplier with GSTIN on file | Scan a bill showing that GSTIN → **Create expense** | Supplier prefilled | happy |
| OCR-013 | Category suggested | | Category "Fuel"; receipt mentions fuel | Scan a receipt | "Suggested category" Fuel at 60%; carried into the form | happy |
| OCR-014 | Bill lines matched | | Item "Steel Ball Bearing 6203" | Scan a **Supplier bill** listing it → **Create bill** | Bill line linked to the item, so its stock moves when saved | happy |
| OCR-015 | Unchecked fields | | Review with low-confidence fields | **Create expense** without checking | "N fields haven't been checked" → **Check them** returns; going on opens the form | edge |
| OCR-016 | Bad date | | | Edit the date to `09/11/2026` | "Type the date as YYYY-MM-DD…"; create blocked until fixed | validation |
| OCR-017 | Rescan | | Review open | **Rescan** | Back to capture | happy |
| OCR-018 | OCR switched off | Owner | **Settings › Modules › OCR** off (or Expenses off) | Look for **Scan a bill** / **Scan with OCR instead** | **Scan a bill** gone from Buy (phone and sidebar) and **Scan with OCR instead** gone from the expense form; `/ocr/capture` refused | edge |
| OCR-019 | Simulator (dev only) | | `OCR_PROVIDER=simulator`, web | Upload any image | Sample receipt fields returned | edge |
