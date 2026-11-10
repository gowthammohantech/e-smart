# 07 — Payments, receivables & payables

A **payment** records money moving. Each payment has three parts:
- **Who:** the customer or supplier.
- **How much:** the amount.
- **Through which account:** cash, bank or wallet.

You then **apply** the payment to one or more open documents. Any part you don't apply is kept as an **advance** against that contact.

Everything about money sits in the **Money** section: 📱 **More › Money**, 🖥 **Money** in the sidebar. Its pages are grouped as **Cash flow** (Payments received, Advance receipt, Payments made, Receipts, Adjust advance, Transfer), **Dues** (Receivables, Payables) and **Spending** (Expenses), plus the books pages covered in [19](19-books.md), [22](22-banking-and-reconciliation.md), [23](23-fixed-assets.md) and [24](24-budgets-and-forecasts.md).

| | Received from customers | Paid to suppliers |
|---|---|---|
| List | **Money › Payments received** | **Money › Payments made** |
| Plan | All plans | Smart Pro and above |
| Settles | Invoices, debit notes, opening invoices | Purchase bills, supplier debit notes, opening bills |
| Who can record | Owner, Admin, Accountant, Sales | Owner, Admin, Accountant, Sales |
| Who can edit | Owner, Admin, Accountant | Owner, Admin, Accountant |
| Who can delete | Owner, Admin | Owner, Admin |
| Waits for approval? | Never | Over the business's payment rule, when made by an Accountant or Sales ([25](25-approvals.md)) |
| Number series | `PAY/…` | `PAY/…` |

The app is online only. **Record payment** is disabled while you have no connection, and nothing is saved until the server has checked it.

---

### 7.1 Receive a payment

**Goal:** Record money a customer paid you, and mark their invoices paid.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. Start the payment from any of these:
   - **Home › Receive payment**
   - **Record payment** on an issued invoice
   - **Record payment** on a customer, in **Receivables**, or in a row's menu on the 🖥 invoice list
   - **Money › Payments received › +**
2. **Select contact**, if it isn't filled in already.
3. Fill in **Payment details**:

   | Field | Notes |
   |---|---|
   | **Amount** | What arrived. Until you type one, it follows what you tick below. |
   | **Payment date** | |
   | **Currency** | The customer's currency unless you pick another. Only documents in the payment's currency are listed. |
   | **Payment method** | Cash, Bank transfer, UPI, Card, Cheque, Wallet or Other |
   | **Deposit into** | The account it went into. Only accounts that match the method are offered (table below). It starts on the account your invoices print as bank details. |
   | **Reference** | *UTR, cheque number…* |
   | **Notes** | *Internal note* |

4. Under **Apply to**, the customer's open documents are listed oldest first, with what each still owes and how late it is (*12d late*). Then either:
   - Tick a document and type an amount against it, or
   - Tap **Auto-allocate** to spread the amount oldest first, or **Settle all** to apply everything owed (the amount rises to match).
5. For TDS the customer kept back, a discount or a write-off, tap **Customer deducted TDS, or a discount or write-off** under a ticked document ([20](20-tds-rcm-itc.md#tds-customers-keep-back)).
6. Check the **Summary**: **Payment amount**, **Allocated**, and **Unallocated (advance)**.
7. Tap **Record payment**. You see *Payment recorded*, and the payment opens.

**What happens**
- Each document's status updates by itself: **Partly paid** if some is still due, **Paid** when nothing is.
- Any unallocated amount is *held as an advance against the contact*.
- The account's balance goes up.

**Which accounts each method can use**

| Method | Allowed accounts |
|---|---|
| Cash | Cash |
| Bank transfer, Cheque, Card | Bank |
| UPI | Bank or Wallet |
| Wallet | Wallet |
| Other | Cash, Bank or Wallet |

**Rules & gotchas**
- If no account fits the method, you see *No account matches this payment method*. Use **Add a bank or wallet account** (see [13 — Settings](13-settings.md)).
- With no contact picked, **Apply to** shows *Pick a contact first*. A contact with nothing open shows *Nothing outstanding*: the whole amount becomes an advance.
- You can't allocate more than the payment: *Over-allocated by …*. And *All of it is applied. Increase the amount first*.
- A document can't take more than it still owes. The server refuses it with what is outstanding.
- Only finalised documents can be paid. Drafts, and documents waiting for approval, don't appear.
- A second tap on **Record payment** does nothing while the first is being saved.

**Example:** Sunrise Retail pays ₹30,000 by UPI into **HDFC Current — 8842** against two invoices of ₹21,240 and ₹12,000.
- **Auto-allocate** settles the older invoice in full (₹21,240) and puts ₹8,760 against the newer one.
- The newer invoice becomes **Partly paid**, with ₹3,240 still due.

---

### 7.2 Take a part payment or an advance

- **Part payment:** allocate less than a document's balance. It becomes **Partly paid**.
- **Advance:** record a payment with nothing allocated, or one that is more than is owed. The form says *This payment will be held as an advance against the contact.* The detail screen shows **Held as an advance**: *Nothing was allocated, so the full amount sits against the contact.*
- **Advance for services:** **Money › Advance receipt** opens a payment with **Advance for services** on. GST is due when such an advance arrives; pick the **GST rate**, **Place of supply** and **SAC**. A customer's TDS on the advance goes in **TDS deducted by the customer**. Advances for goods carry no GST. See [20](20-tds-rcm-itc.md#gst-on-advances-for-services).

### 7.3 Pay a supplier

**Goal:** Record money you paid a supplier.
**Who / plan:** Owner, Admin, Accountant or Sales, on Smart Pro and above.

**Steps**
1. Start from **Pay supplier** on an issued purchase bill (or on the toast after recording one), **Pay supplier** in **Payables**, or **Money › Payments made › +**. The screen is titled **Pay supplier**.
2. Fill in the payment as in 7.1. The account field is **Pay from**, and each account shows its **Balance**.
3. Under **Apply to**, allocate against the supplier's open bills (each shows **Supplier no. …**). **Pay all** applies everything owed.
4. For TDS you kept back or a discount you got, tap **You deducted TDS, or got a discount** under a bill. When TDS is kept back, pick the **TDS section**: *The TDS kept back here is reported under this section in 26Q and TDS payable.*
5. Tap **Record payment**. You see *Payment made*.

**What happens:** The bills' statuses update, and the account's balance goes down.

**Rules & gotchas**
- You can't pay out more than the account holds (RULES 6.26):
  - *Cash in hand has only ₹…* / *… has only ₹…*
  - *More than the balance of ₹…*
- A bill that already kept back TDS under its section takes no more TDS on the payment.
- *Pick the TDS section to save* when TDS is entered without a section.
- Write-off is for customers only.
- If the business has a payment rule and you are an Accountant or Sales, a payment over the amount isn't recorded yet. You see *Sent for approval. It's recorded once an owner or admin approves.* and the app opens **Waiting for approval**. See [25 — Approvals](25-approvals.md).
- MSME suppliers must be paid within their limit; see [20](20-tds-rcm-itc.md#paying-micro-and-small-suppliers-on-time).

### 7.4 Use an advance against new documents

**Goal:** Use money the customer paid earlier (or money you paid a supplier in advance) against a new invoice or bill.

**Steps** (any one of these)
- **On the document:** an invoice or bill with a balance shows **Adjust advance (₹…)** when the contact holds an advance. It opens **Adjust advance** for that document.
- **On a new payment** for the same contact: **Advance available: ₹…** is shown. Tap **Adjust** to spread earlier advances over the open documents, oldest first, or **Use advance (₹…) on this** on one document. The adjustment applies straight away (*₹… adjusted from advances*); you don't need to save a payment for it.
- **On the advance payment:** open it and tap **Adjust**. You see *₹… adjusted from advances*, or *No advance could be adjusted* if nothing is open.
- **Money › Adjust advance:** *Apply what a party has paid in advance, or a credit note not raised against an invoice, to what they still owe.*
  1. Pick the **Party**. For a contact who is both customer and supplier, choose **As customer** or **As supplier**.
  2. **Advances and credit notes** lists what they hold; **Open invoices and notes** lists what they owe.
  3. Either tap **Apply all, oldest first**, or pick an advance, type amounts (**Apply to …**) and tap **Apply ₹…**. You see *₹… adjusted*.

**Rules & gotchas**
- An advance can only be used in the same currency it was paid in.
- A service advance's GST comes back on the invoice it is applied to. Applying it to an invoice with no service on it warns: *This invoice has no service on it: GST paid on a service advance should only come back on a service invoice.*
- *No unadjusted advance or credit note* or *Nothing is owed on an invoice or note* when there is nothing to do.

### 7.5 Refund an advance

**Goal:** Pay a customer back part or all of an advance they paid.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan (a refund is not a payment to a supplier, so it needs no Pro plan and never waits for approval).

**Steps**
1. Open the receipt that holds the advance. Under *₹… is unallocated and available as an advance.* tap **Refund**.
2. **Refund the advance**: *Out of PAY/…: ₹… still held*. Enter the **Amount to refund**, the date, and **Paid from**.
3. Tap **Refund**. You see *Advance refunded*, and the refund opens.

**What happens**
- The refund is a payment made, with *Refund of the advance on PAY/…*. It settles no documents.
- *The refund prints as the refund voucher (Rule 51). On an advance for services, the GST paid on what is refunded comes back in the month of the refund.*
- The receipt lists it under **Refunded out of this advance**.

**Rules & gotchas**
- *Only ₹… of the advance is left*: you can't refund more than is unused.
- *A refund can't be dated before the advance was received*.
- The account must hold the money.
- A receipt with refunds can't be deleted until the refunds are deleted, and its party and currency can't change.

### 7.6 Settle a foreign-currency invoice (FX gain or loss)

**Goal:** Record an overseas customer's payment when the exchange rate has moved.
**Who / plan:** Smart Pro and above.

**Steps**
1. Receive a payment from **Harbour Supplies FZE** in **AED**.
2. Enter the **Settlement rate (1 AED → INR)**: the rate the bank actually gave you.
3. Allocate the payment to the AED invoice.

**What happens:** *A rate different from the invoice rate produces an FX gain or loss.* The payment shows **FX gain on settlement** or **FX loss on settlement**. For a supplier, paying more rupees than the bill was booked at is a loss.

**Example:** An invoice for AED 10,000 at 23.85 counted as ₹2,38,500. It is paid at 24.10, which is worth ₹2,41,000. That is an **FX gain on settlement** of ₹2,500.

### 7.7 Open, edit or delete a payment

- Open a payment from **Payments received** or **Payments made**. You see:
  - **Received from** or **Paid to**
  - Date, method, **Deposited into** or **Paid from**, reference, exchange rate
  - **Applied to**: every document it settled, with any TDS, discount or write-off (**Settled without cash**)
  - Any FX gain or loss
  - Any amount still unallocated, with **Adjust** (and **Refund** on money received)
- **Share PDF** (📱) or **Download PDF** (🖥) gives the receipt for money in, or the payment voucher for money out.
- **Edit** (Owner, Admin, Accountant) changes the date, method, account, reference and notes. *The amount and what it settles stay as recorded. To change them, delete this payment and record it again.* You see *Payment updated*. An edit doesn't go back for approval.
- **Delete** (Owner, Admin) › **Delete this payment?** *Any invoice it was applied to will go back to being outstanding. This cannot be undone.* You see *Payment deleted*.
- The lists have search, a date range, and follow the branch picked in the top bar. 🖥 They show a table where you can tick rows and **Export CSV**.

---

### 7.8 Record other money in (Receipts)

**Money › Receipts** is for money in that isn't from an invoice: *interest, rent, a refund, capital brought in*. It works like an expense the other way round, and posts as a receipt voucher (`RV/…`).

1. **New receipt**: **Amount received**, **Received for** (an income or other account: *Interest, rent, a refund. Taxable income goes on an invoice.*), **Received into** (cash or bank), and optionally **Received from**, **Party**, reference, cost centre and a photo of the slip (**Attach the slip**).
2. **Save receipt**. You see *Receipt saved*.

You can edit or delete a receipt from its page. Money moved between your own cash and bank accounts is a **Transfer** ([19 — Books](19-books.md#vouchers)).

### 7.9 Chase what customers owe (Receivables)

**Goal:** See who owes you, how late each amount is, and send reminders.
**Who / plan:** Every role and plan.

**Steps**
1. **Money › Receivables**, or tap **Money owed to you** on Home.
2. The top shows **Total receivable**, **Overdue** and **Due soon**.
3. Pick a filter:
   - **All**
   - **Overdue**
   - **Due soon**: *Due in the next 7 days*
4. The **Aging** bar splits the outstanding amount into **Current**, **1–30**, **31–60**, **61–90** and **90+** days late. Tap a bucket to filter by it; **Clear** removes it.
5. Each contact shows what is open, with its oldest item (*oldest 42d late*). Tap a document to open it.
6. Act on a contact:
   - **Record payment**
   - **Remind**: choose **WhatsApp** or **Email**. A polite message listing the invoices and the total opens ready to send: *Hi …, a gentle reminder that invoices … totalling ₹… are still open…*. *The message is prepared for you — you send it yourself, so nothing leaves the app without your say-so.*

**What happens:** Outstanding is the invoice total less what has been paid or credited by returns and notes. It is never below zero.

**Rules & gotchas**
- The business also gets a notification once when an invoice falls overdue (for invoices that fell due in the past week).
- **Import outstanding** at the top brings in invoices that were unpaid when you started these books ([26](26-imports-and-opening-balances.md)).
- A statement for one customer is on their page ([08](08-contacts.md)).

### 7.10 See what you owe (Payables)

**Money › Payables** (Smart Pro and above) is the same screen for supplier bills, with **Total payable**. Use **Pay supplier** on a supplier to open a payment. There is no **Remind** on payables. **Import outstanding** brings in bills you owed before you started.

**Related:** [05 — Sales](05-sales.md) · [06 — Purchases](06-purchases.md) · [08 — Customers & suppliers](08-contacts.md) · [12 — Reports](12-reports.md) (the Receivables, Payables and Payments reports) · [20 — TDS, reverse charge, credit & adjustments](20-tds-rcm-itc.md) · [22 — Banking & reconciliation](22-banking-and-reconciliation.md) · [25 — Approvals](25-approvals.md)
