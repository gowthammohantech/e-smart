# 06 — Purchases

The **Buy** tab is your purchases hub. At the top it shows:
- **Purchases this month**
- **Expenses**
- **Payable**
- **Overdue**

Below that are **Purchase documents**, **Where the money goes** and **Recent bills**.

> **Plan:** Purchases and suppliers are on **Smart Pro** and **Smart Business**. On a sales plan, the Buy tab, suppliers and payables are hidden, and opening one sends you to the upgrade page (see [14 — Team, roles & plans](14-team-roles-plans.md)).

```
Purchase order ──► Goods receipt ──► Purchase bill ──► Purchase return
      └──────────────────────────────────►┘
```

| Document | Statuses | Moves stock? |
|---|---|---|
| **Purchase order** | Draft → Confirmed → Received | No |
| **Goods receipt** | Draft → Received → Billed | **Yes**: stock comes in |
| **Purchase bill** | Draft → Issued → Partly paid / Overdue → Paid | **Yes**, if no goods receipt brought the stock in already |
| **Purchase return** (debit note) | Requested → Approved → Processed | **Yes**: stock goes back out |

The editor, actions and rules are the same as for sales documents. See [05 — Sales](05-sales.md): the editor in 5.1, convert in 5.6, cancel in 5.10, share in 5.11. This chapter covers what is different.

---

### 6.1 Record a purchase bill

**Goal:** Record a supplier's bill so you know what you owe, and claim the input tax.
**Who / plan:** Owner, Admin, Accountant or Sales, on Smart Pro and above.

**Steps**
1. **Buy › Purchase bills › New purchase bill**, or **Buy › Record a bill**.
2. **Select supplier**, or **Add new supplier**.
3. Fill in the header:

   | Field | Notes |
   |---|---|
   | **Purchase bill date** | The date on the supplier's bill |
   | **Due date** | Date + the supplier's payment terms |
   | **Supplier document number** | *Their bill number*, exactly as printed. It shows as *Their no. …* on the bill. |
   | **Place of supply** | Usually your own state. Sets IGST vs CGST + SGST. |

4. Add the lines as on an invoice. The rate is what you paid.
5. **Finalise**.

**What happens**
- The bill gets your own number, for example `BILL/2026-27/0011`.
- It appears in **Payables**.
- Stock-tracked goods come into stock at the bill's branch.
- The purchase cost feeds the item's average cost.

**Rules & gotchas**
- HSN/SAC is required on every line when you are GST-registered.
- **Import from abroad**: *no GST on the supplier's bill (IGST is paid at customs).*
- Paid, Partly paid and Overdue follow from the payments you record (see [07 — Payments](07-payments.md)).

**Example:** A bill from **Apex Steel Works** for 500 × Steel Ball Bearing 6203 at ₹120, 18% intra-state.
- Taxable ₹60,000, CGST ₹5,400, SGST ₹5,400, total ₹70,800.
- 500 Nos are added to Mumbai's stock.

---

### 6.2 Raise a purchase order

**Goal:** Order stock from a supplier.

**Steps**
1. **Buy › Purchase orders › New purchase order**.
   - Or from **Stock › Low stock › Raise a purchase order**, which suggests quantities to bring each item up to twice its reorder level.
2. Fill it in, then **Finalise**. It is numbered (`PO/…`) and goes straight to **Confirmed**.
3. Share the PDF with the supplier (**Share PDF** or **Send by email**).
4. When the goods arrive, **Create goods receipt** or **Convert to bill**.

**What happens:** A purchase order doesn't change stock or what you owe.

### 6.3 Record a goods receipt

**Goal:** Record goods arriving at a branch before the bill comes.

**Steps**
1. Start the receipt either way:
   - From the purchase order: **Actions › Create goods receipt**.
   - **Buy › Goods receipts › New goods receipt**.
2. Adjust the quantities to what actually arrived, then **Finalise**. It is numbered (`GRN/…`) and goes straight to **Received**.
3. When the supplier's bill arrives, use **Convert to bill**. The receipt becomes **Billed**.

**What happens:** Stock comes in when the receipt is finalised. A bill made from it, or from the same purchase order, does not add the stock again.

### 6.4 Raise a purchase return (debit note)

**Goal:** Send goods back to a supplier, or reduce what you owe them.

**Steps**
1. Start the return either way:
   - On the bill: **Actions › Create a return**.
   - **Buy › Purchase returns › New purchase return**, then pick the bill.
2. *Its lines are copied into the return, where you can reduce quantities.* You can't return more than was billed.
3. **Save draft**: it shows as **Requested**. Then **Finalise**: it is numbered (`DRN/…`) and becomes **Approved**. Mark it **Processed** when settled.

**What happens**
- Stock-tracked goods leave your stock.
- The return's total is credited against the bill, so its balance goes down.

**Rules & gotchas:** You need enough stock at the branch to send back, unless **Allow negative stock** is on.

### 6.5 Create a bill from a scanned supplier bill

**Goal:** Skip typing: photograph the bill and let the app read it.

**Steps**
1. **More › Scan a bill or receipt** (phone app only).
2. Capture the bill, check the fields, then tap **Create bill**.
3. A **New purchase bill** opens, prefilled. Check it, then finalise.

Nothing is saved until you finish the form. The full recipe is in [10 — Expenses & bill scanning](10-expenses-and-ocr.md).

### 6.6 Buy a particular item

Open the item under **Stock** and tap **Buy this item**. A new purchase bill opens with that item on it (see [09 — Items & stock](09-items-and-stock.md)).

### 6.7 Pay a supplier

On an issued bill with a balance, tap **Pay supplier** (see [07 — Payments](07-payments.md#73-pay-a-supplier)).
