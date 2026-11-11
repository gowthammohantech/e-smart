# 06 — Purchases

The **Buy** tab (🖥 **Purchases** in the sidebar) is your purchases hub. When expenses are on your plan, a switch at the top moves between **Purchases** and **Expenses**. A period bar sets the period the figures cover. The purchases view shows:
- **Purchases this month**, with the change from the previous period
- **Expenses**
- **Payable**: what you still owe, and how many bills are open
- **Overdue**

Below those are **Purchase documents**, a tile for each list with its count, and **Recent bills**. The **+ Bill** button starts a new purchase bill.

> **Plan:** Purchases and suppliers are on **Smart Pro** and **Smart Business**. On a sales plan the Buy tab, suppliers and payables are hidden, and opening one sends you to the upgrade page (see [14 — Team, roles & plans](14-team-roles-plans.md)).

```
Purchase order ──► Goods receipt ──► Purchase bill ──► Purchase return
      └──────────────────────────────────►┘               Supplier credit / debit note
```

| Document | Number | Statuses | Moves stock? |
|---|---|---|---|
| **Purchase order** | `PO/…` | Draft → Confirmed → Received | No |
| **Goods receipt** | `GRN/…` | Draft → Received → Billed | **Yes**: stock comes in |
| **Purchase bill** | `BILL/…` | Draft → Issued → Partly paid / Overdue → Paid | **Yes**, unless a goods receipt already brought the stock in |
| **Purchase return** | `DRN/…` | Requested → Approved → Processed | **Yes**: stock goes back out when it is approved |
| **Supplier credit note** / **Supplier debit note** | `SCN/…` / `SDN/…` | Draft → Issued | No |

The editor, actions and rules are the same as for sales documents. See [05 — Sales](05-sales.md) for the editor, converting, cancelling and sharing. This chapter covers what is different for purchases. Supplier credit and debit notes are in [20 — TDS, reverse charge, credit & adjustments](20-tds-rcm-itc.md#credit-and-debit-notes-without-goods).

The Finalise button says what it does for each kind:

| Kind | Finalise button | Status after |
|---|---|---|
| Purchase order | **Confirm order** | Confirmed |
| Goods receipt | **Mark received** | Received |
| Purchase bill | **Record bill** | Issued |
| Purchase return | **Approve return** | Approved |
| Supplier credit or debit note | **Record credit note** / **Record debit note** | Issued |

A draft has no number yet; the list shows it as a draft. The number is given when it is finalised.

---

### 6.1 Record a purchase bill

**Goal:** Record a supplier's bill so you know what you owe, and claim the input tax.
**Who / plan:** Owner, Admin, Accountant or Sales, on Smart Pro and above.

**Before you start:** The supplier exists, or you add them from the editor. For TDS on bills, your TAN is in the business profile.

**Steps**
1. **Buy › Purchase bills › New purchase bill**, or **+ Bill** on the Buy tab.
2. **Select supplier**, or add a new one.
3. Fill in the header:

   | Field | Notes |
   |---|---|
   | Date | The date on the supplier's bill |
   | **Due date** | Date plus the supplier's payment terms. It can't be before the bill's date. |
   | **Supplier document number** | *Their bill number*, exactly as printed. It shows as **Their no. …** on the bill and in lists, and it is what GSTR-2B matching looks for. |
   | **Place of supply** | Usually your own state. Sets IGST or CGST + SGST. |

4. Add the lines as on an invoice. The rate is what you paid. Each line can carry its own input tax credit type (**Eligible**, **Capital goods**, **Reverse charge**, **Blocked (s.17(5))**, **Not claimable**) and, for lines that are not stock, its own cost centre.
5. Optional fields, where they apply:
   - **TDS section**: what will be kept back, for example **₹2,000 kept back at 2%, paid to the government** ([20](20-tds-rcm-itc.md#tds-on-supplier-bills)). Without a TAN you see *Add your TAN in the business profile to deduct TDS on bills. Without it nothing is kept back.* with **Add TAN**.
   - **Reverse charge** ([20](20-tds-rcm-itc.md#reverse-charge)).
   - **Input Service Distributor invoice**, for a credit your ISD passed on (registered supplier, not an import).
   - Bill of entry, for imports (6.8).
   - Vehicle, cost centre, notes, attachments and custom fields.
6. Tap **Record bill** and confirm.

**What happens**
- The bill gets your own number, for example `BILL/2026-27/0011`, and becomes **Issued**.
- It appears in **Payables** and on the supplier's statement ([08](08-contacts.md)).
- Stock-tracked goods come into stock at the bill's branch, unless a goods receipt already brought them in (6.3).
- The purchase cost feeds the item's cost (moving average, or first in, first out if the business uses FIFO; see [09 — Items & stock](09-items-and-stock.md#912-how-stock-is-valued)). GST that can't be claimed on stocked goods is part of their cost (RULES 6.27).
- The toast offers **Pay supplier**.
- If the bill has capital-goods lines, the bill shows *Capital goods worth ₹… on this bill are in your fixed assets. Add them to the register so they depreciate.* with **Add to fixed asset register** (see [23 — Fixed assets](23-fixed-assets.md)).

**Rules & gotchas**
- HSN/SAC is required on every line when you are GST-registered: *HSN/SAC is required on every line of a GST invoice. Missing on: …*
- *The total must be more than 0.*
- An issued bill can't be edited. Only its notes, terms, reference and attachments can change. To correct it, cancel it (if nothing is paid against it) or raise a supplier credit or debit note.
- Paid, Partly paid and Overdue follow from the payments you record (see [07 — Payments](07-payments.md)).
- If a business has an approval rule for purchase bills, a bill over the amount waits for an owner or admin before it is issued (see [25 — Approvals](25-approvals.md)).
- From 1 December 2026, charges on a bill (freight, packing and so on) are taxed like a line (RULES 1.10).
- A bill from a micro or small supplier has to be paid within the MSME limit, 45 days at most, or 15 days with no agreed terms ([20](20-tds-rcm-itc.md#paying-micro-and-small-suppliers-on-time)).
- A bill still unpaid 180 days after its date has its credit reversed: *Input tax credit reversed on …: unpaid 180 days after the bill. It is claimed again once paid.*

**Example:** A bill from **Apex Steel Works** for 500 × Steel Ball Bearing 6203 at ₹120, 18% intra-state.
- Taxable ₹60,000, CGST ₹5,400, SGST ₹5,400, total ₹70,800.
- 500 Nos are added to Mumbai's stock.

---

### 6.2 Raise a purchase order

**Goal:** Order stock from a supplier.
**Who / plan:** Owner, Admin, Accountant or Sales, on Smart Pro and above.

**Steps**
1. **Buy › Purchase orders › New purchase order**.
   - Or from **Stock › Low stock › Raise a purchase order**, which suggests quantities to bring each item up to twice its reorder level.
2. Fill it in, then tap **Confirm order**. It is numbered (`PO/…`) and becomes **Confirmed**.
3. Share the PDF with the supplier (**Share PDF** or send it by email).
4. When the goods arrive, use **Actions › Create goods receipt**. If the bill comes with the goods, use **Convert to bill** instead.

**What happens:** A purchase order doesn't change stock or what you owe.

**Rules & gotchas**
- An order is carried forward once. After a goods receipt or bill has been made from it (and not cancelled), neither action is offered again, so the same goods aren't received or billed twice.
- Nothing can be made from a draft or a cancelled order.
- The order does not become **Received** by itself. Use **Change status › Received** once everything has arrived.
- A confirmed order can still be cancelled.

### 6.3 Record a goods receipt

**Goal:** Record goods arriving at a branch before the bill comes.
**Who / plan:** Owner, Admin, Accountant or Sales, on Smart Pro and above.

**Steps**
1. Start the receipt either way:
   - From the purchase order: **Actions › Create goods receipt**. You see *Created a draft goods receipt* with the order's lines.
   - **Buy › Goods receipts › New goods receipt**.
2. Change the quantities to what actually arrived, then tap **Mark received**. It is numbered (`GRN/…`) and becomes **Received**.
3. When the supplier's bill arrives, open the receipt and tap **Convert to bill**. Check the draft bill, enter **Supplier document number**, and tap **Record bill**.
4. Mark the receipt **Billed** with **Change status** if you want the list to show it as done. It doesn't change by itself.

**What happens**
- Stock comes in when the receipt is marked received.
- With perpetual stock, the goods' value goes into *Stock in hand* and is owed under *Goods received, not billed* until the bill arrives. The bill made from the receipt, or from the same purchase order, moves that amount into what you owe the supplier. Any price difference on the bill stays in Purchases (RULES 6.2; see [19 — Books](19-books.md)).
- A bill made from the receipt, or from the same order, does not add the stock again.

**Rules & gotchas**
- A received goods receipt can't be cancelled. Its only next status is **Billed**.
- A bill entered on its own, not converted from the receipt or its order, would bring the goods in a second time. Always use **Convert to bill**.

### 6.4 Raise a purchase return

**Goal:** Send goods back to a supplier, and reduce what you owe them.
**Who / plan:** Owner, Admin, Accountant or Sales, on Smart Pro and above.

**Steps**
1. Start the return either way:
   - On the bill: **Actions › Create a return**.
   - **Buy › Purchase returns › New purchase return**, then pick the bill: *Pick the bill being returned. Its lines are copied into the return, where you can reduce quantities or remove lines.*
2. Reduce the quantities to what is going back. You can't return more than was billed: *Cannot exceed …, the quantity on the original document*.
3. Saved as a draft, it shows as **Requested**. Tap **Approve return**: it is numbered (`DRN/…`) and becomes **Approved**.
4. Mark it **Processed** with **Change status** when the supplier has settled it.

**What happens** (when it is approved)
- Stock-tracked goods leave your stock. With FIFO costing, they go back at what the bill's goods came in at.
- The return's total is credited against the bill, so its balance goes down.
- Its GST comes off your input tax.

**Rules & gotchas**
- You need enough stock at the branch to send back, unless **Allow negative stock** is on: *Not enough stock on …*.
- Several returns can be raised against one bill, up to what it carried.
- For a price change or discount with no goods going back, use **Record their credit note** or **Record their debit note** on the bill instead ([20](20-tds-rcm-itc.md#credit-and-debit-notes-without-goods)).

### 6.5 Create a bill from a scanned supplier bill

**Goal:** Skip typing: photograph the bill and let the app read it.

**Steps**
1. **Buy › Scan a bill**.
   - 📱 Take a photo or choose one.
   - 🖥 Choose a clear photo or scan of the bill. If it can't be read in the browser, scan it with the phone app.
2. Check the fields, then tap **Create bill**.
3. A **New purchase bill** opens, filled in: the supplier (found by GSTIN or name), the date, their number and the lines read off it, with the image attached. Check it, then **Record bill**.

Nothing is saved until you finish the form. The full recipe is in [10 — Expenses & bill scanning](10-expenses-and-ocr.md).

### 6.6 Buy a particular item

Open the item under **Stock** and tap **Buy this item**. A new purchase bill opens with that item on it (see [09 — Items & stock](09-items-and-stock.md)).

### 6.7 Pay a supplier

On an issued bill with a balance, the payment card shows **Outstanding** and **Paid**, and the button **Pay supplier** (see [07 — Payments](07-payments.md#73-pay-a-supplier)). If the supplier holds an advance you paid earlier, **Adjust advance (₹…)** applies it to this bill instead ([07](07-payments.md#74-use-an-advance-against-new-documents)).

On 🖥 the Purchase bills list, a bill with a balance has **Pay supplier** in its row menu.

### 6.8 Record an import bill

**Goal:** Record goods bought from abroad and claim the IGST paid at customs.

**Steps**
1. New purchase bill from an overseas supplier, or with place of supply **96**. You see *Import from abroad — no GST on the supplier's bill (IGST is paid at customs).*
2. Enter the bill of entry: **Bill of entry number**, **Bill of entry date**, **Port code**, **Assessable value**, **IGST paid at customs** and **Cess paid at customs**.
3. **Record bill**.

**What happens:** The customs IGST and cess are your input credit (GSTR-3B 4A(1)), matched to GSTR-2B on the bill of entry number (RULES 7.11; see [21 — GST returns](21-gst-returns.md)).

### 6.9 Bring in bills you owed before you started

Bills that were still unpaid when you started these books are imported one by one as **opening bills**: **Money › Payables › Import outstanding** (RULES 6.12). They go on the supplier's account and in Payables, and are paid like any bill, but never count as purchases or GST. See [26 — Imports & opening balances](26-imports-and-opening-balances.md).

### 6.10 Cancel or delete a purchase document

- **Delete draft** removes a draft. Drafts have no number, so nothing is left behind.
- **Cancel document** on an issued bill: *The number stays reserved and the document is kept for your audit trail, but it no longer counts towards your books.* It is refused while a payment or a live return stands against the bill. Delete the payment or cancel the return first.
- 🖥 On a list, tick drafts and use **Delete drafts** to remove several at once. **Export CSV** exports the ticked rows.

---

**Related:** [07 — Payments](07-payments.md) · [08 — Customers & suppliers](08-contacts.md) · [09 — Items & stock](09-items-and-stock.md) · [20 — TDS, reverse charge, credit & adjustments](20-tds-rcm-itc.md) · [21 — GST returns](21-gst-returns.md) · [23 — Fixed assets](23-fixed-assets.md) · [25 — Approvals](25-approvals.md)
