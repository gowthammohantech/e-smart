# 25 — Approvals

Approvals let an owner decide that large documents and payments need an owner or admin to say yes before they count. An Accountant or Sales user can still prepare them; they wait in **Waiting for approval** until someone approves them or sends them back.

| | Documents | Payments made |
|---|---|---|
| What waits | Issuing (finalising) a document of a kind with a rule, over its amount | Recording a payment to a supplier over the payment rule's amount |
| While it waits | It stays a draft: no number, not in the books, GST, stock or aging | Nothing is recorded: no payment, no change to the bills or the account |
| Approve | Issues it, as the approver | Records the payment, as the approver |
| Send back / Turn down | Back to the creator as a draft, with the reason | Nothing is recorded; the requester is told why |
| Rule | Internal control | RULES 6.14 |

**Who decides:** Owners and Admins. They never wait on themselves: anything they issue or pay goes through at once.
**Who sets the rules:** the Owner only.
**Plan:** every plan. Payment rules matter only on Smart Pro and above, where payments made are available.

---

### 25.1 Choose what needs approval

**Goal:** Hold documents and payments over an amount for an owner or admin.
**Who / plan:** Owner, any plan.

**Steps**
1. 📱 **More › Approvals** (under **Account**). 🖥 **Settings › Approvals**.
2. *Choose which documents wait for an owner or admin before they are issued, and over what amount. Owners and admins never wait on themselves.*
3. Turn on a kind and enter the amount in **Over**. *0 holds every one.* The kinds are:
   - Invoices, Credit notes, Purchase orders, Purchase bills, Supplier debit notes, Sales orders, Quotations, Proforma invoices
   - **Payments made**
4. Tap **Save**. You see *Approval rules saved*.

**Rules & gotchas**
- Others see *Only an owner can set what needs approval.* and can't change the switches. The server refuses a change from anyone else.
- The amount is the document's grand total (or the payment's amount) in your base currency. A document is held only when it is **over** the amount.
- Turning a rule off doesn't release what is already waiting. Approve or send those back.

### 25.2 Send a document for approval

**Goal:** Issue a document that is over its rule's amount.
**Who / plan:** Accountant or Sales.

**Steps**
1. Prepare the document as usual and tap its Finalise button (**Issue invoice**, **Record bill**, **Confirm order**…).
2. The document stays a draft and goes to the approvers. Its page shows **Waiting for approval**: *Sent for approval on …. An owner or admin approves it, which issues it, or sends it back.*

**What happens**
- The owners and admins get a notification: *A document is waiting for your approval*.
- It has no number yet, and it is not in the books, GST, stock, receivables or payables. It can't be paid, converted or sent as an issued document.
- You can still change the draft while it waits. The approver issues it as it is when they approve.

### 25.3 Approve or send back a document

**Goal:** Decide on a document that is waiting.
**Who / plan:** Owner or Admin.

**Steps**
1. Open **Sell › Waiting for approval** (🖥 **Sales › Waiting for approval**), or tap the notification. Documents are listed oldest request first, with kind, amount, number and party.
2. Either:
   - Tap **Approve**. The document is issued, numbered and posted. You see *Approved and issued*.
   - Tap **Send back**, write *Why is it going back?*, then **Send back**. You see *Sent back to its creator*.
3. You can also decide from the document's own page, on the **Waiting for approval** card.

**What happens after sending back:** the document shows **Sent back**: *An owner or admin sent this back: …. Change it and issue it again.* Issuing it again sends it for approval again.

**Rules & gotchas**
- Approving runs every check issuing does. If it can't be issued (a closed period, not enough stock, the customer's credit limit), the error is shown and the document goes back to waiting.
- Once approved, changing the amount or the party of a draft asks for approval again when it is issued.
- If two people decide at once, the second sees *This document was decided on a moment ago; refresh to see it*.
- The creator isn't sent a notification when a document is approved or sent back. They see it on the document's page.

### 25.4 Send a payment for approval

**Goal:** Pay a supplier more than the payment rule allows.
**Who / plan:** Accountant or Sales, on Smart Pro and above.

**Steps**
1. Record the payment as usual ([07 — Payments](07-payments.md#73-pay-a-supplier)) and tap **Record payment**.
2. You see *Sent for approval. It's recorded once an owner or admin approves.* The app opens **Waiting for approval**, where your request is listed under **Payments**.

**What happens**
- No payment is recorded. The bills stay outstanding and the account's balance doesn't change.
- The owners and admins get a notification: *A payment is waiting for your approval*.
- Accountants and Sales see only their own requests in the list. Owners and admins see all of them.

**Rules & gotchas**
- Money received never waits, and nor does a refund of an advance.
- A foreign-currency payment is measured at its rate in base currency.
- An edit to a payment that was already recorded doesn't go back for approval.

### 25.5 Approve or turn down a payment

**Goal:** Decide on a payment request.
**Who / plan:** Owner or Admin.

**Steps**
1. Open **Waiting for approval**. **Payments** lists each request: amount, reference, *party · asked by name*.
2. Either:
   - Tap **Approve**. The payment is recorded now, as you, and opens in the lists. You see *Approved and recorded*.
   - Tap **Send back**, write *Why not?*, then **Turn down**. You see *Turned down*.

**What happens**
- The requester is notified: *Your payment was approved* (with its number), or *Your payment was not approved* with your reason.
- An approved payment is checked as any payment is: if the account no longer holds enough, or a bill has since been paid, approval is refused with the reason and the request keeps waiting.

**Rules & gotchas**
- Decided requests leave the list. The app has no history of turned-down requests; the requester has the notification, and the audit trail records each request and decision ([13 — Settings](13-settings.md)).
- The list shows *Nothing waiting* when it is empty: *Documents and payments over the amounts set in Settings → Approvals wait here for an owner or admin.*

---

**Related:** [05 — Sales](05-sales.md) · [06 — Purchases](06-purchases.md) · [07 — Payments](07-payments.md) · [14 — Team, roles & plans](14-team-roles-plans.md)
