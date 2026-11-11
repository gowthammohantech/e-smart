# 05 — Sales

The **Sales** tab is your sales hub (*Quotes, orders, invoices and returns*). At the top it shows four tiles for the period and branch picked in the top bar:
- **Invoiced** (with the number of invoices)
- **Collected**
- **Outstanding** (*N open invoices*)
- **Overdue**

Tap a tile to open the list behind it. Below are the **Sales trend** and **Top customers** charts (each can be exported as CSV), the **Sales documents** tiles with a count on each, and **Recent invoices**. The **+ Invoice** button starts a new invoice.

Every plan includes every sales document. A sale can go through as many steps as you need:

```
Quotation ──► Proforma invoice ──► Sales order ──► Delivery note ──► Invoice ──► Sales return
     │                │                  └──────────────────────────────►│          Credit note
     └────────────────┴─────────────────────────────────────────────────►┘          Debit note
```

You can start at any step. Most shops raise an **Invoice** directly. A wholesaler may go quote → order → delivery → invoice. Each step can be *converted* into the next one, which copies the lines forward.

| Document | Number | Statuses | Moves stock? |
|---|---|---|---|
| **Quotation** | `QT/…` | Draft → Sent → Accepted / Rejected / Expired (an expired quote can be sent again) | No |
| **Proforma invoice** | `PI/…` | Draft → Sent → Accepted / Rejected / Expired; a sent or accepted proforma can still be cancelled | No |
| **Sales order** | `SO/…` | Draft → Confirmed → Fulfilled | No |
| **Delivery note** | `DN/…` | Draft → Delivered | **Yes**: stock goes out |
| **Invoice** | `INV/…` | Draft → Issued → Partly paid / Overdue → Paid | **Yes**, unless it came from a delivery note that already moved the stock |
| **Sales return** | `CRN/…` | Requested → Approved → Processed | Yes: stock comes back in |
| **Credit note** | `CN/…` | Draft → Issued | No |
| **Debit note** | `DBN/…` | Draft → Issued → Partly paid / Overdue → Paid | No |

A quotation or proforma never counts as a sale and never reaches your books. Draft and cancelled documents never count in reports, aging or stock.

The app is online only. Saving, finalising, sharing and every other action needs a connection. With no connection the header shows **No internet connection** and the save buttons are greyed out.

---

## Creating documents

### 5.1 Raise an invoice

**Goal:** Bill a customer.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan. **Free** allows 20 invoices a month.

**Before you start:** Have the customer and items in the app, or add them as you go.

**Steps** (📱 the phone uses a 4-step wizard: **Who → What → Tax & terms → Review**. 🖥 Desktop shows **Who**, **What** and **Tax & terms** on one page, with the review summary and totals kept in view on the right.)

1. **Sales › Invoices › New invoice**, or **+ Invoice** on the Sales tab, or **Home › New invoice**.
2. **Who:** tap **Select customer**.
   - Search your contacts, or tap **Add new customer**. The customer you save becomes the invoice's customer.
   - The card shows the customer's terms badge (*30d terms*), and their currency if it isn't yours.
3. Check the header fields:

   | Field | Notes |
   |---|---|
   | **Invoice date** | Today by default. Moving it moves the due date with it. |
   | **Due date** | Date + the customer's payment terms (*Sunrise Retail is on 30-day terms.*); 30 days if none are set. It can't be before the invoice date. |
   | **Reference** | Optional: *PO number, job name…* |
   | **Branch** | Only shown when you have more than one branch |
   | **Place of supply** | Defaults to the customer's billing state. *Decides whether IGST or CGST + SGST applies.* |
   | **Currency** | Smart Pro and above; see 5.9 |

4. **What:** tap **Add item**.
   - Choose from the catalogue. You can tick several items, then tap **Add 3 items**.
   - Or tap **One-off line**, or **New item** to create an item and come back with it on the invoice.
   - The picker shows the stock at this branch on the invoice date: *12 Nos in stock*, *Low stock · 3 Nos left* or *Out of stock*. An out-of-stock item can't be picked unless negative stock is allowed.
   - **Rates are**: **Before tax** or **Tax included** sets every line at once. If the lines disagree you see *Some lines include tax and some don’t. Pick one to set them all.*
5. Edit a line:
   - 📱 Change the quantity with the − / + buttons on the line, or tap the line to open it.
   - 🖥 Type straight into the line grid. *Enter moves down a column; on the last line it adds an item.* **More details** opens the full line.
   - In the full line: **Quantity**, **Unit**, **Rate**, **Rate includes tax**, **Discount** (% or amount), **Tax rate**, **HSN code** / **SAC code** (*Taken from the item master*) and **Description**. Then tap **Save line**. **Remove** asks *Remove this line?* first.
6. **Tax & terms:**
   - **Reverse charge**, for a supply where *The buyer pays this GST to the government*.
   - **TDS the customer will deduct** and **TCS (income tax)**: see 5.17.
   - **Cost centre** and **Vehicle**, when your business uses them, and your own custom fields.
   - **Paid into** shows the bank details printed on the invoice, with **Change in settings** (or **Add bank details**). With a UPI ID on an INR invoice: *UPI QR for the total prints on the invoice*. See [27 — Invoice design](27-invoice-design.md#277-bank-details-and-the-upi-qr).
   - **Discount on total**, as % or an amount.
   - **Other charges**: freight, packing or installation. See 5.18 for how they are taxed.
   - **Round off the total**: **Auto**, or **Manual** with a **Round-off amount**. A negative amount rounds down, for example −0.40.
   - **Notes** (*Visible to the customer on the document*) and **Terms and conditions**, prefilled with *Goods once sold will not be taken back. Interest @18% p.a. on overdue amounts.*
   - If the customer has billable expenses not yet recovered, a card offers *N billable expenses to recover* with **Add** (see [20 — TDS, reverse charge, credit & adjustments](20-tds-rcm-itc.md)).
7. **Review:** check the number the invoice will get, the tax badge (**CGST + SGST**, **IGST**, **Zero-rated** or **No tax**), and the totals:
   - Subtotal → line discounts → **Taxable value** → tax → discount on total → other charges → TCS → round off → **Total**.
   - If the invoice takes the customer past their credit limit, a warning shows here already.
8. Tap **Save draft** to finish later, **Issue invoice** to issue it, or **Save & send** to issue it and email it straight away (5.11).
   - **Finalise this invoice?** asks you to confirm: *A permanent number will be assigned and the invoice can no longer be edited freely.*
   - 📱 **Save draft** is also in the header on every step before Review.
   - 🖥 **Ctrl/⌘+S** saves the draft and **Ctrl/⌘+Enter** opens the issue confirmation.
   - Leaving with unsaved changes asks you first.

**What happens on Issue invoice**
- The invoice gets its permanent number, for example `INV/2026-27/0042`. It is never reused, even if you cancel the invoice.
- The toast *Invoice finalised* offers **Edit this invoice** (see 5.16).
- The status becomes **Issued**, and the amount shows in **Receivables**.
- Stock-tracked items leave the branch's stock.
- If your business has approval limits and this invoice is over one, it waits for an owner or admin instead of issuing (see [25 — Approvals](25-approvals.md)).
- If the e-invoice and e-way bill rules apply, the invoice offers **Generate e-invoice** and an e-way bill action (see [11 — GST compliance](11-gst-compliance.md)).

**Rules & gotchas: what stops issuing**

| Message | Fix |
|---|---|
| *Enter a name for this line* | Every line needs a name |
| *Rate and amount must be more than 0. Fix: …* / *The total must be more than 0.* | No zero lines or zero totals |
| *HSN/SAC is required on every line of a GST invoice. Missing on: …* | Add HSN/SAC to the item, or to the line |
| *Not enough stock on {date}: …* | Add stock, change the branch, or turn on **Allow negative stock** in the business profile |
| *Can't be before {date}, the opening stock date of {item}* | Date the invoice on or after the item's opening stock date |
| *Can't be before the document date, {date}* | The due date is before the invoice date |
| **Credit limit exceeded**: *… has a credit limit of … With this invoice they would owe …* | A warning only. Tap **Continue anyway** |
| *Round-off must be less than ₹1.00 either way.* | Manual round-off is limited to less than one unit |
| *Not saved: can't reach the server. Try again when online.* | You lost the connection; nothing was saved and no number was used |

- Drafts aren't numbered and can be edited freely. The list and title show them as **Draft**.
- The save button stays busy until the saved invoice opens, so a double tap never makes two invoices.

**Related:** [07 — Payments](07-payments.md) · [11 — GST compliance](11-gst-compliance.md) · [27 — Invoice design](27-invoice-design.md)

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
- **Other country (export)**: *Export or SEZ supply — IGST applies. Add an LUT in the business profile to zero-rate it.* With a valid LUT on file: *Export or SEZ supply under LUT — zero-rated, no IGST charged.*
- **SEZ customer**: treated like an export.
- **Unregistered business (yours)**: no tax is added. Prices with **Rate includes tax** still have their tax taken out.

---

### 5.3 Create a quotation

**Goal:** Send a price offer that the customer can accept.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. **Sales › Quotations › New quotation**, or **Home › New quote**.
2. Fill it in as for an invoice (5.1). Quotations have **Valid until** (default: 15 days) instead of a due date.
3. **Save draft**, or **Mark as sent**. This numbers the quotation (`QT/2026-27/…`) and sets it to **Sent**. **Save & send** does the same and emails it.

**What happens**
- Sending a draft quotation by email from the app also numbers it and marks it **Sent**.
- When the customer replies, use **Change status** to mark it **Accepted**, **Rejected** or **Expired**. An expired quotation can be marked **Sent** again.
- Then convert it (5.6). The main button on a sent quotation is **Convert to invoice**.

**Rules & gotchas**
- Quotations never move stock and never count as sales.
- A draft quotation can be withdrawn with **Cancel quotation**. Once it is sent it can't be cancelled; mark it **Rejected** or **Expired** instead.
- *Quotes awaiting reply* appear on Home under **Needs your attention**.

### 5.4 Create a proforma invoice

**Goal:** Give the customer a priced document to pay an advance against, before the real invoice.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. **Sales › Proforma invoices › New**, or on a quotation **Actions › Make a proforma invoice**.
2. Fill it in like a quotation, with **Valid until**.
3. **Mark as sent** numbers it (`PI/2026-27/…`).
4. Record any advance the customer pays as a payment against the customer (see [07 — Payments](07-payments.md)).
5. When you deliver or bill, use **Convert to sales order** or **Convert to invoice**.

**Rules & gotchas**
- A proforma is not a tax invoice. It is never in your books, GST returns or stock.
- Unlike a quotation, a sent or accepted proforma can still be cancelled.

### 5.5 Create a sales order

**Goal:** Confirm what the customer has ordered before you deliver.

**Steps**
1. **Sales › Sales orders › New sales order**, or convert a quotation or proforma.
2. **Confirm order**. The order is numbered and goes straight to **Confirmed**.
3. When everything has gone out, use **Change status** to mark it **Fulfilled**.

### 5.6 Create a delivery note

**Goal:** Send goods (with an e-way bill if needed) before you invoice.

**Steps**
1. **Sales › Delivery notes › New delivery note**, or **Create delivery note** from a sales order.
2. **Mark delivered**. The note is numbered and goes straight to **Delivered**.

**What happens**
- The stock leaves when the delivery note is marked delivered.
- An invoice made from it later doesn't take the stock out a second time.
- A delivery note of goods worth more than ₹50,000 can carry an e-way bill (see [11 — GST compliance](11-gst-compliance.md)).
- **Save & send** isn't offered on a delivery note.

---

## Working with a document

Open any document from its list.
- 📱 The screen shows the header, what is outstanding, the lines, totals, payments, compliance and notes. The bar at the foot has **Actions** and the main action.
- 🖥 The page has **Details** and **Preview** tabs. **Edit**, **Actions** and the main action sit in the page header.

The main action is **Issue invoice** (or the kind's own finalise word) on a draft, **Convert to invoice** on a sent quotation, order or delivery note, and **Save as PDF** (🖥) / **Share PDF** (📱) otherwise. A document made from another one shows *Against Quotation QT/2026-27/0004*; tap it to open the source.

### 5.7 Convert to the next step

| From | Actions |
|---|---|
| Quotation | **Make a proforma invoice**, **Convert to sales order**, **Convert to invoice** |
| Proforma invoice | **Convert to sales order**, **Convert to invoice** |
| Sales order | **Create delivery note**, **Convert to invoice** |
| Delivery note | **Convert to invoice** |
| Invoice | **Create a return**, **Raise a credit note**, **Raise a debit note** |

**What happens:** A new **draft** is created with the lines copied (*Created a draft invoice*, *From QT/2026-27/0004*). Edit it and finalise as usual. From an invoice with more than one line, a return or note first asks **Which lines?** (5.13).

**Rules & gotchas**
- Nothing is converted from a draft or a cancelled document.
- A quotation, proforma, order or delivery note is carried forward **once**. After an order, delivery or invoice is made from it, it isn't offered again, so the same goods aren't delivered or billed twice. Cancel the onward document to convert again.
- Returns and notes are the exception: several can be raised against one invoice.
- The new document can't be dated before the one it came from (*Can't be before {date}, the date of Quotation QT/…*).

### 5.8 Duplicate a document

**Actions › Duplicate** makes a fresh draft with the same customer and lines, and opens it. Use it for repeat orders, or to start again from an issued document that can't be edited.

### 5.9 Edit or delete a draft

- **Edit** works on any draft.
- **Delete draft** asks *Delete this draft?* (*Drafts are not numbered, so nothing is left behind.*) and then shows *Draft deleted*.
- An issued quotation, order, delivery note, return or note can't be edited. Tapping **Edit** says *An issued quotation can't be changed. Duplicate it to start again, or cancel it.* Issued invoices are different: see 5.16.
- 🖥 In a list, tick several rows to **Export CSV**, **Mark sent** (quotations and proformas) or **Delete drafts** in one go. Rows that aren't drafts are left alone.

### 5.10 Invoice in a foreign currency

**Goal:** Bill an overseas customer in their currency.
**Who / plan:** Smart Pro or Smart Business. Multi-currency is a Pro feature; on Free and Basic the **Currency** field isn't shown.

**Example:** **Harbour Supplies FZE** (Dubai, AED).
1. Start a **New invoice** and pick **Harbour Supplies FZE**. The prices of the items are converted into AED.
2. **Place of supply** shows **Other country (export)**, because the contact is overseas.
3. **Currency** shows *AED · 1 AED = 23.8500 INR*. The **Exchange rate** comes from **Settings › Currencies & rates** for the invoice date, and you can change it on this invoice. *The rate is stored on the document so it stays reproducible.*
4. The totals show *≈ ₹… at 1 AED = 23.85 INR*. The issued invoice carries the badge *AED @ 23.85*.

**What happens**
- Reports convert this invoice at its own saved rate.
- When the customer pays at a different rate, the difference is recorded as an **FX gain** or **FX loss** (see [07 — Payments](07-payments.md)).
- The UPI QR prints only on INR invoices.

### 5.11 Share, print and send

From a finalised document's **Actions** (or the main button for the PDF):

| Action | What happens |
|---|---|
| **Share PDF** (📱) / **Save as PDF** (🖥) | The server makes the PDF in the document's template, in English or Tamil to match your app language. It includes the IRN, signed QR, e-way bill number and UPI QR when present. 📱 It opens the share sheet; 🖥 it downloads (*PDF downloaded*). |
| **Preview document** | Opens the print preview, where you can pick the **Template** and the **Copy**, then **Print** or save the PDF. See [27 — Invoice design](27-invoice-design.md). |
| **Send by email** | If the customer has an email address, the server emails them a designed message with the business logo, the amount, and buttons to view the document and download the PDF: *On its way to the customer*. Without an email address on file, your own mail app opens with the message filled in. |
| **Send on WhatsApp** | Your own WhatsApp opens (📱 the app, 🖥 WhatsApp Web) with *Invoice INV/… — ₹…* and a link to the document, addressed to the customer's phone number. You press send. |
| **Copy link** (🖥) / **Share link** (📱) | A link to the PDF, valid for 7 days (*Link copied*). |

**What the customer sees:** the link in an email or WhatsApp message opens the document as printed, with **Download PDF**. The link works for 30 days and stops working at once if the document is cancelled. An expired or withdrawn link shows *This link isn’t available*.

**Rules & gotchas**
- **Save & send** in the editor issues the document and then emails it, the same way **Send by email** does.
- Emailing a draft quotation or proforma numbers it and marks it **Sent**.
- A second tap on **Send** while one is on its way does nothing, and the server won't email the same person the same document twice within 2 minutes.
- If the email can't be delivered you see *The email could not be sent: …* instead of a false "sent".

**Not available yet**
- **WhatsApp Business** sending from the server. WhatsApp always opens your own WhatsApp.
- **Payment links and Razorpay.** The Razorpay integration is *coming soon*. Until it is, there is no **Payment link** action, and emails, reminders, mail drafts and the shared page carry no **Pay now** link. Record the payment yourself when it arrives (5.12).

### 5.12 Record a payment against an invoice

On an issued invoice with a balance, tap **Record payment** in the outstanding card. The payment form opens with the customer and invoice already filled in (see [07 — Payments](07-payments.md)).
- If the customer holds an advance, **Adjust advance (₹…)** applies it instead.
- On a draft: *Issue it first to record a payment.*
- On a paid invoice: *Nothing is due on this document.*

### 5.13 Change status or cancel

**Change status**
- **Actions › Change status** lists only the statuses allowed from where the document is now (*Currently sent*). 🖥 it drops down from **Actions**.
- If the document is already in its final status, you see *Nothing left to do*.
- **Paid**, **Partly paid** and **Overdue** follow from payments and due dates. Record a payment instead of marking an invoice paid by hand.

**Cancel**
1. **Actions › Cancel invoice** (the kind's own name).
2. Confirm **Cancel INV/…?** with **Cancel document**.

*The number stays reserved and the document is kept for your audit trail, but it no longer counts towards your books.*

You can't cancel while an e-invoice or e-way bill is still live:
- *Cancel e-way bill … before cancelling this document*
- *Cancel the e-invoice (IRN) before cancelling this document*

Cancel those first (see [11 — GST compliance](11-gst-compliance.md)).

More rules:
- An invoice with a payment allocated can't be cancelled: *Remove the payments allocated to this document before cancelling it*. Delete the payment first.
- An invoice with a return or note standing against it can't be cancelled until that is cancelled.
- Only these can be cancelled: a draft; a sent or accepted proforma; a confirmed sales order; an issued or overdue invoice; a requested or approved return; an issued credit or debit note. A sent quotation, a delivered delivery note, a fulfilled order, a processed return, or anything with money paid against it can't be, and the app doesn't offer **Cancel** on them.
- Cancelling puts back the stock the document moved, and withdraws its links.
- Any role except Viewer can cancel.

---

### 5.14 Sales returns

**Goal:** Take goods back from a customer, and reduce what they owe on the invoice.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. Start the return in one of two ways:
   - **Sales › Sales returns › New sales return**: *Pick the invoice being returned.* Search by number or party.
   - On the invoice: **Actions › Create a return**.
2. If the invoice has several lines, **Which lines?** asks which ones are coming back (*Untick the lines this doesn't cover*). Tap **Create return**: *Return draft created*.
3. Lower the quantities to what is actually coming back. The most you can return on a line is the quantity invoiced: *Up to 10 can be returned*.
4. **Save draft**. An unfinalised return shows as **Requested**.
5. **Approve return**. The return is numbered (`CRN/2026-27/…`) and becomes **Approved**.
6. When it is settled, use **Change status** to mark it **Processed**.

**What happens**
- Stock-tracked goods come back into stock.
- The return's total is credited against the invoice, so the invoice's balance goes down. It can become **Paid** with no money changing hands.
- A return against an invoice that collected TCS gives the TCS back at that invoice's rate.
- It appears in GSTR-1 under credit notes.

**Rules & gotchas**
- Under GST, a credit note must be issued by **30 November** after the end of the invoice's financial year. A later return shows the badge **Past the GST credit note deadline**.
- A sales return is the document to use when an e-invoice can no longer be cancelled (after 24 hours).

### 5.15 Credit notes and debit notes

**Goal:** Lower (credit note) or raise (debit note) what a customer was charged, without goods coming back.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. On the invoice: **Actions › Raise a credit note** or **Raise a debit note**. Or **Sales › Credit notes › New credit note** (or **Debit notes**) and pick the invoice. A note can also be raised **Without an invoice**, *for a discount over a period or a rate change that isn't against one invoice*.
2. The invoice's lines are copied in. Change them to the amount being credited or charged.
3. Pick the **Reason**: **Discount after the sale**, **Price change**, **Tax charged wrongly**, **Short or faulty supply** or **Other**. It prints on the note.
4. **Issue credit note** / **Issue debit note**.

**What happens:** a credit note lowers what the invoice still owes; a debit note is a new amount the customer owes and is paid like an invoice. The GST treatment, direct notes "with GST" or "no GST", and applying a direct credit note to invoices are covered in [20 — TDS, reverse charge, credit & adjustments](20-tds-rcm-itc.md).

### 5.16 Edit an issued invoice

**Goal:** Put right a mistake on the invoice you just issued, keeping its number.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. Open the invoice and tap **Edit** (or **Edit this invoice** on the toast after issuing).
2. Change anything: customer, date, lines, charges, TCS, expected TDS.
3. Tap **Save changes**: *Invoice updated*.

**What happens:** the invoice is worked out again under the same number and branch. Its stock is taken back and posted again, the books are updated, and the audit trail keeps the invoice before and after (RULES 6.23).

**Rules & gotchas:** this works only while the invoice is the latest issued in its series and nothing stands on it. Otherwise **Edit** is greyed and tells you why:

| Message | What to do |
|---|---|
| *Can't edit: a payment is allocated to it* | Delete the payment first, or raise a note |
| *Can't edit: a credit note is adjusted against it* | Undo the adjustment under **Credit notes adjusted** |
| *Can't edit: a return or note stands against it* | Cancel the return or note |
| *Can't edit: it has an IRN (e-invoice)* / *Can't edit: it has an e-way bill* | Cancel those first |
| *Can't edit: its GSTR-1 month is filed* | Raise a credit or debit note |
| *Can't edit: the books are closed for its date* | Ask the owner to reopen the period |
| *Can't edit: its stock has moved since (FIFO)* | Raise a note |

- When a later invoice has been issued, **Edit** isn't offered at all. Raise a credit or debit note, or cancel and reissue.
- The date can't move before the invoice issued before it, out of its numbering period, or into the future.
- If the edit takes the customer past their credit limit you see the same **Credit limit exceeded** warning.
- Only invoices can be edited after issue.

### 5.17 TCS and the TDS a customer deducts

**Goal:** Collect TCS on a sale that needs it, or show the TDS your customer will keep back.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**TCS (income tax)** (RULES 6.13)
1. On the invoice's **Tax & terms**, tap **TCS (income tax)** and pick the section, or **No TCS**. A customer set up with a TCS section brings it in by default.
   - *For sales of scrap, minerals, timber and similar goods, or vehicles and luxury goods over ₹10 lakh.*
2. The hint shows *Collects ₹… from the buyer*, and the totals add **TCS collected**.

TCS is worked on the price with GST and rounded to the rupee. A buyer with neither PAN nor GSTIN is charged the higher rate. It is added to what the buyer owes but is not part of the GST taxable value.

**TDS the customer will deduct** (RULES 4.14)
1. Pick the section under **TDS the customer will deduct**. Optionally type a **TDS rate (%)**; leave it empty for the section's rate.
2. The hint shows *The customer is expected to deduct ₹… and pay ₹…*, and the totals show **Net receivable**.

*The invoice total stays the same.* When the customer pays, record the TDS on the payment (see [07 — Payments](07-payments.md)).

**Related:** [20 — TDS, reverse charge, credit & adjustments](20-tds-rcm-itc.md) · [12 — Reports](12-reports.md)

### 5.18 Other charges (freight, packing)

**Goal:** Bill freight, packing or installation on top of the goods.

**Steps:** type the amount in **Other charges** on **Tax & terms**. A negative amount is allowed, for a deduction.

**What happens** (RULES 1.10)
- **Invoices dated before 1 Dec 2026:** *Freight, packing or installation added to the total.* The charge comes after tax, untaxed.
- **Invoices dated 1 Dec 2026 or later:** *Freight, packing or installation. Spread over the items and taxed at their GST rates.* The charge is shared over the lines in proportion to their taxable value and taxed with each line. The totals show **Freight and other charges (taxable)**, and the charges count in the taxable value, GSTR-1, GSTR-3B and the e-invoice.

### 5.19 Repeat an invoice

**Goal:** Bill the same customer the same amount every week, month, quarter or year.
**Who / plan:** Owner, Admin or Accountant, on any plan.

**Steps**
1. Open an issued invoice. **Actions › Repeat…**.
2. **Repeat this invoice**: pick **Weekly**, **Monthly**, **Quarterly** or **Yearly** (or **Off** to stop).
3. Optionally set **Last date (optional)**, and turn on **Email each copy** (*Sends it to the customer as soon as it is issued*).
4. Tap **Save**: *Repeats; next copy on {date}*. The action now reads **Repeat… · Monthly**.

**What happens:** on each date the server issues a copy with the same customer, lines and prices and its own number, at that day's tax and exchange rates, due as many days after its date as the original. *It is e-invoiced like any other.* Lines that recovered a billable expense are left out of the copies.

**Rules & gotchas**
- A cancelled invoice, a draft, or a copy can't repeat (*change the series on the original*).
- The last date must be after the invoice date.
- If a copy can't be issued (a closed period, the credit limit), the series waits and tries again the next day, and you get a notification.

### 5.20 Opening invoices

Invoices your customers still owed when you started using the app are imported as **Opening invoices** (RULES 6.12). Each keeps its original number, date and due date, for the amount still owing. It is paid, aged and allocated like any invoice, but it is never in sales, GST or stock, and it can't be edited, converted or deleted. Cancel it if it was entered wrongly. Opening an opening invoice shows its preview. See [26 — Imports & opening balances](26-imports-and-opening-balances.md).

---

## Finding documents

### 5.21 Search and filter a list

**Steps:** Open any list, for example **Sales › Invoices**. Then:
- **Search** by number, reference or contact.
- **Filters**: **Status** chips, **Date range** (Today, Last 7 days, This month, Last 90 days, This financial year, Custom, …), **Branch** and customer. Tap **Apply**, or **Reset**.
- The list follows the branch picked in the top bar (*Branch: Mumbai — Head office*; clear it to see all branches).
- 📱 Each issued invoice row shows what it still owes (*₹2,124.00 due 12 Dec*).
- The list footer shows the count and total of what you're looking at. **Load more** fetches the next page.
- 🖥 Desktop shows a sortable table with **Number, Customer, Date, Due, Status, Amount, Balance due**.

Filters are kept in the page address, so a filtered list can be bookmarked or shared with a colleague.

### 5.22 Start a sale from somewhere else

- From an item: **Sell this item** (see [09 — Items & stock](09-items-and-stock.md)).
- From a customer: open them in **People**, then start a new document. The customer is filled in.
- From **Receivables**, to chase what is already owed (see [07 — Payments](07-payments.md)).

There is no separate counter or POS sale screen; a counter sale is an ordinary invoice.

**Related:** [25 — Approvals](25-approvals.md) · [27 — Invoice design](27-invoice-design.md) · [20 — TDS, reverse charge, credit & adjustments](20-tds-rcm-itc.md)
