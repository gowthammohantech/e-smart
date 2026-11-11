# 02 — Sales documents

Tests for quotes, proformas, sales orders, delivery notes, invoices, sales returns, credit and debit notes: the editor, tax calculation, finalise blockers, lifecycles, conversions, editing an issued invoice, TCS, charges, recurring invoices, sharing, and invoice design (`TPL-`). Setup and demo data are in [00 — Test setup](00-test-setup.md).

Unless a scenario says otherwise: owner, **Vertex Traders** (Smart Pro), branch **Mumbai — Head office**, online.

Reference line: **BRG-6203 Steel Ball Bearing, qty 10 × ₹180, 18% GST** = taxable ₹1,800.00, tax ₹324.00, total ₹2,124.00.

Sales approvals are tested in the approvals file (see [25 — Approvals](../part-a-user-guide/25-approvals.md)); tax treatment of notes is in [14 — Accounting & GST returns](14-accounting-gst-returns.md) (`NTE-`).

### Editor basics

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-001 | Phone wizard | Owner | 📱 | **Sales › Invoices › +** | 4 steps: **Who → What → Tax & terms → Review**; **Save draft** in the header on steps 1–3 | happy |
| SAL-002 | Desktop single page | Owner | 🖥 ≥768 px | New invoice | Sections **Who**, **What**, **Tax & terms** on one page; review summary and totals stay in view on the right; header has **Save draft**, **Save & send**, **Issue invoice** | happy |
| SAL-003 | Pick a customer | | | **Who** → search "Sunrise" → pick | Customer set; badge "30d terms"; due date = date + 30; hint "Sunrise Retail is on 30-day terms." | happy |
| SAL-004 | Add a customer inline | | | Picker → **Add new customer** → save | Contact form opens; after saving it becomes the document's customer | happy |
| SAL-005 | Default due date | | | Customer without terms | **Due date** = date + 30 days | happy |
| SAL-006 | Quote validity | | | New quote | **Valid until** = date + 15 days; no due date | happy |
| SAL-007 | Branch picker | | 2 branches | Open the editor | Branch field shown; on Aurora (1 branch) it's hidden | edge |
| SAL-008 | Add from the catalogue | | | **What** → tick BRG-6203 and LED-18 → **Add 2 items** | Both lines added with price, unit, tax and HSN from the item ("Taken from the item master") | happy |
| SAL-009 | One-off line | | | **One-off line** → name, qty, rate, tax, HSN → **Save line** | Line added without an item; closing the sheet without saving leaves no blank line | happy |
| SAL-010 | Stock badge in the picker | | | Open the item picker | Each tracked item shows "N in stock", "Low stock · N left" or "Out of stock" for the branch on the document date | happy |
| SAL-011 | Save draft | | | **Save draft** | "Saved as draft"; status **Draft**; title and list show "Draft"; no number assigned | happy |
| SAL-012 | Edit a draft | | SAL-011 | Open → **Edit** → change qty → save | Changes kept; still unnumbered | happy |
| SAL-013 | Delete a draft | Owner | SAL-011 | **Delete draft** → confirm | "Delete this draft?" → "Draft deleted"; gone from the list; no number gap | happy |
| SAL-014 | Customer in the URL | | 🖥 | Pick a customer on a new invoice → reload the page | Reopens with the same customer (`?partyId=`) | edge |
| SAL-015 | Prefill with a missing customer | | | Open `/sales/invoices/new?partyId=<deleted id>` | Toast "That customer is gone. Pick another to continue." | edge |
| SAL-016 | Rates are before tax / tax included | | 2 lines | **Rates are › Tax included**; then make one line exclusive | All lines switch; with mixed lines neither is picked and "Some lines include tax and some don’t. Pick one to set them all." shows | happy |
| SAL-017 | Desktop line grid | | 🖥 | Type qty in line 1, press Enter down to the last line, Enter again | Moves down the column; on the last line opens the item picker | happy |
| SAL-018 | Phone quantity stepper | | 📱 | Tap + on a line | Quantity rises without opening the line sheet; line total updates | happy |
| SAL-019 | Leave with unsaved changes | | New invoice with a line | Press Back | Leave guard asks before discarding; an untouched form leaves without asking | edge |

### Tax & totals

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-020 | Intra-state | | Customer **Sunrise Retail** (27) | Reference line | Hint "Intra-state supply — CGST + SGST apply."; CGST 9% ₹162.00 + SGST 9% ₹162.00; total ₹2,124.00; review badge **CGST + SGST** | happy |
| SAL-021 | Inter-state | | **Kumar Electronics** (29) | Reference line | "Inter-state supply — IGST applies."; IGST 18% ₹324.00; total ₹2,124.00; badge **IGST** | happy |
| SAL-022 | Change place of supply | | Sunrise Retail | Set place of supply to Karnataka (29) | Switches to IGST ₹324.00 | edge |
| SAL-023 | Rate includes tax | | Sunrise | One-off line ₹212.40, **Rate includes tax** on, 18% | Taxable ₹180.00, tax ₹32.40, total ₹212.40 | happy |
| SAL-024 | Line discount | | | Reference line, 10% line discount | Taxable ₹1,620.00, tax ₹291.60, total ₹1,911.60 | happy |
| SAL-025 | Document discount comes after tax | | | Reference line + **Discount on total** ₹100 | Tax stays ₹324.00; total ₹2,024.00 | edge |
| SAL-026 | Other charges before 1 Dec 2026 | | Invoice dated 30 Nov 2026 | Reference line + **Other charges** ₹50 | Hint "Freight, packing or installation added to the total."; ₹50 added after tax, untaxed; total ₹2,174.00 | happy |
| SAL-027 | Auto round-off | | | Total ends in paise (e.g. qty 3 × ₹33.33 at 18%) | **Auto**: total rounded to the nearest rupee and the adjustment line shown | happy |
| SAL-028 | Manual round-off limit | | | **Manual** round-off of 1.50 | "Round-off must be less than ₹1.00 either way." | validation |
| SAL-029 | Export without LUT | | Harbour Supplies FZE; no LUT in the profile | Add a line | "Export or SEZ supply — IGST applies. Add an LUT in the business profile to zero-rate it." | edge |
| SAL-030 | Export under LUT | | LUT number and valid-till set (SET-005) | Same | "Export or SEZ supply under LUT — zero-rated, no IGST charged."; tax 0; badge **Zero-rated** | edge |
| SAL-031 | Unregistered business | | A business with GST registration off | Reference line | No tax lines; total ₹1,800; badge **No tax** | edge |
| SAL-032 | Tax rate is snapshotted | | Invoice finalised at 18% | Change GST 18% in **Settings › Taxes** | The finalised invoice still shows 18% and the old amounts | edge |
| SAL-033 | Other charges from 1 Dec 2026 | | Invoice dated 1 Dec 2026; lines at 18% (₹1,800) and 5% (₹1,000) | **Other charges** ₹280 | Hint "…Spread over the items and taxed at their GST rates."; ₹180 shared to the 18% line and ₹100 to the 5% line; tax rises by ₹32.40 + ₹5.00; totals show "Freight and other charges (taxable)" (RULES 1.10) | happy |
| SAL-034 | Negative other charges | | | **Other charges** −50 | Accepted; total lowers by ₹50 (taxed share negative after 1 Dec) | edge |
| SAL-035 | Reverse charge on a sale | | GST-registered | **Tax & terms › Reverse charge** on | Hint "The buyer pays this GST to the government. The invoice shows it but doesn’t charge it."; tax shown as payable by the recipient, not in the total | edge |

### Foreign currency

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-040 | AED invoice | Owner / Pro | Harbour Supplies FZE (AED) | New invoice | Currency "AED · 1 AED = 23.8500 INR"; exchange rate field with "The rate is stored on the document so it stays reproducible."; item prices converted to AED | happy |
| SAL-041 | Override the rate | | SAL-040 | Change the rate to 24.10 → issue | The document keeps 24.10 (badge "AED @ 24.10"); reports convert at 24.10 | edge |
| SAL-042 | Multi-currency on a sales plan | Owner / Basic | Aurora | New invoice | No **Currency** field (FX needs Pro) | plan |
| SAL-043 | No UPI QR on a foreign invoice | | UPI ID set; SAL-040 | **Tax & terms › Paid into**; preview | No "UPI QR for the total prints on the invoice" line; no QR on the page | edge |

### Finalise & blockers

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-050 | Issue an invoice | Owner | Draft with the reference line | **Issue invoice** → confirm | "Finalise this invoice?" with "A permanent number will be assigned…" → "Invoice finalised" with **Edit this invoice**; number `INV/<FY>/NNNN`; status **Issued**; stock of BRG-6203 at MUM drops by 10 | happy |
| SAL-051 | Keyboard shortcuts | | 🖥 | Ctrl/⌘+S; then Ctrl/⌘+Enter | Ctrl+S saves the draft; Ctrl+Enter opens the issue confirmation (not while a sheet is open) | happy |
| SAL-052 | Line without a name | | | One-off line, name blank | "Enter a name for this line" | validation |
| SAL-053 | Zero-rate line | | | Rate 0 | "Rate and amount must be more than 0. Fix: <name>" | validation |
| SAL-054 | Zero total | | | A 100% discount takes the total to 0 | "The total must be more than 0." (or the zero-line message) | validation |
| SAL-055 | Missing HSN | | GST-registered | One-off line, HSN blank | "HSN/SAC is required on every line of a GST invoice. Missing on: <name>" | validation |
| SAL-056 | HSN shape | | | HSN `12345` | "HSN/SAC code should be 4, 6 or 8 digits" | validation |
| SAL-057 | Not enough stock | | **Allow negative stock** off | Invoice qty greater than BRG-6203 on hand at MUM | "Not enough stock on <date>: Steel Ball Bearing 6203 (X Nos in stock, Y needed). Add stock or allow negative stock in settings." | validation |
| SAL-058 | Out-of-stock item | | Item at 0 | Try to pick it | Blocked in the picker: "<item> is out of stock at this branch. Add stock, or turn on “Allow negative stock” in company settings." | validation |
| SAL-059 | Negative stock allowed | | Turn on **Allow negative stock** | Repeat SAL-057 | Issues; stock goes negative | edge |
| SAL-060 | Stock checked at the document's branch | | Stock only at PUN | Invoice at MUM | Blocked at MUM; allowed when the branch is PUN | edge |
| SAL-061 | Credit limit | | Mehta Hardware credit limit ₹10,000 | Invoice pushing their exposure over ₹10,000 → **Issue invoice** | Warning already on **Review**; "Credit limit exceeded": "Mehta Hardware has a credit limit of ₹10,000.00. With this invoice they would owe ₹…" → **Continue anyway** → confirm → issues | validation |
| SAL-062 | Date before the source | | Invoice converted from a quote dated 10th | Set the invoice date to the 9th | "Can't be before <date>, the date of Quotation QT/…"; draft save refused too | validation |
| SAL-063 | Number never reused | | Invoice 0040 cancelled | Issue a new invoice | Gets 0041, not 0040 | edge |
| SAL-064 | Issued non-invoice can't be edited | | Issued quotation | Tap **Edit** | Toast "An issued quotation can't be changed. Duplicate it to start again, or cancel it." (invoices: see SAL-140) | edge |
| SAL-065 | Free plan: 20 invoices a month | Owner / Free | Operator set Aurora to Free (ADM-011); 20 invoices issued this month | Issue the 21st | Refused with `PLAN_LIMIT_REACHED`, naming Smart Basic | plan |
| SAL-066 | No connection | | Draft open; network off | Look at the editor; try **Save draft** | Header shows "No internet connection"; save and issue buttons disabled; if the network drops mid-save: "Not saved: can't reach the server. Try again when online."; nothing saved, no number used | edge |
| SAL-068 | Edited elsewhere | | Same draft open in two sessions | Save in session A, then save a different change in session B | B's save is refused with a toast; B's screen shows the server's copy (A's change) | edge |
| SAL-067 | Locked period | Owner | Books closed through a date | Save a document dated on or before the lock | 409 `PERIOD_LOCKED` "The books are closed through …" | edge |
| SAL-069 | Double tap on Issue | | Draft | Tap **Issue invoice** in the confirmation twice quickly | One invoice, one number; the button stays busy until the invoice opens | edge |
| SAL-170 | Due date before the date | | | Set **Due date** before the invoice date | "Can't be before the document date, <date>"; the date picker doesn't offer earlier days | validation |
| SAL-171 | Before the opening stock date | | Item with opening stock dated 1 Apr | Invoice dated 31 Mar with that item | Item blocked in the picker ("…opening stock is dated …"); date field "Can't be before 1 Apr…, the opening stock date of <item>" | validation |

### Lifecycles

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-070 | Quote: draft → sent | | Draft quote | **Mark as sent** → confirm (or **Change status › Sent**) | Numbered `QT/…`; **Sent** | happy |
| SAL-071 | Emailing a draft quote marks it sent | | Draft quote; customer has an email | **Save & send** from the editor | Quote numbered and **Sent**; email sent | edge |
| SAL-072 | Quote: sent → accepted / rejected / expired | | Sent quote | Try each | Each allowed; Accepted and Rejected are final ("Nothing left to do") | happy |
| SAL-073 | Expired quote sent again | | Expired quote | **Change status › Sent** | **Sent** again | edge |
| SAL-074 | Quote: draft → cancelled | | Draft | **Cancel quotation** → **Cancel document** | **Cancelled**; no conversions offered | happy |
| SAL-075 | Sales order | | | **Confirm order** → **Confirmed** → **Fulfilled**; also confirmed → cancelled | Allowed; Fulfilled is final | happy |
| SAL-076 | Delivery note | | | **Mark delivered** | **Delivered**; final | happy |
| SAL-077 | Invoice paid status comes from payments | | Issued ₹2,124 | Record ₹1,000, then ₹1,124 | **Partly paid**, then **Paid**; not offered in **Change status** | happy |
| SAL-078 | Overdue | | Issued, due date passed | View | **Overdue** with "N days late"; due badge red | happy |
| SAL-079 | Sales return | | Return draft | **Requested → Approve return → Approved → Processed** | Allowed; Processed is final | happy |
| SAL-080 | Return cancellation | | Requested or Approved | **Cancel sales return** | **Cancelled** | happy |
| SAL-081 | Paid invoice can't be cancelled | | Paid | **Actions › Cancel invoice** → confirm | Refused by the server ("Remove the payments allocated…" or "A invoice cannot go from paid to cancelled"); invoice unchanged. Note: the app still offers Cancel | edge |
| SAL-082 | Cancel an issued invoice | Owner | Issued, no IRN or e-way bill | **Cancel invoice** | "Cancel INV/…?" with "The number stays reserved…" → **Cancel document** → "Document cancelled"; left out of reports, aging and stock | happy |
| SAL-083 | Cancel blocked by an IRN | | IRN generated | Cancel | "Cancel the e-invoice (IRN) before cancelling this document" (before the confirmation) | validation |
| SAL-084 | Cancel blocked by an e-way bill | | Active e-way bill | Cancel | "Cancel e-way bill <number> before cancelling this document" | validation |
| SAL-085 | Cancel blocked by payments | | Issued, partly paid | Cancel | 409 `DOCUMENT_HAS_PAYMENTS` "Remove the payments allocated to this document before cancelling it" | validation |
| SAL-086 | Cancel blocked by a live return | | Invoice with an approved return | Cancel | 409 `DOCUMENT_HAS_RETURNS` "Cancel return CRN/… before cancelling INV/…" | validation |
| SAL-087 | Cancel reverses stock | | Issued invoice that moved 10 BRG-6203 | Cancel | +10 back at the branch through a reversing movement; the original movement stays | edge |
| SAL-088 | Transition not allowed (API) | | Paid invoice | `setDocumentStatus` → cancelled | 409 `INVALID_TRANSITION` "A invoice cannot go from paid to cancelled" | validation |
| SAL-089 | Sent quote can't be cancelled | | Sent quote | Open **Actions** | No **Cancel quotation**; nor on a delivered note, fulfilled order, processed return or a paid or partly paid invoice (the server would refuse with `INVALID_TRANSITION`) | edge |
| SAL-172 | Proforma lifecycle | | | Draft → **Mark as sent** → Accepted → Cancel | Numbered `PI/…`; a sent or accepted proforma can be cancelled | happy |
| SAL-173 | Paid status can't be set by hand (API) | | Issued invoice | `setDocumentStatus` → paid | Refused with `STATUS_DERIVED` "… is derived from payments and the due date; record a payment instead" | validation |

### Conversions & duplicate

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-090 | Quote → sales order | | Sent or accepted quote | **Convert to sales order** | "Created a draft sales order" ("From QT/…"); lines copied; opens the order showing "Against Quotation QT/…" | happy |
| SAL-091 | Quote → invoice | | Sent quote | Main button **Convert to invoice** | Draft invoice with the quote's lines | happy |
| SAL-092 | Order → delivery note | | Confirmed order | **Create delivery note** | Draft delivery note | happy |
| SAL-093 | Order → invoice | | | **Convert to invoice** | Draft invoice | happy |
| SAL-094 | Delivery → invoice | | Delivered | **Convert to invoice** | Draft invoice; stock not moved a second time (the delivery already posted it); picker shows no stock badges | edge |
| SAL-095 | Invoice → return | | Issued invoice with one line | **Create a return** | "Created a draft sales return"; lines from the invoice | happy |
| SAL-096 | Cancelled or draft source | | Cancelled quote; draft quote | Open actions | No conversion offered | edge |
| SAL-097 | Duplicate | | Any document | **Duplicate** | New draft with the same lines opens; no number until finalised | happy |
| SAL-098 | Quote → proforma | | Sent quote | **Make a proforma invoice** | Draft proforma with the quote's lines | happy |
| SAL-099 | Carried forward once | | Quote converted to an order (not cancelled) | Open the quote's actions | No further conversion offered; API convert → 409 `ALREADY_CONVERTED` "… has already been carried forward to SO/…; cancel that first…"; after cancelling the order it's offered again | edge |
| SAL-174 | Proforma → invoice | | Sent proforma | **Convert to invoice** | Draft invoice; the proforma never appears in sales, GST or the books | happy |

### Sales returns, credit and debit notes

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-100 | Start from the picker | | | **Sales › Sales returns › +** | "Pick the invoice being returned…"; search "by number or party" | happy |
| SAL-101 | Return more than invoiced | | Invoice qty 10 | Return qty 11 | "Cannot exceed 10, the quantity on the original document"; stepper stops at 10; hint "Up to 10 can be returned" | validation |
| SAL-102 | Partial return | | | Qty 4 → **Approve return** → **Processed** | Stock of BRG-6203 +4 (Sales return movement); receivable reduced | happy |
| SAL-103 | Credit note deadline | | Invoice from the previous FY; today after 30 Nov | Create a return | Badge "Past the GST credit note deadline" | edge |
| SAL-104 | Empty picker | | New business | Open the picker | "Nothing to return against yet" | edge |
| SAL-105 | Pick which lines | | Invoice with 3 lines | **Actions › Create a return** | **Which lines?** ("INV/… · <party>"); untick one → "2 of 3 lines" → **Create return** → "Return draft created" with 2 lines; unticking all → "Pick at least one line" | happy |
| SAL-106 | Raise a credit note | | Issued invoice | **Raise a credit note** → reason **Discount after the sale** → lower the amount → **Issue credit note** | Numbered `CN/…`; invoice outstanding drops by the note's total | happy |
| SAL-107 | Raise a debit note | | Issued invoice | **Raise a debit note** → **Issue debit note** | Numbered `DBN/…`; payable like an invoice (**Record payment** offered) | happy |
| SAL-108 | Direct credit note | | | **Sales › Credit notes › +** → **Without an invoice** | Editor with **GST treatment** (**With GST (s.34)** / **Financial note — no GST**) and original invoice number/date (detail in `NTE-`) | happy |
| SAL-109 | Return gives TCS back | | Invoice with TCS 206C(1) at 1% | Return half the goods | Return's totals show TCS given back in proportion, at the invoice's rate | edge |

### Sharing & preview

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-110 | Preview | | Issued invoice | 🖥 **Preview** tab; 📱 **Actions › Preview document** | Invoice page with company, GSTIN, tax table and totals in the business template | happy |
| SAL-111 | PDF | | | **Save as PDF** (🖥) / **Share PDF** (📱) | "Preparing the PDF…" → "PDF downloaded" / "PDF ready" with the file name; server PDF | happy |
| SAL-112 | PDF in Tamil | | Language தமிழ் | **Share PDF** | Tamil PDF; GST terms in English (L10N-010) | happy |
| SAL-113 | Email from the server | | Customer has an email; email provider set up | **Send by email** | "Sending…" → "On its way to the customer"; email has the logo, amount, **View invoice** and **Download PDF** buttons; a notification "INV/… sent" | happy |
| SAL-114 | WhatsApp | | Customer has a phone | **Send on WhatsApp** | "Opened in WhatsApp"; 📱 WhatsApp, 🖥 `wa.me/<phone>` with "Invoice INV/… — ₹…" and the share link; nothing sent by the server | happy |
| SAL-115 | Copy link | | 🖥 | **Copy link** | "Creating a share link…" → "Link copied"; the link downloads the PDF (valid 7 days) | happy |
| SAL-116 | Open the share page | | Link from SAL-114 | Open it in a private window | The document as printed with **Download PDF**; after cancelling the invoice, the same link shows "This link isn’t available" | happy |
| SAL-117 | No payment link | | Issued with a balance | Open **Actions**; **Send by email**; open the shared page | No **Payment link** action; the email and shared page carry no **Pay now**; the API answers `ONLINE_PAYMENTS_UNAVAILABLE` [sim]. Razorpay is coming soon | edge |
| SAL-118 | Sharing with no connection | | Network off | **Share PDF** / **Send by email** | Fails with a connection message; nothing queued | edge |
| SAL-119 | Payment from a draft | | Draft invoice | **Actions › Record payment** | "Issue it first to record a payment." | validation |
| SAL-120 | Payment on a quote | | Quote | Look for payment | Not offered (a quote has nothing to pay) | edge |
| SAL-121 | Payment on a paid invoice | | Paid | **Actions › Record payment** | "Nothing is due on this document." | edge |
| SAL-122 | Email without an address | | Customer has no email | **Send by email** | Your mail app opens with subject "Invoice INV/… from Vertex Traders" and the dates, total and links in the body ("Opened in your email app") | edge |
| SAL-123 | Save & send | | Draft invoice; customer has an email | **Save & send** → confirm (button reads **Save & send**) | Invoice issued, detail opens and the email goes once; reload doesn't send it again | happy |
| SAL-124 | No double send | | | Tap **Send by email** twice quickly | One email; the server doesn't resend to the same person within 2 minutes | edge |
| SAL-125 | Failed email is not "sent" | | Email provider refuses the address | **Send by email** | Error "The email could not be sent: …"; no "On its way" toast | validation |
| SAL-126 | No Save & send on a delivery note | | | New delivery note | Only **Save draft** and **Mark delivered** | edge |
| SAL-127 | Adjust an advance | | Customer holds an advance; issued invoice with a balance | **Adjust advance (₹…)** | Opens the adjustment with the customer and invoice filled in | happy |

### Lists

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-130 | Search | | Demo data | Search "Kumar" or a number | Matches by number, contact or reference | happy |
| SAL-131 | Status chips | | | Pick **Overdue** | Only overdue invoices; the running total updates | happy |
| SAL-132 | Filters live in the URL | | 🖥 | Set filters → reload | Filters kept | edge |
| SAL-133 | Desktop table | | 🖥 | Sort by **Balance due** | Rows sorted; balance column shown | happy |
| SAL-134 | Drafts and cancelled left out of totals | | | Compare list totals with reports | Drafts and cancelled don't count in reports or aging | edge |
| SAL-135 | Branch filter follows the top bar | | 2 branches | Pick Pune in the top bar → open Invoices | Chip "Branch: Pune"; only Pune invoices; clearing it shows all branches | happy |
| SAL-136 | Bulk actions | | 🖥; 2 drafts and 1 issued quote selected | **Delete drafts** → confirm; **Mark sent**; **Export CSV** | Only the drafts deleted ("Selected documents that aren’t drafts are left alone."); CSV of the chosen rows | happy |
| SAL-137 | Phone owing line | | 📱 | Invoices list | Issued rows show "₹… due <date>" | happy |
| SAL-138 | Sales tab | | | Open **Sales** | Tiles **Invoiced**, **Collected**, **Outstanding**, **Overdue** for the top-bar period and branch; **Sales trend**, **Top customers** (CSV export), **Sales documents** tiles with counts, **Recent invoices** | happy |

### Edit an issued invoice (RULES 6.23)

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-140 | Edit the latest invoice | Owner | Latest issued invoice, nothing against it | **Edit** → change qty 10 → 12 → **Save changes** | "Invoice updated"; same number; totals and stock (−12) recomputed; audit trail keeps before and after | happy |
| SAL-141 | Not the latest | | A later invoice issued | Open the older one | No **Edit** offered | edge |
| SAL-142 | Payment allocated | | Partly paid latest invoice | Tap **Edit** | Greyed; "Can't edit: a payment is allocated to it" | validation |
| SAL-143 | Note against it | | Latest invoice with a credit note | Tap **Edit** | "Can't edit: a return or note stands against it" | validation |
| SAL-144 | IRN or e-way bill | | Latest invoice with an IRN | Tap **Edit** | "Can't edit: it has an IRN (e-invoice)" | validation |
| SAL-145 | Filed month | | GSTR-1 for its month filed | Tap **Edit** | "Can't edit: its GSTR-1 month is filed" | validation |
| SAL-146 | Date before the previous invoice | | Previous invoice dated 5th | Edit date to the 4th → save | Refused "INV/… cannot be dated before INV/… (…), issued before it" | validation |
| SAL-147 | Edit over the credit limit | | Mehta Hardware limit ₹10,000 | Raise the total past the limit → **Save changes** | "Credit limit exceeded" → **Continue anyway** saves | validation |
| SAL-148 | Branch is fixed | | | Try to change the branch (API) | Refused "… keeps its branch: its number was drawn there" | validation |

### TCS and expected TDS

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-150 | TCS on scrap | | Customer with PAN | **TCS (income tax)** → 206C(1) scrap 1% on the reference line | Hint "Collects ₹21 from the buyer"; totals row **TCS collected** ₹21; total ₹2,145 (TCS on the price with GST, rounded) | happy |
| SAL-151 | TCS higher rate without PAN | | Customer with no PAN or GSTIN | Same | Rate = higher of twice the rate and 5% (s.206CC) | edge |
| SAL-152 | Customer's TCS section prefilled | | Customer set to 206C(1) | New invoice → pick them | TCS section already set; picking another customer clears it | edge |
| SAL-153 | Expected TDS | | Customer deducts 194J | **TDS the customer will deduct** → 194J | Hint "The customer is expected to deduct ₹… and pay ₹…"; totals show **Net receivable**; invoice total unchanged | happy |
| SAL-154 | TDS rate override | | SAL-153 | **TDS rate (%)** 2 | Expected TDS at 2% of the value before GST | edge |

### Recurring invoices

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-160 | Set a monthly series | Owner | Issued invoice | **Actions › Repeat…** → **Monthly** → **Email each copy** on → **Save** | "Repeats; next copy on <date>"; action now reads "Repeat… · Monthly" | happy |
| SAL-161 | Copy is issued | | SAL-160; next date reached (run the `invoices.recur` job) | Open Invoices | New issued invoice with its own number, same lines and prices, due offset kept; emailed to the customer | happy |
| SAL-162 | Stop a series | | SAL-160 | **Repeat…** → **Off** → **Save** | "No longer repeats" | happy |
| SAL-163 | End date before the invoice | | | Last date on or before the invoice date (API) | Refused "The series must end after the invoice date" | validation |
| SAL-164 | Copies and drafts can't repeat | | A recurring copy; a draft | Look for **Repeat…** | Not offered; API: "…is a copy of a recurring invoice; change the series on the original" / "Issue the invoice before it can repeat" | edge |
| SAL-165 | Role | Sales | Issued invoice | **Repeat…** → **Save** | Refused (owner, admin or accountant only) | role |

### Invoice design

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| TPL-001 | Pick a template | Owner | At least one issued invoice | **More › Settings › Invoice design** → **Classic** → **Save** | Preview shows the latest invoice in Classic as you pick; "Invoice design saved"; every document's PDF now Classic | happy |
| TPL-002 | No invoice yet | Owner | New business | Open Invoice design | "Issue an invoice to see a preview here." | edge |
| TPL-003 | Switches per template | | | Pick each template | Standard: discount, tax rate, HSN under item, logo, bank, signature, compact. Classic/Modern: logo, HSN table, bank, signature, declaration, ship-to, PAN/TAN, seal box, compact. Detailed adds discount column | happy |
| TPL-004 | Template defaults | | Fresh design | Pick Detailed | Ship-to, PAN/TAN, HSN table, declaration, seal box on; accent navy; logo right | happy |
| TPL-005 | Accent and logo side | | Classic | Pick Gold, **Logo › Right** → Save | PDF uses gold and puts the logo on the right; logo side isn't offered on Standard | happy |
| TPL-006 | Declaration text | | Classic, declaration on | Clear the text; then type your own | Empty prints the default "We declare that this invoice shows the actual price…"; own text (max 300) prints instead | edge |
| TPL-007 | Footer line | | | **Footer line** "Thank you for your business" → Save | Prints at the foot instead of "Generated with Elixir Books Smart" | happy |
| TPL-008 | Unsaved design | | | Change template, leave without **Save** | Documents still print in the old design | edge |
| TPL-009 | Role | Accountant | | Change the design → **Save** | Refused (owner or admin only) | role |
| TPL-010 | Per-invoice template | Sales | Business default Classic | Invoice preview → **Template** → **Modern** | "This invoice now prints in Modern"; its PDF, email and share page use Modern; other invoices stay Classic | happy |
| TPL-011 | Back to the default | | TPL-010 | **Template** → **Business default (Classic)** | Prints in Classic again | happy |
| TPL-012 | Template on an issued or cancelled document | | Cancelled invoice | Change its template | Allowed; only the look changes; audit trail records it | edge |
| TPL-013 | Copies | | Classic | Preview → **Copy** → each option → **Save as PDF** | Labels "ORIGINAL FOR RECIPIENT", "DUPLICATE FOR TRANSPORTER", "TRIPLICATE FOR SUPPLIER" (in Tamil, the Tamil label then the English one); **All three** gives three copies in one PDF | happy |
| TPL-014 | Standard original has no label | | Standard | Copy **Original for recipient** | No label; Duplicate/Triplicate show the label top right | edge |
| TPL-015 | Copy isn't saved | | TPL-013 with Triplicate | Close and reopen the preview; email the invoice | Preview back to Original; the email PDF is the original | edge |
| TPL-016 | Page numbers | | Classic; invoice with 60 lines | **Save as PDF** | Pages numbered; with **All three**, no page numbers | edge |
| TPL-017 | Compact | | Long invoice | Turn **Compact** on | Smaller type; fewer pages | happy |
| TPL-018 | Print | | 📱 / 🖥 | Preview → **Print** | System print dialog; where printing isn't possible: "Printing is not available here" | happy |
| TPL-019 | Logo upload | Owner | | **Business profile › Add logo** with a 6 MB image; then a PNG | "That image is over 5 MB. Choose a smaller one."; then "Logo updated"; logo on every template with **Logo** on | validation |
| TPL-020 | Signature | Owner | | **Bank & signature › Add signature** → **Check the signature** → **Use this signature** | "Signature updated"; prints above "Authorised signatory"; **Signature** off hides it; **Remove** → "Remove the signature?" | happy |
| TPL-021 | Bank details printed | Owner | Bank details and UPI ID set | Preview an INR invoice | Bank block and UPI QR "Scan to pay with any UPI app"; **Bank details and UPI QR** off hides both | happy |
| TPL-022 | Link to a bank account | Owner | Bank account "HDFC Current" under Payment accounts | **Account in your books** → HDFC Current → Save | Account number filled if empty; **Payment accounts** marks it **On invoices**; new receipts default to it | happy |
| TPL-023 | Number mismatch | Owner | TPL-022 | Type a different account number | Warning "The account number above isn't the one saved for HDFC Current (…). Customers will pay into the number printed here." | validation |
| TPL-024 | Linked account protected | Owner | TPL-022 | Delete HDFC Current, or change its type to cash | Refused "Your invoices print this account; pick another under Business profile, bank details first" | validation |
| TPL-025 | Only bank accounts link (API) | | | Save company with a cash account's id as `paymentAccountId` | 422 "Choose one of your bank accounts" | validation |
| TPL-026 | Statutory content always prints | | Every switch off | Preview a GST invoice with an IRN | GSTIN, HSN, tax, place of supply and the IRN/QR still print | edge |
| TPL-027 | Brands | Admin | | **Settings › Brands › Add brand** "SKF"; delete a brand items carry | "Brand saved"; delete refused: "A brand that items carry can’t be deleted…"; brands don't print on documents | happy |
