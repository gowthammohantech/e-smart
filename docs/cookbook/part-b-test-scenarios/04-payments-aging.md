# 04 — Payments & aging

Tests for payments in and out, allocation, advances, FX gain or loss, deleting a payment, receivables and payables aging, and reminders. Setup and demo data are in [00 — Test setup](00-test-setup.md).

Default: owner, **Vertex Traders**. Accounts: Cash in hand, HDFC Current — 8842 (default), ICICI Current — 3310, UPI wallet.

### Recording a payment received

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-001 | Full payment against one invoice | Owner | Sunrise Retail invoice of ₹2,124 issued | **Record payment** on the invoice → amount ₹2,124, method **Bank**, account HDFC → save | "Payment recorded"; `PAY/<FY>/NNNN`; invoice **Paid** | happy |
| PAY-002 | Part payment | | Same invoice | ₹1,000 | Invoice **Partly paid**, balance ₹1,124 | happy |
| PAY-003 | From the Payments screen | | | **More › Payments received › +** → contact | "N open documents" listed under **Apply to** | happy |
| PAY-004 | Contact first | | | Try to allocate with no contact | "Pick a contact first" | validation |
| PAY-005 | Nothing outstanding | | Contact with no open documents | Pick the contact | "Nothing outstanding"; the payment would be held as an advance | edge |
| PAY-006 | Auto-allocate | | Customer with 3 open invoices | Amount less than their total → **Auto-allocate** | Applied to the oldest first until the amount runs out | happy |
| PAY-007 | Pay all | | | **Pay all** | Each open document fully allocated; the amount rises to match | happy |
| PAY-008 | Over-allocation | | | Allocate more than the payment amount | "Over-allocated by ₹…"; can't save | validation |
| PAY-009 | Advance | | | Amount ₹5,000 with nothing allocated | "This payment will be held as an advance against the contact."; detail shows "Held as an advance" | happy |
| PAY-010 | Allocated + unallocated = amount | | ₹3,000 with ₹2,124 allocated | Save | Detail: allocated ₹2,124; "₹876.00 is unallocated and available as an advance." | happy |
| PAY-011 | Use an advance | | Customer has an advance and a new invoice | Open the payment → **Adjust** | "₹… adjusted from advances"; invoice paid down | happy |
| PAY-012 | Advance with nothing to adjust | | No open documents | **Adjust** | "No advance could be adjusted" | edge |
| PAY-013 | Advance shown on a new payment | | Customer has an advance | New payment for that customer | "Advance available: ₹…" with **Use advance (₹…) on this** per document | happy |
| PAY-014 | Advances stay in their currency | | AED advance; INR invoice | Adjust | AED advance not applied to the INR invoice | edge |
| PAY-015 | Reference | | | UTR in **Reference** | Saved; searchable | happy |

### Methods and accounts

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-020 | Cash → cash account | | | Method **Cash** | **Deposit into** offers only Cash in hand | validation |
| PAY-021 | Bank, cheque, card → bank | | | Each method | Only HDFC and ICICI offered | validation |
| PAY-022 | UPI → bank or wallet | | | **UPI** | Banks and UPI wallet offered | validation |
| PAY-023 | Wallet → wallet | | | **Wallet** | UPI wallet only | validation |
| PAY-024 | No account for the method | | No wallet account exists | **Wallet** | "No account matches this payment method" + **Add a bank or wallet account** | edge |
| PAY-025 | Default account | | HDFC is the default | New payment | HDFC preselected for bank methods | happy |

### Payments made (Pro)

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-030 | Pay a supplier | Owner / Pro | Issued bill | **Pay supplier** → HDFC → save | "Payment made"; bill **Paid** | happy |
| PAY-031 | More than the cash balance | | Cash in hand ₹2,000 | Pay ₹5,000 from cash | "Cash in hand has only ₹2,000.00"; blocked | validation |
| PAY-032 | More than the bank balance | | | Pay more than the HDFC balance | "More than the balance of ₹…" | validation |
| PAY-033 | Hidden on sales plans | Owner / Basic | Aurora | Open `/payments/made` | Upgrade page; not listed in More | plan |

### FX settlement

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-040 | FX gain | Owner / Pro | AED invoice at 23.85 (demo 0036) | Receive AED 1,000, **Settlement rate** 24.00 | "FX gain on settlement" ₹150.00 (1,000 × (24.00 − 23.85)) | happy |
| PAY-041 | FX loss | | | Settlement rate 23.50 | "FX loss on settlement" ₹350.00 | happy |
| PAY-042 | Same rate | | | Settlement 23.85 | No FX line | edge |
| PAY-043 | FX hint | | | Change the settlement rate | Hint "A rate different from the invoice rate produces an FX gain or loss." | happy |

### Payment detail & delete

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-050 | Detail | | PAY-010 | Open the payment | "Received from …", "Deposited into …", **Applied to** list, unallocated note | happy |
| PAY-051 | Delete a payment | Owner | PAY-001 | **Delete payment** → confirm | "Any invoice it was applied to will go back to being outstanding." → "Payment deleted"; invoice back to **Issued** or **Overdue** | happy |
| PAY-052 | Accountant can't delete | Accountant (Meera) | | Delete | Refused by the server (delete is owner or admin only) | permission |
| PAY-053 | Sales can record but not edit | Sales (Rahul) | | Record a payment, then edit it | Recording works; editing is refused (edit is owner, admin or accountant) | permission |
| PAY-054 | Viewer | Viewer (Priya) | | Record a payment | Refused | permission |

### Receivables & payables aging

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PAY-060 | Buckets | Owner | Fresh seed | **More › Receivables** | Buckets Current, 1–30, 31–60, 61–90, 90+ all populated | happy |
| PAY-061 | Filters | | | **All / Overdue / Due soon** | Due soon = due within 7 days; overdue = past due with a balance | happy |
| PAY-062 | Outstanding formula | | | Compare a contact's row with their invoices | Total minus allocated payments, never below 0; "oldest Nd late" | happy |
| PAY-063 | Drafts and cancelled left out | | | Cancel an overdue invoice | Leaves aging | edge |
| PAY-064 | Remind on WhatsApp or email | Owner | Customer with overdue invoices | **Remind** | Prefilled: "Hi <name>, a gentle reminder that invoices … totalling ₹… are still open…"; you send it yourself | happy |
| PAY-065 | Record from aging | | | **Record payment** on a row | Payment form for that contact | happy |
| PAY-066 | Payables aging | Owner / Pro | | **More › Payables** | Same buckets for supplier bills; **Pay** | happy |
| PAY-067 | Aging is device-side | | Offline | Open Receivables | Still renders from the local copy (computed on the device) | offline |
| PAY-068 | Payment offline | | Network off | Record a payment | "Saved on this device…"; synced later; the invoice status updates when synced | offline |
