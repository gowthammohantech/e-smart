# 04 — Home dashboard

**Home** shows how the business is doing over the period you pick, and what needs your attention today. It always covers the business and branch you've selected (see [03 — Finding your way around](03-navigation.md)). Every figure comes from the server when you open the page; until it arrives the page shows grey placeholders shaped like the cards (shimmer), never zeroes.

---

### 4.1 Pick the period

**Goal:** Choose which dates the dashboard covers.
**Who / plan:** Every role and plan.

**Steps**
1. On the period bar under the greeting, pick **Today**, **This week**, **This month** (the default), **This quarter**, **This FY** or **Custom**.
2. For **Custom**, **Choose a period**: set **From** and **To**, then **Apply**. A range that ends before it starts shows *The period ends before it starts*.
3. Under **Show by**, bucket the charts by **Day**, **Week** or **Month**.
4. Turn on **Compare** (*vs previous period*) to see each tile against the same length of time just before.

**What happens:** The section heading names the period, and every tile, chart and list below follows it. The choice is one setting for Home and the section hubs, kept between visits on this device.

---

### 4.2 Read the dashboard

**Sections, from the top**

1. **Greeting**: *Good morning, Gowtham* (afternoon, evening), and *Here's how the business is doing this month.*

2. **Tiles** for the period. Each opens its detail.

   | Tile | What it shows | Opens |
   |---|---|---|
   | **Sales** | Value invoiced, with *N invoices* | Sales summary report |
   | **Collected** | Payments received | Payments received |
   | **Expenses** (full plans) | Expenses recorded, with *N entries* | Expenses |
   | **Profit** (full plans) | Profit *As the profit report*, from the books | Accounts & P&L |
   | **E-invoices** | *Reported to IRP*, or *N rejected* | GST › e-invoices |
   | **E-way bills** | **Active**, or *N expire in 24 h* | GST › e-way bills |

   With **Compare** on, each tile shows how it moved against the previous period.

3. **Charts**, each with **Export CSV**:
   - **Sales trend** (*Invoiced by period*).
   - **Net cash flow** (*Money in and out of cash and bank*): **In**, **Out** and **Net** per bucket.
   - **Invoices by status**: tap a status to open the invoice list filtered to it. *No invoices in this period* when empty.

4. **Money owed to you**: **Total receivable**, with *… overdue* and *… due soon*. **View all** opens **Receivables**.

5. **You owe** (full plans): **Total payable**, *… overdue* and *N open bills*. Opens **Payables**.

6. **Cash & bank**: the balance across your payment accounts (*N accounts*).

7. **Stock health** (plans with stock): **Stock value**, *Low N*, *Out N*, *Idle N* (*No sales in 90 days*) and *… sitting idle*. Opens the stock report.

8. **Needs your attention**. Possible rows, each with its count:
   - **Overdue invoices**
   - **Draft invoices**: drafts you never finalised
   - **Quotes awaiting reply**
   - **Items low on stock**
   - **E-invoices rejected**
   - **E-way bills expiring in 24 h**

   Tap a row to go straight to the list. Rows with nothing in them, or for modules your plan can't open, don't show.

9. **Chase these first**: the overdue invoices, oldest first (*12d overdue*). Tap one to open it.

10. **Filing cards** (see 4.3).

11. **Money in and out**: what was received, paid or spent in the period (*Received from …*, *Paid to …*, *… expense*), with **Export CSV**. *Nothing received, paid or spent in this period* when empty.

12. **Recent invoices**: the latest invoices with their status. **View all** opens Invoices.

🖥 On a desktop the charts take the wider column and the money cards sit beside them.

**Rules & gotchas**
- **Sales** counts finalised invoices only. Drafts and cancelled documents never count toward any total.
- **Profit** is the profit and loss figure for the same period and branch, from the books. It is not sales less expenses. See [19 — Books](19-books.md).
- Amounts in other currencies are converted at the rate saved on each document.
- Pulling down on 📱 Home opens Lixi (4.7), not a refresh. Without a connection, what is already on screen stays readable but doesn't refresh.

---

### 4.3 Filing cards

**Goal:** See what's due to the tax department and where your input credit stands. These cards only inform; nothing here files anything.
**Who / plan:** Shown when your plan and role can see them.

| Card | What it shows |
|---|---|
| **Filing calendar** | GSTR-1, IFF (optional), GSTR-3B, PMT-06 tax payment and TDS deposits, with *Due {date}* and **Filed**, **Due** or **Overdue**. Overdue first. *Nothing falls due in the next 60 days* when clear. |
| **ITC from GSTR-2B** | For the latest period: **Matched**, **Don't match**, **Not in your books**, **Not reported by suppliers**, **Claimable credit**, and *… of credit waits on suppliers*. If 2B isn't fetched yet: **Open GSTR-2B**. |
| **TDS to deposit** | TDS deducted and not yet deposited, by section and month, with *… overdue*. *All TDS deducted has been deposited* when clear. |

🖥 The same next filing also shows in the sidebar's **Next filing** card ([03](03-navigation.md#38-the-web-desktop-layout)). See [21 — GST returns](21-gst-returns.md) and [20 — TDS](20-tds-rcm-itc.md).

---

### 4.4 Accounts & P&L

**Goal:** See profit, cash and tax for the period on one page.
**Who / plan:** Full plans (it reads the books).

**Steps:** Tap the **Profit** tile, or open **Money › Accounts & P&L**.

**What's on it** (*Profit, cash and tax for the period*, same period bar as Home):
- **Profit & loss**: **Revenue**, **Cost of goods**, **Gross profit**, **Other income**, **Expenses**, **Net profit** and the margin.
- **Profit trend** (*Net profit by period*).
- **Cash movement**: **Opening**, **Receipts**, **Payments**, **Expenses**, **Tax paid**, **Other**, **Closing**.
- **GST position**: **On sales**, **On purchases & expenses**, and **Net payable** or **Net credit**.
- **Balance sheet** *As of {date}*, and **Accounts that moved most** (**Debit**, **Credit**, **Closing**).

**Rules & gotchas**
- *Opening and closing balances cover every branch, so they show with all branches selected.*
- A user limited to some branches sees *The books cover every branch. Ask an owner or admin to see the balance sheet and accounts.*

---

### 4.5 Create from Home

**Goal:** Start the most common jobs in one tap.

**Steps**
- 📱 Swipe through **Quick actions** under the greeting, or tap the round **Create** button for the full list.
- 🖥 Click **Create** in the page header; its menu opens under the button.

The actions: **New invoice**, **New quote**, **Receive payment**, **Add expense** (full plans), **Add customer**, **Add item**.

**Rules & gotchas:** An action your plan can't open is hidden. For example, Aurora Design Studio (Smart Basic) has no **Add expense**.

---

### 4.6 First steps for a new business

**Goal:** Get from an empty book to your first invoice.

**When you see it:** A business with nothing in it yet shows a first-run Home instead of empty charts:
- 📱 **Let's get you started** (*Raise your first invoice and this dashboard fills in…*), the quick actions, and the setup checklist.
- 🖥 **Getting started**, **Welcome, {name}** (*{business} is ready…*), buttons for **Create your first invoice** and **Add customer**, the checklist, and the quick actions as a grid.

**The setup checklist** (**Set up your business**, *2 of 7 done*). Each step opens where it's done and is ticked once it is:

| Step | Done when |
|---|---|
| **Complete your business profile** | Logo, address, and a phone or email are saved |
| **Set up GST** | A GSTIN is saved, or the business is marked not registered |
| **Add bank details and signature** | An account number or UPI ID, and a signature, are saved |
| **Add a customer** | There is at least one customer |
| **Add a product or service** | There is at least one item |
| **Create your first invoice** | There is at least one invoice |
| **Invite your team** | Someone else has been added to the business |

Steps your plan or role can't open are left out. The checklist stays on Home, above the tiles, until every step is ticked or you tap **Hide setup steps** (remembered per business on this device).

---

### 4.7 Ask Lixi from Home

📱 **Pull down on Home** to open Lixi, if that gesture is on under **Appearance & language** (see [16 — Lixi assistant](16-lixi-assistant.md)). For example, ask *"Who owes me the most?"* 🖥 Use **Ask Lixi** in the top bar.
