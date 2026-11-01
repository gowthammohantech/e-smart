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
| SET-006 | Logo offline | Owner | Network off | Upload | Needs a connection | offline |
| SET-007 | LUT | Owner | | **LUT number (exports)** + **LUT valid till** | Exports zero-rated (SAL-030) | happy |
| SET-008 | Allow negative stock | Owner | | Toggle | Changes SAL-057 / SAL-059 | happy |
| SET-010 | Add a branch | Admin / Pro | | **Settings › Branches › Add branch** → name, code, state, PIN | "Branch added" | happy |
| SET-011 | Branch GSTIN against state | | | GSTIN `29…`, state Maharashtra | "This GSTIN is registered in Karnataka, not the state below" | validation |
| SET-012 | Primary branch | | | Mark a branch **Primary branch** | Used as the default on new documents | happy |
| SET-013 | Delete a branch | | | **Delete** → confirm | "Branch deleted"; its documents keep the reference | happy |
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
| SET-029 | Delete an account | | | Delete | "Payments already recorded against it keep their reference." | happy |
| SET-030 | Expense categories | Accountant | | Add, rename, delete | Saved and reflected in the expense form | happy |

### Integrations, backup, audit, devices, about

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SET-040 | Integrations list | Admin | | **Settings › Integrations** | Razorpay, UPI/QR, GST e-Invoice (IRP), E-way bill, WhatsApp Business, SMS gateway, Tally export, Google Drive backup | happy |
| SET-041 | Connect Razorpay or Drive | Admin | | **Connect** | Goes to the provider's authorise URL. The return callback is **Blocked** (no page yet) | edge |
| SET-042 | Accountant can't connect | Accountant | | Connect | Refused | permission |
| SET-043 | Export JSON | Admin | Online | **Settings › Backup › Export this business** → JSON → **Export** | Warning "The package contains customer details…" → "Export package prepared"; covers this business only | happy [sim] |
| SET-044 | CSV zip and Tally XML | Admin | | Each format | Package prepared | happy [sim] |
| SET-045 | Automatic backup | Admin / Business | | **Back up automatically**, Nightly | Saved; "No backup has run yet." **Blocked**: no scheduler runs backups | edge |
| SET-046 | Export by an accountant | Accountant | | Export | Refused (owner or admin) | permission |
| SET-047 | Audit trail | Accountant | | **Settings › Audit** → search an invoice number | Events newest first, "N fields changed" with before and after; "append-only" | happy |
| SET-048 | Audit hidden from sales | Sales | | Open Audit | Refused (owner, admin or accountant) | permission |
| SET-049 | Audit can't be edited | | | Look for edit or delete | None; "Audit records cannot be edited or deleted from the app." | edge |
| SET-050 | Devices | | | See AUTH-070 / AUTH-071 | | happy |
| SET-051 | About | | | **Settings › About** | Version and build number shown | happy |

### Team

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| TEAM-001 | List users | Owner / Pro | Vertex | **Settings › Users** | Gowtham (Owner), Meera (Accountant), Rahul (Sales), Priya (Invited, "Invitation pending") | happy |
| TEAM-002 | Invite | Owner | Seats free (Pro = 6) | **Invite someone** → name, email, role Sales → **Send invitation** | "Invitation sent"; email in Mailpit; row "Invited" | happy |
| TEAM-003 | Email already in the team | | | Invite `meera@vertextraders.in` | Server refusal shown | validation |
| TEAM-004 | Resend | | Priya invited | **Resend invite** | "Invitation sent again" | happy |
| TEAM-005 | Change a role | Owner | Meera | **Edit user** → Admin → save | "User updated"; Meera can now save numbering | happy |
| TEAM-006 | Guest from another account | Owner | A user with their own account | Edit | "This person has their own Elixir Books account. To change their access, remove them and invite them again." | edge |
| TEAM-007 | Remove | Owner | | **Remove** → confirm | "They immediately lose access…" → "User removed"; their documents stay | happy |
| TEAM-008 | Admin manages the team | Admin | | Invite or remove | Allowed | permission |
| TEAM-009 | Accountant can't | Accountant | | Invite | Refused | permission |
| TEAM-010 | Seat limit on Basic | Owner / Basic | Aurora: owner plus 1 invite = 2 seats | Invite a third | "Upgrade to invite more people": "Your Smart Basic plan includes 2 users, and every seat is taken (pending invitations count)…" + **See plans** | plan |
| TEAM-011 | Free = 1 seat | Owner / Free | Aurora set to Free | Invite | Limit dialog straight away | plan |
| TEAM-012 | Business = unlimited | Owner / Business | Aurora set to Business | Invite many | No limit dialog | plan |

### Plans & billing

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PLAN-001 | Plan screen | Owner | | **Settings › Plan** | "Plan & billing"; Free ₹0, Smart Basic ₹399, Smart Pro ₹899 ("Popular"), Smart Business ₹1,799; usage Businesses, Invoices, Users, Pending invitations | happy |
| PLAN-002 | Yearly toggle | | | **Yearly · save 2 months** | ₹3,990, ₹8,990, ₹17,990 per year | happy |
| PLAN-003 | Choose a plan | Owner / Basic | Aurora | **Choose this plan** on Smart Pro | Checkout URL opens; plan unchanged until the payment webhook confirms ("A plan change takes effect once the payment is confirmed.") [sim] | happy |
| PLAN-004 | Checkout cycle | | PLAN-003 with **Monthly** selected | Inspect the checkout request | Expected monthly; **known issue**: always yearly (see the report) | edge |
| PLAN-005 | Only the owner can buy | Admin | | **Choose this plan** | Refused (owner only) | permission |
| PLAN-006 | Downgrade | Owner / Pro | | **Downgrade** to Basic, payment confirmed | "Smart Basic — purchases, stock and expenses are hidden, not deleted" | plan |
| PLAN-007 | Cancel subscription | Owner | Paid plan | Cancel | Ends at the period end, then falls back to Free with no data lost | happy [sim] |
| PLAN-008 | Usage counts | | | Plan screen | Shows plain counts; "3 of 6" style isn't implemented yet | edge |
| PLAN-009 | Upgrade page | Owner / Basic | Aurora | Open any gated route | "<Module> is on Smart Pro" + "…anything you recorded before stays as it was." + **See plans** | plan |
| PLAN-010 | Quick actions hidden | Owner / Basic | Aurora Home | Quick actions | No **Add expense**; New invoice, New quote, Receive payment, Add customer, Add item shown | plan |

### Role matrix

Run each action as each demo user. The server is the authority, because the app hides only a few buttons by role.

✓ = allowed. ✗ = refused with 403.

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
| ROLE-013 | Taxes, accounts, rates, transporters | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-014 | Company, branches, numbering, compliance settings and credentials | ✓ | ✓ | ✗ | ✗ | ✗ |
| ROLE-015 | Invite, edit or remove users | ✓ | ✓ | ✗ | ✗ | ✗ |
| ROLE-016 | Integrations, exports, backup settings | ✓ | ✓ | ✗ | ✗ | ✗ |
| ROLE-017 | Audit log | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROLE-018 | Checkout or cancel a subscription; create a company | ✓ | ✗ | ✗ | ✗ | ✗ |
| ROLE-019 | Upload attachment / remove attachment | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✗ | ✗ |
| ROLE-020 | Payment reminder, payment link | ✓ | ✓ | ✓ | ✓ | ✗ |

Two more checks for the matrix:
- **ROLE-021 — branch scope.** Rahul is assigned to the Pune branch. Confirm what he can see and create at Mumbai.
- **ROLE-022 — other businesses.** Meera has access to Vertex only. Opening any Aurora route as Meera must be refused (company access).
