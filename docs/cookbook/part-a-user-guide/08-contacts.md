# 08 — Customers & suppliers

Contacts live in **People** (📱 under **More** on full plans). There are two lists:
- **Customers**: who you sell to. On every plan.
- **Suppliers**: who you buy from. Smart Pro and above. On a sales plan the hub is titled **Customers**: *Who you sell to*.

You don't have to add contacts first: you can create one from inside a document with **Add new customer** or **Add new supplier**.

---

### 8.1 Add a customer

**Goal:** Save a customer's details so they fill into every document.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. Start from **People › Customers › Add contact**, **Home › Add customer**, or **Add new customer** in the editor.
2. **Business details**:
   - **Customer name** (required).
   - **Contact person**: *Who you deal with*.
   - **GST registration**: Regular, Composition scheme, Unregistered, SEZ unit or developer, or Overseas.
   - **GSTIN**: *Leave blank for unregistered contacts.*
3. **Phone** and **Email**.
4. **Billing address**: **Address**, **City**, **State** and PIN.
   - *Decides whether IGST or CGST + SGST applies on their documents.*
   - Leave **Shipping address is the same** on, or turn it off and enter a separate **Shipping address**.
5. **Trading terms**:

   | Field | Notes |
   |---|---|
   | **Currency** | For overseas buyers, e.g. AED (Pro and above) |
   | **Payment terms** | **Due on receipt**, or a number of days. Sets the default due date on their invoices. |
   | **Credit limit** | *Optional. Used to warn you before invoicing beyond it.* |
   | **Opening balance** | *What they already owed you when you started.* |

6. **Notes and status**: internal **Notes**, and **Active**.
7. Save. You see *Customer added*.

**Rules & gotchas: GSTIN**

| Registration type | GSTIN |
|---|---|
| Regular, Composition, SEZ | **Required**: *Enter the GSTIN for a registered party* |
| Unregistered, Overseas | **Not allowed**: *An unregistered or overseas party has no GSTIN* |

- The GSTIN must have the right shape and pass its check digit.
- Its first two digits must match the **State** you enter. Otherwise you see *This GSTIN is registered in Karnataka, not the state below*.
- *SEZ and overseas buyers are reported differently on e-invoices.* Invoices to unregistered buyers (B2C) never need an e-invoice.

### 8.2 Add an overseas customer

**Example:** Harbour Supplies FZE, Dubai.
1. Set **GST registration** to **Overseas**. The GSTIN field goes away.
2. Choose the **Country** (required), and fill in **State / province / region** and **Postal code**.
3. Set **Currency** to **AED**.

*Place of supply is 'other country': invoices to them are exports.* See [05 — Sales](05-sales.md), on foreign-currency invoices.

### 8.3 Add a supplier

**Who / plan:** Owner, Admin, Accountant or Sales, on Smart Pro and above.

Use **People › Suppliers › Add contact**, or **Add new supplier** in a purchase document. The form is the same as for a customer, except that the opening balance is *What you already owed them when you started.* You see *Supplier added*.

---

### 8.4 View a contact

Tap a contact to see what they owe and their history. The summary shows:
- **Owes you** (or what you owe a supplier)
- **N open**
- **N overdue**
- **Total invoiced** / **Total purchased**

The four tabs:

| Tab | What it shows |
|---|---|
| **Open** | Unpaid documents, with *12d overdue · ₹4,500 left* |
| **Documents** | Everything raised for them: invoices, bills, returns |
| **Payments** | Their payments |
| **Details** | Their saved details. *Not registered* shows when they have no GSTIN. |

**Actions:**
- **Call**
- **Send payment reminder**
- **Record payment** / **Pay**
- **New invoice** or **New quotation** for a customer; **New purchase bill** for a supplier
- **Edit contact**
- **Delete contact**

### 8.5 Edit or deactivate a contact

**Edit contact**, change the fields, then save. You see *Customer updated*.

**Active** off: *Inactive contacts stay in your records but are hidden from pickers.* In the demo, Zenith Corporate is inactive. The list labels inactive contacts **Inactive**, and settled ones **Settled**.

### 8.6 Delete a contact

**Who:** Owner or Admin.

Go to **Actions › Delete contact**, then **Delete 〈name〉?** *Their documents stay in your books, but the contact is removed from your list.* This can't be undone.

If you might deal with them again, deactivate them instead (8.5).

### 8.7 Search contacts

Use **Search customers** or **Search suppliers** at the top of each list. Each row shows *₹… receivable* or *₹… payable*.
