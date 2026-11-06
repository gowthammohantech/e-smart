# 11 — GST compliance: e-invoice, e-way bill, GSTR-1

This chapter covers the GST portal work: reporting invoices to the e-invoice portal (IRP) to get an **IRN**, raising **e-way bills** for goods on the move, and preparing **GSTR-1**.

- **Plan:** every plan, including Free.
- **Roles:**
  - Generating or cancelling an IRN, and raising, updating, extending or cancelling an e-way bill: **owner, admin or accountant**. Sales and viewer users get a permission error from the server.
  - Changing the compliance settings and portal logins: **owner or admin**.
- **Connection:** every portal action needs the internet. Offline, you see **Connect to the internet to reach the GST portal, then try again.**

Where to find it:
- 📱 **GST** tab (sales plans), or **More › Data & compliance › GST compliance** (full plans).
- 🖥 **Compliance › GST** in the sidebar.
- On any invoice or delivery note: the **E-invoice** and **E-way bill** sections of its detail screen.

> **Before go-live:** the GST portal connection (GSP) has been built but not yet certified against the government sandboxes. In the demo and development environments, IRNs and e-way bill numbers come from a simulator. See [18](18-troubleshooting-faq.md#not-available-yet).

---

## Set up compliance

### Turn on e-invoicing and e-way bills, and set the thresholds

**Goal:** tell the app when e-invoicing and e-way bills apply to your business.
**Who / plan:** owner or admin · any plan.

**Steps**
1. Open **More › Data & compliance › E-invoicing & e-way bill**. On the GST tab, use **Settings**.
2. Under **E-invoice**:
   - **Report invoices to the portal**: on or off. B2B invoices and credit notes get an IRN and a signed QR.
   - **Report on finalising**: generate the IRN as soon as an invoice is issued, without asking.
   - **Aggregate annual turnover**: what the business turns over in a year across all its registrations, for example ₹8.4 crore for Vertex Traders.
   - **Mandatory above**: the turnover threshold. The default is ₹5 crore, which has applied since August 2023.
   - **Reporting window**: the portal refuses an invoice older than this many days. The default is 30 days.
3. Under **E-way bill**:
   - **Raise e-way bills**: for goods moving on an invoice or a delivery note.
   - **Raise on finalising**: only possible when the defaults are enough to fill Part-B. Road consignments still need a vehicle number, so you will be asked for it.
   - **Required above**: the default is ₹50,000. Some states set a higher figure for movement within the state.
   - **Default mode**, **Default cargo**, **Default transporter** and **Default distance**: these prefill new bills.
4. Tap **Save**. You see **Compliance settings saved**.

**What happens:** **Where things stand** shows **Reported invoices**, **Rejected or unreported** and **Active e-way bills**.

### Save your portal logins

**Goal:** let the app talk to the government portals on your behalf.

**Steps**
1. On the same screen, open **Portal credentials**. The e-invoice (IRP) and e-way bill portals have separate logins, which need not match, so each is entered on its own tab.
2. Enter the **E-invoice portal username** and **E-invoice portal password**. Tap **Save credentials**.
3. Tap **Test connection**. You see **Connected.** or **Could not sign in to the portal.**
4. Repeat steps 2–3 for the **E-way bill portal username** and **password**.

**Rules & gotchas**
- Logins are **stored encrypted on the server and never shown again**.
  - The screen shows **Connected as …** once saved.
  - To keep a saved password, leave the field blank. Type a new one to replace it.
- The GSP's own client ID and secret belong to the server and are never asked for here.

### Add your transporters

**More › Data & compliance › Transporters** (owner, admin or accountant).
- **Add a transporter:** a **Name** and a **Transporter ID**, which is a 15-character GSTIN, or a TRANSIN if the carrier isn't registered. **Phone** is optional.
- An invalid ID shows **Transporter ID must be a valid 15-character GSTIN or TRANSIN**.
- Saved transporters become a pick-list on Part-B, so you don't retype them.

*Example:* Konkan Roadlines, `27AABCT5512M1Z6`, the Vertex Traders default.

---

## E-invoice (IRN)

### When does a document need an IRN?

A document can be reported only when **all** of these hold:

| Condition | Why it matters |
|---|---|
| **Report invoices to the portal** is on | Otherwise the hub says *"E-invoicing is switched off for this business."* |
| The business is GST-registered and **not** on the composition scheme | Composition dealers are outside e-invoicing |
| Annual turnover is at or above **Mandatory above** | Below the threshold, the document shows *Not applicable* |
| The document is a finalised **invoice** or **sales return** (credit note) | Quotes, orders, delivery notes and purchases are never reported |
| The buyer is registered: B2B, SEZ, or an export | A sale to an unregistered buyer (B2C) is outside e-invoicing |

*Examples:*
- Vertex Traders (₹8.4 crore turnover) invoicing **Kumar Electronics**, which has a GSTIN: needs an IRN.
- The same business invoicing **Galaxy Superstore**, which has no GSTIN: **Not applicable**.
- Aurora Design Studio (₹1.4 crore turnover): **Not applicable** on every invoice.

### Generate an IRN

**Goal:** report a finalised invoice and get its IRN and signed QR.
**Who / plan:** owner, admin or accountant · any plan · online.

**Steps**
1. Open the finalised invoice. Its e-invoice status is **Not reported**.
2. Tap **Generate IRN** on the e-invoice card, or **Generate e-invoice** in the document's actions menu. The **Generate the e-invoice** sheet opens with:
   - **Portal checks**: every rule the portal will apply. If all pass, you see **Every portal check passes.**
   - **What will be reported**: document type, place of supply, lines and invoice value.
   - **The IRN this will produce**, and **The payload sent to the portal** (under **View**).
3. If you see **Fix N problems before reporting**, close the sheet, fix the document and come back. Common problems:
   - a missing or invalid GSTIN, on your side or the buyer's;
   - a line without HSN/SAC. From ₹5 crore turnover, HSN must be 6 digits;
   - a document number longer than 16 characters;
   - a place of supply that doesn't match the IGST vs CGST/SGST split;
   - totals that don't add up within ₹1.
4. Tap **Generate IRN**.

**What happens**
- You see **IRN generated**, and the status changes to **IRN generated**.
- **Ack No.** and **Ack date** appear. **Copy IRN** copies the number (you see **IRN copied**).
- The IRN, Ack No. and signed QR are printed on the invoice PDF.
- If the portal refuses the invoice, you see **The portal refused the invoice**, the status becomes **Rejected**, and the reasons are listed. Fix them and generate again. Rejected invoices also show on Home under **Needs your attention**.

**Rules & gotchas**
- **Keep numbers to 16 characters.** `INV/2026-27/0042` (exactly 16 characters) is fine. Adding a branch code, as in `INV/MUM/2026-27/0042` (20 characters), is too long for the portal. **Settings › Document numbering** warns you: *"Longer than 16 characters — the e-invoice portal will reject this number."*
- An invoice older than the **Reporting window** is refused by the portal.
- With **Report on finalising** on, step 2 happens automatically when you finalise.

### Cancel an IRN

**Goal:** withdraw a reported invoice, for example because it was a duplicate or had a data entry mistake.
**Who / plan:** owner, admin or accountant · **within 24 hours of the IRN being generated.**

**Steps**
1. Open the invoice. Its e-invoice section shows **Cancellable until 〈date, time〉**.
2. Tap **Cancel IRN**.
3. Pick a **Reason**: **Duplicate**, **Data entry mistake**, **Order cancelled** or **Other**. **Other** needs a **Remark** ("Say what happened").
4. Read the warning and confirm with **Cancel the IRN**.

**What happens**
- You see **IRN cancelled**, and the status changes to **IRN cancelled**.
- The document number **cannot be used again this financial year**. Raise a fresh invoice instead.

**Rules & gotchas**
- **After 24 hours, an IRN can't be cancelled.** Issue a sales return (credit note) instead ([05](05-sales.md)).
- **Order matters:**
  1. Cancel any active e-way bill on the invoice. Until you do, you see *"Cancel e-way bill 〈number〉 before cancelling the IRN"*.
  2. Cancel the IRN.
  3. Cancel the invoice in the books.

---

## E-way bill

### When is an e-way bill required?

A document needs one when **all** of these hold:
- **Raise e-way bills** is on.
- The document is a finalised **invoice** or **delivery note**.
- The document carries **goods**. Services never need one, so an invoice for only *On-site Installation* doesn't.
- Its value is **above the threshold** (default ₹50,000).

The document's e-way bill status shows one of: **Not applicable**, **Not required**, **Not raised**, **Raised**, **Cancelled** or **Expired**.

### Raise an e-way bill

**Goal:** generate the e-way bill before the goods leave.
**Who / plan:** owner, admin or accountant · any plan · online.

**Steps**
1. Open the finalised invoice or delivery note and tap **Generate e-way bill**, on the e-way bill card or in the actions menu. If an earlier bill on this document was cancelled or has expired, the button reads **Raise a new e-way bill**. Once a bill exists, the actions menu offers **View e-way bill**.
2. Check the **Supply** section: **Document type**, **Sub-supply type** (**Supply**, **Export**, **Job work**, **Sales return**, …), **Taxable value**, **Total value** and **Main HSN**.
3. Check **From** and **To**: **Legal name**, GSTIN, **Address**, **Place**, **PIN code**, **State**, **Despatch state** and **Delivery state**.
   - For an unregistered party, enter **URP** in place of the GSTIN.
4. Fill in **Transport**:
   - **Mode**: **Road**, **Rail**, **Air** or **Ship**.
   - **Cargo**: **Regular** or **Over-dimensional**.
   - **Approximate distance** in km. The maximum is 4,000 km.
   - **Saved transporter**: pick one, or type the **Transporter name** and **Transporter ID**.
   - For road: the **Vehicle number**, for example `MH12AB1234`. Spaces are removed and letters are capitalised for you.
   - For rail, air or ship: the **Transport document number** (railway receipt, airway bill or bill of lading) and the **Transport document date**.
5. Check the validity preview, for example **2 days · valid to 〈date〉**.
6. Tap **Generate e-way bill**.

**What happens**
- You see **E-way bill generated**. The bill gets an **E-way bill number**, **Valid from** and **Valid until**.
- The number is printed on the invoice PDF, and the bill appears in the compliance register.

**How validity is worked out**

| Cargo | Validity |
|---|---|
| Regular | 1 day per 200 km or part of it: 200 km → 1 day, 201 km → 2 days, 640 km → 4 days |
| Over-dimensional | 1 day per 20 km or part of it |

Validity always ends at **midnight** (rule 138(10)).

*Example:* Mumbai → Bengaluru, Kumar Electronics, ~980 km, road, regular cargo. That is 5 days, ending at midnight on the fifth day.

### Update Part-B (change of vehicle)

**When:** the vehicle changes because of a breakdown, a transhipment or a fresh carrier.
**Allowed:** only while the bill is **Active**.

**Steps**
1. Open the e-way bill. In the register, tap it under **E-way bills**.
2. Tap **Update Part-B**.
3. Choose a **Reason**: **First time**, **Vehicle breakdown**, **Transhipment** or **Others**.
4. Enter the new **Vehicle number**, or the transport document; **Leg starts from** (where this leg begins); and a **Remark**.
5. Tap **Save Part-B**. You see **Part-B updated**.

Each update is **added** to the bill's **History**; earlier legs are never overwritten.

### Extend validity

**When:** the goods are still moving and the bill is about to run out.
**Allowed:** only from **8 hours before** expiry to **8 hours after**. The screen shows when this window opens and closes.

**Steps**
1. Open the bill and tap **Extend**.
2. Choose a **Reason**: **Natural calamity**, **Law and order situation**, **Transhipment**, **Accident** or **Other**.
3. Enter the **Distance still to cover**, **Where the goods are now** (place and **PIN code**) and whether the goods are **In movement** or **In transit**.
4. Tap **Extend validity**. You see **Validity extended**.

The new validity is worked out from the **distance still to cover**, counted from now. The original journey doesn't count.

### Cancel an e-way bill

**Allowed:** within **24 hours** of raising it, and only if it hasn't already been verified in transit. The screen tells you the deadline.

**Steps**
1. Open the bill and tap **Cancel this bill**.
2. Choose a **Reason**: **Duplicate**, **Order cancelled**, **Data entry mistake** or **Other**.
3. Confirm with **Cancel the bill**.

**What happens**
- You see **E-way bill cancelled**, and the bill shows **Cancelled on 〈date〉**.
- Goods already in transit must not move against a cancelled bill. Raise a new one if they have to move.
- An invoice with an active e-way bill can't be cancelled in the books until the e-way bill is cancelled first.

---

## The compliance register

**GST** tab or **GST compliance**. It has two tabs:

| Tab | What it shows | Filters | Search |
|---|---|---|---|
| **E-invoices** | Every reportable invoice and credit note | **All**, **Reported**, **Not reported**, **Rejected**, **Cancelled** | **Invoice, party or IRN** |
| **E-way bills** | Every bill, with time left: **3 h left**, **expired 2 days ago** | **All**, **Active**, **Expired**, **Cancelled** | **Bill number, document or party** |

- A banner warns you when **N e-way bills expire within 24 hours**. Extend them if the goods are still moving.
- Home's **E-way bills** tile and **Needs your attention** list show the same warning.

*Demo:* Vertex Traders has seven e-way bill cases for practice: active, expiring soon, expired, cancelled, over-dimensional multi-leg, rail and regenerated.

---

## GSTR-1

**Goal:** see your outward supplies grouped the way the GSTR-1 return wants them, and export them.
**Who / plan:** any role can view it · any plan.

**Steps**
1. Open **GST › GSTR-1**, or **More › Data & compliance › GSTR-1**.
2. Pick the period. The default is **This month**; you can also filter by **Branch**.
3. Switch between the tables:

| Table | What goes in it |
|---|---|
| **B2B** | Invoices to registered buyers |
| **B2CL** | Large inter-state sales to unregistered buyers |
| **B2CS** | Small sales to unregistered buyers, consolidated. Credit notes show as negatives. |
| **EXP** | Exports |
| **CDNR** | Credit notes (sales returns) to registered buyers |
| **CDNUR** | Credit notes to unregistered buyers |
| **NIL** | Table 8: nil-rated, exempt and non-GST supplies |
| **HSN** | Table 12: quantities and values rolled up by HSN |
| **DOCS** | Table 13: documents issued in the period, by numbering series, with cancelled and net counts |

4. Use **Export** to download the current table as **PDF**, **Excel (.xlsx)** or **CSV**. The exported file keeps the English column names of the GSTN offline tool, so it lines up with what the portal expects.

**Rules & gotchas**
- The app **prepares** GSTR-1; you **file** it on the GST portal. GSTR-3B and annual returns are outside the product.
- Drafts and cancelled documents are left out.
- **Credit note deadline:** a sales return dated after 30 November following the invoice's financial year shows **Past the GST credit note deadline**. This is a warning only; the return is still saved.

---

**Related:** [05 Sales](05-sales.md) · [13 Settings › Numbering](13-settings.md#document-numbering) · [12 Reports › Tax summary](12-reports.md) · [18 Troubleshooting](18-troubleshooting-faq.md)
