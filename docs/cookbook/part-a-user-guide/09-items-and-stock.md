# 09 — Items & stock

**Items & services** is your catalogue: what you sell and buy, with its price, tax rate and HSN/SAC. Every plan has it.

**Stock** tracks how many of each product you hold at each branch. It is on Smart Pro and above. The **Stock** tab (*Items, levels and movements*) shows:
- **Stock value**, with the number of tracked items
- **Low stock**, with *N out of stock* (tap it for the low-stock list)
- The item list, filtered by **All**, **Low**, **Out** or **Services**, and searched by name, SKU or barcode
- **Movements**
- The **+** button, which opens **Stock actions**: **Add item**, **Stock adjustment**, **Branch transfer**, **Set opening stock**, **Scan barcode** and **Stock movements**

Where to find it: 📱 the **Stock** tab, or **More › Stock** on a sales plan (there only **Items & services** opens; stock isn't tracked). 🖥 **Stock** in the sidebar: **Items & services**, **Stock movements**, **Low stock**.

Every stock figure covers the branch picked in the top bar, or the whole business under **All branches**.

> Stock is never typed in directly. It is always worked out from **movements**: opening stock, purchase receipts, sales issues, returns, transfers and adjustments. Each movement is kept for good and never edited. To correct a figure, add another movement.

---

### 9.1 Add a product or service

**Goal:** Save an item once and reuse it on every document.
**Who / plan:** Owner, Admin or Accountant, on any plan. Stock fields need Smart Pro.

**Steps**
1. Start from **Items & services › New item**, **Stock › + › Add item**, **Home › Add item**, or **New item** in a document editor.
2. Choose **Product** or **Service**. *Can't be changed once the item is saved.*
3. Fill in:

   | Field | Notes |
   |---|---|
   | **Name** | Required, e.g. *Steel Ball Bearing 6203* |
   | **SKU / item code** | *Auto-generated if left blank* (`SKU-0001`, `SKU-0002`…). Must be unique: *Another item already uses this SKU* |
   | **Description** | *Shown on documents* |
   | **Category** / **Brand** | Pick from your masters (9.13), or **None** |
   | Custom fields | Your business's own item fields, if any (9.14) |
   | **Sale price** / **Purchase price** | In your base currency. The purchase price is the cost used until you have real purchases. |
   | **Unit** | Pieces (the default), Box, Kilogram, Litre, Metre, Hour, Day, Set or Numbers. *Services are always billed in Nos.* |
   | **Tax rate** | One of your tax rates, e.g. GST 18% |
   | **HSN code** (product) / **SAC code** (service) | 4, 6 or 8 digits. Required when your business is GST-registered. |
   | GST treatment | Shown when you're GST-registered (9.2) |
   | **Barcode** | *Scan or type*. Products only. Must be unique. |
   | **Track stock** | *Sales and purchases will move this item's stock automatically.* Products only, Smart Pro. |
   | **Opening stock** / **Reorder level** | What you hold today, and *Alerts you below this.* |
   | **Opening stock date** | *The day this stock was counted. No invoice or bill with this item can be dated before it.* Can't be a future date. |
   | **Active** | *Inactive items are hidden when creating documents.* |

4. Tap **Add item**. You see *Item added*, and the item opens. **Save & add another** keeps the type, unit, tax rate, category and brand for the next one.

**What happens:** With **Opening stock**, an *Opening stock* movement is posted at your main branch on the opening stock date, at the purchase price.

**Rules & gotchas**
- SKU, **Barcode**, **Category** and **Brand** appear only while **Retail item fields** is on in **Settings › Modules**. Off, items are just a name, unit and price; a SKU is still given to each.
- A business with ₹5 crore or more turnover needs **6-digit HSN codes** on e-invoices ([11](11-gst-compliance.md)).
- After you save, **Opening stock** is locked: *Use a stock adjustment to change this.*
- Once an item has stock movements, its type, unit and stock tracking can't change: *This item has stock movements, so its type, unit and stock tracking cannot change; make a new item instead*.
- A service has no stock: *A service has no stock*.
- Changing an item's price or tax later doesn't change documents already raised.

**Example (service):** *On-site Installation*, `SRV-INST`, SAC 998729, 18%. A service never needs an e-way bill.

**Not available yet:** **Item photos.** The server can store an item image, but the app has no way to add one.

### 9.2 Set an item's GST treatment

Shown on the item form when your business is GST-registered.

| Field | Choices and meaning |
|---|---|
| **GST treatment** | **Taxable** (*GST at the rate above.*), **Nil-rated**, **Exempt** or **Non-GST** |
| **Reimbursement at cost** | You pay this for the customer and recover exactly what you paid (pure agent, Rule 33). No GST. |
| **Reverse charge** | A notified supply where the buyer pays the GST, such as GTA transport or legal services |
| **Cess (%)** | Compensation cess on top of GST, e.g. tobacco, aerated drinks, cars |
| **Capital goods** | Machinery or equipment you keep. Products only. Its input credit is reported separately. |
| **Input tax credit** | **Can be claimed**, **Blocked, section 17(5)** or **Not claimable** |

See [20](20-tds-rcm-itc.md) and [21](21-gst-returns.md) for how these reach the returns.

### 9.3 View an item

Tap an item to see:
- Its SKU and barcode, and badges for **Product**/**Service**, the tax rate, the HSN and **Inactive**.
- **Sale price** (*per* its unit) and **Margin** (*cost ₹…*).
- For a tracked product: **In stock** (*reorder at …*) and **Stock value** (*… sold all-time*).
- **Pricing**: **Sale price**, **Purchase price**, **Tax category** and **Sale price incl. tax**.
- **Stock movements**: each movement with its date, type, reference, quantity and running balance.

**Actions:**
- **Edit** (then **Save changes**; you see *Item updated*)
- **Adjust stock** and **Transfer between branches** (tracked products only)
- **Sell this item**: opens a new invoice with this item on it
- **Buy this item**: opens a new purchase bill with this item on it (Smart Pro)
- **Delete item**

### 9.4 Search and filter the catalogue

**Items & services** has **Items** and **Services** views. **Search by name, SKU or HSN** (it also matches barcode and description). With categories or brands set up, filter by **All categories** and **All brands**.

🖥 On a desktop you can tick items and use **Export CSV** or **Deactivate**.

---

### 9.5 Enter opening stock for many items

**Goal:** Record what you had on hand when you started using the app.
**Who / plan:** Owner, Admin or Accountant, on Smart Pro and above.

**Steps**
1. Pick the branch in the top bar. The screen says *For 〈branch〉* when you have more than one.
2. Go to **Stock › + › Set opening stock**, or tap **Set opening stock** on an empty stock list.
3. Pick the **As on** date.
4. Enter the quantity for each stock-tracked item. **Search items** helps. Each row shows *currently 40 Pcs*.
5. Tap **Save opening stock**. You see *Opening stock set for 12 items*.

**What happens:** An *Opening stock* movement is posted for each item at the branch, at its purchase price. It doesn't change your sales or purchase figures.

With no tracked items you see *No stock-tracked items*.

### 9.6 Adjust stock

**Goal:** Correct the stock for damage, loss, a stock count and so on.
**Who / plan:** Owner, Admin or Accountant, on Smart Pro and above.

**Steps**
1. Go to **Stock › + › Stock adjustment**, or **Adjust stock** on an item.
2. Pick the **Item** and, with more than one branch, the **Branch**. **Current stock** is shown.
3. Choose **Decrease** or **Increase** and enter the **Quantity**. **New stock** previews the result.
4. Pick a **Reason** (*Why is this changing?*): Damaged, Lost or stolen, Expired, Sample given, Stock count correction, Internal use, Found stock, Returned from customer, Production output.
5. Set the **Date**, then tap **Save adjustment**. You see *Stock adjusted*.

**What happens:** An *Adjustment* movement is posted, at the item's purchase price. Under perpetual stock the shortage or excess posts to *Stock adjustments* in the books (RULES 6.2).

**Rules & gotchas**
- Stock can't go below zero, on the adjustment's own date: the screen warns *This would take stock negative. Check the quantity before saving.*, and the server refuses it (*Steel Ball Bearing 6203 has 3 Pcs at Mumbai on 2026-11-10; this would take it to -2*). This applies even with **Allow negative stock** on.
- The date can't be in a closed period ([19](19-books.md)).
- Quantities take at most three decimals.

### 9.7 Move stock between branches

**Goal:** Send stock from one branch to another, for example Mumbai → Pune warehouse.
**Who / plan:** Owner, Admin or Accountant, on Smart Pro and above. You need two or more branches.

**Steps**
1. Go to **Stock › + › Branch transfer**, or **Transfer between branches** on an item.
2. Fill in the transfer:
   - **Item**
   - **From branch** (with *40 Pcs available*) and **To branch**
   - **Quantity**
   - **Date**
   - **Notes**: *Vehicle, driver, LR number…*
3. Check **After the transfer**: each branch's stock now and after.
4. Tap **Transfer stock**. You see *Stock transferred*.

**What happens:** Two movements are posted: **Transfer out** at the source and **Transfer in** at the destination, at the source's cost. Total stock and its value stay the same.

**Rules & gotchas**
- You can move only what the source has on that date: *Only 40 Pcs available at the source branch*.
- From and To must differ: *From and To are the same branch. Pick a different branch to move stock to.*
- With one branch you see *You only have one location*, and **Add a branch** takes you to **Settings › Branches**.
- The date can't be in a closed period.

### 9.8 Review stock movements

Go to **Stock › Movements**. Filter by type, or **Search by item or reference** (item name, SKU or document number). With several branches each row shows the branch code.

| Type | When it's posted |
|---|---|
| **Opening stock** | Opening stock entry, or an item saved with opening stock |
| **Purchase receipt** | Goods receipt, or a purchase bill without one |
| **Sales issue** | Invoice or delivery note |
| **Sales return** | Sales return finalised |
| **Purchase return** | Purchase return finalised |
| **Transfer in** / **Transfer out** | Branch transfer |
| **Adjustment** | Stock adjustment |

Cancelling a document posts a reversing movement; the original stays. A cancelled document's movements carry no value.

### 9.9 Act on low stock

**Goal:** Restock before you run out.

**Steps**
1. Go to **Stock › Low stock**, or tap **Items low on stock** on Home.
2. Items at or below their reorder level are listed under **Need attention**, each with *reorder at 50 Pcs* and *buy 70 ≈ ₹8,400*. Items at zero are marked **Out**.
3. **Restock cost** is what it would cost *To reach 2× reorder level*.
4. Tap **Raise a purchase order**. A purchase order opens with the suggested quantities ([06](06-purchases.md)).

When nothing is low, the screen shows *Everything is stocked*.

### 9.10 Look up an item by barcode

**Steps**
1. Go to **Stock › + › Scan barcode**, or the barcode icon in the Stock search.
2. Under **Look up a code**, type or paste it in **Barcode** (*Enter or paste a code*), or use a scanner that types for you, then tap **Use**. **Items with a barcode** lists sample codes from your items.
3. If the code is found, the item shows with its stock (*12 Pcs in stock*); tap it to open the item.
4. If not, you see *No item with that code*. Tap **Create item**, or add the barcode to an existing item.

**Not available yet:** **Camera scanning.** *Camera scanning is not available yet. Type or paste the code from the label, or pick an item below.*

---

### 9.11 Selling more than you have

When **Allow negative stock** is off (the default), an invoice or delivery note can't take a branch below zero **on the document's date**:
- *Not enough stock at this branch on 01 Nov 2026: Steel Ball Bearing 6203 (12 Pcs in stock, 20 needed).*
- In the item picker the item shows **Out of stock**.

To allow it, turn on **Allow negative stock** in **Settings › Business profile** (*Let invoices and deliveries sell more than the branch has in stock.*). See [13](13-settings.md). Adjustments and transfers never go below zero.

### 9.12 How stock is valued

**Stock costing** is a business setting, under **Books › Close the books › Stock costing** (owner only):

| Method | How goods going out are costed |
|---|---|
| **Weighted average** (default) | *At the average of what is in stock, which moves with each purchase.* |
| **First in, first out** | *At what the oldest stock still on hand cost; stock left over is valued at the latest prices.* |

- The method can change only while no period is closed (*Stock costing values every period's stock, so it can be changed only while no period is closed.*). Changing it works out every period again (RULES 6.2, AS 2).
- An item never bought is valued at its **Purchase price**.
- Stock run down to nothing is worth nothing. A cancelled bill is left out of the cost.

**Periodic or perpetual.** The same screen has **Stock in the books**. Periodic: closing stock is valued at the end of each period, as in Tally. **Keep stock perpetually** (from the first day of an open financial year) posts goods to *Stock in hand* as they come in and go out, and what is sold to *Cost of goods sold* (RULES 6.2, 6.10). Under perpetual stock, cost of goods sold follows each document's cost centre (6.7). See [19 — Books](19-books.md).

### 9.13 Item categories and brands

**More › Business setup › Item categories** and **More › Business setup › Brands**. Owner, Admin or Accountant.
- **Add category**: a **Category name** (e.g. *Bearings*) and a **Colour**, then **Save**. You see *Category saved*.
- **Add brand**: a **Brand name** (e.g. *SKF*), then **Save**. You see *Brand saved*.
- Tap one to rename it (**Edit category** / **Edit brand**).
- **Delete**: only when no item uses it. *A category that items are filed under can't be deleted. Move those items to another category first.*

Categories and brands show on items only while **Retail item fields** is on (9.1).

### 9.14 Custom fields on items

An owner or admin adds item fields under **More › Account › Custom fields** (entity **Items**): text, number, date, list or tick box, optionally required. They appear on the item form and can be filled from an import (9.16). See [13](13-settings.md).

### 9.15 Delete an item

**Actions › Delete item**, then confirm **Delete 〈name〉?**. Deleting needs Owner or Admin.

Only an item on no document and with no stock movements can be deleted. Otherwise the server refuses: *This item appears in documents; mark it inactive instead*. Set it inactive instead (turn off **Active**).

### 9.16 Import items from a spreadsheet

**Goal:** Bring your catalogue in from Excel, Google Sheets, Tally or another app.
**Who / plan:** Owner, Admin or Accountant.

**Steps**
1. On **Items & services**, tap **Import**.
2. 🖥 **Choose a file** (`.csv`), **Match the columns**, then **Check and import**. 📱 **Choose CSV file** or paste into **Or paste the CSV here**.
3. Tap **Check**. Each row is **Ready**, **Already there** or **Fix**; the counts read *N new, N already there, N to fix*.
4. Tap **Import N**. You see *N items imported*.

**Rules & gotchas**
- Columns read: Name (required), SKU, Goods or service, Unit, Sale price, Purchase price, GST rate, HSN/SAC, Barcode, Opening stock, Reorder level, Description. Columns headed with your custom fields' names fill those fields.
- A row is **Already there** when an item has the same SKU, barcode or name.
- A required custom field with no column is warned about; those items are created without it.
- Opening stock goes to your main branch, dated today.
- Up to 1,000 rows at a time.

More on imports: [26 — Imports & opening balances](26-imports-and-opening-balances.md).

---

**Related:** [05 Sales](05-sales.md) · [06 Purchases](06-purchases.md) · [12 Reports › Stock](12-reports.md) · [13 Settings](13-settings.md) · [19 Books](19-books.md)
