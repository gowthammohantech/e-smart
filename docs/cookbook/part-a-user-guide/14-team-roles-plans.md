# 14 — Team, roles & plans

This chapter covers who can use a business, what each person may do, and what each plan includes.

- **Team management:** owner or admin. Only an owner can create, change or remove another owner.
- **Plan:** every role can see the plan page. Changing the plan isn't done in the app today ([Change the plan](#change-the-plan)).

---

## Team

### Invite someone

**Goal:** give an accountant, a salesperson or a viewer access to this business.
**Who / plan:** owner or admin · any plan with a free seat.

**Before you start**
- Have the person's name and email address.
- Check the plan has a free seat ([Seat limits](#seat-limits)).

**Steps**
1. Open **More › Business setup › Users & roles**.
2. Tap **Invite someone**.
3. Enter their **Name** and **Email**, and pick a **Role**. Each role shows a one-line description; see [Role matrix](#role-matrix).
4. Tap **Send invitation**. You see **Invitation sent**.

**What happens**
- The person appears in the list as **Invited**, with **Invitation pending**.
- They get an email with an invitation link, valid for 7 days. When they open it, they see the business name, who invited them and their role ([01 › Accept an invitation](01-getting-started.md)):
  - New users set a password.
  - People who already have an Elixir Books account just accept. They join as a guest and keep their own account.
- Once they accept, they're listed with **Last active 〈when〉**.

**Rules & gotchas**
- **Seat limits count pending invitations.** When every seat is taken, you see **Upgrade to invite more people** with a **See plans** button. For example: *"Your Smart Basic plan includes 2 users, and every seat is taken (pending invitations count). Upgrade to invite more people."*
- Inviting an email that is already on your team: *"This person is already on your team"*. Edit their role instead.
- Inviting someone from another account who already has access: *"〈Name〉 already has access to 〈business〉"*.
- If the email can't be sent, the invitation is still saved: *"The invitation for 〈email〉 was saved, but the email could not be sent. Use "Resend invite" to try again."*
- If the invitation emails link to the wrong address (for example localhost), the server's app URL isn't set; tell your administrator. See [18](18-troubleshooting-faq.md).
- The app doesn't let you limit a person to certain branches. Branch limits can only be set up on the server today ([18](18-troubleshooting-faq.md#not-available-yet)).

*Demo:* Priya Nair (`priya@vertextraders.in`, viewer) is a pending invitation in Vertex Traders.

### Resend, edit or remove a team member

**Goal:** chase an invitation, change someone's name or role, or take their access away.
**Who / plan:** owner or admin · any plan.

**Steps**

On **Users & roles**, tap the person, then:
- **Resend invite:** for an invitation that hasn't been accepted. You see **Invitation sent again**. The button then counts down (**Resend in 〈N〉s**): you can send it again after a minute.
- **Edit user:** change their **Name** or **Role**, then **Save**. You see **User updated**.
- **Remove:** confirm **Remove 〈name〉?**. You see **User removed**.

**What happens**
- A removed person loses access to this business immediately: *"They immediately lose access to this business. Documents they created stay in your books."*
- A role change applies from their next action.

**Rules & gotchas**
- Only an owner can make someone an owner, or change or remove an owner: *"Only an owner can manage owners"*.
- The last active owner can't be demoted or removed: *"The account needs at least one active owner"*. Make someone else an owner first.
- You can't remove yourself, or disable yourself.
- **Guests** (people with their own Elixir Books account) can't be edited here: *"This person has their own Elixir Books account. To change their access, remove them and invite them again."*

---

## Role matrix

Every business has five roles. A person can hold a different role in each business they belong to. **The server checks the role on every action**; the app hides only a few controls by role. If someone tries something their role doesn't allow, the action fails with *"This needs one of: owner, admin, …"* ([18](18-troubleshooting-faq.md#plans-and-permissions)).

The plan still applies on top of the role: a module that isn't in the plan, or that the owner has switched off, is closed to everyone ([Plans](#plans)).

### Everyday work

| What you can do | Owner | Admin | Accountant | Sales | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| View documents, contacts, items, payments, reports, the dashboard; ask Lixi | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create and edit drafts; finalise, convert, duplicate, change status (including cancel), send, payment links, choose a document's print layout | ✓ | ✓ | ✓ | ✓ | — |
| Add and edit customers and suppliers | ✓ | ✓ | ✓ | ✓ | — |
| Record a payment (received or made) | ✓ | ✓ | ✓ | ✓ | — |
| Send payment reminders; upload attachments | ✓ | ✓ | ✓ | ✓ | — |
| Set a document to repeat (recurring invoices) | ✓ | ✓ | ✓ | — | — |
| Edit a recorded payment; adjust advances and credit notes against invoices, or undo an adjustment | ✓ | ✓ | ✓ | — | — |
| Add and edit items, item categories and brands | ✓ | ✓ | ✓ | — | — |
| Record and edit expenses; scan bills (OCR) | ✓ | ✓ | ✓ | — | — |
| Stock adjustments and branch transfers | ✓ | ✓ | ✓ | — | — |
| E-invoice (IRN) and e-way bill: generate, update Part-B, extend, cancel | ✓ | ✓ | ✓ | — | — |
| Delete attachments | ✓ | ✓ | ✓ | — | — |
| Delete documents, contacts, items, payments, expenses | ✓ | ✓ | — | — | — |

### Approvals

| What you can do | Owner | Admin | Accountant | Sales | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| See what is waiting for approval | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approve or reject a document or a supplier payment that is waiting | ✓ | ✓ | — | — | — |
| Issue documents and pay suppliers without waiting for approval | ✓ | ✓ | — | — | — |
| Set what needs approval (**Approvals** rules) | ✓ | — | — | — | — |

Accountants and sales staff wait for an approver only where the owner has set a rule. See [25 Approvals](25-approvals.md).

### Books, GST returns and imports (full plans)

| What you can do | Owner | Admin | Accountant | Sales | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| View the books, budgets, fixed assets, bank statements and reconciliation | ✓ | ✓ | ✓ | ✓ | ✓ |
| Chart of accounts, vouchers, voucher templates, cost centres: create, edit, delete | ✓ | ✓ | ✓ | — | — |
| Post to earlier years' profit (retained earnings) | ✓ | ✓ | draft only | — | — |
| Budgets: create, edit, delete | ✓ | ✓ | ✓ | — | — |
| Fixed assets: create, edit, delete | ✓ | ✓ | ✓ | — | — |
| Bank reconciliation: import or remove a statement, match, unmatch, exclude, record from a bank line | ✓ | ✓ | ✓ | — | — |
| Cash forecast | ✓ | ✓ | ✓ | — | — |
| GST portal connection; GSTR-2B (fetch, import, match, claim); GSTR-3B; set-off; save and file returns | ✓ | ✓ | ✓ | — | — |
| Import customers, suppliers, items, opening invoices and bills, and journals | ✓ | ✓ | ✓ | — | — |
| Close or reopen the books (period lock) | ✓ | — | — | — | — |
| Change how stock is kept in the books, or how it is costed (average or FIFO) | ✓ | — | — | — | — |

GSTR-2B, bank reconciliation, budgets, fixed assets, vouchers and the cash forecast are in [21](21-gst-returns.md), [22](22-banking-and-reconciliation.md), [24](24-budgets-and-forecasts.md), [23](23-fixed-assets.md), [19](19-books.md) and [26](26-imports-and-opening-balances.md).

**Branch limits:** a person limited to some of the branches can't open or post to the books, TDS/TCS reports or the balance sheet, which cover every branch. They see *"The books cover every branch; ask an owner or admin"*.

### Settings and the business

| What you can do | Owner | Admin | Accountant | Sales | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| Taxes, expense categories, payment accounts, exchange rates, transporters, vehicles | ✓ | ✓ | ✓ | — | — |
| Read the audit trail | ✓ | ✓ | ✓ | — | — |
| Business profile, logo, signature, branches, numbering, custom fields, invoice design | ✓ | ✓ | — | — | — |
| E-invoicing settings and portal logins | ✓ | ✓ | — | — | — |
| Integrations; backup & export; automatic backup settings | ✓ | ✓ | — | — | — |
| Invite, edit and remove team members | ✓ | ✓¹ | — | — | — |
| Switch modules on or off (**Modules**) | ✓ | — | — | — | — |
| Set a lower AI budget (**AI usage**) | ✓ | —² | — | — | — |
| Archive or restore the business | ✓³ | — | — | — | — |
| Create another business | ✓⁴ | — | — | — | — |
| Change plan, billing, cancel subscription | ✓⁵ | — | — | — | — |

¹ Admins can't create, change or remove owners.
² The screen lets only the owner change it.
³ Only an owner on the account the business belongs to; a guest owner can't. See [28](28-company-archive-and-data.md).
⁴ Only during onboarding today; there is no "add a business" button in the app.
⁵ Allowed for owners only, but there is no plan-change button in the app today ([Change the plan](#change-the-plan)).

**Your own profile:** everyone can edit their own name and phone, turn on sign-in security, manage their devices, choose privacy settings and delete their own account ([01](01-getting-started.md), [13](13-settings.md)).

The in-app descriptions, under **What each role can do**:
- **Owner:** full access, including billing and deleting the business.
- **Admin:** everything except billing and deleting the business.
- **Accountant:** invoices, bills, payments, expenses and reports.
- **Sales:** quotes, invoices, customers and payments received.
- **Viewer:** read-only access to documents and reports.

> **Note:** the Smart Business plan card lists **Role-based access**, but roles work on every plan today; only the seat count differs.

---

## Plans

### Compare plans and see usage

**Goal:** see which plan the business is on, what it includes, and how much of it you use.
**Who / plan:** any role · any plan.

**Steps**
1. Open **More › Account › Plan & billing**. 🖥 On the desktop, open **Settings** and pick **Plan & billing**.
2. The top card shows your plan with **Active**, and your usage:
   - **Businesses**: how many you can open;
   - **Invoices this year**;
   - **Users**, as *"3 of 6"* on plans with a limit, or a plain count on Smart Business;
   - **Pending invitations**, when there are any.
3. 🖥 In a browser, the card also shows **Renews on 1 April · 〈price〉 a year**, or **Free forever**. Switch between **Monthly** and **Yearly · save 2 months** to compare prices.

📱 **The phone apps show no prices** and no billing cycle: only what each plan includes and which one you're on. This follows the app stores' billing rules.

| | Free | Smart Basic | Smart Pro | Smart Business |
|---|---|---|---|---|
| For | Get going and see if it fits | A shop or a solo trader who sells | Buy, stock and sell, for a growing business | Multiple locations and heavier volume |
| Monthly / yearly (web only) | ₹0 | ₹399 / ₹3,990 | ₹899 / ₹8,990 (**Popular**) | ₹1,799 / ₹17,990 |
| Users per business (owner included) | 1 | 2 | 6 | Unlimited |
| Invoices | 20 a month | Unlimited | Unlimited | Unlimited |
| AI actions a month (Lixi messages and server bill scans) | 30 | 300 | 1,500 | 5,000 |
| Sales, receipts, customers, receivables, e-invoice, e-way bill, GSTR-1 | ✓ | ✓ | ✓ | ✓ |
| Purchases, suppliers, payables, payments made | — | — | ✓ | ✓ |
| Stock, adding branches, stock transfers | — | — | ✓ | ✓ |
| Expenses and bill scanning (OCR) | — | — | ✓ | ✓ |
| Choosing a document's currency | — | — | ✓ | ✓ |
| Books: chart of accounts, vouchers, receipts, trial balance, P&L and balance sheet, budgets, fixed assets, bank reconciliation | — | — | ✓ | ✓ |
| GSTR-2B matching; GST set-off, challans and journals | — | — | ✓ | ✓ |
| Purchase, expense, payables, stock, profit, TDS, TCS payable, trial balance and MSME reports | — | — | ✓ | ✓ |

What the plan cards say, plan by plan:
- **Free:** 1 business · 20 invoices a month · E-invoice & e-way bill · Single user.
- **Smart Basic:** 1 business, 2 users · Unlimited invoices · E-invoice, e-way bill & GSTR-1 · Receivables & reminders.
- **Smart Pro:** 3 businesses, 6 users · Everything in Basic · Purchases & payables · Stock, branches & transfers · Expenses, OCR & multi-currency · All reports.
- **Smart Business:** Unlimited businesses & users · Everything in Pro · Role-based access · Priority compliance support · Backup & audit export.

**Rules & gotchas**
- The cards describe the offer. Today the app only enforces the seat limit, the Free invoice cap, the AI allowance and the full-plan modules above.
  - **Businesses** per plan isn't enforced, and there is no way to add a business in the app ([18](18-troubleshooting-faq.md#faq)).
  - **Receivables, reminders and GSTR-1** work on Free too.
  - **Role-based access, backup and audit export** work on every plan.
  - **Google Drive backup** is **Coming soon** on every plan ([13](13-settings.md)).
- **Currencies & rates** opens on every plan, and a customer set up in another currency can be invoiced in it on any plan. Picking a different currency on a document is a full-plan feature.
- **Branches** opens on every plan, so Free and Basic can name their one branch. Adding more branches needs Pro.
- An owner can also switch modules off for the business under **More › Account › Modules**. A module that is off behaves as if it weren't in the plan; its records stay.

### Change the plan

**Goal:** move to a plan with more modules or seats, or down to a cheaper one.
**Who / plan:** owner.

> **Not available yet in the app.** Online plan payments aren't live, so the plan page has no **Choose this plan**, **Downgrade** or **Cancel subscription** buttons. Only the current plan shows a (disabled) **Current plan** button. Every new business starts on **Free**.

**Steps (today)**
1. Contact Elixir Books support (**More › Account › About › Support**) and say which plan you want.
2. A platform operator changes the plan from the admin console ([17](17-admin-console.md#override-a-companys-plan)).
3. Reopen the app, or reload the page on the web. The new plan shows on **Plan & billing**, and the modules open.

**What happens on a downgrade**
- Moving from Pro or Business to Free or Basic hides purchases, stock, expenses and the books. **Nothing is deleted**.
- Move up again and it all comes back.

**Rules & gotchas**
- The price shown on the web is the list price; there is no checkout behind it yet.
- An operator's change can be undone by a billing event if the business ever had a paid subscription ([17](17-admin-console.md#override-a-companys-plan)).

### A module is locked

Opening something your plan doesn't include (purchases, suppliers, payables, payments made, stock, expenses, OCR, the books, receipts, GSTR-2B matching, or a full-plan report) shows the upgrade page.
- It reads, for example: **Purchases is on Smart Pro**. Below that: *"Smart Basic covers selling and GST. Upgrade to buy, stock and track expenses in the same books — anything you recorded before stays as it was."*
- Tap **See plans** to go to **Plan & billing**, or **Go back**.

Menu entries for locked modules are hidden, so you mostly reach this page from an old link or from one of Lixi's suggestions.

If the module is in your plan but the owner switched it off, the server answers *"〈module〉 is switched off for this business; an owner can switch it on in Settings"*.

### Hit the invoice limit (Free)

Free includes **20 invoices a month**. Finalising the 21st shows: *"Your free plan includes 20 invoices a month. Upgrade your plan to issue more."*
- Drafts are still allowed.
- Finalise them next month, or after the plan is changed.

### Seat limits

| Plan | Users per business |
|---|---|
| Free | 1 (just the owner) |
| Smart Basic | 2 |
| Smart Pro | 6 |
| Smart Business | Unlimited |

- The count includes the owner, every active member and every pending invitation.
- To free a seat, remove someone or remove a pending invitation.

### AI allowance

Lixi messages and bills read by the server's scanning service come out of a monthly allowance for each business. See [16 › AI usage and the monthly allowance](16-lixi-assistant.md#ai-usage-and-the-monthly-allowance).

---

**Related:** [01 Getting started](01-getting-started.md) · [13 Settings](13-settings.md) · [16 Lixi](16-lixi-assistant.md) · [17 Admin console](17-admin-console.md) · [18 Troubleshooting](18-troubleshooting-faq.md) · [25 Approvals](25-approvals.md) · [28 Company archive](28-company-archive-and-data.md)
