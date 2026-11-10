# 11 — GST compliance: e-invoice, e-way bill, GSTR-1

This chapter covers the GST portal work done document by document: reporting invoices and notes to the e-invoice portal (IRP) to get an **IRN**, raising **e-way bills** for goods on the move, and preparing **GSTR-1**. GSTR-2B, GSTR-3B, the set-off and filing are in [21](21-gst-returns.md).

- **Plan:** every plan, including Free.
- **Roles:**
  - Generating or cancelling an IRN, and raising, updating, extending or cancelling an e-way bill: **owner, admin or accountant**. Sales and viewer users get a permission error from the server.
  - Adding transporters and vehicles: **owner, admin or accountant**.
  - Changing the compliance settings and portal logins: **owner or admin**.
  - Viewing GSTR-1: any role.
- **Connection:** every portal call runs on the server. If the connection drops while you ask, you see **Connect to the internet to reach the GST portal, then try again.**

Where to find it:
- 📱 Sales plans (Free, Basic): the **GST** tab. Its tiles open **GSTR-1**, **GST returns** and **GST & e-invoicing** (the setup), with the compliance register below them.
- 📱 Full plans (Pro, Business): **More**, under **GST**: **GST compliance**, **GSTR-1**, and the returns pages of [21](21-gst-returns.md).
- 🖥 The **GST** section of the sidebar. **Compliance** holds **GST compliance**; **Returns** holds **GSTR-1** and the rest.
- On any invoice, credit note, debit note, sales return or delivery note: the **Compliance** section of its detail screen, with its **E-invoice** and **E-way bill** cards.
- Settings: **More › GST & e-invoicing** (🖥 **Settings › GST & e-invoicing**) holds **GST portal connection**, **E-invoicing & e-way bill** and **Transporters**. The **Settings** button on the compliance register opens **E-invoicing & e-way bill**.

> **Before go-live:** the e-invoice and e-way bill connection (GSP) has been built but not yet certified against the government sandboxes. In the demo and development environments, IRNs and e-way bill numbers come from a simulator. See [18](18-troubleshooting-faq.md#not-available-yet).

---

## Set up compliance

### Turn on e-invoicing and e-way bills, and set the thresholds

**Goal:** tell the app when e-invoicing and e-way bills apply to your business.
**Who / plan:** owner or admin · any plan.

**Steps**
1. Open **More › GST & e-invoicing › E-invoicing & e-way bill**. From the compliance register, tap **Settings**.
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
   - **Default transporter**, **Default distance**, **Default mode** and **Default cargo**: these prefill new bills. The transporter list comes from **Transporters**; with none saved, the field says to add them there first.
4. Tap **Save**. You see **Compliance settings saved**.

**What happens:** **Where things stand** shows **Reported invoices**, **Rejected or unreported** and **Active e-way bills**.

### Save your portal logins

**Goal:** let the app talk to the e-invoice and e-way bill portals on your behalf.
**Who / plan:** owner or admin · any plan.

**Steps**
1. On the same screen, open **Portal credentials**. The e-invoice (IRP) and e-way bill portals have separate logins, which need not match, so each has its own tab: **E-invoice** and **E-way bill**.
2. Enter the **E-invoice portal username** and **E-invoice portal password**. Tap **Save credentials**. You see **Credentials saved. They are encrypted on the server and never shown again.**
3. Tap **Test connection**. You see **Connected.** or **Could not sign in to the portal.**
4. Repeat steps 2–3 on the **E-way bill** tab with the **E-way bill portal username** and **password**.

**Rules & gotchas**
- Logins are **stored encrypted on the server and never shown again**.
  - The tab shows **Connected as …** once saved, or **Not connected yet. Enter the login and save it.**
  - To keep a saved password, leave the field blank. Type a new one to replace it.
  - **Test connection** with nothing saved says **Enter the portal username and password first.**
- The GSP's own client ID and secret belong to the server and are never asked for here.
- This login is for e-invoices and e-way bills only. GSTR-2B and filing use your own GST portal session, connected under **GST portal connection** ([21](21-gst-returns.md#connect-to-the-gst-portal)).

### Add your transporters

**More › GST & e-invoicing › Transporters** (owner, admin or accountant).
- **Add a transporter:** a **Name** and a **Transporter ID**, which is a 15-character GSTIN, or a TRANSIN if the carrier isn't registered. **Phone** is optional.
- An invalid ID shows **Transporter ID must be a valid 15-character GSTIN or TRANSIN**. An ID already saved shows **Another transporter already has this ID**.
- Saved transporters become a pick-list on Part-B, so you don't retype them. Deleting one leaves the bills already raised as they are; it just won't be offered for new ones.

*Example:* Konkan Roadlines, `27AABCT5512M1Z6`, the Vertex Traders default.

**Vehicles** (**More › Business setup › Vehicles**) are a separate list. They tag expenses and documents with the vehicle so you can see what each one costs. The e-way bill's **Vehicle number** is typed on the bill and isn't picked from this list.

### Exports, SEZ supplies and the LUT

**Goal:** zero-rate exports and SEZ supplies without paying IGST.
**Who / plan:** owner or admin · any plan.

1. Open **Business profile** and fill in **LUT number (exports)** and **LUT valid till**.
2. Mark the customer: an overseas buyer, or **SEZ unit or developer** as the GST registration type ([08](08-contacts.md)).
3. On the invoice, an overseas buyer's place of supply is **Other country (export)**.

**What happens**
- With an LUT on file and the invoice dated on or before **LUT valid till**, the editor says **Export or SEZ supply under LUT — zero-rated, no IGST charged.**
- Without one, or once it has run out, IGST is charged and the editor says **Export or SEZ supply — IGST applies. Add an LUT in the business profile to zero-rate it.**
- The e-invoice reports it as **Export with payment of tax** or **Export without payment of tax**, or **SEZ with payment of tax** or **SEZ without payment of tax**. Deemed exports aren't produced.
- GSTR-1 lists exports in **EXP**; GSTR-3B puts them in 3.1(b), zero-rated.

---

## E-invoice (IRN)

### When does a document need an IRN?

A document can be reported only when **all** of these hold:

| Condition | Why it matters |
|---|---|
| **Report invoices to the portal** is on | Otherwise the register says *"E-invoicing is switched off for this business. Turn it on under Settings to report invoices."* |
| The business is GST-registered and **not** on the composition scheme | Composition dealers are outside e-invoicing |
| Annual turnover is at or above **Mandatory above** | Below the threshold, the document shows *Not applicable* |
| The document is a finalised **invoice**, **credit note**, **sales return** or **debit note** | Quotes, orders, delivery notes and purchases are never reported |
| The buyer is registered (B2B), an SEZ, or overseas (export) | A sale to an unregistered buyer (B2C) is outside e-invoicing |

Invoices are reported as `INV`, credit notes and sales returns as `CRN`, and debit notes as `DBN`.

*Examples:*
- Vertex Traders (₹8.4 crore turnover) invoicing **Kumar Electronics**, which has a GSTIN: needs an IRN.
- The same business invoicing **Galaxy Superstore**, which has no GSTIN: **Not applicable**.
- Aurora Design Studio (₹1.4 crore turnover): **Not applicable** on every invoice.

### Generate an IRN

**Goal:** report a finalised invoice or note and get its IRN and signed QR.
**Who / plan:** owner, admin or accountant · any plan.

**Steps**
1. Open the finalised document. Its e-invoice status is **Not reported**.
2. Tap **Generate IRN** on the **E-invoice** card, or **Generate e-invoice** in the document's actions menu. The **Generate the e-invoice** sheet opens with:
   - **Portal checks**: every rule the portal will apply. If all pass, you see **Every portal check passes.** Problems that block are counted (**N blocking**); warnings under **Worth knowing** don't block.
   - **What will be reported**: **Document type**, **Place of supply**, **Lines** and **Invoice value**.
   - **The IRN this will produce**, and **The payload sent to the portal** (under **View**).
3. If you see **Fix N problems before reporting.**, close the sheet, fix the document and come back. Common problems:
   - a missing or invalid GSTIN, on your side or the buyer's;
   - a buyer whose GSTIN state doesn't match their address;
   - a missing address line, city or 6-digit PIN code;
   - a line without HSN/SAC. From ₹5 crore turnover, HSN must be 6 digits;
   - a document number longer than 16 characters;
   - IGST on a supply within the state, or CGST and SGST on one across states;
   - a date in the future, or older than the reporting window;
   - totals that don't add up within ₹1.
4. Tap **Generate IRN**. While it works you see **Generating the IRN…**.

**What happens**
- You see **IRN generated**, and the status changes to **IRN generated**.
- **Ack No.** and **Ack date** appear. **Copy IRN** copies the number (you see **IRN copied**).
- The IRN, Ack No. and signed QR are printed on the PDF.
- If the portal refuses the document, you see **The portal refused the invoice**, the status becomes **Rejected**, and the reasons are listed. Fix them and tap **Try again**. Rejected invoices also show on Home under **Needs your attention**, and as a count beside **GST compliance** in the menu.

**Rules & gotchas**
- **Keep numbers to 16 characters.** `INV/2026-27/0042` (exactly 16 characters) is fine. Adding a branch code, as in `INV/MUM/2026-27/0042` (20 characters), is too long for the portal. **Settings › Document numbering** warns you: *"Longer than 16 characters — the e-invoice portal will reject this number."*
- An invoice older than the **Reporting window** is refused by the portal.
- With **Report on finalising** on, step 2 happens automatically when you finalise.
- **Reimbursements at cost** aren't items on the e-invoice; they travel as other charges, with no HSN. From documents dated **1 December 2026**, freight, packing and similar charges are taxed with the lines and each line's share is sent as its own item.
- **Once an invoice has an IRN it can't be edited**, even if it is the latest in its series. The detail screen says *"Can't edit: it has an IRN (e-invoice)"*.
- **Not available yet:** an invoice that collects **TCS** can't be e-invoiced. The portal checks stop it with *"The document total does not reconcile with its lines"*, because the check leaves the TCS out of the total. Report such an invoice on the IRP directly until this is fixed.

### Cancel an IRN

**Goal:** withdraw a reported document, for example because it was a duplicate or had a data entry mistake.
**Who / plan:** owner, admin or accountant · **within 24 hours of the IRN being generated.**

**Steps**
1. Open the document. Its e-invoice card shows **Cancellable until 〈date〉, 〈time〉**.
2. Tap **Cancel IRN**.
3. Pick a **Reason**: **Duplicate**, **Data entry mistake**, **Order cancelled** or **Other**. **Other** needs a **Remark** ("Say what happened").
4. Read the warning and confirm with **Cancel the IRN**.

**What happens**
- You see **IRN cancelled**, and the status changes to **IRN cancelled**.
- The document number **cannot be used again this financial year**. Raise a fresh invoice instead.

**Rules & gotchas**
- **After 24 hours, an IRN can't be cancelled** ("The 24-hour cancellation window has closed; issue a credit note instead"). Issue a credit note or sales return instead ([05](05-sales.md)).
- **Order matters:**
  1. Cancel any active e-way bill on the document. Until you do, you see *"Cancel e-way bill 〈number〉 before cancelling the IRN"*.
  2. Cancel the IRN. Until you do, cancelling the invoice says *"Cancel the e-invoice (IRN) before cancelling this document"*.
  3. Cancel the invoice in the books.

---

## E-way bill

### When is an e-way bill required?

A document needs one when **all** of these hold:
- **Raise e-way bills** is on.
- The document is a finalised **invoice** or **delivery note**, and isn't cancelled.
- The document carries **goods**. Services never need one, so an invoice for only *On-site Installation* doesn't.
- Its value is **above the threshold** (default ₹50,000). A value exactly at the threshold isn't above it. A foreign-currency document is converted to rupees first.

The document's e-way bill status shows one of: **Not applicable**, **Not required**, **Not raised**, **Raised**, **Cancelled** or **Expired**.

### Raise an e-way bill

**Goal:** generate the e-way bill before the goods leave.
**Who / plan:** owner, admin or accountant · any plan.

**Steps**
1. Open the finalised invoice or delivery note and tap **Generate e-way bill**, on the **E-way bill** card or in the actions menu. If an earlier bill on this document was cancelled or has expired, the button reads **Raise a new e-way bill**. Once a bill exists, the actions menu offers **View e-way bill**.
   - Or, in the register, open **E-way bills › Needs e-way bill** and pick the document.
2. Check the **Supply** section: **Document type**, **Sub-supply type** (**Supply**, **Export**, **Job work**, **For own use**, **Job work returns**, **Sales return**, **Exhibition or fairs**, **Line sales**, **Recipient not known**, **Others**), **Taxable value**, **Total value** and **Main HSN**. **Others** asks you to **Describe the sub-supply**.
3. Check **From** and **To**: **Legal name**, GSTIN, **Address**, **Place**, **PIN code**, **State**, **Despatch state** and **Delivery state**.
   - For an unregistered party, enter **URP** in place of the GSTIN.
4. Fill in **Transport · Part-B**:
   - **Mode**: **Road**, **Rail**, **Air** or **Ship**.
   - **Cargo**: **Regular** or **Over-dimensional**.
   - **Approximate distance** in km. The maximum is 4,000 km.
   - **Saved transporter**: pick one, or type the **Transporter name** and **Transporter ID**.
   - For road: the **Vehicle number**, for example `MH12AB1234`, in capitals with no spaces or hyphens.
   - For rail, air or ship: the **Transport document number** (RR / AWB / BL number) and the **Transport document date**.
5. Check the validity preview, for example **2 days · valid to 〈date〉**. It updates as you change the distance or the cargo.
6. Tap **Generate e-way bill**. While it works you see **Raising the e-way bill…**.

**What happens**
- You see **E-way bill generated**. The bill gets an **E-way bill number**, **Valid from** and **Valid until**.
- The number is printed on the invoice PDF (**E-way bill no.**), and the bill appears in the compliance register.
- If the portal refuses it, you see **The bill could not be raised** with the portal's reason.

**How validity is worked out**

| Cargo | Validity |
|---|---|
| Regular | 1 day per 200 km or part of it: 200 km → 1 day, 201 km → 2 days, 640 km → 4 days |
| Over-dimensional | 1 day per 20 km or part of it |

Validity always ends at **midnight** (rule 138(10)).

*Example:* Mumbai → Bengaluru, Kumar Electronics, ~980 km, road, regular cargo. That is 5 days, ending at midnight on the fifth day.

**Rules & gotchas**
- **An invoice with an e-way bill can't be edited**, even if it is the latest in its series ("Can't edit: it has an e-way bill"). A cancelled bill doesn't count.
- The e-way bill itself can't be printed from the app yet; its number is on the invoice PDF.

### Update Part-B (change of vehicle)

**When:** the vehicle changes because of a breakdown, a transhipment or a fresh carrier.
**Allowed:** only while the bill is **Active**. An expired bill says "The bill has expired"; a cancelled one, "The bill has been cancelled".

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

The new validity is worked out from the **distance still to cover**, counted from now. The original journey doesn't count. History shows **Extended · 〈reason〉**.

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

**GST compliance** (📱 the **GST** tab on sales plans). The header tiles show **Reported** and **Needs attention** for e-invoices, and **Active bills** and **Expiring in 24 h** for e-way bills. It has two tabs:

| Tab | What it shows | Filters | Search |
|---|---|---|---|
| **E-invoices** | Every reportable invoice and note | **All**, **Reported**, **Not reported**, **Rejected**, **Cancelled** | **Invoice, party or IRN** |
| **E-way bills** | Every bill, with time left: **3 h left**, **expires within the hour**, **expired 2 days ago** | **All**, **Needs e-way bill**, **Active**, **Expired**, **Cancelled** | **Bill number, document or party** |

- **Needs e-way bill** lists finalised invoices and delivery notes of goods above the threshold that have no active bill. A banner counts them: **N invoices above the threshold still need an e-way bill. Tap to see them.** With none, you see **Nothing waiting for a bill**.
- A banner warns you when **N e-way bills expire within 24 hours**. Extend them if the goods are still moving.
- Home's **E-invoices** and **E-way bills** tiles, and its **Needs your attention** list, show the same warnings.
- 🖥 Each tab is a table: number, party, date, amount and status.

*Demo:* Vertex Traders has seven e-way bill cases for practice: active, expiring soon, expired, cancelled, over-dimensional multi-leg, rail and regenerated.

---

## GSTR-1

**Goal:** see your outward supplies grouped the way the GSTR-1 return wants them, and export them.
**Who / plan:** any role can view it · any plan.

**Steps**
1. Open **GSTR-1** from the GST section or the GST tab.
2. Pick the **Return month**. The period filter above also takes a custom range and a **Branch**; a range that isn't one whole month says *"The range above isn't one whole month. A return is filed for a month."*
3. The key figures show **Documents**, the taxable value and the tax. **Rate-wise summary** lists every rate across B2B, B2CL, B2CS, EXP, CDNR and CDNUR, net of credit notes.
4. Switch between the tables. Each shows the taxable value with **IGST**, **CGST**, **SGST** and **Cess** in their own columns:

| Table | What goes in it |
|---|---|
| **B2B** | Invoices to registered buyers |
| **B2CL** | Inter-state sales to unregistered buyers over ₹1 lakh, invoice by invoice |
| **B2CS** | Small sales to unregistered buyers, consolidated by place of supply and rate. Small credit notes net against them. |
| **EXP** | Exports |
| **CDNR** | Credit and debit notes to registered buyers |
| **CDNUR** | Credit and debit notes to unregistered buyers, when the invoice was B2CL |
| **NIL** | Table 8: nil-rated, exempt and non-GST supplies |
| **HSN** | Table 12: quantities and values rolled up by HSN |
| **DOCS** | Table 13: documents issued in the period, by numbering series, with cancelled and net counts |
| **11A/B** | Table 11: GST on advances for services, received (11A) and adjusted (11B). See [20](20-tds-rcm-itc.md#gst-on-advances-for-services). |
| **AMEND** | Amendments: documents of an earlier filed return changed since (B2BA, B2CLA, EXPA, CDNRA, CDNURA), and B2CSA by original month. A cancelled one is reported again at nil. |

5. Use **Export** to download the current table as **PDF**, **Excel** or **CSV**. When the range is one whole month and the branch you picked (or, with none, every branch) files under one GSTIN, **GSTN JSON (for the portal)** is offered too. The file keeps the column names of the GSTN offline tool, so it lines up with what the portal expects.

**Rules & gotchas**
- The app **prepares** GSTR-1 here. Saving it to the portal and filing are on **GST returns** ([21](21-gst-returns.md#saving-and-filing)); while filing through the app is switched off, you file on the GST portal.
- Drafts, cancelled documents and returns not yet issued are left out. A **financial note — no GST** is left out of every table ([20](20-tds-rcm-itc.md#credit-and-debit-notes-without-goods)).
- **Amendments** show only when the range is one month and an earlier return was recorded as filed. With nothing changed you see *"Nothing filed earlier has changed. Amendments show when the range is one month."*
- **Credit note deadline:** a credit note or sales return against an invoice is refused after 30 November following the invoice's financial year (CGST s.34(2), `NOTE_TIME_BARRED`). The document shows **Past the GST credit note deadline**.
- An empty table says **Nothing in this table**.

---

**Related:** [05 Sales](05-sales.md) · [13 Settings › Numbering](13-settings.md#document-numbering) · [12 Reports › Tax summary](12-reports.md) · [20 TDS, reverse charge, credit & adjustments](20-tds-rcm-itc.md) · [21 GST returns](21-gst-returns.md) · [18 Troubleshooting](18-troubleshooting-faq.md)
