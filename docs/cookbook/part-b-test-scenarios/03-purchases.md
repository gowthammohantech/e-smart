# 03 — Purchases

Tests for purchase orders, goods receipts, purchase bills and purchase returns, and the gate that keeps them off the sales plans. Setup and demo data are in [00 — Test setup](00-test-setup.md).

The editor, tax engine and sharing are shared with sales, so the editor basics in [02](02-sales-documents.md) also apply here. Only the purchase-specific behaviour is tested below. Default: owner, **Vertex Traders** (Pro).

### Plan gate

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-001 | Buy tab on Pro | Owner / Pro | Vertex | Look at the tab bar | **Buy** tab present (📱 Home, Sell, Buy, Stock, More) | plan |
| PUR-002 | No Buy tab on Basic | Owner / Basic | Switch to Aurora | Look at the tabs | 📱 Home, Sell, GST, More; no Buy | plan |
| PUR-003 | Deep link on Basic | Owner / Basic | Aurora | Open `/purchases/bills` | Redirects to the upgrade page: "Purchases is on Smart Pro" + **See plans** | plan |
| PUR-004 | Server refuses too | Owner / Basic | Aurora | Create a purchase bill through the API | Refused for the plan module | plan |
| PUR-005 | Downgrade hides, doesn't delete | Owner | Operator moves Vertex Pro → Basic (ADM-011), then back | Check purchases each time | Hidden on Basic; all bills back unchanged on Pro | plan |

### Purchase orders

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-010 | Create a PO | Owner | | **Buy › Purchase orders › +** → supplier **Precision Components** → BRG-6203 qty 100 @ ₹120 → **Finalise** | Number `PO/<FY>/NNNN`; status **Confirmed**; stock not changed | happy |
| PUR-011 | PO lifecycle | | | draft → **Confirmed** → **Received**; confirmed → cancelled | Allowed; Received is final | happy |
| PUR-012 | PO → goods receipt | | Confirmed PO | **Create goods receipt** | "Created a draft goods receipt" with the PO's lines | happy |
| PUR-013 | PO → bill | | | **Convert to bill** | Draft purchase bill | happy |
| PUR-014 | PO from low stock | Owner | An item at or below its reorder level | **Stock › Low stock › Raise a purchase order** | New PO prefilled with the low items | happy |

### Goods receipts

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-020 | Receive goods | | PUR-012 draft | **Finalise** | `GRN/<FY>/NNNN`; status **Received**; stock +100 at the branch (Purchase receipt movement) | happy |
| PUR-021 | GRN → bill | | Received GRN | **Convert to bill** | Draft bill; finalising it moves the GRN to **Billed** and doesn't add stock again | edge |
| PUR-022 | Cancel a draft GRN | | Draft | **Cancel** | **Cancelled** | happy |
| PUR-023 | Received GRN can only be billed | | Received | **Change status** | Only Billed offered | edge |

### Purchase bills

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-030 | Bill from an in-state supplier | | Supplier in state 27 | BRG-6203 qty 10 @ ₹120, 18% | Taxable ₹1,200; CGST ₹108 + SGST ₹108; total ₹1,416 | happy |
| PUR-031 | Supplier bill number | | | Enter the supplier's own bill number | Saved and shown on the detail; searchable | happy |
| PUR-032 | Due date | | | New bill | Due date shown (default 30 days) | happy |
| PUR-033 | HSN required | | | One-off line without HSN → Finalise | "HSN/SAC is required on every line…" | validation |
| PUR-034 | Bill lifecycle | | | Issued → partly paid → paid via **Pay supplier** | Status comes from payments | happy |
| PUR-035 | Overdue bill | | Due date passed | View | **Overdue**, "N days late"; listed in Payables | happy |
| PUR-036 | Import supply | | Supplier with type overseas | New bill | "Import from abroad — no GST on the supplier's bill (IGST is paid at customs)." | edge |
| PUR-037 | Bill from a scan | Owner / Pro | Installed app | **Scan with OCR instead** → capture → **Create bill** | The bill opens prefilled (`fromScan=1`); nothing saved until finalised (OCR-005) | happy |
| PUR-038 | Cancel an issued bill | Owner | Unpaid issued bill | **Cancel document** | **Cancelled**; payable removed | happy |
| PUR-039 | Pay from the bill | | Issued bill with a balance | **Pay supplier** | Payment form with direction = paid, the supplier and the bill preselected | happy |

### Purchase returns

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-040 | Start a return | | Issued bill | **Create a return**, or **Buy › Returns › +** → pick the bill | "Pick the bill being returned…"; lines copied | happy |
| PUR-041 | Quantity cap | | Bill qty 10 | Return 11 | "Cannot exceed 10, the quantity on the original document" | validation |
| PUR-042 | Return lifecycle | | | **Requested → Approved → Processed**, or cancel | Allowed; Processed reduces stock (Purchase return movement) and the payable | happy |
| PUR-043 | Not enough stock to return | | Stock 0 and negative stock off | Return goods already sold | Blocked by the insufficient-stock rule | edge |

### Payables view

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PUR-050 | Payables list | Owner / Pro | Demo bills | **More › Payables** | Suppliers with outstanding bills, aging buckets, **Pay** | happy |
| PUR-051 | Payables on Basic | Owner / Basic | Aurora | Open `/payables` | Upgrade page | plan |
