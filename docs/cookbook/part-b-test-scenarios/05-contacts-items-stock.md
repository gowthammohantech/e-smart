# 05 — Contacts, items & stock

Tests for customers and suppliers, the item catalogue and stock movements. Setup and demo data are in [00 — Test setup](00-test-setup.md).

Default: owner, **Vertex Traders** (Pro).

### Contacts

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| CON-001 | Add a registered customer | Owner | | **People › Customers › Add contact** → name, type Regular, GSTIN `27AABCV1234F1ZO`-style valid GSTIN, state 27 → save | Created with the next code (C-014) | happy |
| CON-002 | Regular needs a GSTIN | | | Type Regular, GSTIN blank | "Enter the GSTIN for a registered party" | validation |
| CON-003 | Unregistered can't have one | | | Type Unregistered with a GSTIN | "An unregistered or overseas party has no GSTIN" | validation |
| CON-004 | GSTIN check digit | | | GSTIN with a wrong last character | "This GSTIN fails its check digit — look for a typo" | validation |
| CON-005 | GSTIN against state | | | GSTIN `29…`, state Maharashtra | Error that the GSTIN doesn't match the state | validation |
| CON-006 | Composition and SEZ need a GSTIN | | | Type Composition, then SEZ, without a GSTIN | GSTIN required for both; SEZ hint "SEZ and overseas buyers are reported differently on e-invoices." | validation |
| CON-007 | Overseas contact | | | Type Overseas | Country, region and postal code fields; "Choose the country" if blank; hint "Place of supply is 'other country'…" | happy |
| CON-008 | Shipping address | | | Turn off **Shipping address is the same** | Shipping fields appear and are saved | happy |
| CON-009 | Credit limit | | | ₹10,000 limit | Saved; used in SAL-061 | happy |
| CON-010 | Opening balance | | | Opening balance ₹5,000 | Shows as receivable on the contact and in aging | happy |
| CON-011 | Inactive contact | | Zenith Corporate (inactive) | Open the invoice customer picker | Zenith not offered; still listed in People with an "Inactive" badge | edge |
| CON-012 | Detail tabs | | Kumar Electronics | Open | Tabs **Open / Documents / Payments / Details**; "₹… receivable" / "owes you" | happy |
| CON-013 | Call & remind | | Has a phone | **Call**; **Send payment reminder** | Dialler opens; reminder prefilled | happy |
| CON-014 | Delete a contact | Owner | | **Delete** → confirm | "Their documents stay in your books…" → "Contact deleted"; old invoices still open | happy |
| CON-015 | Sales role can add and edit | Sales (Rahul) | | Add a customer; delete it | Add works; delete refused (owner or admin only) | permission |
| CON-016 | Viewer read-only | Viewer | | Add a contact | Refused | permission |
| CON-017 | Suppliers on a sales plan | Owner / Basic | Aurora | People / Customers | Title "Customers", "Who you sell to"; no Suppliers tab | plan |
| CON-018 | Search | | | "Search customers" for "Mehta" | Mehta Hardware | happy |
| CON-019 | Phone shape | | | Phone `123` | "Enter a 10-digit number" (or "Enter a valid phone number") | validation |

### Items

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ITM-001 | Add a product | Accountant / Pro | | **Stock › Items › +** → Product, name, sale ₹250, purchase ₹180, Nos, 18%, HSN `84821011`, **Track stock** on, opening 50, reorder 10 → save | Created; SKU auto-generated if blank; 50 on hand (Opening stock movement) | happy |
| ITM-002 | SKU must be unique | | | SKU `BRG-6203` | "Another item already uses this SKU" | validation |
| ITM-003 | HSN required when registered | | | HSN blank | "HSN/SAC code is required for a GST-registered business" | validation |
| ITM-004 | HSN shape | | | `8482101` (7 digits) | "HSN/SAC code should be 4, 6 or 8 digits" | validation |
| ITM-005 | Service | | | Type Service, SAC `998719` | Unit fixed to Nos; no stock tracking; no e-way bill (EWB-003) | happy |
| ITM-006 | Opening stock locked | | ITM-001 saved | Edit the item | Opening stock read-only: "Use a stock adjustment to change this." | edge |
| ITM-007 | Barcode | | | Barcode `8901234567890` | Saved; found by the scan screen (STK-050) | happy |
| ITM-008 | Inactive item | | `SRV-AMC` | Item picker in the invoice editor | Not offered | edge |
| ITM-009 | Delete an item | Owner | Item used on invoices | **Delete** | "Documents that already use this item keep their own copy…" → "Item deleted"; invoices unchanged | happy |
| ITM-010 | Sales can't create items | Sales (Rahul) | | Add an item | Refused (owner, admin or accountant only) | permission |
| ITM-011 | Sell / Buy this item | | Item detail | **Sell this item** / **Buy this item** | New invoice or bill with the item line prefilled | happy |
| ITM-012 | Search | | | "Search by name, SKU or HSN" with `8482` | Matches by HSN | happy |
| ITM-013 | Items on Basic | Owner / Basic | Aurora | Catalogue | Items are available (catalogue is on all plans); stock actions hidden | plan |

### Stock

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| STK-001 | Stock on Basic | Owner / Basic | Aurora | Open `/inventory/adjust` | Upgrade page "Stock is on Smart Pro" | plan |
| STK-010 | Increase | Accountant | BRG-6203 at MUM | **Adjust stock** → Increase 20, reason **Found stock** → **Save adjustment** | "Stock adjusted"; New stock = current + 20; movement logged | happy |
| STK-011 | Decrease | | | Decrease 5, **Damaged** | −5 | happy |
| STK-012 | Negative warning | | On hand 3 | Decrease 5 | "This would take stock negative. Check the quantity before saving." | validation |
| STK-013 | Reason list | | | Open **Reason** | Damaged, Lost or stolen, Expired, Sample given, Stock count correction, Internal use, Found stock, Returned from customer, Production output | happy |
| STK-014 | Sales can't adjust | Sales | | Save an adjustment | Refused by the server | permission |
| STK-020 | Transfer | Accountant | MUM has 50 | **Transfer stock** MUM → PUN, 20 | "Stock transferred"; MUM −20, PUN +20; two movements (Transfer out / Transfer in); total unchanged | happy |
| STK-021 | Transfer more than available | | MUM has 50 | Qty 60 | "Only 50 Nos available at the source branch" | validation |
| STK-022 | One location only | | Business with 1 branch | Open Transfer | "You only have one location" + **Add a branch** | edge |
| STK-030 | Bulk opening stock | | | **Set opening stock** → as on date → enter quantities for 3 items → **Save opening stock** | "Opening stock set for 3 items"; sales and purchase figures unchanged | happy |
| STK-031 | No tracked items | | All services | Open Opening stock | "No stock-tracked items" | edge |
| STK-040 | Movements log | | | **Movements** → filter by item or type | Opening, Purchase receipt, Sales issue, Sales return, Purchase return, Transfer in/out, adjustments | happy |
| STK-041 | Movements are never edited | | | Cancel an issued invoice | A reversing movement appears; the original stays | edge |
| STK-042 | Weighted average valuation | | Two receipts: 10 @ ₹100 and 10 @ ₹120 | Stock report | Value at ₹110 average × on hand | happy |
| STK-043 | Low stock | | Item at or below reorder level | **Low stock** | Listed under "Need attention"; "Restock cost — To reach 2× reorder level"; **Raise a purchase order** | happy |
| STK-044 | Low stock on Home | | STK-043 | Home | Shown in "Needs your attention" | happy |
| STK-050 | Scan by typing | | ITM-007 | **Scan barcode** → type `8901234567890` → **Use** | Item found with "N in stock" | happy |
| STK-051 | Unknown code | | | Type an unknown code | "No item with that code" + **Create item** | edge |
| STK-052 | Camera scanning | | Phone | Open Scan | "Camera scanning is not available yet…". **Blocked** | edge |
| STK-053 | Branch scope | | Branch switcher on PUN | Item detail | Stock shown for the selected branch; "All branches" shows the total | happy |
