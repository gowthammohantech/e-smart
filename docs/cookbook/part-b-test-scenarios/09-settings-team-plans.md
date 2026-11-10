# 09 — Settings, team, plans & roles

Tests for every settings screen, team management, seat limits, plans and billing, plan gating and the role matrix. Setup and demo data are in [00 — Test setup](00-test-setup.md).

### Business profile & branches

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SET-001 | Edit the profile | Admin / owner | Vertex | **Settings › Company** → change the phone → save | Saved; new phone on the invoice preview | happy |
| SET-002 | Fields lock once entries are posted | Owner | Vertex has documents | Open the profile | "Entries have been posted, so the legal name, state, financial year and GST registration are locked. An unregistered business can still register for GST." | edge |
| SET-003 | Country and currency fixed | | | Open the profile | Country and base currency are read-only | edge |
| SET-004 | Logo | Owner | Online | Upload a PNG under 5 MB | Shown on PDFs | happy |
| SET-005 | Logo by an accountant | Accountant | | Open the profile | Logo section hidden (owner or admin only); the server refuses too | permission |
| SET-006 | Logo without a connection | Owner | Network off | Upload | Nothing is saved; "Can't reach the server. Check your connection and try again." (the app is online only) | edge |
| SET-007 | LUT | Owner | | **LUT number (exports)** + **LUT valid till** | Exports zero-rated (SAL-030) | happy |
| SET-008 | Allow negative stock | Owner | | Toggle | Changes SAL-057 / SAL-059 | happy |
| SET-010 | Add a branch | Admin / Pro | | **Settings › Branches › Add branch** → name, code, state, PIN | "Branch added" | happy |
| SET-011 | Branch GSTIN against state | | | GSTIN `29…`, state Maharashtra | "This GSTIN is registered in Karnataka, not the state below" | validation |
| SET-012 | Primary branch | | | Mark a branch **Primary branch** | Used as the default on new documents | happy |
| SET-013 | Delete a branch | Admin / Pro | A non-primary branch with no documents, and one with documents | **Delete** → confirm on each | Unused branch: "Branch deleted". Branch with documents: refused, "This branch has 〈what it holds〉". The primary branch: no **Delete** in its sheet (the API refuses it: "The primary branch cannot be deleted; make another branch primary first") | edge |
| SET-014 | Branches on Basic | Owner / Basic | Aurora | Open Branches | Upgrade page (branches need Pro) | plan |

### Masters

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SET-020 | Add a tax rate | Accountant | | **Settings › Taxes › Add tax rate** → "GST 28%", 28, effective from today | "Tax rate added"; "How a rate is applied": within your state CGST + SGST; other states IGST | happy |
| SET-021 | Effective date | | | Rate effective from next month | Documents dated before it keep the old rate | edge |
| SET-022 | Delete a tax rate in use | | | Delete | "Existing documents keep the rate they were issued with…" | edge |
| SET-023 | Exchange rate | Accountant / Pro | | **Settings › Currencies** → USD 88.00 dated today | New documents in USD default to 88.00; older ones unchanged | happy |
| SET-024 | Numbering | Admin | | **Settings › Numbering** → Invoice → prefix `TX`, digits 5 → save | "Invoice numbering updated"; "Next number will be TX/2026-27/00001" | happy |
| SET-025 | Numbering: branch code too long | | | Turn on **Include branch code** | Warning "Longer than 16 characters — the e-invoice portal will reject this number." | validation |
| SET-026 | Reset policy | | | **Reset each month** | Sequence restarts each month | edge |
| SET-027 | Numbering by an accountant | Accountant | | Save numbering | Refused (owner or admin) | permission |
| SET-028 | Payment account | Accountant | | **Add account** → Wallet "Paytm", opening ₹1,000, **Use as default** | "Account added"; preselected in payments | happy |
| SET-029 | Delete an account | | Account with no payments, expenses, statements, vouchers or opening balance, not the invoice bank account | Delete → confirm | "Account deleted"; an account in use is refused with "This account has payments; it can't be deleted" | happy |
| SET-030 | Expense categories | Accountant | | Add, rename, delete | Saved and reflected in the expense form | happy |

### Integrations, backup, audit, devices, about

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SET-040 | Integrations list | Admin | | **Settings › Integrations** | Groups Payments, Compliance, Messaging, Accounting, Storage & backup. Only GST e-Invoice (IRP) and E-way bill can be configured (**Configure** opens E-invoicing & e-way bill). Razorpay, UPI / QR, WhatsApp Business, SMS gateway, Tally export and Google Drive backup show **Coming soon** | happy |
| SET-041 | Coming-soon integrations can't be switched on | Admin | | Try to connect Razorpay, Google Drive, WhatsApp, SMS, UPI or Tally (in the app, and by calling `connectIntegration` without credentials) | Marked **Coming soon**, no connect control in the app; the server refuses the connect. Nothing shows as connected | edge |
| SET-042 | Accountant can't connect | Accountant | | Connect | Refused | permission |
| SET-043 | Export JSON | Admin | Online | **Settings › Backup › Export this business** → JSON → **Export** | Warning "The package contains customer details…" → "Export package prepared"; covers this business only | happy [sim] |
| SET-044 | CSV zip and Tally XML | Admin | | Each format | Package prepared | happy [sim] |
| SET-045 | Automatic backup | Admin | | **Back up automatically**, Nightly → wait for the hourly `backups.due` job (or run it) | Saved; until the first run "No backup has run yet.", then "Last backup 〈when〉." The backup is a JSON export of this business. Works on every plan; Google Drive as a destination is **Coming soon** | happy |
| SET-046 | Export by an accountant | Accountant | | Export | Refused (owner or admin) | permission |
| SET-047 | Audit trail | Accountant | | **Settings › Audit** → search an invoice number | Events newest first, "N fields changed" with before and after; "append-only" | happy |
| SET-048 | Audit hidden from sales | Sales | | Open Audit | Refused (owner, admin or accountant) | permission |
| SET-049 | Audit can't be edited | | | Look for edit or delete | None; "Audit records cannot be edited or deleted from the app." | edge |
| SET-050 | Devices | | | See AUTH-070 / AUTH-071 | | happy |
| SET-051 | About | | | **Settings › About** | Version and build number shown | happy |


New settings scenarios (SET-052 to SET-097) are in [16 — Settings & data](16-settings-data.md).

### Team

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| TEAM-001 | List users | Owner / Pro | Vertex | **More › Business setup › Users & roles** | Gowtham (Owner), Meera (Accountant), Rahul (Sales), Priya (Invited, "Invitation pending"); **What each role can do** lists the five roles | happy |
| TEAM-002 | Invite | Owner | Seats free (Pro = 6) | **Invite someone** → name, email, role Sales → **Send invitation** | "Invitation sent"; email in Mailpit with a link valid 7 days; row "Invited" | happy |
| TEAM-003 | Email already in the team | | | Invite `meera@vertextraders.in` | "This person is already on your team" | validation |
| TEAM-004 | Resend | | Priya invited, last sent over a minute ago | **Resend invite** | "Invitation sent again"; the button shows "Resend in 〈N〉s" for a minute | happy |
| TEAM-005 | Change a role | Owner | Meera | **Edit user** → Admin → save | "User updated"; Meera can now save numbering | happy |
| TEAM-006 | Guest from another account | Owner | A user with their own account who accepted an invite | Open them | No Save button; "This person has their own Elixir Books account. To change their access, remove them and invite them again." | edge |
| TEAM-007 | Remove | Owner | | **Remove** → confirm | "They immediately lose access to this business. Documents they created stay in your books." → "User removed"; their documents stay | happy |
| TEAM-008 | Admin manages the team | Admin | | Invite or remove a non-owner | Allowed | permission |
| TEAM-009 | Accountant can't | Accountant | | Invite | Refused: "This needs one of: owner, admin" | permission |
| TEAM-010 | Seat limit on Basic | Owner / Basic | Aurora: owner plus 1 invite = 2 seats | Invite a third | "Upgrade to invite more people": "Your Smart Basic plan includes 2 users, and every seat is taken (pending invitations count). Upgrade to invite more people." + **See plans** | plan |
| TEAM-011 | Free = 1 seat | Owner / Free | Aurora set to Free (admin override) | Invite | Limit dialog straight away: "…includes 1 user, and that seat is taken (a pending invitation counts)…" | plan |
| TEAM-012 | Business = unlimited | Owner / Business | Aurora set to Business | Invite many | No limit dialog | plan |
| TEAM-013 | Admin can't touch an owner | Admin | Vertex, a second owner exists | Edit the owner's role, or invite someone as Owner | "Only an owner can manage owners" | permission |
| TEAM-014 | Last owner | Owner | Only one active owner | Change your own role to Admin, or remove yourself | "The account needs at least one active owner", or "You can't remove yourself" | edge |
| TEAM-015 | Resend too soon | Owner | Invitation just sent | Call `resendInvite` again within a minute | 429 "The invite was just sent; wait a minute before sending it again" | edge |
| TEAM-016 | Invite email fails | Owner | Email provider failing | Invite | "The invitation for 〈email〉 was saved, but the email could not be sent. Use "Resend invite" to try again."; row shows Invited and resend works at once | edge |
| TEAM-017 | Existing user invited twice | Owner | A guest already in Vertex | Invite the same email again | "〈Name〉 already has access to Vertex Traders" | validation |
| TEAM-018 | Invite in the public demo | Demo | Signed in through **Give it a try** | Invite someone | "This is a demo, so changes aren't saved. Create your free account to keep your own books." | permission |

### Plans & billing

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PLAN-001 | Plan screen (web) | Owner | Browser | **More › Account › Plan & billing** | "Plan & billing"; current plan with **Active**; Free ₹0, Smart Basic ₹399, Smart Pro ₹899 ("Popular"), Smart Business ₹1,799; usage Businesses, Invoices this year, Users, Pending invitations (only when there are some) | happy |
| PLAN-002 | Yearly toggle | | Browser | **Monthly** ↔ **Yearly · save 2 months** | ₹3,990, ₹8,990, ₹17,990 per year; monthly prices per month | happy |
| PLAN-003 | No plan-change buttons | Owner / Basic | Aurora | Look at every plan card | Only the current plan has a button, **Current plan**, disabled. No **Choose this plan**, **Downgrade** or **Cancel subscription** (payments not live) | edge |
| PLAN-004 | Checkout API | Owner | | Call `startCheckout` | Owner only (admin → 403). Not reachable from the app today; record what it returns for the billing team | edge |
| PLAN-005 | Only the owner can buy | Admin | | Call `startCheckout` or `cancelSubscription` | 403 "This needs one of: owner" | permission |
| PLAN-006 | Downgrade hides, doesn't delete | Owner / Pro | Operator sets Vertex to Basic (ADM-011) | Reopen the app | Purchases, stock, expenses and Books disappear from the menu; their records come back when set to Pro again | plan |
| PLAN-007 | Renewal line | Owner / Pro | Browser | Plan screen | "Renews on 1 April · ₹8,990 a year"; Free shows "Free forever" | happy |
| PLAN-008 | Usage counts | | Pro, 3 active users | Plan screen | Users "3 of 6"; Smart Business shows a plain count | happy |
| PLAN-009 | Upgrade page | Owner / Basic | Aurora | Open any gated route (e.g. `/purchases/bills`) | "Purchases is on Smart Pro" + "Smart Basic covers selling and GST. Upgrade to buy, stock and track expenses in the same books — anything you recorded before stays as it was." + **See plans**, **Go back** | plan |
| PLAN-010 | Quick actions hidden | Owner / Basic | Aurora Home | Quick actions | No **Add expense**; New invoice, New quote, Receive payment, Add customer, Add item shown | plan |
| PLAN-011 | Phone shows no prices | Owner | iPhone or Android app | Plan screen | No prices, no Monthly/Yearly switch, no renewal line, no footnote; features and the current plan only | happy |
| PLAN-012 | Free invoice cap | Owner / Free | 20 invoices finalised this month | Finalise a 21st | "Your free plan includes 20 invoices a month. Upgrade your plan to issue more."; saving a draft still works | plan |
| PLAN-013 | Server refuses a gated module | Owner / Basic | Aurora | Call `createExpense` | 403 `PLAN_UPGRADE_REQUIRED` "The expenses module needs the pro plan" | plan |
| PLAN-014 | Module switched off | Owner / Pro | **Modules**: Expenses off | Open Expenses; call `createExpense` | Hidden in the menu; server 403 `MODULE_OFF` "expenses is switched off for this business; an owner can switch it on in Settings" | plan |
| PLAN-015 | Currencies on a sales plan | Owner / Basic | Aurora, a customer in USD | Open **Currencies & rates**; invoice the USD customer | Both work; the invoice is in USD. A base-currency customer's invoice shows no currency picker | plan |
| PLAN-016 | Branches on a sales plan | Owner / Basic | Aurora | Open **Branches**, rename the branch, then **Add branch** | Page opens and rename saves; adding is refused (`PLAN_UPGRADE_REQUIRED`, branches) | plan |
| PLAN-017 | New business starts on Free | — | Fresh sign-up | Finish onboarding | Plan & billing shows Free | happy |

### Role matrix

Run each action as each demo user. The server is the authority, because the app hides only a few buttons by role. Operations are from `packages/api-contract/openapi.yaml` (`x-roles`) plus the owner-only checks in `apps/api/src/modules/companies/handlers.ts`.

✓ = allowed. ✗ = refused with 403 (`ROLE_FORBIDDEN` "This needs one of: …", or `OWNER_ONLY`).

| ID | Action (API operation) | Owner | Admin | Accountant (Meera) | Sales (Rahul) | Viewer (Priya) |
|---|---|:-:|:-:|:-:|:-:|:-:|
| ROLE-001 | Read documents and reports | ✓ | ✓ | ✓ | ✓ | ✓ |
| ROLE-002 | Create, edit, finalise, convert, duplicate, send a document | ✓ | ✓ | ✓ | ✓ | ✗ |
| ROLE-003 | Change status, including **cancel** (`setDocumentStatus`) | ✓ | ✓ | ✓ | ✓ (FRD says ✗; see the report) | ✗ |
| ROLE-004 | Delete a document | ✓ | ✓ | ✗ | ✗ | ✗ |
| ROLE-005 | Create or edit a contact | ✓ | ✓ | ✓ | ✓ | ✗ |
| ROLE-006 | Delete a contact or item | ✓ | ✓ | ✗ | ✗ | ✗ |
| ROLE-007 | Create or edit an item | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-008 | Record a payment | ✓ | ✓ | ✓ | ✓ | ✗ |
| ROLE-009 | Edit a payment / delete a payment | ✓ / ✓ | ✓ / ✓ | ✓ / ✗ | ✗ / ✗ | ✗ |
| ROLE-010 | Expenses: create or edit / delete | ✓ / ✓ | ✓ / ✓ | ✓ / ✗ | ✗ | ✗ |
| ROLE-011 | Stock adjust or transfer | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-012 | E-invoice and e-way bill actions | ✓ | ✓ | ✓ | ✗ (FRD says ✓; see the report) | ✗ |
| ROLE-013 | Taxes, accounts, rates, transporters, vehicles, item categories, brands | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-014 | Company, branches, numbering, custom fields, logo, signature, compliance settings and credentials | ✓ | ✓ | ✗ | ✗ | ✗ |
| ROLE-015 | Invite, edit or remove users | ✓ | ✓ | ✗ | ✗ | ✗ |
| ROLE-016 | Integrations, exports, backup settings | ✓ | ✓ | ✗ | ✗ | ✗ |
| ROLE-017 | Audit log | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-018 | Checkout or cancel a subscription; create a company | ✓ | ✗ | ✗ | ✗ | ✗ |
| ROLE-019 | Upload attachment / remove attachment | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✗ | ✗ |
| ROLE-020 | Payment reminder, payment link | ✓ | ✓ | ✓ | ✓ | ✗ |

Two more checks for the matrix:
- **ROLE-021 — branch scope.** Rahul is assigned to the Pune branch. Confirm what he can see and create at Mumbai ("You do not work in this branch").
- **ROLE-022 — other businesses.** Meera has access to Vertex only. Opening any Aurora route as Meera must be refused (`COMPANY_ACCESS_DENIED`).

Newer permissions (full plan for the books rows):

| ID | Action (API operation) | Owner | Admin | Accountant (Meera) | Sales (Rahul) | Viewer (Priya) |
|---|---|:-:|:-:|:-:|:-:|:-:|
| ROLE-023 | Approve or reject a document / a supplier payment (`approveDocument`, `rejectDocument`, `approvePaymentRequest`, `rejectPaymentRequest`) | ✓ | ✓ | ✗ | ✗ | ✗ |
| ROLE-024 | See what is waiting (`listApprovals`, `listPaymentRequests`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| ROLE-025 | Change approval rules (`saveCompany` with `approvalRules`) | ✓ | ✗ (`OWNER_ONLY`) | ✗ | ✗ | ✗ |
| ROLE-026 | Close or reopen the books (`saveCompany` with `lockedThroughDate`) | ✓ | ✗ (`OWNER_ONLY`) | ✗ | ✗ | ✗ |
| ROLE-027 | Switch modules on or off (`disabledModules`) | ✓ | ✗ (`OWNER_ONLY`) | ✗ | ✗ | ✗ |
| ROLE-028 | Stock costing or perpetual stock date | ✓ | ✗ (`OWNER_ONLY`) | ✗ | ✗ | ✗ |
| ROLE-029 | Archive / restore the business | ✓ (own account only) | ✗ | ✗ | ✗ | ✗ |
| ROLE-030 | Vouchers, ledger accounts, cost centres, voucher templates: create, edit, delete | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-031 | Post a voucher to retained earnings | ✓ | ✓ | ✗ (`RETAINED_EARNINGS_ROLE`; draft only) | ✗ | ✗ |
| ROLE-032 | Budgets: create, edit, delete; read variance | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✗ / ✓ | ✗ / ✓ |
| ROLE-033 | Fixed assets: create, edit, delete; read schedule | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✗ / ✓ | ✗ / ✓ |
| ROLE-034 | Bank statements: parse, import, remove; match, unmatch, exclude, include; create payment, expense or voucher from a line | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-035 | Cash forecast (`getCashForecast`) | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-036 | GST portal, GSTR-2B, GSTR-3B, set-off, save and file returns | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-037 | Imports: parties, items, opening documents, journals | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-038 | Set a document to repeat (`setDocumentRecurrence`) | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-039 | Adjust advances; remove a credit application | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-040 | Choose a document's print layout (`setDocumentPrintLayout`) | ✓ | ✓ | ✓ | ✓ | ✗ |
| ROLE-041 | Lixi: ask (`lixiChat`) / confirm a prepared action | ✓ / as role | ✓ / as role | ✓ / as role | ✓ / as role | ✓ / refused by the underlying route |
| ROLE-042 | Branch-limited person opens the books or the balance sheet | — | — | ✗ if limited (`BOOKS_ALL_BRANCHES`) | ✗ if limited | ✗ if limited |
| ROLE-043 | Create a share link (`createShareLink`) / upload an item image (`uploadItemImage`) | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✗ | ✗ / ✗ |
