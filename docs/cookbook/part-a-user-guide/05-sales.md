# 05 — Sales

The **Sell** tab is your sales hub. At the top it shows:
- **Invoiced this month**
- **Collected**
- **Outstanding**
- **Overdue**

Below that are your **Sales documents**, **Top customers** and **Recent invoices**.

Every plan includes sales. A sale can go through as many steps as you need:

```
Quotation ──► Sales order ──► Delivery note ──► Invoice ──► Sales return
     └──────────────┴──────────────────────────────►┘
```

You can start at any step. Most shops raise an **Invoice** directly, and a wholesaler may go quote → order → delivery → invoice. Each step can be *converted* into the next one, which carries the lines forward.

| Document | Statuses | Moves stock? |
|---|---|---|
| **Quotation** | Draft → Sent → Accepted / Rejected / Expired (an expired quote can be sent again) | No |
| **Sales order** | Draft → Confirmed → Fulfilled | No |
| **Delivery note** | Draft → Delivered | **Yes**: stock goes out |
| **Invoice** | Draft → Issued → Partly paid / Overdue → Paid | **Yes**, unless it came from a delivery note that already moved the stock |
| **Sales return** (credit note) | Requested → Approved → Processed | Yes: stock comes back in |

Any document can be **Cancelled** before it reaches its final status.

---

## Creating documents

### 5.1 Raise an invoice

**Goal:** Bill a customer.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan. **Free** allows 20 invoices a month.

**Before you start:** Have the customer and items in the app, or add them as you go.

**Steps** (📱 the phone uses a 4-step wizard: **Who → What → Tax & terms → Review**; 🖥 on desktop everything is on one page)

1. **Sell › Invoices › New invoice**, or **Home › New invoice**.
2. **Who:** tap **Select customer**.
   - Search your contacts, or tap **Add new customer**.
   - A badge shows the customer's terms (*30d terms*).
3. Check the header fields:

   | Field | Notes |
   |---|---|
   | **Invoice date** | Today by default |
   | **Due date** | Date + the customer's payment terms; 30 days if none are set |
   | **Reference** | Optional: *PO number, job name…* |
   | **Branch** | Only shown when you have more than one branch |
   | **Place of supply** | Defaults to the customer's billing state. *Decides whether IGST or CGST + SGST applies.* |
   | **Currency** | Pro and above only; see 5.9 |

4. **What:** tap **Add item**.
   - Choose from the catalogue. You can tick several items, then tap **Add 3 items**.
   - Or add a **One-off line**, or create a **New item**.
   - The picker shows the stock at this branch: *12 Nos in stock*, *Low stock · 3 Nos left* or *Out of stock*.
5. Tap a line to edit it:
   - **Quantity**, **Unit** and **Rate**.
   - **Rate includes tax**: turn it on when the price you quote already contains tax.
   - **Discount** and **Tax rate**.
   - **HSN code** / **SAC code**: *Taken from the item master*.
   - **Description**.
   - Then tap **Save line**.
6. **Tax & terms:**
   - **Discount on total**.
   - **Other charges**: freight, packing or installation.
   - **Round off the total**: **Auto**, or **Manual** with a **Round-off amount**. A negative amount rounds down, for example −0.40.
   - **Notes**: visible to the customer.
   - **Terms and conditions**: prefilled with *Goods once sold will not be taken back. Interest @18% p.a. on overdue amounts.*
7. **Review:** check the totals:
   - Subtotal → line discounts → **Taxable value** → tax → discount on total → other charges → round off → **Total**.
8. Tap **Save draft** to finish later, or **Finalise** to issue the invoice.
   - **Finalise this invoice?** asks you to confirm.
   - 🖥 **Ctrl/⌘+Enter** finalises.

**What happens on Finalise**
- The invoice gets its permanent number, for example `INV/2026-27/0042`. It is never reused, even if you cancel the invoice.
- The status becomes **Issued**, and the amount shows in **Receivables**.
- Stock-tracked items leave the branch's stock.
- If the e-invoice and e-way bill rules apply, the invoice shows **Generate e-invoice** and an e-way bill action (see [11 — GST compliance](11-gst-compliance.md)).

**Rules & gotchas: what stops Finalise**

| Message | Fix |
|---|---|
| *Enter a name for this line* | Every line needs a name |
| *Rate and amount must be more than 0. Fix: …* / *The total must be more than 0.* | No zero lines or zero totals |
| *HSN/SAC is required on every line of a GST invoice. Missing on: …* | Add HSN/SAC to the item, or to the line |
| *Not enough stock at this branch on {date}: …* | Add stock, change the branch, or turn on **Allow negative stock** in the business profile |
| **Credit limit exceeded**: *… has a credit limit of … With this invoice they would owe …* | A warning only. You can tap **Continue anyway** |
| *Round-off must be less than … either way.* | Manual round-off is limited to less than one unit (₹1) |

- Drafts aren't numbered and can be edited freely. A finalised invoice can't be edited; cancel it, or raise a sales return.
- Draft and cancelled documents never count in reports, aging or stock.

**Related:** [07 — Payments](07-payments.md) · [11 — GST compliance](11-gst-compliance.md)

---

### 5.2 Worked example: same state vs another state

**Vertex Traders** is in Maharashtra (27).

**Invoice A, same state.** To **Sunrise Retail** (Mumbai, 27): 100 × Steel Ball Bearing 6203 at ₹180, 18%.
- Place of supply: Maharashtra. *Intra-state supply — CGST + SGST apply.*
- Taxable ₹18,000 → CGST 9% ₹1,620 + SGST 9% ₹1,620 → **Total ₹21,240**.

**Invoice B, another state.** The same lines to **Kumar Electronics** (Bengaluru, 29).
- Place of supply: Karnataka. *Inter-state supply — IGST applies.*
- Taxable ₹18,000 → IGST 18% ₹3,240 → **Total ₹21,240**.

The total is the same; only the split changes. If the goods are delivered somewhere other than the billing state, change **Place of supply** on the document. The tax split updates as you change it.

**Special places of supply**
- **Other country (export)**: *Export or SEZ supply — IGST applies. Add an LUT in the business profile to zero-rate it.* With a valid LUT on file, the line becomes **Zero-rated**.
- **SEZ customer**: treated like an export.
- **Unregistered business (yours)**: no tax is added. Prices with **Rate includes tax** still have their tax taken out.

---

### 5.3 Create a quotation

**Goal:** Send a price offer that the customer can accept.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. **Sell › Quotations › New quotation**, or **Home › New quote**.
2. Fill it in as for an invoice (5.1). Quotations have **Valid until** (default: 15 days) instead of a due date.
3. **Save draft**, or **Finalise**. Finalising numbers the quotation (`QT/2026-27/…`) and marks it **Sent**.
4. Share it from the quotation (5.11).

**What happens**
- Sharing the PDF of a draft quotation also marks it **Sent**.
- When the customer replies, use **Change status** to mark it **Accepted**, **Rejected** or **Expired**.
- Then convert it (5.6).

**Rules & gotchas**
- Quotations never move stock and never count as sales.
- *Quotes awaiting reply* appear on Home under **Needs your attention**.

### 5.4 Create a sales order

**Goal:** Confirm what the customer has ordered before you deliver.
**Steps**
1. Use **Sell › Sales orders › New sales order**, or convert an accepted quotation.
2. **Finalise**. The order is numbered and goes straight to **Confirmed**.
3. When everything has gone out, use **Change status** to mark it **Fulfilled**.

### 5.5 Create a delivery note

**Goal:** Send goods (with an e-way bill if needed) before you invoice.

**Steps**
1. **Sell › Delivery notes › New delivery note**, or **Create delivery note** from a sales order.
2. **Finalise**. The note is numbered and goes straight to **Delivered**.

**What happens**
- The stock leaves when the delivery note is finalised.
- An invoice made from it later doesn't take the stock out a second time.
- A delivery note of goods worth more than ₹50,000 can carry an e-way bill (see [11 — GST compliance](11-gst-compliance.md)).

---

## Working with a document

Open any document from its list to see the **Details** and **Preview** tabs. The **Actions** menu holds everything below.

### 5.6 Convert to the next step

| From | Actions |
|---|---|
| Quotation | **Convert to sales order**, **Convert to invoice** |
| Sales order | **Create delivery note**, **Convert to invoice** |
| Delivery note | **Convert to invoice** |
| Invoice | **Create a return** |

**What happens:** A new **draft** is created with the lines copied (*Created a draft invoice*). It shows *Against Quotation QT/2026-27/0004*. Edit it and finalise as usual.

**Rules & gotchas:** The new document can't be dated before the one it came from (*Can't be before {date}, the date of …*).

### 5.7 Duplicate a document

**Actions › Duplicate** makes a fresh draft with the same customer and lines. Use it for repeat orders.

### 5.8 Edit or delete a draft

- **Edit** works on drafts only.
- **Delete draft** removes it completely. *Drafts are not numbered, so nothing is left behind.*

### 5.9 Invoice in a foreign currency

**Goal:** Bill an overseas customer in their currency.
**Who / plan:** Smart Pro or Smart Business. Multi-currency is a Pro feature.

**Example:** **Harbour Supplies FZE** (Dubai, AED).
1. Start a **New invoice** and pick **Harbour Supplies FZE**.
2. **Place of supply** shows **Other country (export)**, because the contact is overseas.
3. **Currency** is AED. The **Exchange rate** comes from **Settings › Currencies & rates** (for example 1 AED = 23.85 INR), and you can change it on this invoice. *The rate is stored on the document so it stays reproducible.*
4. The totals show *≈ ₹… at 1 AED = 23.85 INR*.

**What happens**
- Reports convert this invoice at its own saved rate.
- When the customer pays at a different rate, the difference is recorded as an **FX gain** or **FX loss** (see [07 — Payments](07-payments.md)).

### 5.10 Change status or cancel

**Change status**
- **Actions › Change status** lists only the statuses allowed from where the document is now (*Currently sent*).
- If the document is already in its final status, you see *Nothing left to do*.
- **Paid**, **Partly paid** and **Overdue** follow from payments and due dates. Record a payment (5.12) instead of marking an invoice paid by hand.

**Cancel**
1. **Actions › Cancel document**.
2. Confirm **Cancel INV/…?**

*The number stays reserved and the document is kept for your audit trail, but it no longer counts toward your totals.*

You can't cancel while an e-invoice or e-way bill is still live:
- *Cancel the e-invoice (IRN) before cancelling this document*
- *Cancel e-way bill … before cancelling this document*

Cancel those first (see [11 — GST compliance](11-gst-compliance.md)).

Two more rules:
- An invoice with a sales return standing against it can't be cancelled until the return is cancelled.
- Cancelling puts back the stock the document moved. If cancelling would take back stock that has since been sold, it is blocked.

Any role except Viewer can cancel.

### 5.11 Share, print and send

**Needs a connection.** From a document's **Share** menu:

| Action | What happens |
|---|---|
| **Share PDF** / **Save as PDF** | The server makes the PDF, in English or Tamil to match your app language. It includes the IRN, signed QR, e-way bill number and UPI QR when present. 📱 It opens the share sheet; 🖥 it downloads. |
| **Print** / **Preview document** | A print-ready preview. |
| **Send by email** | 📱 The server emails the customer. 🖥 It opens your own mail app with a message ready. |
| **Send on WhatsApp** | 📱 The message is sent through WhatsApp Business, with delivered and read status. 🖥 It opens WhatsApp Web. *On its way to the customer.* |
| **Copy link** / **Share link** | A link to the document that expires after a while (*Link copied*). |
| **Payment link** | Invoices with a balance only. A Razorpay link the customer can pay through; the payment is recorded against the invoice automatically. |

**Not available yet**
- The **web pages behind shared links and payment links** aren't live, so a customer who opens one won't see the document yet. Send the PDF instead.
- **WhatsApp / email delivery** and **Razorpay** need those integrations set up (see [13 — Settings](13-settings.md)).

### 5.12 Record a payment against an invoice

On an **Issued** invoice with a balance, tap **Record payment**. The payment form opens with the customer and invoice already filled in (see [07 — Payments](07-payments.md)). If you tap it on a draft, you see *Issue it first; payment is recorded against an issued document.*

---

## Returns

### 5.13 Raise a sales return (credit note)

**Goal:** Take goods back from a customer, or reduce what they owe on an invoice.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. Start the return in one of two ways:
   - **Sell › Sales returns › New sales return**, then pick the invoice being returned.
   - On the invoice: **Actions › Create a return**.
2. The invoice's lines are copied in (*Lines from INV/…*). Lower the quantities to what is actually coming back. The most you can return on a line is the quantity invoiced: *Up to 10 can be returned*.
3. **Save draft**. An unfinalised return shows as **Requested**.
4. **Finalise**. The return is numbered (`CRN/2026-27/…`) and becomes **Approved**.
5. When it is settled, use **Change status** to mark it **Processed**.

**What happens**
- Stock-tracked goods come back into stock.
- The return's total is credited against the invoice, so the invoice's balance goes down. It can become **Paid** with no money changing hands.
- It appears in GSTR-1 under credit notes.

**Rules & gotchas**
- Under GST, a credit note must be issued by **30 November** after the end of the invoice's financial year. A later return shows the badge **Past the GST credit note deadline**.
- A sales return is the document to use when an e-invoice can no longer be cancelled (after 24 hours).

---

## Finding documents

### 5.14 Search and filter a list

**Steps:** Open any list, for example **Sell › Invoices**. Then:
- **Search** by number, customer or reference.
- **Filters**: **Status** chips, **Date range** (Today, Last 7 days, This month, Last 90 days, This financial year, Custom, …) and customer. Tap **Apply**, or **Reset**.
- The list footer shows the count and total of what you're looking at.
- 🖥 Desktop shows a sortable table with **Number, Customer, Date, Due, Status, Amount, Balance due**.

Filters are kept in the page address, so a filtered list can be bookmarked or shared with a colleague.

### 5.15 Start a sale from somewhere else

- From an item: **Sell this item** (see [09 — Items & stock](09-items-and-stock.md)).
- From a customer: open them in **People**, then start a new document.
- From **Receivables**, to chase what is already owed (see [07 — Payments](07-payments.md)).
