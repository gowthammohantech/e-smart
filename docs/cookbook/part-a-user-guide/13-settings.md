# 13 — Settings

Settings shape every document you create: your business identity, branches, numbering, the modules you use, and how you sign in. Most of them are set during onboarding ([02](02-onboarding.md)); this chapter covers changing them later.

Where to find them:
- 📱 the **More** tab. Your name card at the top opens **Your profile**. The settings follow, in four groups.
- 🖥 the account menu › **All settings**, which opens Settings with its own side menu. The main sidebar folds to icons while you are in settings.

Settings pages leave the list when your plan doesn't include them, or when the module they belong to is switched off.

### Every settings page

| Group | Page | What it's for | Covered in |
|---|---|---|---|
| **Business setup** | **Business profile** | Name, address, tax identity, bank details, signature, rules, archiving | [below](#business-profile) |
| | **Branches** | Locations, each with its own stock and documents | [below](#branches) |
| | **Users & roles** | Inviting people, their role and branches | [14](14-team-roles-plans.md) |
| | **Taxes** | Tax rates and when they apply | [11](11-gst-compliance.md) |
| | **Currencies & rates** | Exchange rates for foreign-currency documents | [05](05-sales.md) |
| | **Document numbering** | Prefix and sequence of every document type | [below](#document-numbering) |
| | **Payment accounts** | Bank, cash and wallet accounts | [22](22-banking-and-reconciliation.md) |
| | **Expense categories** | Categories for expenses | [10](10-expenses-and-ocr.md#107-manage-expense-categories) |
| | **Item categories**, **Brands** | Grouping items | [09](09-items-and-stock.md) |
| | **Vehicles** | Your own vehicles for e-way bills | [11](11-gst-compliance.md) |
| **GST & e-invoicing** | **GST portal connection** | Logging in to the GST portal | [21](21-gst-returns.md) |
| | **E-invoicing & e-way bill**, **Transporters** | IRP and e-way bill settings | [11](11-gst-compliance.md#set-up-compliance) |
| **Data** | **Integrations** | Payment, messaging and storage providers | [below](#integrations) |
| | **Backup & export** | A copy of one business's books | [28](28-company-archive-and-data.md#export-a-business) |
| | **Audit trail** | Who changed what, and when | [below](#audit-trail) |
| **Account** | **Your profile** | Your name, sign-in security, privacy, devices | [below](#your-profile) |
| | **Modules** | Switching parts of the app off | [below](#modules) |
| | **Invoice design** | Invoice templates and copies | [27](27-invoice-design.md) |
| | **AI usage** | Lixi's monthly allowance, and ways to open Lixi | [below](#ai-usage) |
| | **Custom fields** | Extra fields on contacts, items and documents | [below](#custom-fields) |
| | **Approvals** | Rules for approving payments and documents | [25](25-approvals.md) |
| | **Notification preferences** | Which push notifications you get | [below](#notification-preferences) |
| | **Plan & billing** | Your plan and subscription | [14](14-team-roles-plans.md) |
| | **Appearance & language** | Theme and language | [below](#appearance--language) |
| | **About** | Version, legal pages, support | [below](#about) |

**Who can change what**

| Settings | Roles |
|---|---|
| Business profile, logo, signature, branches, numbering, custom fields, integrations, backup & export, users | Owner, admin |
| Modules, archiving a business | Owner only |
| AI budget | Owner (the app offers it to the owner only) |
| Taxes, currencies & rates, payment accounts, expense categories, transporters | Owner, admin, accountant |
| Audit trail (to read) | Owner, admin, accountant |
| Your profile, appearance, notification preferences, privacy | Everyone, for themselves |

Everyone can open settings; a save the role doesn't allow is refused by the server. Every change needs a connection.

---

### Your profile

**Goal:** keep your own details, sign-in and privacy choices in one place.
**Who / plan:** everyone, on every plan.

📱 Tap your name card at the top of **More**. 🖥 Account menu › **Profile**, or **All settings › Your profile**.

**Steps**
1. Edit your **Name**, **Email** and **Phone**.
2. Tap **Save changes** (🖥 or press Ctrl+S / ⌘S). You see **Profile updated**.

The page also holds:
- **Your businesses:** every business you can open, with its type and base currency. The one you're in shows **Active**. To switch, use the business picker in the header ([03](03-navigation.md)); this list doesn't switch, so nothing you typed is lost.
- **Sign-in security:** turn on an **Authenticator app**. See [Turn on an authenticator app](#turn-on-an-authenticator-app).
- **Privacy and usage data:** the **Share usage data** switch. See [Privacy and usage data](#privacy-and-usage-data).
- **Devices & sessions:** where you're signed in. See [Devices & sessions](#devices--sessions).
- **Delete account** at the foot of the page. See [28](28-company-archive-and-data.md#delete-your-account).

Old links to **Sign-in security**, **Devices & sessions** and **Privacy** now open this page.

---

### Turn on an authenticator app

**Goal:** add a second step to signing in.
**Who / plan:** everyone.

**Steps**
1. **Your profile › Sign-in security › Turn on**.
2. Scan the QR code with an app such as Google Authenticator, Microsoft Authenticator or 1Password. If you can't scan it, type the key shown under it.
3. Enter the 6-digit **Code from the app** and tap **Turn on**.
4. **Save your recovery codes.** Each one signs you in once if you lose your phone, and they are shown only now. Tap **Copy codes**, keep them safe, then **I have saved them**.

**What happens**
- Each time you sign in on a new device, you also give a code from the app (**Enter your code**). A recovery code works there too.
- The card shows **On** and how many recovery codes are left.

**To turn it off:** **Turn off**, then give a code from the app or a recovery code. You see **Authenticator turned off**.

---

### Privacy and usage data

**Goal:** decide whether the app shares anonymous usage data.
**Who / plan:** everyone, for themselves.

**Your profile › Privacy and usage data.** Also linked from **About**.

- **Share usage data** is on unless you turn it off. It helps us see which screens and features are used, and fix crashes.
- **What is shared:** which screens you open and which features you use (an invoice was created, a return was filed), your app version, and crash reports. It is tied to your account and business by an ID, not your name or email, and kept by PostHog in the EU.
- It never includes amounts, customers or tax numbers.
- Turn it off and nothing more is sent, from the app or from the server.
- The public demo never shares usage data (**The demo never shares usage data.**).

---

### Devices & sessions

**Your profile › Devices & sessions**

- Lists every signed-in device: **This device**, **Active now**, or **Last active 〈when〉**.
- **Sign out** a lost or old device, and confirm **Sign out 〈device〉?**. You see **Device signed out**. Its session ends immediately; it can't keep using a cached sign-in.
- Session tokens are kept in the device's secure keychain.

---

### Business profile

**More › Business setup › Business profile** · owner or admin.

**Goal:** keep your business's name, address, tax identity and document defaults correct.

**Steps**
1. Edit the fields you need:
   - **Business details:** logo, **Business name**, **Legal name**, **Business type**, **Email**, **Phone**, **Website**.
   - **Registered address:** **Address**, **City**, **State**, PIN code.
   - **Bank & signature:** see [Bank details on invoices](#bank-details-on-invoices).
   - **Tax and fiscal year:** **Country** and **Base currency** (read-only), **Financial year starts**, your GSTIN, **Composition scheme**, **GST returns** (**Monthly** or **Quarterly (QRMP)**), **TAN**, **LUT number (exports)** and **LUT valid till**.
   - **Inventory:** **Allow negative stock**.
   - **Rules:** **RBI bank rate (%)** and **GSTR-2B date tolerance (days)**.
2. Tap **Save changes**. You see **Business profile updated**.

**The settings that need a word**
- **Quarterly (QRMP)** files GSTR-1 and GSTR-3B every quarter and pays tax monthly. It is open to turnover up to ₹5 crore ([21](21-gst-returns.md)).
- **TAN:** with it, TDS is worked out on supplier bills under their section ([20](20-tds-rcm-itc.md)).
- **LUT:** with a valid Letter of Undertaking, export invoices are zero-rated and carry no IGST. **LUT valid till** shows once a number is entered.
- **Allow negative stock:** on, invoices and deliveries may sell more than the branch has; off, a document short of stock can't be finalised until the stock is added.
- **RBI bank rate (%):** MSME late-payment interest is three times this rate (MSMED Act s.16). Update it when RBI changes the rate. 0–50%.
- **GSTR-2B date tolerance (days):** a 2B line and a bill with the same amounts, this many days apart or less, can be claimed without anyone accepting it. 0–30; 0 means the same day only.

**Logo**
- **Add logo**, **Change logo** or **Remove**. PNG or JPEG, up to 5 MB.
- The logo uploads as soon as you pick it. If the upload fails, your old logo comes back and you see **The logo you added couldn't be uploaded…**.
- **Remove the logo?** asks before it comes off your documents.

**Signature**
- **Add signature**: a photo of your signature on white paper works; a transparent PNG looks best.
- **Check the signature** shows how it prints above "Authorised signatory". Tap **Use this signature**. You see **Signature updated**.
- **Remove** asks **Remove the signature?** first.

**Rules & gotchas**
- **Locks after the first posted entry.** Once entries exist, the **legal name, state, financial year and GST registration** are locked: *"Entries have been posted, so the legal name, state, financial year and GST registration are locked. An unregistered business can still register for GST."*
- **Country** and **Base currency** are fixed once the business has transactions.
- On the composition scheme, invoices are raised without a tax breakdown, and e-invoicing doesn't apply.
- The owner also sees **Close this business** at the foot of the page ([28](28-company-archive-and-data.md#archive-a-business)).

---

### Bank details on invoices

**Goal:** print where customers should pay, and link it to the bank account in your books.
**Who / plan:** owner or admin, every plan.

**Business profile › Bank & signature**

**Steps**
1. Enter **Bank name**, **Account holder name** (the business name is suggested), **Account number**, **IFSC**, **Branch** and **UPI ID**.
2. Pick the **Account in your books**: one of your bank accounts under Payment accounts, or **Not linked**.
3. Tap **Save changes**.

**What happens**
- The details print on invoices, quotes and orders. With a UPI ID, the invoice carries a QR code for the amount.
- Money customers pay against your invoices goes into the linked account by default ([07](07-payments.md)).
- If the account number you typed isn't the one saved for the linked account, you see: *"The account number above isn't the one saved for 〈name〉 (〈number〉). Customers will pay into the number printed here."*

**Rules & gotchas**
- An IFSC is 11 characters: 4 letters, a zero, then 6 letters or digits (`HDFC0001234`).
- An account number is 6 to 34 letters and digits. A UPI ID looks like `name@bank`.
- With no bank account in the books yet, you see **Add a bank account under Cash and bank accounts to link it here.** ([22](22-banking-and-reconciliation.md)).

---

### Branches

**More › Business setup › Branches** · owner or admin.

Branches keep stock and documents separate by location. Every document records its branch, and reports can be filtered by branch.

**On Free and Basic** the page opens with your one branch. You can rename it; its address, GSTIN and phone follow the business profile. **Add branch** is locked: *"Your plan includes one branch. Upgrade to add more branches."*

**On Pro and Business:**
- **Add branch:**
  - **Branch name** (for example *Pune warehouse*), **Code** (for example `PUN`), **Address**, **City**, **State**, **PIN code** and **Phone**.
  - **GSTIN**: leave it blank if the branch uses the company GSTIN. A GSTIN from another state is rejected: *"This GSTIN is registered in 〈state〉, not the state below"*.
  - **Primary branch**: used as the default on new documents. Only one branch is primary.
  - Tap **Save**. You see **Branch added**.
- **Edit:** tap the branch. You see **Branch updated**.
- Each branch shows how many **Documents** it holds.

**Delete a branch**
- Tap **Delete**, then confirm **Delete 〈name〉?**. You see **Branch deleted**.
- Only a branch with nothing recorded against it can be deleted. The server refuses a branch that has documents, payments, expenses, stock movements or users limited to it (*"This branch has 〈what〉"*). The confirm message still says documents "keep their reference"; that is out of date.
- The primary branch can't be deleted. Make another branch primary first.

**Rules & gotchas**
- Two branches can't share a name, a code or an address.
- Switching off the **Branches** module hides the branch pages; branches and their records are kept.

*Demo:* Vertex Traders has **Mumbai — Head office** (`MUM`, primary) and **Pune — Warehouse** (`PUN`).

To work in one branch, use the branch picker in the header ([03](03-navigation.md)).

---

### Document numbering

**More › Business setup › Document numbering** · owner or admin.

Each document type has its own series, for example INV, QT, SO, DN, CRN, PO, GRN, BILL, DRN, PAY and EXP.

**Steps**
1. Tap a series, for example **INV**. 🖥 The series are a table.
2. Set:
   - **Prefix**
   - **Next number**
   - **Digits**: 0001 uses four digits
   - **Include financial year**: adds, for example, `2026-27`
   - **Include branch code**: useful when several locations issue documents
   - **Reset policy**: **Never reset**, **Reset each financial year** or **Reset each month**
3. Check the preview under **Next number will be**, then tap **Save**. You see **〈series〉 numbering updated**.

**Rules & gotchas**
- Drafts have **no number**. A number is assigned only when a document is finalised, and a finalised number is **never reused**. That is why drafts can be deleted freely.
- You can't set **Next number** below what may already be issued: *"Numbers below 〈n〉 may already be issued; start at 〈n〉 or above"*.
- **Watch for "Longer than 16 characters — the e-invoice portal will reject this number."** For example, `INV/MUM/2026-27/0042` is 20 characters. Turn off the branch code or shorten the prefix ([11](11-gst-compliance.md#generate-an-irn)).

---

### Modules

**More › Account › Modules** · owner only.

**Goal:** hide the parts of the app this business doesn't use.

Each module in your plan has a switch:

| Module | What it covers |
|---|---|
| **Purchases** | Purchase orders, goods received, bills and suppliers |
| **Stock** | Stock levels, movements and valuation |
| **Expenses** | Expenses and their categories |
| **Bill capture** | Reading bills and receipts from a photo. Needs Expenses |
| **Multi-currency** | Customers and suppliers billed in other currencies |
| **Branches** | More than one branch or godown |
| **Payables** | What you owe suppliers, TDS and MSME dues. Needs Purchases |
| **Books** | Chart of accounts, vouchers, bank reconciliation and the statements |
| **Retail item fields** | SKU, barcode, category and brand on items. On every plan |

**Steps**
1. Flip a module's switch off.
2. Confirm **Switch off 〈module〉?** with **Switch off**. You see **〈module〉 switched off**.
3. To bring it back, flip it on. You see **〈module〉 switched on**.

**What happens**
- The module disappears from the app for everyone in this business, and its work is refused by the server.
- Its records are kept, and come back when you switch it on again.
- Switching off a module also switches off what depends on it: Purchases takes Payables with it, and Expenses takes Bill capture. The switch says so (*"Switching it off also switches off …"*).
- Reports that read a switched-off module leave the Reports list ([12](12-reports.md)).

**Rules & gotchas**
- Only modules your plan includes are listed. Free and Basic see only **Retail item fields**.
- Anyone who isn't the owner sees *"Only an owner can switch modules on or off."* and the switches are greyed out.
- With **Retail item fields** off, items are just a name, unit and price; a SKU is still given to each.

---

### Custom fields

**More › Account › Custom fields** · owner or admin to change; everyone fills them in.

**Goal:** ask for more on contacts, items and documents: a drug licence on a customer, a vehicle number on a delivery.

**Steps**
1. Pick **Contacts**, **Items** or **Documents** at the top.
2. Tap **Add a field**.
3. Enter the **Name** and pick its kind: **Text**, **Number**, **Date**, **List** or **Tick box**. For a list, enter the **Choices**, separated by commas.
4. Optional: **Required**, and (contacts and documents) **Printed on documents**.
5. Tap **Save**. You see **Field saved**.

**What happens**
- The field appears on that form. A required field must be filled before saving (*"〈name〉 is required"*).
- A printed field appears on the PDF: a document's field on that document; a contact's field on documents to that contact.

**Rules & gotchas**
- A field keeps its kind. For a different kind, add another field.
- Switch **In use** off to take a field off the forms but keep what records hold. It shows **Inactive**.
- **Delete field** asks **Delete 〈name〉?**: records stop showing what they held for it. To keep that, mark it unused instead.
- Text is at most 500 characters.

---

### AI usage

**More › Account › AI usage** · everyone can view; the owner sets a budget.

**Goal:** see how much of the monthly AI allowance is used, and keep it lower if you want.

- **〈used〉 of 〈limit〉 used this month**, split into **Lixi** and **Bill scans**.
- Lixi messages and bills read by the scanning service count. Text your phone reads itself is free. The count starts again on the 1st (India time).
- **Your plan includes 〈n〉 a month:**

| Plan | AI actions a month |
|---|---|
| Free | 30 |
| Smart Basic | 300 |
| Smart Pro | 1,500 |
| Smart Business | 5,000 |

- When it is used up: *"The allowance is used up. Lixi and bill scanning pause until the 1st."*

**Set a lower monthly budget (owner)**
1. Under **Set a lower monthly budget**, enter **AI actions a month**.
2. Tap **Save**. You see **AI budget saved**.
- The budget can only be lower than the plan's allowance, never higher. Others see *"Only the owner can change the budget."*

**Ways to open Lixi** are on this page too, for this device:
- Switch each on or off: **Hold a tab**, **Swipe up on the tab bar**, **Floating orb** and **Pull down on Home**.
- **Show gesture tips again** brings back the hints above the tab bar.
- With every way off, Lixi is still under **More › Ask Lixi**. See [16](16-lixi-assistant.md).

---

### Notification preferences

**More › Account › Notification preferences** · everyone, for themselves.

- If notifications are off on the phone, tap **Turn on notifications**; if they are blocked, **Open phone settings**.
- Choose which push notifications you get: **Payments received**, **Invoices overdue**, **E-invoices and e-way bills**, **Low stock**, and **Exports, backups and everything else**.
- Everything still shows in the app's notification list, whatever you turn off here.
- 🖥 *"The web app doesn't send notifications."* Use the phone app, or check the notification list.

---

### Integrations

**More › Data › Integrations** · owner or admin.

| Group | Integrations | Status |
|---|---|---|
| **Payments** | **Razorpay**, **UPI / QR** | **Coming soon** |
| **Compliance** | **GST e-Invoice (IRP)**, **E-way bill** | Working. **Configure** opens the e-invoicing settings ([11](11-gst-compliance.md#set-up-compliance)) |
| **Messaging** | **WhatsApp Business**, **SMS gateway** | **Coming soon** |
| **Accounting** | **Tally export** | **Coming soon** |
| **Storage & backup** | **Google Drive backup** | **Coming soon** |

- Only the two GST integrations can be switched on. You see **〈name〉 connected** or **〈name〉 disconnected**.
- A portal with no login saved yet asks for the login instead of switching on.

> **Not available yet.** Razorpay, UPI / QR, WhatsApp Business, SMS gateway, Tally export and Google Drive backup show **Coming soon**, and their switches are greyed out.
> - A UPI QR on invoices already works from the **UPI ID** in [Bank details](#bank-details-on-invoices).
> - Sharing on WhatsApp opens your own WhatsApp with the link filled in ([05](05-sales.md)).
> - Tally files come from **Backup & export › Tally XML** and **Books › Tally export** ([19](19-books.md)).

---

### Audit trail

**More › Data › Audit trail** · owner, admin or accountant.

- Every change is logged: who did it, what changed, when, and from which device. Entries are newest first: *"〈n〉 events · append-only, newest first"*.
- Use **Search the trail** to find entries. Tap an entry to see each **field changed**, with its before and after value.
- 🖥 The trail is a table: **Date**, **By**, **Event**, **Type**, **Changes**, **Device**.
- Audit records **cannot be edited or deleted** from the app. Export them with the company backup ([28](28-company-archive-and-data.md#export-a-business)).

---

### Appearance & language

**More › Account › Appearance & language.** 🖥 Account menu › **Appearance**.

**Theme**
- **Match device**, **Dark** or **Light**. **Light** is used unless you choose otherwise; the hint on **Dark** that calls it "The default look" is out of date.
- **Preview** shows how sample tiles look in the chosen theme.

**Language**
- **Match device**, **English** or **தமிழ்** (Tamil).
- Tax terms such as GST, GSTIN and HSN stay in English, because that is how they appear on your filings.
- Some text is still English in Tamil mode, for example messages from the server and parts of the server-made PDFs.

The **Ways to open Lixi** switches moved to [AI usage](#ai-usage).

---

### About

**More › Account › About**

- The app's name and **Version 〈n〉**, and **Data: Kept on the server**.
- Links to **Privacy policy**, **Privacy and usage data** (opens Your profile), **Terms of service** and **Contact support**. The legal and support pages are on the Elixir Books Smart website.
- **About your data:** your books live on the server, and nothing is kept on this device. Every change is saved straight to the server, which checks it before it counts, so the app needs an internet connection to make changes.

---

**Related:** [02 Onboarding](02-onboarding.md) · [11 GST compliance](11-gst-compliance.md) · [14 Team, roles & plans](14-team-roles-plans.md) · [28 Archive & data](28-company-archive-and-data.md)
