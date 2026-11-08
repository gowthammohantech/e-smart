# 17 — Admin console (platform operators)

> **This chapter is for platform operators**, the Elixir Books staff who look after every customer account. Business users never see the admin console.

The admin console is a separate web app. In it, operators can:
- see platform usage;
- look up tenant accounts, companies and users;
- suspend accounts, change a company's plan by hand, and disable users.

Every change asks for a written reason and is recorded in the platform audit log.

**Operator roles**

| Role | Can see | Can change |
|---|---|---|
| **Support** | Everything: overview, accounts, companies, users, audit log | Nothing |
| **Superadmin** | Everything | Suspend and reactivate accounts, override plans, disable and enable users |

Buttons a support operator isn't allowed to use are hidden, and the server refuses those actions anyway.

---

### Grant (or remove) operator access

**Goal:** make someone an operator.
**Who:** an engineer with database access. The console and the API **cannot grant operator roles**.

**Steps**
1. The person signs up for an ordinary Elixir Books account first.
2. From the repository, with the API's `.env` pointing at the right database, run:

   ```bash
   npm run db:platform-admin -w @esmart/db -- --email person@example.com --role superadmin
   ```

   - `--role` is `superadmin` (the default), `support`, or `none` to remove access.
3. The person signs out of the console and back in.

**Rules & gotchas**
- `No user with email …` means they haven't signed up yet.
- Granting and removing operator access is **not** recorded in the audit log. Keep your own record of who granted what.

---

### Sign in

1. Open the console URL. Locally that's http://localhost:5174 after `npm run admin`.
2. Enter your **Email** and **Password** and click **Sign in**.

- Accounts without an operator role are signed straight back out.
- Only email and password are accepted.

---

### Overview

The landing page. Pick a range: **30 days**, **90 days** or **12 months**.

| Tile or chart | Meaning |
|---|---|
| **Accounts** | Total tenant accounts, and how many are new in the range |
| **Companies** | Total businesses, and the share on a paid plan |
| **Users** | Everyone with a login |
| **Active users** | Users seen in the last 30 days |
| **Suspended accounts** | Accounts currently suspended |
| **Signups per day** | New accounts over the range |
| **Documents created per day** | Platform activity over the range |
| **Companies by plan** | How many businesses are on Free, Basic, Pro and Business. Use **Show as table** to see the numbers. |

---

### Find an account

**Accounts** lists every tenant. An account holds one or more companies and their team.
1. Type in **Search account, company, owner name or email**.
2. Filter by status (**All statuses**, **Active** or **Suspended**) and by plan (**Any plan**, or a specific plan).
3. Click a row to open the account. It shows the owner, the account's **Companies** and **Team members** (each with their role in the business), and **Operator actions on this account**.

---

### Suspend or reactivate an account

**Goal:** stop everyone on an account from using the product, for example after abuse or fraud, or at the customer's request. Or undo a suspension.
**Who:** superadmin.

**Steps**
1. Open the account and click **Suspend account**. On a suspended account the button reads **Reactivate account**.
2. Read what will happen:
   - **Suspend:** every user on the account is signed out on every device straight away, and nobody can sign in until it's reactivated. **Their data is kept.**
   - **Reactivate:** everyone can sign in again. Sessions ended by the suspension stay signed out.
3. Enter a **Reason** of 3–500 characters, for example *Support ticket #1234*. Click **Suspend account** or **Reactivate**.

**What happens**
- The account shows **Account suspended**.
- Its users, and guests invited to its businesses, see *"This account has been suspended. Contact support."* or *"This business has been suspended."*

---

### Override a company's plan

**Goal:** give a company a plan without going through billing, for example a comp, a trial extension or a support fix.
**Who:** superadmin.

**Steps**
1. Open the company from its account's **Companies** list. Find the account under **Accounts**, where you can also search by company name.
2. Check **Subscription** and **Plan history**.
3. Click **Change plan**.
4. Choose the **Plan**, marked **(current)** for the one it has now. Choose a **Status**: **Active** or **Trialing**.
5. *Optional:* set **Period ends**. This date is only shown to the company; **nothing downgrades automatically when it passes.**
6. Enter a **Reason** and click **Change plan**.

**What happens**
- The plan changes immediately. It shows in **Plan history** as **Changed by an operator**.
- The company's devices pick up the change the next time they load from the server.

**Rules & gotchas**
- **Billing can undo it.** If the company has a paid subscription, the next billing event may set the plan back. When that applies, the console shows a warning; it appears only **after** you confirm, so check **Subscription** first.
- Moving a company down hides its purchases, stock and expenses, but doesn't delete them ([14](14-team-roles-plans.md#upgrade-or-downgrade-the-plan)).
- To end a trial, set the plan back by hand.

---

### Disable or enable a user

**Goal:** lock out one person, for example a compromised login, without suspending the whole account.
**Who:** superadmin.

**Steps**
1. Open **Users**: everyone with a login, across every account.
2. Find the person with **Search name, email or phone**. You can filter by **Active**, **Invited** or **Disabled**.
3. Click **Disable**, or **Enable** for a disabled user.
4. Enter a **Reason** and confirm with **Disable user** or **Enable user**.

**What happens**
- **Disable:** they are signed out on every device and can't sign in until enabled again.
- **Enable:** they can sign in again.

**Rules & gotchas**
- Operators are shown as **Operator** and can't be disabled here. Use the CLI with `--role none` first.
- To change someone's role inside a business, ask the business's owner or admin ([14](14-team-roles-plans.md)). Operators don't edit tenant roles.

---

### Review the audit log

**Audit log** lists every action an operator has taken, with the reason they gave. It's read-only.
- Filter by target (**All targets**, **Accounts**, **Companies** or **Users**) and by date.
- Each entry shows **When**, **Operator**, **Action**, **Target**, **Reason**, and the **Before** and **After** values.
- Account and company pages show the same history for that record.

> **Not recorded:** operator sign-ins, pages viewed, and granting or removing operator roles.

---

### Security notes for operators

> **Before go-live**
> - Operator sign-in has **no two-factor authentication** and no lockout after failed attempts. Use a strong, unique password.
> - Operator sessions last as long as tenant sessions (30 days). **Sign out** of the console on shared machines.
> - Removing a compromised operator needs database access and the CLI (`--role none`).

---

**Related:** [14 Team, roles & plans](14-team-roles-plans.md) · [18 Troubleshooting](18-troubleshooting-faq.md) · Test scenarios: [Part B › 13 Admin console](../part-b-test-scenarios/13-admin-console.md)
