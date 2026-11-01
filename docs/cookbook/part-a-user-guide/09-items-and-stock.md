# 09 — Items & stock

**Items & services** is your catalogue: what you sell and buy, with its price, tax rate and HSN/SAC. Every plan has it.

**Stock** tracks how many of each product you hold at each branch. It is on Smart Pro and above, in the **Stock** tab, which shows:
- **Stock value**
- **Low stock**
- **N out of stock**
- The item list, which you can filter by **All**, **Low** or **Out**
- **Stock actions**

On a sales plan, the catalogue is under **More › Sales › Items & services** and stock isn't tracked.

> Stock is never typed in directly. It is always worked out from **movements**: opening stock, purchase receipts, sales issues, returns, transfers and adjustments. Each movement is kept for good and never edited. To correct a figure, add another movement.

---

### 9.1 Add a product or service

**Goal:** Save an item once and reuse it on every document.
**Who / plan:** Owner, Admin or Accountant, on any plan. Stock fields need Smart Pro.

**Steps**
1. Start from **Stock › Items** (or **Items & services**) › **New item**, **Home › Add item**, or **New item** in the editor.
2. Choose **Product** or **Service**.
3. Fill in:

   | Field | Notes |
   |---|---|
   | **Item name** | Required, e.g. *Steel Ball Bearing 6203* |
   | **SKU / item code** | *Auto-generated if left blank.* Must be unique: *Another item already uses this SKU* |
   | **Description** | *Shown on documents* |
   | **Sale price** / **Purchase price** | Purchase price is the cost used until you have real purchases |
   | **Unit** | Nos, Kg, Box, … Services are always Nos. |
   | **Tax rate** | e.g. 18% |
   | **HSN code** (product) / **SAC code** (service) | 4, 6 or 8 digits. Required when you're GST-registered. |
   | **Barcode** | *Scan or type* |
   | **Track stock** | *Sales and purchases will move this item's stock automatically.* Products only. |
   | **Opening stock** | What you hold today |
   | **Reorder level** | *Alerts you below this.* |
   | **Active** | *Inactive items are hidden when creating documents.* |

4. Save. You see *Item added*.

**Rules & gotchas**
- A business with ₹5 crore or more turnover needs **6-digit HSN codes** on e-invoices.
- After you save, **Opening stock** is locked: *Use a stock adjustment to change this.*
- Changing an item's price or tax later doesn't change documents already raised. *Documents that already use this item keep their own copy of the details.*

**Example (service):** *On-site Installation*, `SRV-INST`, SAC 998729, 18%. A service never needs an e-way bill.

### 9.2 View an item

Tap an item to see:
- **Pricing**: **Sale price**, **Sale price incl. tax**, **Margin**, cost and **Tax category**.
- **In stock** and **Stock value**, *reorder at …*, and *… sold all-time*.
- **Stock movements**: each movement, with the running balance.

**Actions:**
- **Edit** (then **Save changes**)
- **Adjust stock**
- **Transfer between branches**
- **Sell this item**: opens a new invoice with this item on it
- **Buy this item**: opens a new purchase bill with this item on it
- **Delete item**

### 9.3 Search the catalogue

**Search by name, SKU or HSN** in Items & services. The Stock tab also searches by barcode. The catalogue has separate **Items** and **Services** views.

---

### 9.4 Enter opening stock for many items

**Goal:** Record what you had on hand when you started using the app.
**Who / plan:** Owner, Admin or Accountant, on Smart Pro and above.

**Steps**
1. Go to **Stock › Stock actions › Opening stock**, or tap **Set opening stock** on an empty stock list.
2. Pick the **As on** date.
3. Enter the quantity for each stock-tracked item. **Search items** helps. Each row shows *currently 40 Nos*.
4. Tap **Save opening stock**. You see *Opening stock set for 12 items*.

**What happens:** An *Opening stock* movement is posted for each item at the selected branch.

### 9.5 Adjust stock

**Goal:** Correct the stock for damage, loss, a stock count and so on.
**Who / plan:** Owner, Admin or Accountant, on Smart Pro and above.

**Steps**
1. Go to **Stock › Stock actions › Stock adjustment**, or **Adjust stock** on an item.
2. Pick the **Item** and **Branch**. **Current stock** is shown.
3. Choose **Increase** or **Decrease** and enter the **Quantity**. **New stock** previews the result.
4. Pick a **Reason**:
   - Damaged
   - Lost or stolen
   - Expired
   - Sample given
   - Stock count correction
   - Internal use
   - Found stock
   - Returned from customer
   - Production output
5. Set the **Date**, then tap **Save adjustment**. You see *Stock adjusted*.

**Rules & gotchas:** If the new figure is below zero you see *This would take stock negative. Check the quantity before saving.*

### 9.6 Move stock between branches

**Goal:** Send stock from one branch to another, for example Mumbai → Pune warehouse.
**Who / plan:** Owner, Admin or Accountant, on Smart Pro and above. You need two or more branches.

**Steps**
1. Go to **Stock › Stock actions › Branch transfer**, or **Transfer between branches** on an item.
2. Fill in the transfer:
   - **Item**
   - **From branch** (with *40 Nos available*) and **To branch**
   - **Quantity**
   - **Date**
   - **Notes**: *Vehicle, driver, LR number…*
3. Tap **Transfer stock**. You see *Stock transferred*.

**What happens:** Two movements are posted: **Transfer out** at the source and **Transfer in** at the destination.

**Rules & gotchas**
- You can move only what the source has: *Only 40 Nos available at the source branch*.
- With one branch you see *You only have one location*, and **Add a branch** takes you to **Settings › Branches**.

### 9.7 Review stock movements

Go to **Stock › Movements** to see every movement. **Search by item or reference** finds a movement by item name or document number.

| Type | When it's posted |
|---|---|
| **Opening stock** | Opening stock entry |
| **Purchase receipt** | Goods receipt, or a purchase bill without one |
| **Sales issue** | Invoice or delivery note |
| **Sales return** | Sales return finalised |
| **Purchase return** | Purchase return finalised |
| **Transfer in** / **Transfer out** | Branch transfer |
| **Adjustment** | Stock adjustment |

### 9.8 Act on low stock

**Goal:** Restock before you run out.

**Steps**
1. Go to **Stock › Low stock**, or tap **Items low on stock** on Home.
2. Items at or below their reorder level are listed under **Need attention**, each with *reorder at 50 Nos* and *buy 70 ≈ ₹8,400*.
3. **Restock cost** is what it would cost *to reach 2× reorder level*.
4. Tap **Raise a purchase order**. A purchase order opens with the suggested quantities (see [06 — Purchases](06-purchases.md)).

When nothing is low, the screen shows *Everything is stocked*.

### 9.9 Look up an item by barcode

**Steps**
1. Go to **Stock › Scan barcode**.
2. Type or paste the code in **Barcode** (*Enter or paste a code*), then tap **Use**.
3. If the code is found, the item opens with its stock (*12 Nos in stock*).
4. If not, you see *No item with that code*. Tap **Create item**, or add the barcode to an existing item.

**Not available yet:** **Camera scanning.** *Camera scanning is not available yet. Type or paste the code from the label, or pick an item.*

---

### 9.10 Selling more than you have

When **Allow negative stock** is off (the default), an invoice or delivery note can't take a branch below zero **on the document's date**:
- *Not enough stock at this branch on 01 Nov 2026: Steel Ball Bearing 6203 (12 Nos in stock, 20 needed).*
- In the item picker the item shows **Out of stock**.

To allow it anyway, turn on **Allow negative stock** in **Settings › Business profile › Inventory** (see [13 — Settings](13-settings.md)).

### 9.11 How stock is valued

The **Stock value** of an item is quantity on hand × its **weighted average cost** of incoming stock. If the item has never been bought, its **Purchase price** is used. Every stock figure covers the branch you've selected, or the whole business under **All branches**.

### 9.12 Delete an item

**Actions › Delete item**, then **Delete 〈name〉?** Past documents keep their own copy of the item's details. Deleting needs Owner or Admin.

If the item might come back, set it inactive instead.
