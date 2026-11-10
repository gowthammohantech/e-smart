# 02 — Onboarding: setting up your business

Onboarding runs straight after sign-up, and again whenever a signed-in user's setup isn't finished on the server.
- It takes about two minutes. The progress line shows where you are (*Step 1 of 3 · Tax*).
- What you type is kept on this device, so a refresh or a relaunch halfway through brings you back to the same answers. Nothing is created on the server until the last screen.
- 🖥 On a desktop, a rail on the left (**Set up your business**, *Signed in as …*) lists the steps and ticks them off; you can click back to a finished step.
- **Sign out** is at the top of every step.

The steps are **Tax → Business → Numbering**, then the done screen. Every plan sees the same three steps.
- **Country** isn't asked: the app is sold in India only for now, so every business starts with India, INR and a financial year starting in April. The year can be changed later in **Settings**.
- **Branches** aren't asked: every new business starts on **Free**, which has one location, the head office. Add branches from **Settings › Branches** after upgrading (see [13 — Settings](13-settings.md)).

Nearly everything can be changed later under **Settings**. The exceptions are listed in [13 — Settings](13-settings.md): once you post entries, the legal name, state, financial year and GST registration are locked.

---

### 2.1 Step 1: Tax

**Goal:** Tell the app whether, and how, you are GST-registered. A GSTIN fills in the next step for you.

**Steps**
1. **Tax registration** (*You can change any of this later under Settings.*). Set **I'm registered for GST** (*Turn this off if you invoice without tax.*):
   - **On:** you charge GST.
   - **Off:** *Your invoices will be raised without a tax breakdown. You can register later without losing any history.*
2. If registered, type the GSTIN in **GSTIN**. Spaces and dashes are dropped and letters made capital. *The first two digits set your home state for CGST/SGST vs IGST.*
3. Once the GSTIN is valid, the app looks it up on the GST portal:
   - *Fetching the registered details…*
   - *Verified on the GST portal, and its details filled in*: the business name, legal name, address, state, city and PIN code are copied into the next step. You can still edit them.
   - *… on the GST portal* (for example a cancelled registration), *The GST portal has no taxpayer with this GSTIN*, or *Couldn't reach the GST portal; fill the details in yourself*.
4. Turn on **Composition scheme** if you file under it (*invoices will not show a tax breakdown*).
5. Look at **Default tax slabs**: GST 0%, 5%, 12%, 18% and 28%. *These are created for you. Add or edit slabs any time in Settings → Taxes.*
6. Tap **Continue**, or **Skip**.

**Rules & gotchas**
- The GSTIN is checked for shape and for its check digit:
  - *GSTIN should look like 27AABCV1234F1ZO*
  - *This GSTIN fails its check digit — look for a typo*
- **Skip** with registration on but no valid GSTIN turns registration off, so nothing half-made is saved. You can register later.
- Going back to Tax doesn't fill the business details again for the same GSTIN.

---

### 2.2 Step 2: Business

**Goal:** The details that appear on every invoice and quote you send (*This appears on every invoice and quote you send.*).

**Steps**
1. **Add your logo (optional)**: a PNG or JPEG of up to 5 MB. Use **Change** or **Remove** to swap it.
2. **Business name** (required), for example *Vertex Traders*.
3. **Legal name**, *As registered (optional)*, for example *Vertex Traders Pvt Ltd*.
4. **Business type**: Retail shop, Wholesale / Trading, Services, Freelancer / Professional, Distributor, Manufacturer, Restaurant / Café, or Other.
5. **Plan** shows **Free**, with *Sales with GST compliance. Upgrade any time for purchases and stock.* You can't pick another plan here; upgrade later from **Plan & billing** ([14](14-team-roles-plans.md)).
6. **Address**, **State** (required), **City** (required) and **PIN code**.
7. **Business email** and **Business phone** (optional).
8. Tap **Continue**.

**Rules & gotchas**
- **State** matters: *Used to decide CGST/SGST vs IGST on your invoices.*
- The PIN code must match the state. Otherwise you see *PIN code 400001 is in Maharashtra, not Karnataka. Check the PIN code or the state.*
- Logo messages: *That image is over 5 MB. Choose a smaller one.* and *Use a PNG or JPEG image.*

---

### 2.3 Step 3: Numbering

**Goal:** Choose how your invoices are numbered (*Finalised numbers are never reused, so pick a format you're happy with.*).

**Steps**
1. Set the **Prefix** (default `INV`) and **Start from** (default `1`).
2. Choose whether to **Include financial year** (*Adds 26-27 to every number and restarts the sequence each year.*).
3. Check the preview, **Your next invoice will be** `INV/26-27/0001`, then tap **Continue** (or **Skip** to keep the defaults).

**What happens:** The prefix and start number apply to the **invoice** series. Every other document (quotes, proforma invoices, orders, delivery notes, returns, credit and debit notes, purchase documents, payments, receipts, expenses, journals, challans and so on) gets its own series with its own default prefix, for example `QT`, `BILL`, `PAY`, `EXP`, starting at 1 with a yearly restart, and with the financial year on or off as you chose here. Tune each one later under **Settings › Document numbering** ([13 — Settings](13-settings.md)).

**Rules & gotchas**
- The year is written short: `26-27` for April 2026 to March 2027.
- If you will issue e-invoices, keep the whole number at **16 characters or fewer** (the portal's limit). `INV/26-27/0001` is 14.
- Turning off the financial year here turns it off in every series, not only invoices (*Quotes, purchase bills, payments and expenses each get their own series and prefix, with the financial year set the same way.*).

---

### 2.4 Done

**{Business} is ready.** *Tax slabs, numbering and your first location are all set up.* Below are three tips: **Add your customers**, **Add products or services**, **Raise your first invoice**.

Choose one:
- **Create my first invoice**: creates the business and opens a new invoice (see [05 — Sales](05-sales.md)).
- **Go to dashboard**: creates the business and opens **Home**, with its setup checklist ([04](04-home-dashboard.md#46-first-steps-for-a-new-business)).

You see *Your business is ready*.

**What onboarding creates for you**
- The business on the **Free** plan, and one branch, **Head office** (code `HO`), at the business address.
- A numbering series for every document type (23 in all).
- The GST tax slabs (or *No tax* if not registered).
- Default expense categories.
- A **Cash** payment account, set as the default.
- E-invoice and e-way bill settings with their defaults, and backup settings.

**Rules & gotchas**
- The business is created only when you tap one of the two buttons, and only once, however many times you tap.
- It needs a connection. Without one the save fails with a message and you stay on the done screen; nothing half-made is left behind. Try again once you are online.
- If the logo upload fails, the business is still created; add the logo again from **Business profile**.
- After this screen the on-device draft is cleared.

---

### Worked example: Vertex Traders

| Field | Value |
|---|---|
| GSTIN | `27AABCV1234F1ZO` (27 = Maharashtra, so sales to Karnataka take IGST) |
| Business name / Legal name | Vertex Traders / Vertex Traders Pvt Ltd (filled from the GSTIN, then checked) |
| Business type | Wholesale / Trading |
| State / PIN | Maharashtra / 400050 |
| Numbering | `INV`, start 1, include financial year → `INV/26-27/0001` |
| After upgrading to Pro | Add Pune — Warehouse (`PUN`) under **Settings › Branches** |

### Not available yet

- **Choosing a paid plan during onboarding.** Every business starts on Free; upgrade afterwards.
- **A country other than India**, and **branches during onboarding** (see above).
- **Adding a second business from inside the app.** There is no "add business" button; extra businesses come from onboarding on a new account or are set up on the server. Switching between businesses you already have works ([03](03-navigation.md)).
