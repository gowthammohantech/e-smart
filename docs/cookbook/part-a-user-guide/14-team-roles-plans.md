# 14 — Team, roles & plans

This chapter covers who can use a business, what each person may do, and what the plan includes.

- **Team management:** owner or admin. Only an owner can create, change or remove another owner.
- **Plan and billing:** owner only.

---

## Team

### Invite someone

**Goal:** give an accountant, a salesperson or a viewer access to this business.
**Who / plan:** owner or admin · any plan with a free seat.

**Steps**
1. Open **More › Business setup › Users & roles**.
2. Tap **Invite someone**.
3. Enter their **Name** and **Email**, and pick a **Role**. Each role shows a one-line description; see [Role matrix](#role-matrix).
4. Tap **Send invitation**. You see **Invitation sent**.

**What happens**
- The person appears in the list as **Invited**, with **Invitation pending**.
- They get an email with an invitation link. When they open it, they see the business name, who invited them and their role ([01 › Accept an invitation](01-getting-started.md)):
  - New users set a password.
  - People who already have an Elixir Books account just accept.
- Once they accept, they're listed with **Last active 〈when〉**.

**Rules & gotchas**
- **Seat limits count pending invitations.** When every seat is taken, you see **Upgrade to invite more people** with a **See plans** button. For example: *"Your Smart Basic plan includes 2 users, and every seat is taken (pending invitations count)."*
- A person whose access belongs to another account shows: *"This person has their own Elixir Books account. To change their access, remove them and invite them again."*
- If the invitation emails link to the wrong address (for example localhost), the server's app URL isn't set; tell your administrator. See [18](18-troubleshooting-faq.md).

*Demo:* Priya Nair (`priya@vertextraders.in`, viewer) is a pending invitation in Vertex Traders.

### Resend, edit or remove a team member

On **Users & roles**, tap the person:
- **Resend invite:** for an invitation that hasn't been accepted. You see **Invitation sent again**.
- **Edit user:** change their **Name** or **Role**, then **Save**. You see **User updated**.
- **Remove:** confirm **Remove 〈name〉?**.
  - They lose access to this business immediately.
  - Documents they created stay in your books.

**Rules & gotchas**
- Only an owner can make someone an owner, or change or remove an owner.
- The last active owner can't be demoted or removed. Every business keeps at least one owner.

---

## Role matrix

Every business has five roles. A person can hold a different role in each business they belong to. **The server checks the role on every action**; the app hides only a few controls by role. If someone tries something their role doesn't allow, the action fails with a permission message ([18](18-troubleshooting-faq.md#common-errors)).

| What you can do | Owner | Admin | Accountant | Sales | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| View documents, contacts, items, reports | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create and edit drafts; finalise, convert, duplicate, change status, send, payment links | ✓ | ✓ | ✓ | ✓ | — |
| Add and edit customers and suppliers | ✓ | ✓ | ✓ | ✓ | — |
| Record a payment (received or made) | ✓ | ✓ | ✓ | ✓ | — |
| Send payment reminders; upload attachments | ✓ | ✓ | ✓ | ✓ | — |
| Edit a recorded payment | ✓ | ✓ | ✓ | — | — |
| Add and edit items | ✓ | ✓ | ✓ | — | — |
| Record and edit expenses; scan bills (OCR) | ✓ | ✓ | ✓ | — | — |
| Stock adjustments and branch transfers | ✓ | ✓ | ✓ | — | — |
| E-invoice (IRN) and e-way bill: generate, update, extend, cancel | ✓ | ✓ | ✓ | — | — |
| Taxes, expense categories, payment accounts, exchange rates, transporters | ✓ | ✓ | ✓ | — | — |
| Read the audit trail; delete attachments | ✓ | ✓ | ✓ | — | — |
| Delete documents, contacts, items, payments, expenses | ✓ | ✓ | — | — | — |
| Business profile, logo, branches, numbering | ✓ | ✓ | — | — | — |
| E-invoicing settings and portal logins | ✓ | ✓ | — | — | — |
| Integrations; backup & export | ✓ | ✓ | — | — | — |
| Invite, edit and remove team members | ✓ | ✓¹ | — | — | — |
| Change plan, billing, cancel subscription | ✓ | — | — | — | — |
| Create another business | ✓ | — | — | — | — |
| Close or reopen the books (period lock) | ✓ | — | — | — | — |

¹ Admins can't create, change or remove owners.

The in-app descriptions, under **What each role can do**:
- **Owner:** full access, including billing and deleting the business.
- **Admin:** everything except billing and deleting the business.
- **Accountant:** invoices, bills, payments, expenses and reports.
- **Sales:** quotes, invoices, customers and payments received.
- **Viewer:** read-only access to documents and reports.

> **Note:** the product plan lists role-based access as a Smart Business feature, but roles work on every plan today; only the seat count differs.

---

## Plans

### Compare plans and see usage

Open **More › Account › Plan & billing**. 🖥 Account menu › **Plan**.

| | Free | Smart Basic | Smart Pro | Smart Business |
|---|---|---|---|---|
| For | Get going and see if it fits | A shop or a solo trader who sells | Buy, stock and sell, for a growing business | Multiple locations and heavier volume |
| Monthly / yearly | ₹0 | ₹399 / ₹3,990 | ₹899 / ₹8,990 (**Popular**) | ₹1,799 / ₹17,990 |
| Businesses | 1 | 1 | 3 | Unlimited |
| Users per business | 1 | 2 | 6 | Unlimited |
| Invoices | 20 a month | Unlimited | Unlimited | Unlimited |
| E-invoice, e-way bill | ✓ | ✓ + GSTR-1 | ✓ | ✓ |
| Receivables & reminders | — | ✓ | ✓ | ✓ |
| Purchases & payables; stock, branches & transfers; expenses, OCR & multi-currency; all reports | — | — | ✓ | ✓ |
| Priority compliance support; backup to Google Drive | — | — | — | ✓ |

The top of the screen shows your current plan and usage: **Businesses**, **Invoices this year**, **Users** and **Pending invitations**. Switch between **Monthly** and **Yearly · save 2 months** to compare prices.

### Upgrade or downgrade the plan

**Goal:** move to a plan with more modules or seats, or down to a cheaper one.
**Who / plan:** owner · online.

**Steps**
1. On **Plan & billing**, find the plan you want and tap **Choose this plan**. On a lower plan the button reads **Downgrade**.
2. A secure checkout page opens. Complete the payment there.
3. Return to the app. **The plan changes once the payment is confirmed**, usually within a minute. Every device sees it the next time it loads from the server.

**What happens on a downgrade**
- Moving from Pro or Business to Free or Basic hides purchases, stock and expenses. **Nothing is deleted**: *"purchases, stock and expenses are hidden, not deleted"*.
- Upgrade again and it all comes back.
- If you cancel a subscription, the business falls back to Free at the end of the paid period, with no data lost.

**Rules & gotchas**
- Checkout is always created for the **yearly** cycle, whatever the Monthly/Yearly toggle shows.
- If the checkout page doesn't open, nothing changes and no error is shown. Check your connection and try again.
- An operator can also change a plan from the admin console, for example a comp or a trial ([17](17-admin-console.md#override-a-companys-plan)).

### A module is locked

Opening something your plan doesn't include (purchases, suppliers, payables, payments made, stock, expenses, OCR, currencies, branches, or the five Pro reports) shows the upgrade page.
- It reads, for example: **Purchases is on Smart Pro**. Below that: *"Smart Basic covers selling and GST. Upgrade to buy, stock and track expenses in the same books — anything you recorded before stays as it was."*
- Tap **See plans** to go to **Plan & billing**.

Menu entries for locked modules are hidden, so you mostly reach this page from an old link or from Lixi.

### Hit the invoice limit (Free)

Free includes **20 invoices a month**. Finalising the 21st shows: *"Your free plan includes 20 invoices a month. Upgrade your plan to issue more."*
- Drafts are still allowed.
- Finalise them after upgrading, or next month.

---

**Related:** [01 Getting started](01-getting-started.md) · [13 Settings](13-settings.md) · [17 Admin console](17-admin-console.md) · [18 Troubleshooting](18-troubleshooting-faq.md)
