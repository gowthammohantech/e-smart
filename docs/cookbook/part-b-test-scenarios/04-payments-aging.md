# 04 — Payments, aging & approvals

Tests for payments in and out, allocation, advances and refunds, FX gain or loss, editing and deleting a payment, receipts, receivables and payables aging, reminders, and approvals of documents and payments. Setup and demo data are in [00 — Test setup](00-test-setup.md).

Default: owner, **Vertex Traders**. Accounts: Cash in hand, HDFC Current — 8842 (default), ICICI Current — 3310, UPI wallet. TDS, discount and write-off on payments are `TDS-`/`ADJ-`, and service advances `ADV-`, in [14](14-accounting-gst-returns.md).

### Recording a payment received

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-001 | Full payment against one invoice | Owner | Sunrise Retail invoice of ₹2,124 issued | **Record payment** on the invoice → amount ₹2,124, method **Bank transfer**, account HDFC → **Record payment** | "Payment recorded"; `PAY/<FY>/NNNN`; invoice **Paid** | happy |
| PAY-002 | Part payment | | Same invoice | ₹1,000 | Invoice **Partly paid**, balance ₹1,124 | happy |
| PAY-003 | From the Payments screen | | | **Money › Payments received › +** → contact | "N open documents" listed under **Apply to**, oldest first | happy |
| PAY-004 | Contact first | | | Open a new payment with no contact | **Apply to** shows "Pick a contact first" | validation |
| PAY-005 | Nothing outstanding | | Contact with no open documents | Pick the contact | "Nothing outstanding"; the payment would be held as an advance | edge |
| PAY-006 | Auto-allocate | | Customer with 3 open invoices | Amount less than their total → **Auto-allocate** | Applied to the oldest first until the amount runs out | happy |
| PAY-007 | Settle all | | | **Settle all** | Each open document fully allocated; the amount rises to match | happy |
| PAY-008 | Over-allocation | | | Allocate more than the payment amount | "Over-allocated by ₹…"; can't save | validation |
| PAY-009 | Advance | | | Amount ₹5,000 with nothing allocated | "This payment will be held as an advance against the contact."; detail shows "Held as an advance" | happy |
| PAY-010 | Allocated + unallocated = amount | | ₹3,000 with ₹2,124 allocated | Save | Detail: allocated ₹2,124; "₹876.00 is unallocated and available as an advance." | happy |
| PAY-011 | Use an advance | | Customer has an advance and a new invoice | Open the payment → **Adjust** | "₹… adjusted from advances"; invoice paid down | happy |
| PAY-012 | Advance with nothing to adjust | | No open documents | **Adjust** | "No advance could be adjusted" | edge |
| PAY-013 | Advance shown on a new payment | | Customer has an advance | New payment for that customer | "Advance available: ₹…" with **Adjust**, and **Use advance (₹…) on this** per document | happy |
| PAY-014 | Advances stay in their currency | | AED advance; INR invoice | Adjust | AED advance not applied to the INR invoice | edge |
| PAY-015 | Reference | | | UTR in **Reference** | Saved; searchable | happy |
| PAY-016 | Amount follows ticks | | No amount typed | Tick two documents | Amount = their total; typing an amount stops it following | happy |
| PAY-017 | Allocation over what is owed | | Invoice owes ₹1,000 | Send ₹1,200 against it through the API | Refused, "… has INR 1,000.00 outstanding" | validation |
| PAY-018 | Default account from bank details | Owner | Invoice bank details linked to ICICI | New payment received, bank method | **Deposit into** starts on ICICI | happy |
| PAY-019 | Double tap | | | Tap **Record payment** twice fast | One payment recorded | edge |

### Methods and accounts

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-020 | Cash → cash account | | | Method **Cash** | **Deposit into** offers only Cash in hand | validation |
| PAY-021 | Bank, cheque, card → bank | | | Each method | Only HDFC and ICICI offered | validation |
| PAY-022 | UPI → bank or wallet | | | **UPI** | Banks and UPI wallet offered | validation |
| PAY-023 | Wallet → wallet | | | **Wallet** | UPI wallet only | validation |
| PAY-024 | No account for the method | | No wallet account exists | **Wallet** | "No account matches this payment method" + **Add a bank or wallet account** | edge |
| PAY-025 | Default account | | HDFC is the default, no bank details link | New payment | HDFC preselected for bank methods | happy |

### Payments made (Pro)

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-030 | Pay a supplier | Owner / Pro | Issued bill | **Pay supplier** → HDFC → **Record payment** | Screen titled **Pay supplier**; "Payment made"; bill **Paid** | happy |
| PAY-031 | More than the cash balance | | Cash in hand ₹2,000 | Pay ₹5,000 from cash | "Cash in hand has only ₹2,000.00"; blocked | validation |
| PAY-032 | More than the bank balance | | | Pay more than the HDFC balance | "More than the balance of ₹…"; server refuses `INSUFFICIENT_BALANCE` | validation |
| PAY-033 | Hidden on sales plans | Owner / Basic | Aurora | Open `/payments/made` | Upgrade page; not listed in More | plan |
| PAY-034 | Pay all | Owner / Pro | Supplier with 2 open bills | **Pay all** | Both bills allocated in full | happy |
| PAY-035 | TDS section on a payment | Owner / Pro | Supplier bill with no TDS kept | **You deducted TDS, or got a discount** → TDS ₹200, no section → save | "Pick the TDS section to save"; with a section, saved and reported under it | validation |
| PAY-036 | No TDS twice | | Bill that kept back TDS under 194C | Payment with TDS on that bill, same section | Refused: "… already kept back TDS under 194C…" | validation |
| PAY-037 | No write-off for suppliers | | | Open the adjustments on a bill | Only TDS deducted and Discount; no Write off | edge |

### Refunds

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-070 | Refund an advance | Owner | Receipt with ₹5,000 unallocated | Open it → **Refund** → ₹2,000 from HDFC → **Refund** | "Advance refunded"; refund opens with "Refund of the advance on PAY/…"; receipt lists it under **Refunded out of this advance**; ₹3,000 left | happy |
| PAY-071 | Refund over what is left | | PAY-070 | Refund ₹4,000 | "Only ₹3,000.00 of the advance is left" | validation |
| PAY-072 | Refund dated before the receipt | | | Date the refund earlier | "A refund can't be dated before the advance was received" | validation |
| PAY-073 | Refund on a sales plan | Owner / Basic | Aurora receipt with an advance | **Refund** | Allowed (a refund isn't a supplier payment) | plan |
| PAY-074 | Can't delete a refunded receipt | Owner | PAY-070 | Delete the receipt | Refused: "… has refunds against it; remove those first" | validation |
| PAY-075 | Refund never waits | Accountant | Payment rule ₹1,000 on | Refund ₹2,000 | Recorded at once, not held | edge |

### FX settlement

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-040 | FX gain | Owner / Pro | AED invoice at 23.85 (demo 0036) | Receive AED 1,000, **Settlement rate** 24.00 | "FX gain on settlement" ₹150.00 (1,000 × (24.00 − 23.85)) | happy |
| PAY-041 | FX loss | | | Settlement rate 23.50 | "FX loss on settlement" ₹350.00 | happy |
| PAY-042 | Same rate | | | Settlement 23.85 | No FX line | edge |
| PAY-043 | FX hint | | | Change the settlement rate | Hint "A rate different from the invoice rate produces an FX gain or loss." | happy |
| PAY-044 | Only same-currency documents | | Customer with INR and AED invoices | Payment in AED | Only AED invoices under **Apply to** | edge |

### Payment detail, edit & delete

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-050 | Detail | | PAY-010 | Open the payment | "Received from …", "Deposited into …", **Applied to** list, unallocated note with **Refund** and **Adjust** | happy |
| PAY-051 | Delete a payment | Owner | PAY-001 | **Delete** → confirm | "Any invoice it was applied to will go back to being outstanding. This cannot be undone." → "Payment deleted"; invoice back to **Issued** or **Overdue** | happy |
| PAY-052 | Accountant can't delete | Accountant (Meera) | | Open a payment | No **Delete** button; API delete refused (owner or admin only) | permission |
| PAY-053 | Sales can record but not edit | Sales (Rahul) | | Record a payment, then open it | Recording works; no **Edit** button; API edit refused | permission |
| PAY-054 | Viewer | Viewer (Priya) | | Record a payment | Refused | permission |
| PAY-055 | Edit a payment | Accountant | Recorded payment | **Edit** → change reference and date → **Save** | "Payment updated"; hint "The amount and what it settles stay as recorded…"; amount and allocations unchanged | happy |
| PAY-056 | Payment PDF | Owner | | **Share PDF** (📱) / **Download PDF** (🖥) | Receipt PDF for money in; payment voucher for money out | happy |
| PAY-057 | Adjustments on the detail | | Payment with TDS deducted on an invoice | Open it | **Applied to** row shows "TDS deducted: ₹…" | happy |
| PAY-058 | List filters | | 🖥 | **Payments received**: search, date range, branch from the top bar; tick rows → **Export CSV** | List narrows; CSV of the ticked rows | happy |

### Receipts and adjust advance

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-080 | Record a receipt | Owner | | **Money › Receipts › New receipt** → ₹1,500, **Received for** Interest received, **Received into** HDFC → **Save receipt** | "Receipt saved"; `RV/…`; HDFC +₹1,500; income in P&L | happy |
| PAY-081 | Receipt needs an account | | | Save without **Received for** | Not saved; field flagged | validation |
| PAY-082 | Adjust advance screen | Owner | Customer with an advance and an open invoice | **Money › Adjust advance** → party → **Apply all, oldest first** | "₹… adjusted"; invoice paid down | happy |
| PAY-083 | Adjust from the document | | Same | Open the invoice → **Adjust advance (₹…)** | Opens Adjust advance for that invoice | happy |
| PAY-084 | Party on both sides | | Contact kind both, with a supplier advance | Adjust advance → **As supplier** | Supplier advances and open bills listed | edge |
| PAY-085 | Service advance on a goods invoice | | Service advance; invoice with goods only | Apply it | Warning "This invoice has no service on it…" | edge |
| PAY-086 | Nothing to adjust | | Party with no advance | Pick the party | "No unadjusted advance or credit note" | edge |

### Receivables & payables aging

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-060 | Buckets | Owner | Fresh seed | **Money › Receivables** | **Total receivable**, **Overdue**, **Due soon**; buckets Current, 1–30, 31–60, 61–90, 90+ populated | happy |
| PAY-061 | Filters | | | **All / Overdue / Due soon** | Due soon = due within 7 days; overdue = past due with a balance | happy |
| PAY-062 | Outstanding formula | | | Compare a contact's row with their invoices | Total minus payments, returns and notes, never below 0; "oldest Nd late" | happy |
| PAY-063 | Drafts and cancelled left out | | | Cancel an overdue invoice | Leaves aging | edge |
| PAY-064 | Remind on WhatsApp or email | Owner | Customer with overdue invoices | **Remind** | Prefilled: "Hi <name>, a gentle reminder that invoices … totalling ₹… are still open…"; you send it yourself | happy |
| PAY-065 | Record from aging | | | **Record payment** on a row | Payment form for that contact | happy |
| PAY-066 | Payables aging | Owner / Pro | | **Money › Payables** | Same buckets for supplier bills; **Pay supplier**; no **Remind** | happy |
| PAY-067 | Bucket filter | | | Tap **31–60**, then **Clear** | Only that bucket's documents; then all again | happy |
| PAY-068 | Payment with no connection | | Network off | Record a payment | Save is disabled; no payment is recorded and the invoice status is unchanged | online |
| PAY-069 | Overdue notification | Owner | Invoice falls due yesterday | Wait for the daily run | One notification "… is overdue"; not repeated | happy |
| PAY-076 | Import outstanding | Owner | Customer with no opening balance | **Receivables › Import outstanding** → 1 row → **Import 1** | Opening invoice in aging; payable via **Record payment**; party with an opening balance refused | happy |

### Approvals

Approval rules are set by the owner under **Settings › Approvals**. Approvers are owners and admins. See [25 — Approvals](../part-a-user-guide/25-approvals.md).

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| APR-001 | Set a rule | Owner | | **Settings › Approvals** → turn on Invoices, **Over** ₹50,000 → **Save** | "Approval rules saved" | happy |
| APR-002 | Only the owner sets rules | Admin | | Open **Approvals** | "Only an owner can set what needs approval."; switches disabled; API change refused `OWNER_ONLY` | permission |
| APR-003 | Invoice held | Sales (Rahul) | APR-001 | Invoice of ₹60,000 → **Issue invoice** | Stays a draft with **Waiting for approval** card; no number; not in receivables; owners/admins notified "A document is waiting for your approval" | happy |
| APR-004 | Under the amount | Sales | APR-001 | Invoice of ₹40,000 → issue | Issued at once | edge |
| APR-005 | Approvers don't wait | Admin | APR-001 | Invoice of ₹60,000 → issue | Issued at once | edge |
| APR-006 | Approve a document | Owner | APR-003 | **Sell › Waiting for approval** → **Approve** | "Approved and issued"; numbered and posted; leaves the list | happy |
| APR-007 | Send back | Owner | Another held invoice | **Send back** → reason → **Send back** | "Sent back to its creator"; document shows **Sent back** with the reason | happy |
| APR-008 | Re-issue after send back | Sales | APR-007 | Change it → **Issue invoice** | Waiting for approval again | happy |
| APR-009 | Approval that can't issue | Owner | Held invoice over the customer's credit limit, or in a closed period | **Approve** | Error shown; document back to waiting | edge |
| APR-010 | Change after approval | | Draft approved but not issued (APR-009 case fixed) | Change its amount, then issue as Sales | Asks for approval again | edge |
| APR-011 | Decide from the document | Admin | Held document | Open it → **Approve** on the card | Issued | happy |
| APR-012 | Non-approver sees no buttons | Accountant | Held document | Open **Waiting for approval** | Listed; no **Approve** or **Send back**; API refused | permission |
| APR-013 | Two decide at once | Owner + Admin | Held document | Both tap **Approve** | One issues it; the other sees "This document was decided on a moment ago; refresh to see it" | edge |
| APR-014 | Purchase bill and PO rules | Owner / Pro | Rules on Purchase bills ₹1,00,000, Purchase orders ₹0 | Accountant records a bill of ₹1,20,000 and confirms any PO | Both wait; approving the PO makes it **Confirmed** | happy |
| APR-020 | Payment rule | Owner / Pro | | Turn on **Payments made**, Over ₹25,000 → Save | Saved | happy |
| APR-021 | Payment held | Accountant (Meera) | APR-020 | Pay a supplier ₹30,000 | "Sent for approval. It's recorded once an owner or admin approves."; opens **Waiting for approval** with the request under **Payments**; no payment in Payments made; bill and account unchanged | happy |
| APR-022 | Approve a payment | Owner | APR-021 | **Approve** | "Approved and recorded"; payment recorded as the owner; bill paid; Meera notified "Your payment was approved" | happy |
| APR-023 | Turn down a payment | Owner | Another held payment | **Send back** → *Why not?* → **Turn down** | "Turned down"; nothing recorded; requester notified "Your payment was not approved" with the reason | happy |
| APR-024 | Money received never waits | Accountant | APR-020 | Receive ₹50,000 | Recorded at once | edge |
| APR-025 | Approval re-checks the payment | Owner | Held payment; HDFC since emptied | **Approve** | Refused (not enough in the account); request keeps waiting | edge |
| APR-026 | Requester sees only own requests | Sales | Requests from Meera and Rahul | Rahul opens **Waiting for approval** | Only Rahul's request listed, no buttons | permission |
| APR-027 | Edit doesn't re-ask | Accountant | Payment of ₹30,000 recorded by the owner | Edit its reference | "Payment updated"; not held | edge |
| APR-028 | Empty list | Owner | Nothing waiting | Open **Waiting for approval** | "Nothing waiting" with the hint about Settings → Approvals | happy |
| APR-029 | Foreign-currency payment | Accountant | APR-020; USD supplier | Pay USD 400 at 84 (₹33,600) | Held (measured in base currency) | edge |
