# 02 — Sales documents

Tests for quotes, sales orders, delivery notes, invoices and sales returns: the editor, tax calculation, finalise blockers, lifecycles, conversions and sharing. Setup and demo data are in [00 — Test setup](00-test-setup.md).

Unless a scenario says otherwise: owner, **Vertex Traders** (Smart Pro), branch **Mumbai — Head office**.

Reference line: **BRG-6203 Steel Ball Bearing, qty 10 × ₹180, 18% GST** = taxable ₹1,800.00, tax ₹324.00, total ₹2,124.00.

### Editor basics

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-001 | Phone wizard | Owner | 📱 | **Sell › Invoices › +** | 4 steps: **Who → What → Tax & terms → Review** | happy |
| SAL-002 | Desktop single page | Owner | 🖥 ≥768 px | New invoice | One-page editor, no wizard steps | happy |
| SAL-003 | Pick a customer | | | **Who** → search "Sunrise" → pick | Customer set; payment-terms badge (30 days); due date = date + 30 | happy |
| SAL-004 | Add a customer inline | | | Search an unknown name → add new | Contact form opens; after saving it becomes the document's customer | happy |
| SAL-005 | Default due date | | | Customer without terms | **Due date** = date + 30 days | happy |
| SAL-006 | Quote validity | | | New quote | **Valid until** = date + 15 days; no due date | happy |
| SAL-007 | Branch picker | | 2 branches | Open the editor | Branch field shown; on Aurora (1 branch) it's hidden | edge |
| SAL-008 | Add from the catalogue | | | **What** → multi-select BRG-6203 and LED-18 | Both lines added with price, unit, tax and HSN from the item ("Taken from the item master") | happy |
| SAL-009 | One-off line | | | Add a one-off line with a name, qty, rate, tax and HSN | Line added without an item | happy |
| SAL-010 | Stock badge in the picker | | | Open the item picker | Each tracked item shows "N in stock", "Low stock · N left" or "Out of stock" for the branch | happy |
| SAL-011 | Save draft | | | **Save draft** | "Saved as draft"; status **Draft**; no number assigned | happy |
| SAL-012 | Edit a draft | | SAL-011 | Open → **Edit** → change qty → save | Changes kept; still unnumbered | happy |
| SAL-013 | Delete a draft | Owner | SAL-011 | **Delete draft** → confirm | "Delete this draft?" → "Draft deleted"; gone from the list; no number gap | happy |
| SAL-014 | Customer in the URL | | 🖥 | Pick a customer on a new invoice → reload the page | Reopens with the same customer (`?partyId=`) | edge |
| SAL-015 | Prefill with a missing customer | | | Open `/sales/invoices/new?partyId=<deleted id>` | Toast "That customer isn't available any more. Pick one to continue." | edge |

### Tax & totals

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-020 | Intra-state | | Customer **Sunrise Retail** (27) | Reference line | Hint "Intra-state supply — CGST + SGST apply."; CGST 9% ₹162.00 + SGST 9% ₹162.00; total ₹2,124.00 | happy |
| SAL-021 | Inter-state | | **Kumar Electronics** (29) | Reference line | "Inter-state supply — IGST applies."; IGST 18% ₹324.00; total ₹2,124.00 | happy |
| SAL-022 | Change place of supply | | Sunrise Retail | Set place of supply to Karnataka (29) | Switches to IGST ₹324.00 | edge |
| SAL-023 | Rate includes tax | | Sunrise | One-off line ₹212.40, **Rate includes tax** on, 18% | Taxable ₹180.00, tax ₹32.40, total ₹212.40 | happy |
| SAL-024 | Line discount | | | Reference line, 10% line discount | Taxable ₹1,620.00, tax ₹291.60, total ₹1,911.60 | happy |
| SAL-025 | Document discount comes after tax | | | Reference line + **Discount on total** ₹100 | Tax stays ₹324.00; total ₹2,024.00 | edge |
| SAL-026 | Other charges | | | Add a charge of ₹50 | Added after the discount, before round-off | happy |
| SAL-027 | Auto round-off | | | Total ends in paise (e.g. qty 3 × ₹33.33 at 18%) | **Auto**: total rounded to the nearest rupee and the adjustment line shown | happy |
| SAL-028 | Manual round-off limit | | | **Manual** round-off of 1.50 | "Round-off must be less than ₹1.00 either way." | validation |
| SAL-029 | Export without LUT | | Harbour Supplies FZE; no LUT in the profile | Add a line | "Export or SEZ supply — IGST applies. Add an LUT in the business profile to zero-rate it." | edge |
| SAL-030 | Export under LUT | | LUT number and valid-till set (SET-005) | Same | "Export or SEZ supply under LUT — zero-rated, no IGST charged."; tax 0 | edge |
| SAL-031 | Unregistered business | | A business with GST registration off | Reference line | No tax lines; total ₹1,800 | edge |
| SAL-032 | Tax rate is snapshotted | | Invoice finalised at 18% | Change GST 18% in **Settings › Taxes** | The finalised invoice still shows 18% and the old amounts | edge |

### Foreign currency

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-040 | AED invoice | Owner / Pro | Harbour Supplies FZE (AED) | New invoice | Currency AED; rate defaults to 23.85 with the note "The rate is stored on the document so it stays reproducible." | happy |
| SAL-041 | Override the rate | | SAL-040 | Change the rate to 24.10 → finalise | The document keeps 24.10; reports convert at 24.10 | edge |
| SAL-042 | Multi-currency on a sales plan | Owner / Basic | Aurora | New invoice | No currency choice (FX needs Pro) | plan |

### Finalise & blockers

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-050 | Finalise | Owner | Draft with the reference line | **Finalise** → confirm | "Finalise this invoice?" → "Invoice finalised"; number `INV/<FY>/NNNN`; status **Issued**; stock of BRG-6203 at MUM drops by 10 | happy |
| SAL-051 | Keyboard shortcut | | 🖥 | Ctrl/⌘+Enter | Opens the finalise confirmation | happy |
| SAL-052 | Line without a name | | | One-off line, name blank | "Enter a name for this line" | validation |
| SAL-053 | Zero-rate line | | | Rate 0 | "Rate and amount must be more than 0. Fix: <name>" | validation |
| SAL-054 | Zero total | | | A 100% discount takes the total to 0 | "The total must be more than 0." (or the zero-line message) | validation |
| SAL-055 | Missing HSN | | GST-registered | One-off line, HSN blank | "HSN/SAC is required on every line of a GST invoice. Missing on: <name>" | validation |
| SAL-056 | HSN shape | | | HSN `12345` | "HSN/SAC code should be 4, 6 or 8 digits" | validation |
| SAL-057 | Not enough stock | | **Allow negative stock** off | Invoice qty greater than BRG-6203 on hand at MUM | "Not enough stock at this branch on <date>: Steel Ball Bearing 6203 (X Nos in stock, Y needed). Add stock or turn on “Allow negative stock” in company settings." | validation |
| SAL-058 | Out-of-stock item | | Item at 0 | Add it | "<item> is out of stock at this branch. Add stock, or turn on “Allow negative stock” in company settings." | validation |
| SAL-059 | Negative stock allowed | | Turn on **Allow negative stock** | Repeat SAL-057 | Finalises; stock goes negative | edge |
| SAL-060 | Stock checked at the document's branch | | Stock only at PUN | Invoice at MUM | Blocked at MUM; allowed when the branch is PUN | edge |
| SAL-061 | Credit limit | | Mehta Hardware credit limit ₹10,000 | Invoice pushing their exposure over ₹10,000 → **Finalise** | "Credit limit exceeded": "Mehta Hardware has a credit limit of ₹10,000.00. With this invoice they would owe ₹…" → **Continue anyway** finalises | validation |
| SAL-062 | Date before the source | | Invoice converted from a quote dated 10th | Set the invoice date to the 9th | "Can't be before <date>, the date of quote QT/…" | validation |
| SAL-063 | Number never reused | | Invoice 0040 cancelled | Finalise a new invoice | Gets 0041, not 0040 | edge |
| SAL-064 | Finalised can't be edited | | Issued invoice | Look for **Edit** | No edit; only status, convert, share and cancel actions | edge |
| SAL-065 | Free plan: 20 invoices a month | Owner / Free | Operator set Aurora to Free (ADM-011); 20 invoices finalised this month | Finalise the 21st | Refused with `PLAN_LIMIT_REACHED`, naming Smart Basic | plan |
| SAL-066 | Finalise with no connection | | Draft open; network off | Try **Finalise** | Header shows "No internet connection"; save and **Finalise** are disabled; the draft on screen stays readable; nothing is saved and no number is used | offline |
| SAL-068 | Edited elsewhere | | Same draft open in two sessions | Save in session A, then save a different change in session B | B's save is refused with a toast; B's screen shows the server's copy (A's change) | edge |
| SAL-067 | Locked period | Owner | `lockedThroughDate` set through the API | Edit a document dated on or before the lock | 409 `PERIOD_LOCKED` "The books are closed through …". **Blocked** in the UI (no lock screen) | edge |

### Lifecycles

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-070 | Quote: draft → sent | | Draft quote | **Change status › Mark Sent** | **Sent** | happy |
| SAL-071 | Sharing a draft quote marks it sent | | Draft quote | **Share PDF** | Status becomes **Sent** | edge |
| SAL-072 | Quote: sent → accepted / rejected / expired | | Sent quote | Try each | Each allowed; Accepted and Rejected are final (no further statuses) | happy |
| SAL-073 | Expired quote sent again | | Expired quote | **Mark Sent** | **Sent** again | edge |
| SAL-074 | Quote: draft → cancelled | | Draft | **Cancel quote** | **Cancelled**; no conversions offered | happy |
| SAL-075 | Sales order | | | draft → **Confirmed** → **Fulfilled**; also confirmed → cancelled | Allowed; Fulfilled is final | happy |
| SAL-076 | Delivery note | | | draft → **Delivered** | Allowed; final | happy |
| SAL-077 | Invoice paid status comes from payments | | Issued ₹2,124 | Record ₹1,000, then ₹1,124 | **Partly paid**, then **Paid**; not offered in **Change status** | happy |
| SAL-078 | Overdue | | Issued, due date passed | View | **Overdue** with "N days late" | happy |
| SAL-079 | Sales return | | Return draft | **Requested → Approved → Processed** | Allowed; Processed is final | happy |
| SAL-080 | Return cancellation | | Requested or Approved | **Cancel** | **Cancelled** | happy |
| SAL-081 | Paid invoice can't be cancelled | | Paid | Look for Cancel | Not offered | edge |
| SAL-082 | Cancel an issued invoice | Owner | Issued, no IRN or e-way bill | **Cancel document** | "Cancel INV/…?" with "The number stays reserved…" → "Document cancelled"; left out of reports, aging and stock | happy |
| SAL-083 | Cancel blocked by an IRN | | IRN generated | Cancel | "Cancel the e-invoice (IRN) before cancelling this document" | validation |
| SAL-084 | Cancel blocked by an e-way bill | | Active e-way bill | Cancel | "Cancel e-way bill <number> before cancelling this document" | validation |
| SAL-085 | Cancel blocked by payments | | Issued, partly paid | Cancel through the API (overdue and partly paid aren't offered Cancel in the app) | 409 `DOCUMENT_HAS_PAYMENTS` "Remove the payments allocated to this document before cancelling it" | validation |
| SAL-086 | Cancel blocked by a live return | | Invoice with an approved return | Cancel | 409 `DOCUMENT_HAS_RETURNS` "Cancel return CRN/… before cancelling INV/…" | validation |
| SAL-087 | Cancel reverses stock | | Issued invoice that moved 10 BRG-6203 | Cancel | +10 back at the branch through a reversing movement; the original movement stays | edge |
| SAL-088 | Transition not allowed (API) | | Paid invoice | `setDocumentStatus` → cancelled | 409 `INVALID_TRANSITION` "A invoice cannot go from paid to cancelled" | validation |

### Conversions & duplicate

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-090 | Quote → sales order | | Accepted quote | **Convert to sales order** | "Created a draft sales order"; lines copied; opens the order | happy |
| SAL-091 | Quote → invoice | | | **Convert to invoice** | Draft invoice with the quote's lines | happy |
| SAL-092 | Order → delivery note | | Confirmed order | **Create delivery note** | Draft delivery note | happy |
| SAL-093 | Order → invoice | | | **Convert to invoice** | Draft invoice | happy |
| SAL-094 | Delivery → invoice | | Delivered | **Convert to invoice** | Draft invoice; stock not moved a second time (the delivery already posted it) | edge |
| SAL-095 | Invoice → return | | Issued invoice | **Create a return** | "Return draft created"; lines from the invoice | happy |
| SAL-096 | Cancelled source | | Cancelled quote | Open actions | No conversion offered | edge |
| SAL-097 | Duplicate | | Any document | **Duplicate** | New draft with the same lines; no number until finalised | happy |

### Sales returns

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-100 | Start from the picker | | | **Sell › Returns › +** | "Pick the invoice being returned…"; search "by number or party" | happy |
| SAL-101 | Return more than invoiced | | Invoice qty 10 | Return qty 11 | "Cannot exceed 10, the quantity on the original document" | validation |
| SAL-102 | Partial return | | | Qty 4 → **Processed** | Stock of BRG-6203 +4 (Sales return movement); receivable reduced | happy |
| SAL-103 | Credit note deadline | | Invoice from the previous FY; today after 30 Nov | Create a return | Badge "Past the GST credit note deadline" | edge |
| SAL-104 | Empty picker | | New business | Open the picker | "Nothing to return against yet" | edge |

### Sharing & preview

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-110 | Preview | | Issued invoice | **Preview** tab | Invoice HTML with company, GSTIN, tax table and totals | happy |
| SAL-111 | PDF | | Online | **Share PDF** | Server PDF opens or shares [sim] | happy |
| SAL-112 | PDF in Tamil | | Language தமிழ் | **Share PDF** | Tamil PDF; GST terms in English (L10N-010) [sim] | happy |
| SAL-113 | Email | | Customer has an email | **Send by email** | "On its way to the customer" (📱 server send [sim]; 🖥 opens your mail app) | happy |
| SAL-114 | WhatsApp | | | **Send on WhatsApp** | 📱 server send [sim]; 🖥 opens `wa.me` with the message "Invoice INV/… — ₹…" | happy |
| SAL-115 | Copy link | | 🖥 | **Copy link** | "Link copied" | happy |
| SAL-116 | Open the share link | | SAL-115 | Open it in a private window | **Blocked**: the `/share/:token` page doesn't exist yet | edge |
| SAL-117 | Payment link | | Issued with a balance | **Payment link** | A Razorpay link is created [sim]; the `/pay/:id` page is **Blocked** | edge |
| SAL-118 | Offline sharing | | Network off | **Share PDF** | Fails with a connection message; nothing queued | offline |
| SAL-119 | Payment from a draft | | Draft invoice | **Record payment** | "Issue it first; payment is recorded against an issued document." | validation |
| SAL-120 | Payment on a quote | | Quote | Look for payment | "No payment is taken against a quote." | edge |
| SAL-121 | Payment on a paid invoice | | Paid | Look for payment | "Nothing is due on this document." | edge |

### Lists

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SAL-130 | Search | | Demo data | Search "Kumar" or a number | Matches by number, contact or reference | happy |
| SAL-131 | Status chips | | | Pick **Overdue** | Only overdue invoices; the running total updates | happy |
| SAL-132 | Filters live in the URL | | 🖥 | Set filters → reload | Filters kept | edge |
| SAL-133 | Desktop table | | 🖥 | Sort by **Balance due** | Rows sorted; balance column shown | happy |
| SAL-134 | Drafts and cancelled left out of totals | | | Compare list totals with reports | Drafts and cancelled don't count in reports or aging | edge |
