# 05 — Contacts, items & stock

Tests for customers and suppliers, the item catalogue and stock movements. Setup and demo data are in [00 — Test setup](00-test-setup.md).

Default: owner, **Vertex Traders** (Pro).

### Contacts

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| CON-001 | Add a registered customer | Owner | | **People › Customers › New customer** → name, type Regular, a valid GSTIN `27…`, state 27 → **Add customer** | "Customer added"; contact opens with the next code (e.g. C-014) | happy |
| CON-002 | Regular needs a GSTIN | | | Type Regular, GSTIN blank | "Enter the GSTIN for a registered party" | validation |
| CON-003 | Unregistered can't have one | | | Type Unregistered | GSTIN field hidden; a GSTIN sent by the API is refused ("An unregistered or overseas party has no GSTIN") | validation |
| CON-004 | GSTIN check digit | | | GSTIN with a wrong last character | "This GSTIN fails its check digit — look for a typo" | validation |
| CON-005 | GSTIN against state | | | GSTIN `29…`, state Maharashtra | "This GSTIN is registered in Karnataka, not the state below" | validation |
| CON-006 | Composition and SEZ need a GSTIN | | | Type Composition, then SEZ, without a GSTIN | GSTIN required for both; hint "SEZ and overseas buyers are reported differently on e-invoices." | validation |
| CON-007 | Overseas contact | | | Type Overseas | GSTIN and PAN hidden; Country, region and postal code fields; "Choose the country" if blank; hint "Place of supply is 'other country'…" | happy |
| CON-008 | Shipping address | | | Turn off **Shipping address is the same** | Shipping address and city appear and are saved | happy |
| CON-009 | Credit limit | | | ₹10,000 limit | Saved; shown on **Details**; used in CON-024 | happy |
| CON-010 | Opening balance | | | Opening balance ₹5,000, **They owe you (Dr)** | Shows as receivable on the contact and in aging | happy |
| CON-011 | Inactive contact | | Zenith Corporate (inactive) | Open the invoice customer picker | Zenith not offered; still listed in People with an "Inactive" badge | edge |
| CON-012 | Detail tabs | | Kumar Electronics | Open | Phone tabs **Open / Documents / Payments / Details**; "Owes you" with "N open · N overdue"; "Total invoiced" | happy |
| CON-013 | Call & remind | | Has a phone and an open invoice | **Call**; **Actions › Send payment reminder** | Dialler opens; reminder sheet opens. Reminder action hidden when nothing is owed | happy |
| CON-014 | Delete a contact in use | Owner | Kumar Electronics has invoices | **Actions › Delete contact** → confirm | Refused: "This party has documents; mark it inactive instead"; contact still listed | edge |
| CON-015 | Sales role can add and edit | Sales (Rahul) | | Add a customer; try to delete it | Add works; delete refused (owner or admin only) | permission |
| CON-016 | Viewer read-only | Viewer | | Add a contact | Refused by the server | permission |
| CON-017 | Suppliers on a sales plan | Owner / Basic | Aurora | Open People | Title "Customers", "Who you sell to"; no Customers / Suppliers / Other switch; type choice has no Supplier or Both | plan |
| CON-018 | Search | | | "Search customers" for "Mehta" | Mehta Hardware | happy |
| CON-019 | Phone shape | | | Phone `123` | "Enter a 10-digit number" (or "Enter a valid phone number") | validation |
| CON-020 | Delete an unused contact | Owner | New contact, no documents, no opening balance | **Delete contact** → confirm | "Contact deleted"; gone from the list | happy |
| CON-021 | Contact that is Both | Owner / Pro | | New contact, type **Both** | Code B-…; listed under Customers and Suppliers; detail shows "You owe them"; actions include **New purchase bill** and **Pay supplier** | happy |
| CON-022 | Other contact | Owner | | **People › Other › New contact** | Code G-…; no payment terms or opening balance; no invoice shortcuts or payments; not offered in invoice or bill pickers | happy |
| CON-023 | Kind locked once used | Owner | Supplier with a bill | Edit → only Supplier and Both offered; via API set kind customer | "A party with transactions cannot switch between customer and supplier; make it both instead" | edge |
| CON-024 | Credit limit warning | Sales | CON-009, customer owes ₹8,000 | Issue a ₹4,000 invoice | "Credit limit exceeded" with the limit and exposure; **Continue anyway** issues it | happy |
| CON-025 | GSTIN lookup fills the form | | GSTIN gateway connected | Type a valid, registered GSTIN | "Fetching the registered details…" then "Verified on the GST portal, and its details filled in"; name, type and address filled | happy |
| CON-026 | GSTIN lookup unavailable | | Gateway off or disabled | Type a valid GSTIN | "Couldn't reach the GST portal; fill the details in yourself"; form still saves | edge |
| CON-027 | Supplier extras | Accountant / Pro | | New supplier: MSME Micro + Udyam number, reverse charge on, TDS section 194C with a s.197 certificate | All saved and shown; used by [14 — TDS/RCM/MSME](14-accounting-gst-returns.md) | happy |
| CON-028 | TCS needs a section | | | New customer, **Collect TCS on sales** on, no section | "Pick the TCS section their sales fall under" | validation |
| CON-029 | Statement of account | | Kumar Electronics | **Actions › Statement of account** → dates → **Download PDF** | Opening, Dr/Cr lines, "Balance on …"; PDF downloaded ("Statement downloaded") | happy |
| CON-030 | Empty statement | | | Dates with no activity | "Nothing in this period" | edge |
| CON-031 | Save & add another | | 🖥 Desktop | Fill a customer → **Save & add another** | "Customer added"; form clears, keeps currency, terms and state | happy |
| CON-032 | Import contacts (web) | Accountant | 🖥 CSV with 3 new rows, 1 existing name, 1 bad GSTIN | **People › Import** → choose file → match columns → **Check** → **Import** | Statuses Ready / Already there / Fix; "2 contacts imported", "3 left out" | happy |
| CON-033 | Import contacts (phone) | Accountant | 📱 | **Import** → paste CSV → **Check** → **Import N** | Same results as CON-032 | happy |
| CON-034 | Import limit | | Sheet over 1,000 rows | Check | "Up to 1,000 at a time; split the sheet."; import disabled | validation |
| CON-035 | Sales can't import | Sales | | Import contacts | Refused (owner, admin or accountant) | permission |
| CON-036 | Required custom field | | Required contact field "Drug licence" | Save a customer without it | "Drug licence is required" | validation |
| CON-037 | Bulk deactivate | | 🖥 Desktop | Tick 2 contacts → **Deactivate** | "2 deactivated"; both show "Inactive" | happy |
| CON-038 | Opening balance in a closed period | | Books closed through 31 Mar 2026 | Opening balance as on 15 Mar 2026 | Refused (closed period) | validation |

### Items

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ITM-001 | Add a product | Accountant / Pro | | **Items & services › New item** → Product, name, sale ₹250, purchase ₹180, Pieces, 18%, HSN `84821011`, **Track stock** on, opening 50, reorder 10 → **Add item** | "Item added"; SKU-NNNN if blank; 50 on hand at the main branch (Opening stock movement) | happy |
| ITM-002 | SKU must be unique | | | SKU `BRG-6203` | "Another item already uses this SKU" | validation |
| ITM-003 | HSN required when registered | | | HSN blank | "HSN/SAC code is required for a GST-registered business" | validation |
| ITM-004 | HSN shape | | | `8482101` (7 digits) | "HSN/SAC code should be 4, 6 or 8 digits" | validation |
| ITM-005 | Service | | | Type Service, SAC `998719` | Unit fixed to Nos ("Services are always billed in Nos."); no stock tracking; no e-way bill (EWB-003) | happy |
| ITM-006 | Opening stock locked | | ITM-001 saved | Edit the item | Opening stock read-only: "Use a stock adjustment to change this."; type switch disabled | edge |
| ITM-007 | Barcode | | | Barcode `8901234567890` | Saved; found by the scan screen (STK-050) | happy |
| ITM-008 | Inactive item | | `SRV-AMC` | Item picker in the invoice editor | Not offered | edge |
| ITM-009 | Delete an item in use | Owner | Item on invoices | **Actions › Delete item** → confirm | Refused: "This item appears in documents; mark it inactive instead" | edge |
| ITM-010 | Sales can't create items | Sales (Rahul) | | Add an item | Refused (owner, admin or accountant only) | permission |
| ITM-011 | Sell / Buy this item | | Item detail | **Sell this item** / **Buy this item** | New invoice or bill with the item line prefilled | happy |
| ITM-012 | Search | | | "Search by name, SKU or HSN" with `8482` | Matches by HSN | happy |
| ITM-013 | Items on Basic | Owner / Basic | Aurora | **More › Stock › Items & services** | Catalogue opens; no Track stock, opening stock or Adjust/Transfer actions | plan |
| ITM-014 | Delete an unused item | Owner | New item, no stock, no documents | **Delete item** | "Item deleted" | happy |
| ITM-015 | Unit locked once stock moved | | Tracked item with movements | Change unit via API | "This item has stock movements, so its type, unit and stock tracking cannot change…" | edge |
| ITM-016 | Opening stock date | | | New tracked item, opening date tomorrow | "Can't be a future date" | validation |
| ITM-017 | GST treatment fields | | GST-registered business | New item | **GST treatment**, Reimbursement at cost, Reverse charge, Cess (%), Capital goods (products only), Input tax credit shown and saved | happy |
| ITM-018 | Retail fields off | Owner | **Settings › Modules › Retail item fields** off | New item; catalogue list | No SKU, Barcode, Category or Brand fields or filters; item still gets SKU-NNNN | edge |
| ITM-019 | Item categories | Accountant | | **More › Business setup › Item categories › Add category** "Bearings", colour → Save | "Category saved"; offered on the item form; **All categories** filter appears | happy |
| ITM-020 | Category in use | | ITM-019 on an item | Delete it | Refused: items are filed under it | edge |
| ITM-021 | Brands | Accountant | | **Brands › Add brand** "SKF"; set on an item; filter **All brands** | Saved; filter shows only SKF items; delete refused while in use | happy |
| ITM-022 | Import items (web) | Accountant | 🖥 CSV: 2 new, 1 duplicate SKU, 1 bad HSN | **Import** → file → match → **Check** → **Import** | "2 new, 1 already there, 1 to fix"; "2 items imported"; opening stock at main branch dated today | happy |
| ITM-023 | Import with custom fields | | Item custom field "Grade" (required) | Import a CSV with no Grade column | Warning that Grade has no column; items created without it | edge |
| ITM-024 | Duplicate barcode | | | Second item with ITM-007's barcode | Refused: "Another item already has the barcode 8901234567890" | validation |
| ITM-025 | Bulk export | | 🖥 Desktop | Tick items → **Export CSV** | CSV with name, SKU, HSN, unit, on hand, price | happy |
| ITM-026 | Item image | | | Look for a way to add a photo on the item form | None: **Not available yet** | edge |

### Stock

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| STK-001 | Stock on Basic | Owner / Basic | Aurora | Open `/inventory/adjust` | Upgrade page "Stock is on Smart Pro" | plan |
| STK-010 | Increase | Accountant | BRG-6203 at MUM | **Stock › + › Stock adjustment** → Increase 20, reason **Found stock** → **Save adjustment** | "Stock adjusted"; New stock = current + 20; Adjustment movement logged | happy |
| STK-011 | Decrease | | | Decrease 5, **Damaged** | −5 | happy |
| STK-012 | Negative refused | | On hand 3 | Decrease 5 → Save | Warning "This would take stock negative…"; server refuses with "… has 3 … this would take it to -2" (even with Allow negative stock on) | validation |
| STK-013 | Reason list | | | Open **Reason** | Damaged, Lost or stolen, Expired, Sample given, Stock count correction, Internal use, Found stock, Returned from customer, Production output | happy |
| STK-014 | Sales can't adjust | Sales | | Save an adjustment | Refused by the server | permission |
| STK-015 | Back-dated adjustment | | 10 received on 5 Nov, none before | Decrease 5 dated 1 Nov | Refused: not enough stock on that date | edge |
| STK-016 | Adjustment in a closed period | | Books closed through 31 Oct | Adjust dated 30 Oct | Refused (closed period) | validation |
| STK-020 | Transfer | Accountant | MUM has 50 | **Branch transfer** MUM → PUN, 20 → **Transfer stock** | "Stock transferred"; MUM −20, PUN +20; Transfer out / Transfer in; total and value unchanged | happy |
| STK-021 | Transfer more than available | | MUM has 50 | Qty 60 | "Only 50 Pcs available at the source branch" | validation |
| STK-022 | One location only | | Business with 1 branch | Open Transfer | "You only have one location" + **Add a branch** | edge |
| STK-023 | Same branch | | | From and To both MUM | "From and To are the same branch…" | validation |
| STK-030 | Bulk opening stock | | | **Set opening stock** → as on date → quantities for 3 items → **Save opening stock** | "Opening stock set for 3 items"; posted at the top-bar branch; sales and purchase figures unchanged | happy |
| STK-031 | No tracked items | | All services | Open Opening stock | "No stock-tracked items" | edge |
| STK-040 | Movements log | | | **Movements** → filter by type; search by item or document number | Opening stock, Purchase receipt, Sales issue, Sales return, Purchase return, Transfer in/out, Adjustment | happy |
| STK-041 | Movements are never edited | | | Cancel an issued invoice | A reversing movement appears; the original stays; the pair carries no value | edge |
| STK-042 | Weighted average valuation | | Costing Weighted average; receipts 10 @ ₹100 and 10 @ ₹120 | Stock report / item detail | Value at ₹110 average × on hand | happy |
| STK-043 | Low stock | | Item at or below reorder level | **Low stock** | Listed under "Need attention"; "Restock cost — To reach 2× reorder level"; **Raise a purchase order** opens a PO with suggested quantities | happy |
| STK-044 | Low stock on Home | | STK-043 | Home | "Items low on stock" in "Needs your attention" | happy |
| STK-045 | FIFO costing | Owner | No period closed; receipts 10 @ ₹100 then 10 @ ₹120; sell 15 | **Books › Close the books › Stock costing** → First in, first out → confirm | "Stock is costed first in, first out"; remaining 5 valued at ₹120; cost of goods sold ₹1,600 | happy |
| STK-046 | Costing locked | Owner | A period closed | Try to change Stock costing | "Stock costing … can be changed only while no period is closed." | edge |
| STK-047 | Cancelled bill out of the cost | | Bill A 10 @ ₹100; bill B 10 @ ₹1,000, then B cancelled | Item stock value | Valued at ₹100 average; B ignored | edge |
| STK-048 | Perpetual stock postings | Owner | **Keep stock perpetually** from the FY start | Sell 5 Pcs | Stock in hand reduced and Cost of goods sold posted at cost (RULES 6.2) | happy |
| STK-050 | Scan by typing | | ITM-007 | **Scan barcode** → type `8901234567890` → **Use** | Item found with "N Pcs in stock"; tapping opens it | happy |
| STK-051 | Unknown code | | | Type an unknown code | "No item with that code" + **Create item** | edge |
| STK-052 | Camera scanning | | Phone | Open Scan | "Camera scanning is not available yet…". **Blocked** | edge |
| STK-053 | Branch scope | | Top-bar branch PUN | Stock tab, item detail | Figures for PUN; "All branches" shows the total | happy |
| STK-054 | Sell past stock | Sales | Allow negative stock off; 12 on hand | Invoice 20 | "Not enough stock at this branch on …"; picker shows **Out of stock** | validation |
| STK-055 | Transfer needs Branches | Owner | **Settings › Modules › Branches** off | Stock › + | No **Branch transfer** action | edge |
