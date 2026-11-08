# 13 — Settings

Settings shape every document you create: your business identity, branches, tax rates, numbering, payment accounts, integrations and backups. Most of them are set during onboarding ([02](02-onboarding.md)); this chapter covers changing them later.

Where to find them:
- 📱 the **More** tab, which groups them as:
  - **Money**: receivables, payables, payments, expenses
  - **Tools**: scan, Lixi, search, notifications
  - **Business setup**: profile, branches, users, taxes, currencies, numbering, accounts, expense categories
  - **Data & compliance**: GST, GSTR-1, e-invoicing, transporters, integrations, backup, audit
  - **Account**: devices, plan, appearance, about
- 🖥 the account menu › **All settings**, which opens Settings with its own side menu.

**Who can change what**

| Settings | Roles |
|---|---|
| Business profile, logo, branches, numbering, e-invoicing settings, integrations, backup & export, users | Owner, admin |
| Taxes, currencies & rates, payment accounts, expense categories, transporters | Owner, admin, accountant |

Everyone can view settings; a save the role doesn't allow is refused by the server.

---

### Your profile

Tap your name card at the top of **More**. 🖥 Account menu › **Profile**.
- Edit your **Name**, **Email** and **Phone**, then **Save changes**. You see **Profile updated**.
- **Your businesses** lists every business you can open. Tap one to switch; you see **Switched to 〈name〉**.

---

### Business profile

**More › Business setup › Business profile**

**Goal:** keep your business's name, address, tax identity and document defaults correct.
**Who:** owner or admin.

**Steps**
1. Edit the fields you need:
   - **Business name**, **Legal name**, **Business type**
   - **Email**, **Phone**, **Website**
   - **Registered address**: **Address**, **City**, **State**
   - **Tax and fiscal year**: GST registration, **Composition scheme**, **Financial year starts**
2. *Optional, exports:* enter the **LUT number (exports)** and **LUT valid till**. With a valid Letter of Undertaking, export invoices are zero-rated and carry no IGST.
3. *Optional:* under **Inventory**, set **Allow negative stock**.
   - On: invoices and deliveries may sell more than the branch has in stock.
   - Off: a document short of stock can't be finalised until the stock is added.
4. Tap **Save changes**. You see **Business profile updated**.

**Logo**
- **Add logo**, **Change logo** or **Remove**. PNG or JPEG, up to 5 MB. Owner or admin only, and you need a connection.
- Offline, you see **You're offline. Connect to the internet to change your logo.**
- The logo uploads as soon as you pick it. If the upload fails, your old logo comes back and you see **The logo you added couldn't be uploaded…**.

**Rules & gotchas**
- **Locks after the first posted entry.** Once entries exist, the **legal name, state, financial year and GST registration** are locked. You see: *"Entries have been posted, so … are locked."* An unregistered business can still register for GST.
- **Country** and **Base currency** are fixed once the business has transactions.
- On the composition scheme, invoices are raised without a tax breakdown, and e-invoicing doesn't apply.

---

### Branches

**More › Business setup › Branches** · Pro or Business · owner or admin.

Branches keep stock and documents separate by location. Every document records its branch, and reports can be filtered by branch.

- **Add branch:**
  - **Branch name** (for example *Pune warehouse*), **Code** (for example `PUN`), **Address**, **City**, **State**, **PIN code** and **Phone**.
  - **GSTIN**: leave it blank if the branch uses the company GSTIN. A GSTIN from another state is rejected: *"This GSTIN is registered in 〈state〉, not the state below"*.
  - **Primary branch**: used as the default on new documents. Only one branch is primary.
- **Edit:** tap the branch.
- **Delete:** documents already recorded against the branch keep the reference, and it can't be undone.

*Demo:* Vertex Traders has **Mumbai — Head office** (`MUM`, primary) and **Pune — Warehouse** (`PUN`).

To work in one branch, use the branch switcher in the header ([03](03-navigation.md)).

---

### Taxes

**More › Business setup › Taxes** · owner, admin or accountant.

- **How a rate is applied:**
  - Within your state: CGST + SGST, split evenly.
  - Other states: IGST at the full rate.
  - Rounding: half-up to the paisa, then the document total to the rupee.
- **Add tax rate:** a **Name** (for example *GST 18%*), **Rate (%)**, **Effective from** and an optional **Description**.
- **Effective dates:** documents dated before **Effective from** keep their original rate. Every document line stores its rate, so changing a tax later never changes a past document.
- **Delete:** existing documents keep their rate, but items using it will need a new one.

---

### Currencies & rates

**More › Business setup › Currencies & rates** · Pro or Business · owner, admin or accountant.

- The **Base currency** (INR) is the currency every report is presented in.
- **Add exchange rate:** a **Currency**, a **Rate (1 AED → INR)** and **Effective from**. Documents dated on or after that day use the new rate.
- **Rate history** shows each rate and when it applied. **Provider** rates come from the rate feed; **Manual** rates are ones you typed.
- A document raised in another currency stores the rate for its date, so its total never shifts later.

*Demo rates:* AED 23.85, USD 87.4, EUR 94.2, GBP 110.6, SGD 64.8.

---

### Document numbering

**More › Business setup › Document numbering** · owner or admin.

Each document type has its own series: INV, QT, SO, DN, CRN, PO, GRN, BILL, DRN, PAY and EXP.

**Steps**
1. Tap a series, for example **INV**.
2. Set:
   - **Prefix**
   - **Next number**
   - **Digits**: 0001 uses four digits
   - **Include financial year**: adds, for example, `2026-27`
   - **Include branch code**: useful when several locations issue documents
   - **Reset policy**: **Never reset**, **Reset each financial year** or **Reset each month**
3. Check the preview under **Next number will be**, then tap **Save**. You see **INV numbering updated**.

**Rules & gotchas**
- Drafts have **no number**. A number is assigned only when a document is finalised, and a finalised number is **never reused**. That is why drafts can be deleted freely.
- **Watch for "Longer than 16 characters — the e-invoice portal will reject this number."** For example, `INV/MUM/2026-27/0042` is 20 characters, too long for e-invoicing. Turn off the branch code or shorten the prefix ([11](11-gst-compliance.md#generate-an-irn)).
- Numbers are assigned by the server when you finalise. Finalising needs a connection.

---

### Payment accounts

**More › Business setup › Payment accounts** · owner, admin or accountant.

- **Add account:** choose the type (**Bank**, **Cash** or **Wallet**), then enter the **Account name** (for example *HDFC Current*), **Account number** and **Opening balance**.
- **Use as default:** pre-selected when recording payments and expenses.
- **Cash and bank balance** shows the opening balances plus everything recorded since.
- **Delete:** payments already recorded against the account keep their reference, and it can't be undone.

The account type decides which payment methods can use it:

| Method | Allowed account types |
|---|---|
| Cash | Cash |
| Bank, cheque, card | Bank |
| UPI | Bank, wallet |
| Wallet | Wallet |
| Other | Cash, bank, wallet |

---

### Expense categories

See [10 › Manage expense categories](10-expenses-and-ocr.md#manage-expense-categories).

### E-invoicing & e-way bill, and transporters

See [11 › Set up compliance](11-gst-compliance.md#set-up-compliance).

---

### Integrations

**More › Data & compliance › Integrations** · owner or admin.

Integrations are grouped by what they do:

| Group | Integrations |
|---|---|
| **Payments** | **Razorpay** (collect invoice payments online), **UPI / QR** (a UPI QR code on every invoice) |
| **Compliance** | **GST e-Invoice (IRP)**, **E-way bill**. **Configure** opens the e-invoicing settings. |
| **Messaging** | **WhatsApp Business** (invoices and reminders), **SMS gateway** (payment reminders) |
| **Accounting** | **Tally export** (vouchers to import into Tally) |
| **Storage & backup** | **Google Drive backup**. **Smart Business only.** |

Use **Connect 〈name〉** or **Disconnect 〈name〉**. You see **〈name〉 connected** or **〈name〉 disconnected**.

> **Not available yet.** The Razorpay and Google Drive sign-in pages that finish the connection haven't been built, so those two can't complete yet. Online payment links lead to a page that doesn't exist yet either. See [18](18-troubleshooting-faq.md#not-available-yet).

---

### Backup & export

**More › Data & compliance › Backup & export** · owner or admin · needs a connection.

**Goal:** take a copy of one business's books, for an auditor, for Tally, or for safekeeping.

**Steps**
1. Check **What's included**: counts of **Customers & suppliers**, **Items**, **Documents**, **Payments**, **Expenses**, **Stock movements** and **Audit events**.
2. Pick a format:
   - **Machine-readable JSON**: full records, ready to import elsewhere.
   - **CSV files**: every table as a CSV file, zipped together.
   - **Tally XML**: vouchers to import into Tally.
   - The **Export this business** button exports JSON.
3. Confirm **Export company data?** with **Export**. The package contains customer details and financial records, so share it only with people who should see them.
4. You see **Export package prepared**, and the file is offered for download or sharing.

**Rules & gotchas**
- The export covers **this business only**; your other businesses stay out of the package.
- **Automatic backup:** switch on **Back up automatically** and choose **Nightly** or **Weekly**. The screen shows **Last backup 〈when〉** or **No backup has run yet.**
  > **Not available yet.** Automatic backups are not scheduled yet. Take manual exports until they are.
- Large businesses may see **The export is taking longer than expected. Try again shortly.**
- Records under statutory retention are kept even if you remove them from the device.

---

### Audit trail

**More › Data & compliance › Audit trail** · owner, admin or accountant.

- Every change is logged: who did it, what changed, and when. Entries are newest first.
- Use **Search the trail** to find entries. Tap an entry to see each **field changed**, with its before and after value.
- Audit records **cannot be edited or deleted**. Export them with the company backup.

---

### Devices & sessions

**More › Account › Devices & sessions**

- Lists every signed-in device: **This device**, **Active now**, or **Last active 〈when〉**.
- **Sign out** a lost or old device, and confirm **Sign out 〈device〉?**. Its session ends immediately; it can't keep using a cached sign-in.
- Session tokens are kept in the device's secure keychain.

---

### Appearance & language

**More › Account › Appearance & language.** 🖥 Account menu › **Appearance**.

**Theme**
- **Match device**, **Dark** or **Light**. **Light** is used unless you choose otherwise; the hint on **Dark** that calls it "The default look" is out of date.
- **Preview** shows how sample tiles look in the chosen theme.

**Language**
- **Match device**, **English** or **தமிழ்** (Tamil).
- Tax terms such as GST, GSTIN and HSN stay in English, because that is how they appear on your filings.
- PDFs you share are generated in the language you choose.
- Some text is still English in Tamil mode: the GST tab tiles, messages from the server, and parts of the server-made PDFs.

**Ways to open Lixi**
- Switch each on or off: **Hold a tab**, **Swipe up on the tab bar**, **Floating orb** (off by default) and **Pull down on Home**.
- **Show gesture tips again** brings back the hints above the tab bar.
- With every way off, Lixi is still under **More › Tools › Ask Lixi**. See [16](16-lixi-assistant.md).

---

### About

**More › Account › About** shows the version, platform and data note, and links to **Privacy policy**, **Terms of service** and **Contact support**.

> The privacy, terms and support links are placeholders until the legal pages are published.

---

**Related:** [02 Onboarding](02-onboarding.md) · [11 GST compliance](11-gst-compliance.md) · [14 Team, roles & plans](14-team-roles-plans.md)
