# 20 — TDS, TCS, reverse charge, credit and adjustments

How the app handles the tax on what you buy and sell beyond plain GST:
- TDS you keep back from suppliers, and TDS customers keep back from you;
- TCS you collect on certain sales;
- reverse charge;
- which input credit you can claim, line by line;
- credit and debit notes without goods;
- reimbursements;
- GST on advances for services, and adjusting advances;
- paying micro and small suppliers on time.

- **Plan:** full plans for the buying side (bills, TDS on bills, MSME) and for the Books entries (adjust advance). Credit and debit notes on sales, TCS and TDS expected on invoices: every plan.
- **Roles:** owner, admin or accountant for writing off what a party owes. Everything else follows the document's own roles.

> These rules are listed for a chartered accountant in the accounting rules document. Rules marked *pending CA sign-off* there are built and running, but not yet reviewed by a CA.

---

## Set up

| Where | Field | Why |
|---|---|---|
| **Business profile** | **TAN** | Without it no TDS is worked out on bills (RULES 4.1). It should look like `CHED12345A`. |
| **Business profile** | **GST returns**: **Monthly** or **Quarterly (QRMP)** | Decides the return due dates |
| **Business profile** | **RBI bank rate (%)** | MSME late-payment interest is three times this rate. Default 5.5%. |
| **Business profile** | **GSTR-2B date tolerance (days)** | How far apart a 2B line and a bill may be dated and still match without anyone accepting it ([21](21-gst-returns.md#gstr-2b-matching-your-bills)). Default 3. |
| **Business profile** | **LUT number (exports)**, **LUT valid till** | Zero-rates exports and SEZ supplies ([11](11-gst-compliance.md#exports-sez-supplies-and-the-lut)) |
| A supplier | **PAN** | TDS needs it. Filled from the GSTIN when left blank. Without one, TDS is at 20% (194Q: 5%, s.206AA). |
| A supplier | **TDS section** | 194C, 194J(a), 194J(b), 194H, 194I(a), 194I(b), 194A or 194Q (table below) |
| A supplier | **Lower deduction certificate (s.197)** | Its rate and valid-till date replace the section's rate while it is valid |
| A supplier | **Bills are under reverse charge** | GTA, advocates and the like |
| A supplier | **MSME (Udyam) registration** and **Udyam number** | Micro, small or medium |
| A customer | **Collect TCS on sales** and **TCS section** | Their invoices collect TCS under that section |
| An item | **GST treatment**: **Taxable**, **Nil-rated**, **Exempt**, **Non-GST** | Only taxable lines carry GST |
| An item | **Reimbursement at cost**, **Reverse charge**, **Cess (%)**, **Capital goods**, **Input tax credit** (**Can be claimed**, **Blocked, section 17(5)**, **Not claimable**) | Copied onto each line when it is written |

The supplier fields show for a party you buy from; the TCS fields for a party you sell to. A party that is only a customer can't hold a TDS section.

**TDS sections**

| Section | Nature | Rate | Threshold |
|---|---|---|---|
| 194C | Contractors | 1% individual / 2% others | ₹30,000 a bill, ₹1 lakh a year |
| 194J(a) | Technical services, royalty | 2% | ₹50,000 a year |
| 194J(b) | Professional services | 10% | ₹50,000 a year |
| 194H | Commission | 2% | ₹20,000 a year |
| 194I(a) | Rent of plant and machinery | 2% | ₹50,000 a bill |
| 194I(b) | Rent of land, building, furniture | 10% | ₹50,000 a bill |
| 194A | Interest | 10% | ₹10,000 a year |
| 194Q | Purchase of goods | 0.1% | Only on what the year's purchases exceed ₹50 lakh by |

---

## TDS on supplier bills

**Goal:** keep back TDS on a supplier's bill and owe it to the government.
**Who / plan:** owner, admin or accountant · full plans.

On a purchase bill from a supplier with a TDS section, the **TDS section** field shows what will be kept back, for example **₹2,000 kept back at 2%, paid to the government**.

- **No TAN yet:** the bill says **Add your TAN in the business profile to deduct TDS on bills. Without it nothing is kept back.** Tap **Add TAN**.
- **When TDS starts:** only once the supplier passes the section's threshold for the year, single bill or annual total. When a bill takes them past the annual threshold, the earlier bills of the year are caught up on it (RULES 4.2).
- **What it is charged on:** the taxable value, not the GST (CBDT circular 23/2017).
- **What the supplier is owed:** the grand total less the TDS. The TDS goes to *TDS payable* for that section.
- **Kept back once:** if a payment already kept TDS back under the same section on money allocated to this bill, the bill keeps back only the rest. A payment can't keep TDS back on a bill that did so itself (RULES 4.16).
- **Choosing the section yourself:** pick **No TDS** or another section on the bill.
- **Notes and returns:** a supplier credit note or a purchase return gives the TDS back at the bill's rate. Cancelling the bill takes its TDS off.

**TDS kept back on a payment.** On **Record payment** to a supplier, **You deducted TDS, or got a discount** opens the **TDS deducted** field per bill. Pick its **TDS section** (the supplier's by default); it is reported under that section in Form 26Q and TDS payable. Without a section you see **Pick the TDS section to save**.

**Paying it to the government:** record a **TDS challan** voucher in Books, with the **BSR code** (7 digits), **Challan serial number** and **Deposited on** date ([19](19-books.md#vouchers)). The same challan voucher can also clear *TCS payable*.

**Reports** (**Reports › TDS & TCS**):
- **TDS deducted**: by quarter, section and deductee.
- **TDS payable**: deducted, deposited and still to deposit, by section and month. Each challan settles its section's oldest month first. Each month is due by the 7th of the next (30 April for March).
- **Form 26Q deductees**: one row per bill and per payment that kept TDS back, with PAN, section, rate and the challan that deposited it.
- **TDS challans**: the challans deposited in the period.

## TDS customers keep back

**On the invoice (expected TDS).** If a customer deducts TDS from what they pay you, pick **TDS the customer will deduct** on the invoice and, if needed, the **TDS rate (%)**. The invoice shows **TDS expected 194J(b), 10%** and the net they should pay. Nothing is posted, and the invoice total and GST stay the same (RULES 4.14).

**On the receipt.** On **Record payment** for a customer, **Customer deducted TDS, or a discount or write-off** opens three fields per invoice. An invoice with expected TDS fills **TDS deducted** for you:
- **TDS deducted:** settles the invoice with no money moving. It goes to *TDS receivable* for its section, to claim against Form 26AS.
- **Discount:** settles the rest as discount allowed.
- **Write off:** settles the rest as a bad debt. Owner, admin or accountant only.

**TDS receivable** report: what customers kept back, by section, customer and quarter. Its **26AS match** view sets the TDS invoices expected against what receipts recorded, per customer (**TAN or PAN**) and quarter, with the **Difference**. Tick each row against Form 26AS or the AIS.

## TCS on sales

**Goal:** collect tax at source on sales of scrap, minerals, timber and similar goods, or vehicles and luxury goods over ₹10 lakh (Income-tax Act s.206C).
**Who / plan:** as for invoices · every plan.

1. Turn on **Collect TCS on sales** for the customer and pick the **TCS section**. Their invoices then start with that section.
2. On any invoice, **TCS (income tax)** shows the section, or **No TCS**.

**What happens**
- TCS is worked on the price with GST, after the document discount, rounded to the rupee, at the section's rate: 1% for scrap, liquor, minerals, motor vehicles and luxury goods; 2.5% for timber and forest produce; 5% for tendu leaves. A buyer with neither PAN nor GSTIN pays twice the rate or 5%, whichever is higher (s.206CC).
- It is added to what the buyer owes (**TCS collected** in the totals) and goes to *TCS payable*, not sales. It isn't part of the GST taxable value.
- A credit note or sales return against a TCS invoice gives TCS back in proportion, at the invoice's rate.
- **Reports › TCS register** lists each invoice and note with TCS; **TCS payable** shows collected, deposited and left by section and month, with the **27EQ quarter rows**. Each month is due within seven days of its end.

An invoice with TCS can be e-invoiced: the TCS travels as other charges; see [11](11-gst-compliance.md#generate-an-irn).

## Reverse charge

A bill line from a reverse-charge item, or any bill from a supplier marked **Bills are under reverse charge**, works out GST that you pay the government yourself:
- **What the supplier is owed:** the bill without that GST. The totals show **Tax payable by the recipient (reverse charge)**.
- **Where it posts:** from bills and expenses dated **1 November 2026**, the tax goes to *Output CGST/SGST/IGST/Cess*, like tax on a sale. Earlier ones stay in *CGST (SGST, IGST, CESS) payable on reverse charge*; the Utilization entry can pay what is left there ([21](21-gst-returns.md#set-off-the-tax-utilization-entry)). The credit goes to input GST when it is eligible (RULES 2.6).
- **Always paid in cash:** reverse-charge tax is never paid from credit (RULES 2.5).
- **Unregistered supplier:** the bill gets a self-invoice number from its own series (Rule 46(f)): **Self-invoice SI/…: the GST on this bill is paid by you under reverse charge.**
- **Expenses:** an expense can be marked **Reverse charge** too: "You pay this GST to the government yourself; the amount is the supplier’s price without it."
- **Imported services:** IGST is self-assessed though the bill carries none.
- **Sales:** the rare sale under reverse charge (**Reverse charge** on the invoice) charges no GST, and is reported with `RegRev Y`.

## Which credit you can claim

**Line by line.** Each purchase line carries its own **Input tax credit** choice: **Eligible**, **Capital goods**, **Reverse charge**, **Blocked (s.17(5))** or **Not claimable**. Picking an item fills it once; what you change on the line stays (RULES 3.9). The bill's detail and totals show its credit by bucket.

- **Blocked** (s.17(5): food, personal vehicles, works contracts…) and **not claimable** lines never reach input GST. Their GST is part of the cost; under perpetual stock it is part of the goods' stock cost (RULES 6.27). 3B reports them as reversed in 4B(1).
- **Capital goods** go to fixed assets, and their credit is shown separately. The bill then says **Capital goods worth ₹… on this bill are in your fixed assets. Add them to the register so they depreciate.** Tap **Add to fixed asset register** ([23](23-fixed-assets.md)).
- **Imported goods:** a bill from an overseas supplier asks for the bill of entry: **Bill of entry number**, **Bill of entry date**, **Port code**, **Assessable value**, **IGST paid at customs** and **Cess paid at customs**. That IGST is your credit in 3B 4A(1), matched to 2B on the bill of entry number.
- **ISD invoices:** on a bill from a registered supplier, **Input Service Distributor invoice** puts its credit in 3B 4A(4) instead of 4A(5).
- **Credit comes from GSTR-2B:** a bill's credit is claimed in the month its line matched in GSTR-2B ([21](21-gst-returns.md#gstr-2b-matching-your-bills)), not the month of the bill. Lines 2B marks as credit not available are never claimed.
- **180 days unpaid:** a bill still unpaid 180 days after its date has its credit reversed by a daily job. The bill shows **Input tax credit reversed on 〈date〉: unpaid 180 days after the bill. It is claimed again once paid.** In the books the credit moves to *Input tax credit reversed* (an expense) and comes back when the bill is paid (RULES 6.22).
- **Supplier credit notes** lower the credit.

## Credit and debit notes without goods

**Sales › Credit notes** and **Sales › Debit notes**, and **Purchases › Supplier credit notes** and **Supplier debit notes**, raise a note for a discount, a price change or a tax correction, with no stock movement.

**Against one invoice or bill**
1. Tap **+**, then pick the invoice (or the supplier's bill) it is against. You can narrow the list by party. Its lines are copied in.
2. Change the lines to the amount being credited or charged, and pick a **Reason**.
3. Tap **Issue credit note** (or **Record credit note** for a supplier's).

A note against an invoice keeps the invoice's GST rate and always carries GST.

**Without an invoice (direct note)**
1. Tap **Without an invoice** (or **Without a bill**). Use it for a discount over a period or a rate change across several invoices. Give the reason on the note.
2. Choose the **GST treatment**:
   - **With GST (s.34)**, the default. Enter the **Original invoice number** (or **Original bill number**) and **Original date**. It goes to GSTR-1 with them, and the 30 November deadline is checked on the date you enter.
   - **Financial note — no GST**: a commercial discount after the sale. No tax on any line; it posts to *Discount allowed* (or *Discount received*), and is left out of GSTR-1 and GSTR-3B (RULES 6.24).
3. Its credit waits on the party like an advance. Apply it with **Adjust advance** (below).

**Rules & gotchas**
- **Limit:** a note can't take more than the source's value, less earlier notes (`NOTE_EXCEEDS_SOURCE`).
- **Time limit:** a credit note or sales return is refused after 30 November following the year of the invoice (s.34(2), `NOTE_TIME_BARRED`).
- **Effect:** a credit note lowers what the invoice owes; a debit note adds to it. With GST, both go to GSTR-1 as CDNR, CDNUR, or netted in B2CS for a consumer.
- **TCS and TDS:** a credit note against a TCS invoice gives the TCS back in proportion; a supplier credit note gives TDS back.

## Reimbursements (pure agent, Rule 33)

You pay something on a customer's behalf, such as port charges or a government fee, and recover exactly that:
1. Record the expense with **Billable to a customer** on and, under **Bill to**, the customer.
2. On their next invoice, the panel of billable expenses to recover lists it: "Add them at cost as reimbursements: no GST, outside the taxable value (Rule 33)." Tap **Add**. The line is **Reimbursement at cost**.

- **In the totals and print:** **Reimbursements at cost** sit in their own table after the items, outside the taxable value and every GSTR-1 table. On the e-invoice they travel as other charges.
- **In the books:** the expense goes to *Reimbursements recoverable* (an asset), and the invoice line clears it, so neither reaches profit and loss (RULES 8.6).
- **Recovered once:** an expense can be recovered only once, and only on an invoice to its customer (`EXPENSE_ALREADY_RECOVERED`). The expense then shows **Recovered on 〈number〉**.
- **Credit warning:** if credit was claimed on the expense, the panel warns you: "A pure agent recovers a cost paid in the customer’s name, without claiming its credit."

## GST on advances for services

When a customer pays before you invoice a service, GST is due on the advance when it arrives (s.13(2)).

**Steps**
1. Open **Money › Advance receipt**, or on **Record payment** with money left over after the invoices, turn on **Advance for services**.
2. Enter the **SAC**, **GST rate**, **Cess %** and **Place of supply**. A rate you don't know is taken as 18%; a place of supply you don't know as another state (**Not known: another state (IGST)**).
3. If the customer kept TDS back from the advance, enter **TDS deducted by the customer** and its section.
4. The screen shows the tax split live: **GST on the advance: ₹…, inside the amount received**.

**Rules & gotchas**
- **Goods:** advances for goods carry no GST (notification 66/2017). A SAC that isn't a service code says **That is goods: an advance for goods carries no GST**.
- **Taking the tax back:** when the advance is applied to an invoice, its tax is taken back on the invoice's date. The invoice then carries the full tax.
- **Where it is reported:** GSTR-1 table 11 (11A received, 11B adjusted) and 3B 3.1(a).
- **The receipt** prints as the receipt voucher (Rule 50).
- **Refunds:** open the receipt and tap **Refund** under the advance it holds. The refund prints as the refund voucher (Rule 51), and the GST on what you pay back comes off in the month of the refund (GSTR-1 table 11B).

## Adjust advances and direct notes

**Money › Adjust advance** (or **Adjust advance (₹…)** on an invoice) applies what a party paid in advance, or a direct credit note, to what they still owe (RULES 8.13).

1. Pick the **Party** (**As customer** or **As supplier**).
2. Under **Advances and credit notes**, pick one, then enter what to **Apply** to each of the **Open invoices and notes**. Or tap **Apply all, oldest first**.
3. Tap **Apply ₹…**. You see **₹… adjusted**.

- A service advance applied to an invoice with no service on it warns: *"This invoice has no service on it: GST paid on a service advance should only come back on a service invoice."*
- A direct note applied this way moves no money and no GST.

## Paying micro and small suppliers on time

Under the MSMED Act (s.15), a bill from a micro or small enterprise must be paid by the day agreed for that bill:
- The agreed day can't be more than 45 days after the bill.
- With no agreement, it is 15 days. A due date that only follows the supplier's standing payment terms doesn't count as an agreement, so such a bill also gets 15 days (RULES 8.7).
- Medium enterprises are outside the rule.

- **Reports › MSME payments due** lists their unpaid bills with the due date, days left or days late, and the interest the law adds once late. That is three times the **RBI bank rate**, compounded monthly, shown for information.
- **Not paid in time this year** lists, for your CA, what can't be deducted this year under Income-tax Act s.43B(h).
- **Reminders:** a daily reminder notifies the business a week before a bill's due date, and once it is late.

---

**Related:** [19 Books](19-books.md) · [21 GST returns](21-gst-returns.md) · [07 Payments](07-payments.md) · [08 Customers & suppliers](08-contacts.md) · [11 GST compliance](11-gst-compliance.md) · [23 Fixed assets](23-fixed-assets.md)
