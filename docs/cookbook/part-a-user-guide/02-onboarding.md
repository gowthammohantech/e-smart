# 02 — Onboarding: setting up your business

Onboarding runs straight after sign-up, and again whenever a signed-in user has no business set up yet.
- It takes about two minutes. The progress bar shows the current step (*Step 2 of 5 · Country*).
- Nearly everything can be changed later under **More › Settings**. The exceptions are listed in [13 — Settings](13-settings.md): once you post entries, the legal name, state, financial year and GST registration are locked, and the country and base currency are fixed once the business has transactions.

The steps are **Business → Country → Tax → Numbering → Branches**.
- On a **sales plan** (Free, Smart Basic), **Country** and **Branches** are skipped. The app assumes India, INR, a financial year starting in April, and a single head office.
- On a **full plan** (Smart Pro, Smart Business) you see all five steps.

---

### 2.1 Step 1: Business

**Goal:** The details that appear on every invoice and quote you send.

**Steps**
1. **Add your logo (optional)**: a PNG or JPEG of up to 5 MB. Use **Change** or **Remove** to swap it.
2. **Business name** (required), for example *Vertex Traders*.
3. **Legal name**, *As registered (optional)*, for example *Vertex Traders Pvt Ltd*.
4. **Business type**: Retail shop, Wholesale / Trading, Services, Freelancer / Professional, Distributor, Manufacturer, Restaurant / Café, or Other.
5. **Plan**:
   - **Buy & sell** (full plan): *Sales, purchases, stock and expenses, with GST compliance.*
   - **Sell** (sales plan): *Sales with GST compliance. Upgrade any time for purchases and stock.*
6. **Address**, **City**, **State** (required) and **PIN code**.
7. **Business email** and **Business phone** (optional).
8. Tap **Continue**.

**Rules & gotchas**
- **State** matters: *Used to decide CGST/SGST vs IGST on your invoices.*
- The PIN code must match the state. Otherwise you see *PIN code 400001 is in Maharashtra, not Karnataka. Check the PIN code or the state.*

---

### 2.2 Step 2: Country *(full plans only)*

**Goal:** Choose the tax rules, currency and financial year.

**Steps**
1. **Country**: India gives you the GST pack, which covers GSTIN validation, the CGST/SGST/IGST split, HSN/SAC codes, e-invoice and e-way bill.
2. **Base currency**: *Every report is presented in this currency.* You can still raise individual documents in another currency.
3. **Financial year starts**: April for India.

---

### 2.3 Step 3: Tax

**Goal:** Tell the app whether, and how, you are GST-registered.

**Steps**
1. Set **I'm registered for GST**:
   - **On:** you charge GST.
   - **Off:** you invoice without tax. *Your invoices will be raised without a tax breakdown. You can register later without losing any history.*
2. If registered, enter the GSTIN in **Tax number**. *The first two digits set your home state for CGST/SGST vs IGST.*
3. Turn on **Composition scheme** if you file under it. Invoices will then not show a tax breakdown.
4. Review **Default tax slabs**. *These are created for you. Add or edit slabs any time in Settings → Taxes.*

**Rules & gotchas**
- The GSTIN is checked for shape and for its check digit. Possible messages:
  - *GSTIN should look like 27AABCV1234F1ZO*
  - *This GSTIN fails its check digit — look for a typo*

---

### 2.4 Step 4: Numbering

**Goal:** Choose how your invoices are numbered.

**Steps**
1. Set the **Prefix** (default `INV`) and **Start from** (default `1`).
2. Choose whether to **Include financial year**. When on, the year is added to every number (for example `INV/2026-27/0001`) and the sequence restarts each April.
3. Check the preview, **Your next invoice will be …**, then tap **Continue**.

**What happens:** Quotes, sales orders, delivery notes, returns, purchase orders, goods receipts, purchase bills, payments and expenses each get their own series with matching settings. That makes 11 series in all. You can tune each one later under **Settings › Document numbering** (see [13 — Settings](13-settings.md)).

**Rules & gotchas**
- *Finalised numbers are never reused, so pick a format you're happy with.*
- If you will issue e-invoices, keep the whole number at **16 characters or fewer** (the portal's limit). `INV/2026-27/0001` is exactly 16.

---

### 2.5 Step 5: Branches *(full plans only)*

**Goal:** Add other shops or warehouses.

**Steps**
1. Your **Head office** is already there as the **Primary location** (*created automatically*).
2. To add another, tap **Add branch** and enter a **Branch name** (for example *Pune warehouse*), a **Code** (for example `PUN`) and the **City**.
3. Tap **Finish setup**. You can skip this step entirely.

---

### 2.6 Done

**{Business} is ready.** *Tax slabs, numbering and your first location are all set up.*

Choose one:
- **Create my first invoice**: opens a new invoice (see [05 — Sales](05-sales.md)).
- **Go to dashboard**: opens Home, which shows a three-step *First steps* checklist: add a customer, add a product or service, create your first invoice.

**What onboarding created for you**
- The business, and its primary branch.
- The 11 numbering series.
- Default GST rates.
- Default expense categories.
- A default payment account.

---

### Worked example: Vertex Traders

| Field | Value |
|---|---|
| Business name / Legal name | Vertex Traders / Vertex Traders Pvt Ltd |
| Business type | Wholesale / Trading |
| Plan | Buy & sell |
| State / PIN | Maharashtra / 400050 |
| GSTIN | `27AABCV1234F1ZO` (27 = Maharashtra, so sales to Karnataka take IGST) |
| Numbering | `INV`, start 1, include financial year → `INV/2026-27/0001` |
| Branches | Head office (MUM) and Pune — Warehouse (PUN) |

### Not available yet

- **Adding a second business from inside the app.** The app has no "add business" button; extra businesses come from onboarding on a new account or are set up on the server. Switching between businesses you already have works (see [03 — Finding your way around](03-navigation.md)).
