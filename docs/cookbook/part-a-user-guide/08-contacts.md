# 08 — Customers & suppliers

Contacts live in **People**. The hub is titled **Contacts** (*Customers and suppliers*) and has three lists:
- **Customers**: who you sell to. On every plan.
- **Suppliers**: who you buy from. Smart Pro and above.
- **Other**: contacts with no account, such as a landlord, auditor or transporter. They never appear on invoices, bills or payments.

On a sales plan (Free, Smart Basic) the hub is titled **Customers** (*Who you sell to*) and shows only the customer list.

Where to find it: 📱 **More › More sections › People**. 🖥 **People** in the sidebar.

A contact can also be **Both**: a customer and a supplier on one account. It shows in the Customers list and in the Suppliers list.

You don't have to add contacts first: you can create one from inside a document with **Add new customer** or **Add new supplier**.

---

### 8.1 Add a customer

**Goal:** Save a customer's details so they fill into every document.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. Start from **People › Customers**, then tap **New customer** (the + button). You can also use **Home › Add customer**, or **Add new customer** in a document editor.
2. Choose the type at the top: **Customer**, **Supplier**, **Both** or **Other**. The hint under it says what each means. Supplier and Both need Smart Pro.
3. **Business details**:
   - **Customer name** (required).
   - **Contact person**: *Who you deal with*.
   - **GST registration** (required): **Regular**, **Composition scheme**, **Unregistered**, **SEZ unit or developer**, or **Overseas**.
   - **GSTIN**: shown for Regular, Composition and SEZ. Spaces and dashes you paste are dropped. The first two digits fill in the **State** if it is still blank.
   - **Phone** and **Email**.
4. **Billing address**: **Address**, **State** (*Decides whether IGST or CGST + SGST applies on their documents.*), **City** and PIN.
   - Leave **Shipping address is the same** on, or turn it off and enter a **Shipping address** and **Shipping city**.
5. **Trading terms**:

   | Field | Notes |
   |---|---|
   | **Currency** | For buyers billed in another currency, e.g. AED |
   | **Payment terms** | **Due on receipt**, or 7, 15, 21, 30, 45, 60 or 90 days. Sets the default due date on their invoices. |
   | **Credit limit** | Customers and Both only. *Optional. Used to warn you before invoicing beyond it.* See 8.9. |
   | **Opening balance** | *What they already owed you when you started.* Then choose **They owe you (Dr)** or **You owe them (Cr)**. Turn on **Opening balance as on a date** to give it a date (*Off: it stands at the start of your books.*). |
   | **PAN** | *Needed for TDS. Filled from the GSTIN when left blank.* Not asked for overseas contacts. |
   | **Collect TCS on sales** | Customers and Both. Turn it on and pick the **TCS section**. See [20](20-tds-rcm-itc.md). |

6. Your business's **custom fields** for contacts, if any, appear next (see 8.10).
7. **Notes and status**: internal **Notes**, and **Active**.
8. Tap **Add customer**. You see *Customer added*, and the contact opens.
   - 🖥 **Save & add another** (Shift+Ctrl+S) saves and clears the form for the next one. It keeps the currency, payment terms and state.

**What happens**
- The contact gets the next code in its series: `C-001` for customers, `S-001` for suppliers, `B-001` for Both, `G-001` for Other.
- An opening balance is posted to the books and shows in their balance and in aging.

**Rules & gotchas: GSTIN**

| Registration type | GSTIN |
|---|---|
| Regular, Composition, SEZ | **Required**: *Enter the GSTIN for a registered party* |
| Unregistered, Overseas | **Not allowed**: *An unregistered or overseas party has no GSTIN* |

- The GSTIN must have the right shape (*GSTIN should look like 27AABCV1234F1ZO*) and pass its check digit (*This GSTIN fails its check digit — look for a typo*).
- Its first two digits must match the **State**. Otherwise you see *This GSTIN is registered in Karnataka, not the state below*.
- The PIN code must be six digits and belong to the state: *PIN code 560001 is in Karnataka, not Maharashtra. Check the PIN code or the state.*
- *SEZ and overseas buyers are reported differently on e-invoices.* Invoices to unregistered buyers (B2C) never need an e-invoice.
- An opening balance date can't be in the future, and can't fall in a closed period.

### 8.2 Fill a contact from its GSTIN

Type all 15 characters of a valid GSTIN. The app looks it up on the GST portal (*Fetching the registered details…*) and fills in the registered name, GST type, address, state, city and PIN.

| Hint under the GSTIN | Meaning |
|---|---|
| *Verified on the GST portal, and its details filled in* | Found and filled. Check the details. |
| *Cancelled on the GST portal* (or another status) | The registration isn't active. |
| *The GST portal has no taxpayer with this GSTIN* | Not found. |
| *Couldn't reach the GST portal; fill the details in yourself* | The lookup isn't connected or didn't answer. Type the details. |

Opening an existing contact to edit it doesn't look the GSTIN up again; typing a different one does.

### 8.3 Add an overseas customer

**Example:** Harbour Supplies FZE, Dubai.
1. Set **GST registration** to **Overseas**. The GSTIN and PAN fields go away.
2. Choose the **Country** (required: *Choose the country*), and fill in **State / province / region**, **City** and **Postal code**.
3. Set **Currency** to **AED**.

*Place of supply is 'other country': invoices to them are exports.* See [05 — Sales](05-sales.md), on foreign-currency invoices.

### 8.4 Add a supplier

**Who / plan:** Owner, Admin, Accountant or Sales, on Smart Pro and above.

Use **People › Suppliers › New supplier**, or **Add new supplier** in a purchase document. The form is the same as for a customer, with these differences:
- No credit limit and no TCS.
- The opening balance is *What you already owed them when you started.*
- Extra supplier fields:
  - **MSME (Udyam) registration**: **Not registered**, **Micro**, **Small** or **Medium**, and the **Udyam number**. *Bills from a micro or small enterprise must be paid within 45 days.*
  - **Bills are under reverse charge**: for a goods transport agency or an advocate, for example.
  - **TDS section**, and a **Lower deduction certificate (s.197)** with its **Certificate rate (%)** and **Valid till** date.

Tap **Add supplier**. You see *Supplier added*. TDS, reverse charge and MSME are explained in [20](20-tds-rcm-itc.md).

### 8.5 Add another contact (landlord, auditor, transporter)

**People › Other › New contact**. Choose **Other**: *A contact only, such as a landlord, auditor or transporter. Not on invoices, bills or payments.* An Other contact has no payment terms and no opening balance.

---

### 8.6 View a contact

Tap a contact. The header shows its code, **Inactive** if it is, and its currency if it isn't yours. Shortcuts under it: **Call**, **WhatsApp**, **Email**, and **Invoice** (customer) or **Bill** (supplier).

The summary shows:
- **Owes you** (customer) or **You owe** (supplier), with *N open · N overdue*
- **You owe them**, for a contact that is Both
- **Total invoiced** / **Total purchased**, with the number of documents

The tabs:

| Tab | What it shows |
|---|---|
| **Open** | Unpaid documents, e.g. *12d overdue · ₹4,500 left*. *All settled* when nothing is owed. |
| **Documents** | Quotations, sales orders, invoices and returns (or purchase orders, goods receipts, bills and returns), each with **See all** |
| **Payments** | Their payments |
| **Details** | Saved details. *Not registered* shows when they have no GSTIN. (📱 phone only; on a desktop the details sit beside the tabs.) |

**Receive payment** (customer) or **Pay supplier** (supplier) records a payment against them ([07](07-payments.md)).

**Actions:**
- **Edit contact**
- **Statement of account** (8.8)
- **New invoice**, **New quotation** and, when something is owed, **Send payment reminder** (customer)
- **New purchase bill** (supplier); a contact that is Both has **New purchase bill** and **Pay supplier** too
- **Delete contact**

An **Other** contact has no payments, documents or invoice shortcuts.

### 8.7 Edit or deactivate a contact

**Edit contact**, change the fields, then tap **Save changes**. You see *Customer updated* or *Supplier updated*.

- A customer or supplier can be changed to **Both**. Once it has transactions it can't switch between customer and supplier: *A party with transactions cannot switch between customer and supplier; make it both instead*.
- If the contact's opening balance comes from opening invoices or bills ([26](26-imports-and-opening-balances.md)), you can't also type an opening balance.

**Active** off: *Inactive contacts stay in your records but are hidden from pickers.* In the demo, Zenith Corporate is inactive. The list labels inactive contacts **Inactive**, settled ones **Settled**, and those who paid ahead *₹… in advance*.

🖥 On a desktop you can tick several contacts in the list and use **Deactivate** or **Export CSV**.

### 8.8 Send a statement of account

**Goal:** Show a customer or supplier every document, payment and voucher between two dates, with the running balance.

**Steps**
1. Open the contact, then **Actions › Statement of account**.
2. Set **From** (defaults to the start of the financial year) and **To** (today).
3. The statement shows *Opening on 〈date〉*, each line marked Dr or Cr, and *Balance on 〈date〉*. A balance in their favour is marked *advance*.
4. Tap **Download PDF**. You see *Statement downloaded* (🖥) or *Statement ready* (📱, to share).

*Nothing in this period* means there were no documents, payments or vouchers between the dates.

### 8.9 Credit limits

When an invoice would take a customer past their **Credit limit**, issuing it shows **Credit limit exceeded**: *Kumar Electronics has a credit limit of ₹10,000. With this invoice they would owe ₹12,400.* Tap **Continue anyway** to issue it, or go back. What they owe counts every open invoice plus this one. Only invoices are checked. See [05](05-sales.md).

### 8.10 Custom fields on contacts

An owner or admin can add your own fields, such as a drug licence number, under **More › Account › Custom fields** (entity **Contacts**). They appear on the contact form; required ones must be filled before saving. Fields marked **Printed on documents** print on the PDFs of documents to that contact. See [13](13-settings.md).

### 8.11 Delete a contact

**Who:** Owner or Admin.

Go to **Actions › Delete contact**, then confirm **Delete 〈name〉?**.

**Rules & gotchas**
- Only a contact nothing points at can be deleted. If it has documents, payments, expenses, e-way bills, vouchers or an opening balance, the server refuses: *This party has documents; mark it inactive instead*. Deactivate it instead (8.7).
- The confirmation says *Their documents stay in your books…*, but a contact with documents can't be deleted at all.

### 8.12 Search contacts

Use **Search customers**, **Search suppliers** or **Search contacts** at the top of each list. It matches name, code, contact person, email, phone and GSTIN. The line under the search shows the count and *₹… receivable* or *₹… payable* for the whole list.

🖥 On a desktop the list is a table with tiles for **To receive** / **To pay**, **Overdue** and **Advances**.

### 8.13 Import contacts from a spreadsheet

**Goal:** Bring in your customers and suppliers from Excel, Google Sheets, Tally or another app.
**Who / plan:** Owner, Admin or Accountant. Suppliers and Both need Smart Pro.

**Steps**
1. On **People**, tap **Import**.
2. Choose **Type for rows that do not say**: **Customer**, **Supplier**, **Both** or **Other**.
3. 🖥 **Choose a file** (a `.csv`), then **Match the columns**: each field (**Name** is required) is matched to a column by its heading, and you can change any match. Then **Check and import**.
   📱 Tap **Choose CSV file** or paste the CSV into **Or paste the CSV here**.
4. Tap **Check**. The server checks every row without saving: **Ready**, **Already there** or **Fix** with the reason.
5. Tap **Import N**. You see *N contacts imported* and *N left out*.

**Rules & gotchas**
- Columns read: Name, Display name, Code, Type, GSTIN, PAN, Email, Phone, Address, Address line 2, City, State, PIN code, Country, Opening balance, Dr/Cr, Credit limit, Credit days, Notes.
- A row is **Already there** when a contact has the same GSTIN or the same name (any case). It is left out.
- Up to 1,000 rows at a time: *Up to 1,000 at a time; split the sheet.*
- Nothing is saved until you import.

The full imports chapter, including opening invoices and bills, is [26 — Imports & opening balances](26-imports-and-opening-balances.md).

---

**Related:** [05 Sales](05-sales.md) · [06 Purchases](06-purchases.md) · [07 Payments](07-payments.md) · [20 TDS, reverse charge & credit](20-tds-rcm-itc.md) · [26 Imports](26-imports-and-opening-balances.md)
