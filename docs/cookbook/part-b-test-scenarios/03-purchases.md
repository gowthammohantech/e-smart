# 03 — Purchases

Tests for purchase orders, goods receipts, purchase bills and purchase returns, and the gate that keeps them off the sales plans. Setup and demo data are in [00 — Test setup](00-test-setup.md).

The editor, tax engine and sharing are shared with sales, so the editor basics in [02](02-sales-documents.md) also apply here. Only the purchase-specific behaviour is tested below. Supplier credit and debit notes, TDS on bills, reverse charge and MSME are in [14](14-accounting-gst-returns.md) (`NTE-`, `TDS-`, `RCM-`, `MSM-`). Approval of bills and orders is `APR-` in [04](04-payments-aging.md#approvals). Default: owner, **Vertex Traders** (Pro).

### Plan gate

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-001 | Buy tab on Pro | Owner / Pro | Vertex | Look at the tab bar | **Buy** tab present (📱 Home, Sell, Buy, Stock, More) | plan |
| PUR-002 | No Buy tab on Basic | Owner / Basic | Switch to Aurora | Look at the tabs | 📱 Home, Sell, GST, More; no Buy | plan |
| PUR-003 | Deep link on Basic | Owner / Basic | Aurora | Open `/purchases/bills` | Redirects to the upgrade page: "Purchases is on Smart Pro" + **See plans** | plan |
| PUR-004 | Server refuses too | Owner / Basic | Aurora | Create a purchase bill through the API | Refused for the plan module | plan |
| PUR-005 | Downgrade hides, doesn't delete | Owner | Operator moves Vertex Pro → Basic (ADM-011), then back | Check purchases each time | Hidden on Basic; all bills back unchanged on Pro | plan |

### Buy hub

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-006 | Hub tiles and figures | Owner / Pro | Demo bills | Open **Buy** | **Purchases this month**, **Expenses**, **Payable** ("N open bills"), **Overdue**; **Purchase documents** tiles with counts; **Recent bills** | happy |
| PUR-007 | Purchases / Expenses switch | Owner / Pro | | Switch to **Expenses** | Expense figures, trend, by category, top suppliers, upcoming recurring; the **+** button becomes a new expense | happy |
| PUR-008 | Tiles open their lists | | | Tap **Payable** and **Overdue** | Both open **Payables**; **Purchases this month** opens Purchase bills | happy |

### Purchase orders

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-010 | Create a PO | Owner | | **Buy › Purchase orders › +** → supplier **Precision Components** → BRG-6203 qty 100 @ ₹120 → **Confirm order** | Number `PO/<FY>/NNNN`; status **Confirmed**; stock not changed | happy |
| PUR-011 | PO lifecycle | | | Draft → **Confirmed** → **Change status › Received**; confirmed → cancelled | Allowed; Received is final; nothing marks the PO Received by itself | happy |
| PUR-012 | PO → goods receipt | | Confirmed PO | **Create goods receipt** | "Created a draft goods receipt" with the PO's lines | happy |
| PUR-013 | PO → bill | | Confirmed PO, nothing made from it | **Convert to bill** | Draft purchase bill with the PO's lines | happy |
| PUR-014 | PO from low stock | Owner | An item at or below its reorder level | **Stock › Low stock › Raise a purchase order** | New PO prefilled with the low items, up to twice the reorder level | happy |
| PUR-015 | PO carried forward once | | PUR-012 receipt made (not cancelled) | Open the PO's actions | Neither **Create goods receipt** nor **Convert to bill** offered | edge |
| PUR-016 | Nothing from a draft PO | | Draft PO | Open actions | No conversions offered | edge |

### Goods receipts

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-020 | Receive goods | | PUR-012 draft | **Mark received** | `GRN/<FY>/NNNN`; status **Received**; stock +100 at the branch (Purchase receipt movement) | happy |
| PUR-021 | GRN → bill | | Received GRN | **Convert to bill** → **Record bill** | Bill issued; stock **not** added again; GRN stays **Received** until marked **Billed** with **Change status** | edge |
| PUR-022 | Cancel a draft GRN | | Draft | **Cancel** | **Cancelled** | happy |
| PUR-023 | Received GRN can only be billed | | Received | **Change status** | Only Billed offered; no cancel | edge |
| PUR-024 | Goods received, not billed | Owner / Pro | Perpetual stock on | Receive GRN of ₹12,000; check trial balance; then bill it at ₹12,500 | After GRN: Stock in hand +₹12,000, *Goods received, not billed* ₹12,000 Cr; after bill: GRNI cleared, supplier owed the bill total, ₹500 difference in Purchases (RULES 6.2) | edge |
| PUR-025 | Bill from the same PO doesn't double stock | | PO → GRN received; second path PO → bill blocked | Try to bill the PO directly | Not offered (PUR-015); billing via the GRN moves no stock | edge |

### Purchase bills

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-030 | Bill from an in-state supplier | | Supplier in state 27 | BRG-6203 qty 10 @ ₹120, 18% → **Record bill** | Taxable ₹1,200; CGST ₹108 + SGST ₹108; total ₹1,416; `BILL/<FY>/NNNN`, **Issued** | happy |
| PUR-031 | Supplier bill number | | | Enter **Supplier document number** | Saved; "Their no. …" badge on the detail and in lists; searchable | happy |
| PUR-032 | Due date | | Supplier with payment terms | New bill | Due date = date + supplier's terms; a due date before the bill date is refused | happy |
| PUR-033 | HSN required | | | One-off line without HSN → Record bill | "HSN/SAC is required on every line of a GST invoice. Missing on: …" | validation |
| PUR-034 | Bill lifecycle | | | Issued → partly paid → paid via **Pay supplier** | Status comes from payments | happy |
| PUR-035 | Overdue bill | | Due date passed | View | **Overdue**, "N days late"; listed in Payables | happy |
| PUR-036 | Import supply | | Supplier with type overseas | New bill | "Import from abroad — no GST on the supplier's bill (IGST is paid at customs)."; bill of entry fields shown | edge |
| PUR-037 | Bill from a scan | Owner / Pro | | **Buy › Scan a bill** → capture or choose → **Create bill** | The bill opens prefilled (supplier, date, their number, lines, image attached); nothing saved until **Record bill** (OCR-005) | happy |
| PUR-038 | Cancel an issued bill | Owner | Unpaid issued bill | **Cancel document** | **Cancelled**; payable removed; its stock no longer counts | happy |
| PUR-039 | Pay from the bill | | Issued bill with a balance | **Pay supplier** | **Pay supplier** form with the supplier and the bill preselected | happy |
| PUR-044 | Pay from the toast | | | **Record bill** on a new bill | Toast "Purchase bill finalised" with **Pay supplier** | happy |
| PUR-045 | Cancel blocked by a payment | Owner | Bill with a payment applied | **Cancel document** | Refused; delete the payment first | validation |
| PUR-046 | Issued bill not editable | Accountant | Issued bill | Try to change a line through Edit or the API | Only notes, terms, reference and attachments change; lines refused (`DOCUMENT_FINALIZED`) | validation |
| PUR-047 | Capital goods → asset register | Owner / Pro | Bill line marked **Capital goods** | **Record bill** → open it | "Capital goods worth ₹… on this bill are in your fixed assets…" + **Add to fixed asset register**, which opens a prefilled asset; gone once registered | happy |
| PUR-048 | ISD invoice | | Registered supplier, not import | Turn on **Input Service Distributor invoice** → Record bill | Credit goes to 3B 4A(4) (G3B-) | edge |
| PUR-049 | TDS needs a TAN | Owner | No TAN; supplier with a TDS section | New bill | "Add your TAN in the business profile to deduct TDS on bills…" + **Add TAN**; nothing kept back | edge |
| PUR-052 | Bill of entry | Owner / Pro | Import bill | Fill **Bill of entry number**, date, port, assessable value, IGST paid at customs → Record bill | Customs IGST in input credit; matched to 2B on the BoE number (G2B-) | happy |
| PUR-053 | Double tap | | | Tap **Record bill** twice fast | One bill created | edge |
| PUR-054 | No connection | | Network off | Record a bill | Not saved: "Not saved: can't reach the server. Try again when online." | online |
| PUR-055 | Bulk delete drafts | Owner | 🖥, 2 draft bills | Tick both → **Delete drafts** → confirm | Both drafts deleted; issued bills untouched | happy |
| PUR-056 | Pay from the list row | | 🖥, issued bill with balance | Row menu → **Pay supplier** | Payment form for that bill | happy |

### Purchase returns

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-040 | Start a return | | Issued bill | **Create a return**, or **Buy › Purchase returns › +** → pick the bill | "Pick the bill being returned…"; lines copied | happy |
| PUR-041 | Quantity cap | | Bill qty 10 | Return 11 | "Cannot exceed 10, the quantity on the original document" | validation |
| PUR-042 | Return lifecycle | | | Save draft (**Requested**) → **Approve return** (**Approved**, `DRN/…`) → **Processed**, or cancel | Approving reduces stock (Purchase return movement) and the bill's balance; Processed changes nothing more | happy |
| PUR-043 | Not enough stock to return | | Stock 0 and negative stock off | Return goods already sold | "Not enough stock on …" | edge |
| PUR-057 | Several returns on one bill | | Bill qty 10, return of 4 approved | Second return of 7 | Capped at 6 | edge |

### Payables view

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-050 | Payables list | Owner / Pro | Demo bills | **Money › Payables** | **Total payable**, **Overdue**, **Due soon**; suppliers with outstanding bills, aging buckets, **Pay supplier**; no **Remind** | happy |
| PUR-051 | Payables on Basic | Owner / Basic | Aurora | Open `/payables` | Upgrade page | plan |
| PUR-058 | Opening bills | Owner / Pro | Supplier with no opening balance | **Payables › Import outstanding** → side **Owed by us** → 1 row → **Import 1** | Opening bill on the supplier, in Payables and aging; payable like a bill; not in Purchases or GST (RULES 6.12; see [26](../part-a-user-guide/26-imports-and-opening-balances.md)) | happy |
