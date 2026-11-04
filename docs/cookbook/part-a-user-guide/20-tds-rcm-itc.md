# 20 — TDS, reverse charge, credit and adjustments

How the app handles the tax on what you buy and sell beyond plain GST:
- TDS you keep back from suppliers, and TDS customers keep back from you;
- reverse charge;
- which input credit you can claim;
- credit and debit notes without goods;
- reimbursements;
- GST on advances for services;
- paying micro and small suppliers on time.

- **Plan:** full plans for the buying side (bills, TDS, MSME). Credit and debit notes on sales: every plan.
- **Roles:** owner, admin or accountant for writing off what a party owes. Everything else follows the document's own roles.

---

## Set up

| Where | Field | Why |
|---|---|---|
| **Business profile** | **TAN** | Without it no TDS is worked out on bills |
| **Business profile** | **GST returns**: monthly or quarterly (QRMP) | Decides 3B due dates |
| A supplier | **PAN** | TDS needs it. Filled from the GSTIN when left blank. Without one, TDS is at 20% (s.206AA). |
| A supplier | **TDS section** | 194C contractors, 194J professional or technical, 194H commission, 194I rent, 194A interest, 194Q goods |
| A supplier | **Lower deduction certificate (s.197)** | Its rate, valid-till date and limit replace the section's rate |
| A supplier | **Bills are under reverse charge** | GTA, advocates and the like |
| A supplier | **MSME (Udyam) registration** and **Udyam number** | Micro, small or medium |
| An item | **GST treatment**: Taxable, Nil-rated, Exempt, Non-GST | Only taxable lines carry GST |
| An item | **Reimbursement at cost**, **Capital goods**, ITC eligibility, reverse charge, cess | Copied onto each line when it is written |

## TDS on supplier bills

On a purchase bill from a supplier with a TDS section, the **TDS section** field shows what will be kept back, for example **₹2,000 kept back at 2%, paid to the government**.

- **When TDS starts:** only once the supplier passes the section's threshold for the year, single bill or annual total. When a bill takes them past the annual threshold, the earlier bills of the year are caught up on it.
- **What it is charged on:** the taxable value, not the GST (CBDT circular 23/2017).
- **What the supplier is owed:** the grand total less the TDS. The TDS goes to *TDS payable* for that section.
- **Choosing the section yourself:** pick **No TDS** or another section on the bill.

When you pay the TDS to the government, record a **TDS challan** voucher ([19](19-books.md#vouchers)). **Reports › TDS deducted** lists TDS by quarter, section and deductee: the figures for Form 26Q.

## TDS customers keep back, discounts and write-offs

On **Record payment** for a customer, **Customer deducted TDS, or a discount or write-off** opens three fields per invoice:
- **TDS deducted:** settles the invoice with no money moving. It goes to *TDS receivable*, to claim against Form 26AS.
- **Discount:** settles the rest as discount allowed.
- **Write off:** settles the rest as a bad debt. Owner, admin or accountant only.

For a supplier, **You deducted TDS, or got a discount** works the same way.

## Reverse charge

A bill line from a reverse-charge item, or any bill from a supplier marked **Bills are under reverse charge**, works out GST that you pay the government yourself:
- **What the supplier is owed:** the bill without that GST. It posts to *GST payable on reverse charge*, and to input GST when the credit is eligible.
- **Unregistered supplier:** the bill gets a self-invoice number from its own series (Rule 46(f)), shown as **Self-invoice SI/…** on the bill.
- **Expenses:** an expense can be marked reverse charge too.
- **Sales:** the rare sale under reverse charge (**Reverse charge** on the invoice) charges no GST, and is reported with `RegRev Y`.

## Which credit you can claim

- **Blocked** lines (s.17(5): food, personal vehicles, works contracts…) and **ineligible** ones never reach input GST. Their GST is part of the cost. 3B reports them as reversed.
- **Capital goods** go to fixed assets, and their credit is shown separately.
- **Credit comes from GSTR-2B:** a bill's credit is claimed in the month its line matched in GSTR-2B ([21](21-gst-returns.md#gstr-2b-matching-your-bills)), not the month of the bill.
- **180 days unpaid:** a bill still unpaid 180 days after its date has its credit reversed by a daily job. The bill shows **Input tax credit reversed on …**. It is claimed again once paid.

## Credit and debit notes without goods

**Sales › Credit notes** and **Sales › Debit notes**, and the same under **Purchases**, raise a note for a discount, a price change or a tax correction, with no stock movement:
1. Pick the invoice or bill it is against, or type the original number and date for one from outside the app.
2. Pick a **Reason**.
3. Enter the lines.

- **Limit:** a note can't take more than the source's value, less earlier notes (`NOTE_EXCEEDS_SOURCE`).
- **Time limit:** a credit note is refused after 30 November following the year of the invoice (s.34(2), `NOTE_TIME_BARRED`).
- **Effect:** a credit note settles the invoice's outstanding; a debit note adds to it. Both go to GSTR-1 as CDNR or CDNUR.

## Reimbursements (pure agent, Rule 33)

You pay something on a customer's behalf, such as port charges or a government fee, and recover exactly that:
1. Record the expense with **Billable** on and, under **Bill to**, the customer.
2. On their next invoice, the panel **billable expenses to recover** lists it. Tap **Add**. The line is **Reimbursement at cost**: no GST, outside the taxable value, and shown separately on the invoice and in GSTR-1.

- **Recovered once:** an expense can be recovered only once (`EXPENSE_ALREADY_RECOVERED`).
- **Credit warning:** if credit was claimed on the expense, the panel warns you. A pure agent pays in the customer's name and doesn't claim the credit.

## GST on advances for services

When a customer pays before you invoice a service, GST is due on the advance when it arrives (s.13(2)):
1. On **Record payment**, with money left over after the invoices, turn on **Advance for services**.
2. Pick the **GST rate** and **Place of supply**. The screen shows the GST inside the amount received.

- **Taking the tax back:** when you raise the invoice and apply the advance to it, the advance's tax is taken back on the invoice's date. The invoice then carries the full tax.
- **Where it is reported:** GSTR-1 table 11 (11A received, 11B adjusted) and 3B 3.1(a).
- **Goods:** advances for goods carry no GST (notification 66/2017), so leave the switch off.
- **Refunds:** refunding an advance isn't built yet. Edit the receipt instead, and its tax follows.

## Paying micro and small suppliers on time

Under the MSMED Act (s.15), a bill from a micro or small enterprise must be paid by the agreed day:
- The agreed day can't be more than 45 days after the bill.
- With no agreement, it is 15 days. A supplier's payment terms count as the agreement.
- Medium enterprises are outside the rule.

- **Reports › MSME payments due** lists their unpaid bills with the due date, days left or days late, and the interest the law adds once late. That is three times the RBI bank rate, compounded monthly, shown for information.
- **Not paid in time this year** lists, for your CA, what can't be deducted this year under Income-tax Act s.43B(h).
- **Reminders:** a daily reminder notifies the business a week before a bill's due date, and once it is late.

---

**Related:** [19 Books](19-books.md) · [21 GST returns](21-gst-returns.md) · [07 Payments](07-payments.md) · [08 Customers & suppliers](08-contacts.md)
