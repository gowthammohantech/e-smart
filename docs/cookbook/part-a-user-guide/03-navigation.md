# 03 — Finding your way around

The phone app and the web app have the same screens, laid out differently:
- 📱 **Phone** and narrow browser windows (under 768 px): a header at the top and a tab bar at the bottom.
- 🖥 **Desktop** (browser 768 px or wider): a sidebar on the left and a top bar.

Every list of places in the app comes from one menu, so a page sits in the same section on the phone tab bar, the More screen, the desktop sidebar and search. What your plan can't open, and modules the owner switched off under **Settings › Modules**, are left out everywhere.

---

### 3.1 The sections

| Section | Pages |
|---|---|
| **Home** | Dashboard ([04](04-home-dashboard.md)) |
| **Sell** | Invoices, Quotations, Proforma invoices, Waiting for approval, Sales orders, Delivery notes · *Adjustments:* Sales returns, Credit notes, Debit notes ([05](05-sales.md)) |
| **Buy** | Purchase bills, Purchase orders, Goods receipts · *Adjustments:* Purchase returns, Supplier credit notes, Supplier debit notes · **Scan a bill** ([06](06-purchases.md)) |
| **Stock** | Items & services, Stock movements, Low stock ([09](09-items-and-stock.md)) |
| **Money** | *Accounts:* Accounts & P&L, Books, Bank reconciliation, Cash-flow forecast, Fixed assets, Budgets, Cost centres · *Cash flow:* Payments received, **Advance receipt**, Payments made, Receipts, Adjust advance, Transfer · *Dues:* Receivables, Payables · *Spending:* Expenses ([07](07-payments.md), [19](19-books.md), [22](22-banking-and-reconciliation.md)) |
| **GST** | *Compliance:* GST compliance · *Returns:* GSTR-1, GSTR-2B, 2B reconciliation, GST returns, Utilization entry, GST challan, GST journal ([11](11-gst-compliance.md), [21](21-gst-returns.md)) |
| **People** | Customers and suppliers ([08](08-contacts.md)) |
| **Reports** | The reports hub ([12](12-reports.md)) |
| **More** | Tools and settings (3.2) |

On a sales plan (Free, Smart Basic), Buy, the Books pages, Payables, Payments made and Expenses are hidden. Stock still shows **Items & services**.

---

### 3.2 The tabs and More on your phone

The tab bar depends on your plan.

| Plan | Tabs | Where the rest lives |
|---|---|---|
| **Full plans** (Smart Pro, Smart Business) | **Home · Sell · Buy · Stock · More** | Money, GST, People and Reports are in **More** |
| **Sales plans** (Free, Smart Basic) | **Home · Sell · GST · More**, split around Lixi's orb in a floating bar | Stock (Items & services), Money, People and Reports are in **More** |

**Tips**
- **Swipe** left or right on a screen to move to the next or previous tab.
- **Hold** a tab to ask Lixi about that screen. You can switch this off (see [16 — Lixi assistant](16-lixi-assistant.md)).
- A red number on **More** counts unread notifications.

**The More screen** (*Settings and tools*), from the top:
1. Your name card: opens **Your profile** ([01](01-getting-started.md#17-your-profile)).
2. The sections that aren't on your tab bar, each with its pages (for example **Money** and **GST** on a full plan).
3. **More sections**: People, Reports.
4. **Tools**: Ask Lixi, Global search, Notifications.
5. **Business setup**: Business profile, Branches, Users & roles, Taxes, Currencies & rates, Document numbering, Payment accounts, Expense categories, Item categories, Brands, Vehicles.
6. **GST & e-invoicing**: GST portal connection, E-invoicing & e-way bill, Transporters.
7. **Data**: Integrations, Backup & export, Audit trail.
8. **Account**: Modules, Invoice design, AI usage, Custom fields, Approvals, Notification preferences, Plan & billing, Appearance & language, About.
9. **Sign out**, and the version (*Elixir Books Smart · version …*).

Pages from More get a back arrow in their header.

### 3.3 The phone header

On every tab:
- Your **business logo** opens **Business profile**.
- The **business name** opens **Switch business** (3.4). The line under it names the branch and opens the branch list (3.5).
- **No internet connection** (amber) when the server can't be reached, or **Loading your books…** while a business's setup arrives. Otherwise a small dot shows how fast the server is answering (green fast, amber a bit slow, red slow); tap it for the round trip split into **Server** and **Network**. On a wide phone the dot also shows the time.
- **Demo**, only in the public demo ([01](01-getting-started.md#11-try-the-demo-without-signing-up)).
- 🔍 search and 🔔 notifications, with the unread count.

---

### 3.4 Switch business

**Goal:** Move between businesses on your account, for example from Vertex Traders to Aurora Design Studio.
**Who / plan:** Anyone who belongs to more than one business.

**Steps**
- 📱 Tap the business name in the header. **Switch business** opens (*Each business keeps its own books, numbering and reports.*), listing each business with its type and currency. Pick one.
- 🖥 Click the business picker at the left of the top bar (it shows the GSTIN under the name). Pick from **Businesses**. **Business profile** at the bottom opens its settings.
- On either: **Your profile › Your businesses**.

**What happens:** *Switched to {business}.* The new business's setup loads before its screens show, so you never see one business's data under another's name. Each business's plan decides what you see: that's why Vertex Traders (Pro) shows Buy and Stock, and Aurora (Basic) doesn't.

### 3.5 Switch branch

**Goal:** Work as one branch, or see every branch together.
**Who / plan:** Businesses with more than one branch (full plans).

**Steps**
- 📱 Tap the line under the business name.
- 🖥 Click the branch picker beside the business picker (it shows the branch code). **Branches** at the bottom opens the branch settings.
- Pick a branch, for example *Pune — Warehouse*, or **All branches**.

**What happens:** *Now showing {branch}.* New documents default to that branch; document, payment and expense lists, stock levels and Home all follow it. **All branches** shows everything combined. A user limited to some branches sees only those.

---

### 3.6 Search everything

**Goal:** Find an invoice number, a customer, an item's SKU, a payment reference, an expense, or a page.

**Steps**
- 📱 The 🔍 in the header, or **More › Global search**. Type into *Invoices, contacts, items, payments…*
- 🖥 Click the search box in the top bar (*Search invoices, customers, items…*), or press **⌘K** (Mac) / **Ctrl+K**, or **/** when you aren't typing in a field. This opens the command palette.
  - Empty, it lists **Quick actions** (New invoice, New quote, Receive payment, Add expense, Add customer, Add item) and **Go to** (the sections).
  - Type at least two characters to search **Pages** and your records. Typing "new invoice" puts that action first.
  - **↑↓** to move, **Enter** to open, **Esc** to close.

**What happens:** Results are grouped: pages, then documents and Customers, Suppliers, Items, Payments, Expenses. Pages match by name and by section, so "sales" finds the Sell pages.

**Rules & gotchas**
- Search looks only in the business you are in. *Nothing in this business matches "…".*
- Searches are not remembered.
- Search needs the server: *Search didn't go through* with **Try again** if it can't be reached.

### 3.7 Notifications

**Goal:** See what happened: invoices sent, payments received, overdue reminders, stock alerts, e-invoice and e-way bill events.

**Steps**
- 📱 The 🔔 in the header, or **More › Notifications**. Filter **All** or **Unread**; tap one to open what it's about.
- 🖥 The bell in the top bar opens the latest few (*You're all caught up* when there are none). **View all** opens the full list.

Then, as needed:
- **Mark all read** (*All caught up*).
- **Clear all** › **Clear all notifications?** *The underlying records are untouched.* (*Notifications cleared*)

**Rules & gotchas:** *Delivered in-app · push, email and WhatsApp are configured under Integrations* (see [13 — Settings](13-settings.md)). Which events notify you is set in **Notification preferences**.

---

### 3.8 The web desktop layout

**Sidebar**
- The logo at the top opens **Home**. Then the sections in bands, split by thin rules: **Home** · **Sell, Buy, Stock** · **Money, GST** · **People, Reports**.
- Click a section to drop its pages down under it, one section at a time: **{Section} overview** first, then its pages under their headings (Documents, Adjustments, Accounts, Cash flow, Dues, Spending, Compliance, Returns), then its actions (**Scan a bill**, **Advance receipt**). Arriving in a section opens its list; click the row again to close it.
- A page that lists documents has a **+** beside it that starts a new one (for example **+** beside Invoices).
- A closed section shows its pages' badges added up, for example rejected e-invoices on **GST**.
- **Next filing** card: when the menu leaves room at the bottom, a card shows the next GST return or TDS deposit due, its period, *Due {date}* and how long is left (*today*, *tomorrow*, *in 5 days*, or *3 days late* in red; amber within 3 days), and *+2 more due*. With nothing due: *All filings up to date* (*Nothing left to file in the next 60 days.*). Click it to open **GST returns**. A dropped-down section takes the room back and the card hides until you close it. It shows only on plans and roles that can open GST returns.
- At the foot: **Settings**, and **Collapse sidebar** / **Expand sidebar**.

**Folded sidebar**
- Folded, only icons show; hover an icon for its name. Clicking a section opens its pages in a panel beside the sidebar, in columns by heading, each with its **+**. **Esc**, a click outside or picking a page closes it.
- The browser remembers whether you folded it.
- Between 768 and 1023 px wide the sidebar is always icons-only. Opening it by hand lasts until you pick a page.
- In **Settings** the sidebar folds to icons for the visit, because Settings brings its own list of pages beside the page. Leaving Settings puts it back as you keep it.

**Top bar**
- Left: the business picker and the branch picker (3.4, 3.5). Names shorten when space is short.
- Middle: the search box (3.6).
- Right:
  - **No internet connection** or **Loading your books…** when they apply. Saving is off while offline.
  - The server-speed dot and time (hidden on narrow windows); click it for the breakdown.
  - **Demo**, in the public demo.
  - **Ask Lixi**, which opens Lixi in a panel on the right; the page stays usable beside it.
  - The notifications bell.
  - The account menu (your avatar): your name and email, **Your profile**, **Plan & billing**, **Appearance & language**, **All settings**, **Sign out**.

**What's different on desktop**
- Pages keep a readable width; settings pages and data-heavy screens use the full width, with lists as tables.
- Document lists are sortable tables with a **Balance due** column.
- The document editor is one page instead of the phone's steps. **Ctrl/⌘+Enter** finalises.
- A phone's bottom sheets become a centred dialog or a drawer from the right. Short pickers drop down under their field.
- A page's **Create** button opens its menu right under the button.
- **More** becomes a grid of cards.
- **Copy link** copies to your clipboard. **Send by email** and **Send on WhatsApp** open your own mail app or WhatsApp Web.
- Bill scanning (OCR) isn't available in a browser (see [10 — Expenses & bill scanning](10-expenses-and-ocr.md)).
- **Skip to content** appears on the first Tab press, for keyboard users.
- If you leave a form with unsaved changes, **Leave without saving?** asks first (**Leave** / **Stay**).

### 3.9 Siri and Shortcuts (iPhone)

On iPhone, Siri and the Shortcuts app can open a prefilled screen, such as a new invoice for a chosen customer. The screen opens ready for you to check and save; nothing is saved without you.

### Not available yet

- **An installable desktop app** (Mac or Windows). Use the web app in a browser.
