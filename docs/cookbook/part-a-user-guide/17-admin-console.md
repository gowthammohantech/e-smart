# 17 — Admin console (platform operators)

> **This chapter is for platform operators**, the Elixir Books staff who look after every customer account. Business users never see the admin console.

The admin console is a separate web app (title **Platform admin**). In it, operators can:
- see platform usage;
- look up tenant accounts, companies and users;
- see what each company's Lixi use costs;
- suspend accounts, change a company's plan by hand, disable users, and grant or remove operator access.

Every change asks for a written reason and is recorded in the platform audit log. Looking at an account or a company, and searching users, is recorded too.

**Operator roles**

| Role | Can see | Can change |
|---|---|---|
| **Support** | Everything: overview, accounts, companies, users, AI cost, audit log | Nothing |
| **Superadmin** | Everything | Suspend and reactivate accounts, override plans, disable and enable users, grant and remove operator roles |

Buttons a support operator isn't allowed to use are hidden, and the server refuses those actions anyway (`PLATFORM_FORBIDDEN`).

---

### Grant (or remove) operator access

**Goal:** make someone an operator, change their operator role, or take it away.
**Who:** a superadmin in the console. The very first superadmin is made from the command line.

**Before you start**
- The person signs up for an ordinary Elixir Books account first.

**Steps (console)**
1. Open **Users** and find the person.
2. Click **Make operator** (or **Change role** for an existing operator).
3. Choose the **Platform role**: **Superadmin**, **Support** or **None**. The hint explains each one.
4. Enter a **Reason** and confirm with **Make superadmin**, **Make support** or **Remove access**.

**Steps (command line, for the first superadmin or an emergency)**

From the repository, with the API's `.env` pointing at the right database, run:

```bash
npm run db:platform-admin -w @esmart/db -- --email person@example.com --role superadmin
```

- `--role` is `superadmin` (the default), `support`, or `none` to remove access.
- `--reset-mfa` clears a lost authenticator, so they set a new one up at their next sign-in.

**What happens**
- The person is signed out everywhere. The new role applies from their next sign-in, where an operator must set up an authenticator app ([Sign in](#sign-in)).
- The change is recorded in the audit log, from the console and from the command line.

**Rules & gotchas**
- You can't change your own platform role: *"You can't change your own platform role"*.
- There must always be one superadmin: *"There must always be at least one superadmin"*.
- A disabled user must be enabled before they can be given a role.
- `No user with email …` from the command line means they haven't signed up yet.

---

### Sign in

**Goal:** get into the console.
**Who:** support or superadmin.

**Steps**
1. Open the console URL. Locally that's http://localhost:5174 after `npm run admin`.
2. Enter your **Email** and **Password** and click **Sign in**.
3. **Two-step verification** follows:
   - **First time:** scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), or open **Can't scan? Enter this key instead**. Enter the **Code from the app** and click **Turn on**. Save the **recovery codes** shown (**Copy codes**), tick **I've saved them somewhere safe**, and click **Continue**.
   - **Every later time:** enter the 6-digit **Code** and click **Continue**. Lost your phone? Enter one of the recovery codes instead; each works once.

**Rules & gotchas**
- Accounts without an operator role are signed straight back out: *"This account is not a platform operator."*
- Only email and password are accepted, then the authenticator code.
- Five wrong passwords, or five wrong codes, lock the login for 15 minutes, doubling each time.
- **Operator sessions last 12 hours.** Then you sign in again (*"Your session ended. Sign in again."*).
- The session shows in the person's app under **Devices** as **Admin console**.
- **Sign out** is on the two-step screen and in the console's menu.

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
| **Signups per day** | New accounts and companies over the range |
| **Documents created per day** | Platform activity over the range |
| **Companies by plan** | How many businesses are on Free, Basic, Pro and Business, all time |

Each chart has **Show as table** to see the numbers. The theme can be **Light**, **Dark** or **System theme**.

---

### Find an account

**Goal:** open a tenant's account and its companies.
**Who:** support or superadmin.

**Accounts** lists every tenant. An account holds one or more companies and their team.
1. Type in **Search account, company, owner name or email**.
2. Filter by status (**All statuses**, **Active** or **Suspended**) and by plan (**Any plan**, or a specific plan).
3. Click a row to open the account. It shows the **Owner**, **Created**, **Last active**, **Companies / users**, the account's **Companies** (plan, subscription, tax ID, onboarded), its **Users** (each with their role and status), and **Operator actions on this account**.

Opening an account is recorded in the audit log as a view.

---

### Suspend or reactivate an account

**Goal:** stop everyone on an account from using the product, for example after abuse or fraud, or at the customer's request. Or undo a suspension.
**Who:** superadmin.

**Steps**
1. Open the account and click **Suspend account**. On a suspended account the button reads **Reactivate account**.
2. Read what will happen:
   - **Suspend:** every user on the account is signed out on every device straight away, and nobody can sign in until it's reactivated. **Their data is kept.**
   - **Reactivate:** *"Everyone on this account can sign in again. Sessions ended by the suspension stay signed out."*
3. Enter a **Reason** of 3–500 characters, for example *Support ticket #1234*. Click **Suspend account** or **Reactivate**.

**What happens**
- The account shows **Account suspended**.
- Its users see *"This account has been suspended. Contact support."* Guests from other accounts invited into its businesses see *"This business has been suspended. Contact support."*; their own businesses keep working.

**Rules & gotchas**
- An account that has an operator on it can't be suspended: *"This account has platform operators; remove their platform role first"*. This also stops you suspending your own account.

---

### Override a company's plan

**Goal:** give a company a plan without going through billing, for example a comp, a trial, or a customer who asked to upgrade. **Today this is the only way to change a plan**, because the app has no plan-change buttons ([14](14-team-roles-plans.md#change-the-plan)).
**Who:** superadmin.

**Steps**
1. Open the company from its account's **Companies** list. Find the account under **Accounts**, where you can also search by company name.
2. Check **Subscription** (**Status**, **Billing** — **Manual** when there's no billing provider — **Cycle**, **Period ends**) and **Plan history**.
3. Click **Change plan**.
4. Choose the **Plan**, marked **(current)** for the one it has now. Choose a **Status**: **Active** or **Trialing**.
5. *Optional:* set **Period ends (optional)**. It must be in the future. It is only shown to the company: *"Nothing downgrades automatically when it passes."*
6. Enter a **Reason** and click **Change plan**.

**What happens**
- The plan changes immediately. It shows in **Plan history** as **Changed by an operator**, and in the company's own audit trail as a change by platform support.
- The company's devices pick up the change the next time they load from the server.

**Rules & gotchas**
- **Billing can undo it.** If the company is billed through a provider, the dialog warns: *"This company is billed through 〈provider〉. Its next billing event (a renewal, a failed payment) may change the plan back."*
- Moving a company down hides its purchases, stock, expenses and books, but doesn't delete them ([14](14-team-roles-plans.md#change-the-plan)).
- To end a trial, set the plan back by hand.

---

### See a company's AI cost

**Goal:** see what a company's Lixi and bill-scanning use costs the platform.
**Who:** support or superadmin.

**Steps**
1. Open the company.
2. Find **AI cost**. The header shows the total in US dollars over the months listed.
3. Each row is a month: **Actions** (Lixi messages plus server bill scans, as counted against the company's allowance), **Tokens in**, **Tokens out** and **Cost**.

**Rules & gotchas**
- **Cost is the provider's figure or an estimate.** OpenRouter reports a price with each answer, and that is used. Anthropic and OpenAI direct don't, so the server estimates it from their list prices for the common models (Claude, GPT-5, GPT-4.1, GPT-4o). A model it has no price for (a self-hosted model, Groq and so on) shows tokens with a cost of $0.00.
- The console can't change a company's allowance. The plan sets it, and the owner can only lower it ([16](16-lixi-assistant.md#ai-usage-and-the-monthly-allowance)).
- **No AI use yet** means nothing has been counted for this company.

---

### Disable or enable a user

**Goal:** lock out one person, for example a compromised login, without suspending the whole account.
**Who:** superadmin.

**Steps**
1. Open **Users**: *"Everyone with a login, across every account."*
2. Find the person with **Search name, email or phone**. You can filter by **Active**, **Invited** or **Disabled**.
3. Click **Disable**, or **Enable** for a disabled user.
4. Enter a **Reason** and confirm with **Disable user** or **Enable user**.

**What happens**
- **Disable:** they are signed out on every device and can't sign in until enabled again (*"This user has been disabled"*).
- **Enable:** they can sign in again.

**Rules & gotchas**
- Operators can't be disabled. Remove their platform role first (**Change role › None**).
- Your own row shows **You** and has no role button.
- To change someone's role inside a business, ask the business's owner or admin ([14](14-team-roles-plans.md)). Operators don't edit tenant roles.

---

### Review the audit log

**Goal:** see who did what, and why.
**Who:** support or superadmin.

**Audit log** lists *"Every action a platform operator has taken, with the reason they gave. Read-only."*
- Filter by **Target** (**All targets**, **Accounts**, **Companies** or **Users**) and by date (**From**, **To**).
- Each entry shows **When**, **Action**, **Target**, **Reason**, **By** (the operator), and the **Before** and **After** values where there are any.
- Account and company pages show the same history for that record.

What is recorded:
- suspensions, reactivations, plan overrides, disabling and enabling users, granting and removing operator roles (console or command line);
- opening an account or a company, and searching users (as views);
- two-step events: setting up an authenticator, codes accepted or refused, recovery codes used, an authenticator reset from the command line.

Each shows as a plain label, for example **Viewed account**, **Searched users**, **Passed two-step sign-in** or **Used a recovery code**.

---

### What the console doesn't do

- **No business data.** Operators see counts, plans and people, not invoices or ledgers. They can't edit documents or settings for a customer.
- **No archive or purge controls.** Archiving and restoring a business is done by its owner in the app ([28](28-company-archive-and-data.md)). Closed accounts and archived businesses are erased by a daily job once their 8-year retention ends; until the server's `PURGE_DRY_RUN` is switched off, that job only logs what it would erase.
- **No public demo controls.** The **Give it a try** demo account rebuilds itself on the server every week; it is read-only and isn't managed from the console.
- **No AI allowance controls**, and no AI cost totals across companies.

---

**Related:** [14 Team, roles & plans](14-team-roles-plans.md) · [16 Lixi](16-lixi-assistant.md) · [18 Troubleshooting](18-troubleshooting-faq.md) · Test scenarios: [Part B › 13 Admin console](../part-b-test-scenarios/13-admin-console.md)
