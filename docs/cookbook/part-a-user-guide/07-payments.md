# 07 — Payments, receivables & payables

A **payment** records money moving. Each payment has three parts:
- **Who:** the customer or supplier.
- **How much:** the amount.
- **Through which account:** cash, bank or wallet.

You then **apply** the payment to one or more open invoices or bills. Any part you don't apply is kept as an **advance** against that contact.

| | Received from customers | Paid to suppliers |
|---|---|---|
| Lists | **More › Payments received** | **More › Payments made** |
| Plan | All plans | Smart Pro and above |
| Who can record | Owner, Admin, Accountant, Sales | Owner, Admin, Accountant, Sales |
| Number series | `PAY/…` | `PAY/…` |

---

### 7.1 Receive a payment

**Goal:** Record money a customer paid you, and mark their invoices paid.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. Start the payment from any of these:
   - **Home › Receive payment**
   - **Record payment** on an issued invoice
   - **Record payment** on a customer, or in **Receivables**
2. **Select contact**, if it isn't filled in already.
3. Fill in the payment:

   | Field | Notes |
   |---|---|
   | **Amount** | What arrived |
   | **Payment date** | |
   | **Payment method** | Cash, Bank transfer, UPI, Card, Cheque, Wallet or Other |
   | **Deposit into** | The account it went into. Only accounts that match the method are offered (table below). |
   | **Reference** | *UTR, cheque number…* |
   | **Notes** | Internal only |

4. Under **Apply to**, the customer's open documents are listed with how late each one is (*12d late*). Then either:
   - Type an amount against each document, or
   - Tap **Auto-allocate** (oldest first), or **Pay all**.
5. Check the **Summary**: **Payment amount**, **Allocated**, and **Unallocated (advance)**.
6. Save. You see *Payment recorded*.

**What happens**
- Each invoice's status updates by itself: **Partly paid** if some is still due, **Paid** when nothing is.
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
- You can't allocate more than the payment (*Over-allocated by …*).
- *The whole amount is already applied — increase the amount first.*
- Payments need an **issued** invoice. Drafts can't be paid.

**Example:** Sunrise Retail pays ₹30,000 by UPI into **HDFC Current — 8842** against two invoices of ₹21,240 and ₹12,000.
- **Auto-allocate** settles the older invoice in full (₹21,240) and puts ₹8,760 against the newer one.
- The newer invoice becomes **Partly paid**, with ₹3,240 still due.

---

### 7.2 Take a part payment or an advance

- **Part payment:** allocate less than an invoice's balance. The invoice becomes **Partly paid**.
- **Advance:** record a payment with nothing allocated, or one that is more than is owed. The detail screen shows **Held as an advance**: *Nothing was allocated, so the full amount sits against the contact.*

### 7.3 Pay a supplier

**Goal:** Record money you paid a supplier.
**Who / plan:** Owner, Admin, Accountant or Sales, on Smart Pro and above.

**Steps**
1. Start from **Pay supplier** on an issued purchase bill, from **Pay** in **Payables**, or from **More › Payments made**.
2. Fill in the payment as in 7.1. The account field is **Pay from**.
3. Under **Apply to**, allocate against the supplier's open bills.
4. Tap **Make payment**. You see *Payment made*.

**Rules & gotchas:** You can't pay out more than the account holds:
- *Cash in hand has only ₹…*
- *More than the balance of ₹…*

### 7.4 Use an advance against new invoices

**Goal:** Use money the customer paid earlier against a new invoice.

**Steps**
1. Open a new payment for the same contact. **Advance available: ₹…** is shown.
2. Either tap **Adjust** to spread the earlier advances over the open documents (oldest first), or tap **Use advance (₹…) on this** on one document.
3. The adjustment applies straight away: you see *₹… adjusted from advances*, and you don't need to save a payment for it. If new money also came in, record it in the same form as usual.

You can also open an existing advance payment and tap **Adjust**. You see *₹… adjusted from advances*, or *No advance could be adjusted* if nothing is open.

**Rules & gotchas:** An advance can only be used in the same currency it was paid in.

### 7.5 Settle a foreign-currency invoice (FX gain or loss)

**Goal:** Record an overseas customer's payment when the exchange rate has moved.
**Who / plan:** Smart Pro and above.

**Steps**
1. Receive a payment from **Harbour Supplies FZE** in **AED**.
2. Enter the **Settlement rate**: the rate the bank actually gave you.
3. Allocate the payment to the AED invoice.

**What happens:** *A rate different from the invoice rate produces an FX gain or loss.*

**Example:** An invoice for AED 10,000 at 23.85 counted as ₹2,38,500. It is paid at 24.10, which is worth ₹2,41,000. That is an **FX gain on settlement** of ₹2,500.

### 7.6 Open or delete a payment

- Open a payment from **Payments received** or **Payments made** to see:
  - **Received from** or **Paid to**
  - **Deposited into**
  - **Applied to**: every document it settled
  - Any FX gain or loss
  - Any amount still unallocated
- **Delete payment** › **Delete this payment?** *Any invoice it was applied to will go back to being outstanding.* Only Owner or Admin can delete a payment. Accountants can edit payments.

---

### 7.7 Chase what customers owe (Receivables)

**Goal:** See who owes you, how late each amount is, and send reminders.
**Who / plan:** Every role and plan.

**Steps**
1. **More › Receivables**, or tap **Money owed to you** on Home.
2. Pick a filter:
   - **All**
   - **Overdue**
   - **Due soon**: *Due in the next 7 days*
3. The **Aging** bar splits the outstanding amount into **Current**, **1–30**, **31–60**, **61–90** and **90+** days late. Tap a bucket to filter by it; **Clear bucket filter** removes it.
4. Each contact shows what is open, with its oldest item (*oldest 42d late*).
5. Act on a contact:
   - **Record payment**
   - **Remind**: choose **WhatsApp** or **Email**. A polite message listing the invoices and the total opens ready to send. *The message is prepared for you — you send it yourself, so nothing leaves the app without your say-so.*

**What happens:** Outstanding is the invoice total less what has been paid or credited by returns. It is never below zero.

### 7.8 See what you owe (Payables)

**More › Payables** (Smart Pro and above) is the same screen for supplier bills. Use **Pay** on a supplier to open a payment.

**Related:** [05 — Sales](05-sales.md) · [06 — Purchases](06-purchases.md) · [12 — Reports](12-reports.md) (the Receivables, Payables and Payments reports)
