# 27 — Invoice design

How your invoices, quotations and other documents look when printed, saved as PDF or sent: the template, accent colour, logo, signature, bank details, and the original, duplicate and triplicate copies.

*How your invoices, quotes and other documents look. GSTIN, HSN, tax, place of supply and the e-invoice always print.* The design only shapes the rest. One design applies to every document kind: invoices, quotations, proformas, orders, delivery notes, returns and notes.

The design is used everywhere a document is drawn: the **Preview** tab, **Preview document**, **Print**, the PDF, the email the customer gets and the page behind a shared link.

| Template | In short | Default accent |
|---|---|---|
| **Standard** | *Clean and open, with totals on the right.* The app's own design, used until you pick another. | Blue |
| **Classic** | *Ruled boxes, taxes under the items and an HSN-wise tax table.* | Navy |
| **Detailed** | *Classic with ship-to, dispatch-from, PAN/TAN and tax on each line.* | Navy |
| **Modern** | *Soft cards and a filled items table.* | Gold |

---

### 27.1 Choose your business's template

**Goal:** Pick how all your documents print.
**Who / plan:** Owner or Admin, on any plan.

**Before you start:** Issue at least one invoice. The preview on this screen is your latest invoice; without one it says *Issue an invoice to see a preview here.*

**Steps**
1. **More › Settings › Invoice design** (under **Account**).
2. Under **Template**, tap **Standard**, **Classic**, **Detailed** or **Modern**. Each shows a small sketch in its colour. *Every template prints what GST asks for. Each invoice can also be printed in another one from its preview.*
3. Pick an **Accent colour**: Blue, Navy, Green, Red, Purple, Orange, Gold or Charcoal.
4. On Classic, Detailed and Modern, pick which side the **Logo** sits: **Left** or **Right**.
5. Under **What prints**, turn sections on or off (27.2).
6. Optionally type a **Footer line** (*For example: Thank you for your business.*). It replaces the app's own line at the foot.
7. Tap **Save** (🖥 **Ctrl/⌘+S**): *Invoice design saved*.

**What happens:** the preview updates as you change things (🖥 beside the controls; 📱 below them). After saving, every document prints in the new design, unless it has a template of its own (27.4).

**Rules & gotchas**
- Changing the design doesn't change any document's content, number or tax; only how it looks.
- Nothing is saved until you tap **Save**.

### 27.2 What prints: the switches

Each template offers only the switches that change its page.

| Switch | Standard | Classic | Detailed | Modern |
|---|---|---|---|---|
| **Discount column** | ✓ on | — | ✓ on | — |
| **Tax rate column** | ✓ on | — | — | — |
| **HSN/SAC under each item** | ✓ on | — (HSN has its own column) | — | — |
| **Logo** | ✓ on | ✓ on | ✓ on | ✓ on |
| **HSN-wise tax table** | — | ✓ on | ✓ on | ✓ on |
| **Bank details and UPI QR** | ✓ on | ✓ on | ✓ on | ✓ on |
| **Signature** | ✓ on | ✓ on | ✓ on | ✓ on |
| **Declaration** | — | ✓ on | ✓ on | ✓ on |
| **Ship-to and dispatch-from** | — | off | ✓ on | off |
| **Company PAN and TAN** | — | off | ✓ on | off |
| **Customer's seal box** | — | ✓ on | ✓ on | ✓ on |
| **Compact** | off | off | off | off |

"on" / "off" is the default for that template; "—" means the switch isn't offered.

- **Declaration**: with it on, a **Declaration text** box appears. Left empty it prints *We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.* Up to 300 characters.
- **Compact**: *Smaller type, so long invoices take fewer pages.*
- On Classic, Detailed and Modern, a PDF that runs over several pages has page numbers.

### 27.3 Preview, print and pick a copy

**Goal:** See the document as the customer will, and print the right copy.
**Who / plan:** Anyone who can open the document, on any plan.

**Steps**
1. Open the document. 📱 **Actions › Preview document**. 🖥 the **Preview** tab shows the page; **Actions › Preview document** opens the full preview with the pickers.
2. At the top, **Template** shows the one this document prints in, and **Copy** which copy.
3. Tap **Copy** and pick **Original for recipient**, **Duplicate for transporter**, **Triplicate for supplier**, or **All three**.
4. Tap **Print**, or **Save as PDF** (🖥) / **Share PDF** (📱).

**What happens**
- The copy's label prints at the top right of the page, for example *DUPLICATE FOR TRANSPORTER* (CGST Rule 48). In a Tamil PDF it prints in Tamil with the English wording after it, for example *போக்குவரத்தாளருக்கான இரண்டாம் நகல் · DUPLICATE FOR TRANSPORTER*. On Standard, the original prints with no label.
- **All three** puts the three copies one after another in one PDF.
- The copy is for this print only. It isn't saved on the document, and emails and links always carry the original.
- If the device can't print you see *Printing is not available here*.

### 27.4 Print one document in another template

**Goal:** Use a different template for one customer's invoice, without changing the business default.
**Who / plan:** Owner, Admin, Accountant or Sales, on any plan.

**Steps**
1. Open the document's preview (27.3).
2. Tap **Template** and pick another one. The list starts with **Business default (Classic)**, the one from settings.
3. *This invoice now prints in Modern.*

**What happens:** the choice is saved on the document on the server, so its PDF, emails and shared link follow it, on every device. Pick **Business default (…)** to go back. Any document can change its template in any status, even after it is issued, because it changes only how it looks.

### 27.5 Add your logo

**Steps**
1. **More › Settings › Business profile**.
2. Tap **Add logo** and pick an image. *Your business logo. PNG or JPEG, up to 5 MB.*
3. *Logo updated*. **Change logo** replaces it; **Remove** asks *Remove the logo?* first.

**Rules & gotchas**
- *That image is over 5 MB. Choose a smaller one.* / *Use a PNG or JPEG image.*
- Turn **Logo** off in Invoice design to print without it while keeping it on file.
- The email the customer gets carries the logo too.

### 27.6 Add a signature

**Goal:** Print your signature above *Authorised signatory*.
**Who / plan:** Owner or Admin, on any plan.

**Steps**
1. **More › Settings › Business profile › Bank & signature**.
2. Tap **Add signature** and pick a photo. *A photo of your signature on white paper works; a transparent PNG looks best.*
3. **Check the signature** shows how it prints (*For Vertex Traders*). If it looks faint or cropped, pick a clearer photo. Tap **Use this signature**.
4. *Signature updated*. **Change** replaces it; **Remove** asks *Remove the signature?* (*Documents print without it from now on.*).

Turn **Signature** off in Invoice design to keep it on file but not print it.

### 27.7 Bank details and the UPI QR

**Goal:** Tell customers where to pay.
**Who / plan:** Owner or Admin, on any plan.

**Steps**
1. **More › Settings › Business profile › Bank & signature**.
2. Pick **Account in your books**: the bank account under **Payment accounts** these details belong to. *Money customers pay against your invoices goes into this account by default.* If the account number field is empty, it is filled in from that account.
3. Fill in **Account holder name**, **Bank name**, **Branch**, **Account number**, **IFSC** and **UPI ID**.
4. Save the business profile.

**What happens**
- The bank block prints on invoices, quotations, proformas and orders. *With a UPI ID, the invoice carries a QR code for the amount* (*Scan to pay with any UPI app*), on INR invoices only.
- The editor's **Paid into** card shows these details, with **Change in settings**.
- Payments received default to the linked account, and **Payment accounts** marks it **On invoices**.

**Rules & gotchas**
- If the number you typed differs from the linked account's: *The account number above isn't the one saved for HDFC Current ({number}). Customers will pay into the number printed here.*
- Only a bank account can be linked; with none, *Add a bank account under Cash and bank accounts to link it here.*
- The linked account can't be deleted or changed to another type while invoices print it: *Your invoices print this account; pick another under Business profile, bank details first*.
- Turn **Bank details and UPI QR** off in Invoice design to hide the block.

### 27.8 Brands

**More › Settings › Brands** keeps the makers of what you sell (*e.g. SKF*), to pick on each item. **Add brand**, tap one to rename it, or **Delete** it. *A brand that items carry can’t be deleted. Change those items’ brand first.* Brands don't print on documents. See [09 — Items & stock](09-items-and-stock.md).

**Related:** [05 — Sales](05-sales.md#511-share-print-and-send) · [13 — Settings](13-settings.md) · [11 — GST compliance](11-gst-compliance.md)
