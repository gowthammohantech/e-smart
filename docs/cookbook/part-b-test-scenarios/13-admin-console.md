# 13 — Admin console

Tests for the platform operator console at `apps/admin` (http://localhost:5174 in development). Setup and demo data are in [00 — Test setup](00-test-setup.md).

Operators are granted from the command line:

```bash
npm run db:platform-admin -w @esmart/db -- --email <email> --role superadmin|support|none
```

The user must sign up first. For these tests, make `gowtham@vertextraders.in` a superadmin and `meera@vertextraders.in` support.

### Granting & sign-in

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ADM-001 | Superadmin sign-in | superadmin | Granted | Sign in with email and password | Overview opens; role badge "superadmin" | happy |
| ADM-002 | Not an operator | — | Rahul (no platform role) | Sign in | "This account is not a platform operator." and signed straight back out | permission |
| ADM-003 | Revoke | | `--role none` on Meera | Meera reloads | Signed out | permission |
| ADM-004 | Grant before sign-up | | Email with no account | Run the CLI | "No user with email … Sign up first, then run this again."; exit code 1 | validation |
| ADM-005 | Every page is protected | — | Signed out | Open `/accounts` | Redirects to `/sign-in` | permission |
| ADM-006 | Admin console sessions | | ADM-001 | App › **Settings › Devices** | Session listed as "Admin console" | edge |

### Overview, accounts & companies

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ADM-010 | Overview | support | | Overview → 30 days / 90 days / 12 months | Tiles: accounts (new in range), companies (% on a paid plan), users, active in 30 days, suspended; charts of documents per day and companies by plan | happy |
| ADM-011 | Plan override | superadmin | Aurora company page | Change plan → Smart Pro, status Active, optional "Period ends" → reason → confirm | Company is on Pro; the app unlocks purchases after a refresh; plan history shows "Changed by an operator" | happy |
| ADM-012 | Override warning | superadmin | Company with a live billing subscription | Override | Warning that the next billing webhook may undo it | edge |
| ADM-013 | "Period ends" is only a label | | ADM-011 with a date | Let the date pass | Nothing downgrades automatically ("Nothing downgrades automatically when it passes.") | edge |
| ADM-014 | Support can't override | support | | Company page | No override control; API returns 403 | permission |
| ADM-015 | Account list | support | | **Accounts** → search "vertex", filter by status and plan, page through | Demo account found; filters apply | happy |
| ADM-016 | Account detail | support | | Open the demo account | Owner, created, last active, companies (plan, subscription, tax ID, onboarded), users with role and platform badge | happy |
| ADM-017 | Company detail | support | | Vertex Traders | Document counts by type (Invoices, Quotes, …), user count, subscription, plan history | happy |

### Suspend & users

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ADM-020 | Suspend an account | superadmin | Demo account | **Suspend account** → reason "Support ticket #1234" → **Suspend account** | Suspended; app requests fail with "This account has been suspended. Contact support." | happy |
| ADM-021 | Team members and guests are cut off too | | ADM-020 | Meera (same account) opens Vertex; a user from another account who was invited into Vertex opens it | Meera: "This account has been suspended. Contact support." Guest: "This business has been suspended. Contact support."; the guest's own businesses still work | permission |
| ADM-022 | Reactivate | superadmin | Suspended | **Reactivate account** → reason → **Reactivate** | Access restored | happy |
| ADM-023 | Disable a user | superadmin | | **Users** → Rahul → **Disable** → reason → **Disable user** | Rahul's requests fail with "This user has been disabled" | happy |
| ADM-024 | Enable | superadmin | ADM-023 | **Enable** → **Enable user** | Rahul can sign in again | happy |
| ADM-025 | Operators can't be changed | superadmin | | **Users** → a platform operator | Shows "Operator"; no Disable button | permission |
| ADM-026 | Support is read-only | support | | Accounts, Users | No Suspend, Disable or Enable buttons; API 403 if called | permission |

### Reason dialog & audit

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ADM-030 | Reason too short | superadmin | Any action dialog | Reason "ok" (2 characters) | Confirm stays disabled (minimum 3) | validation |
| ADM-031 | Reason limit | | | Paste 600 characters | Input stops at 500 | validation |
| ADM-032 | Reason only spaces | | | "   " | Treated as empty; confirm disabled | validation |
| ADM-033 | Audit log | support | After ADM-011, 020, 022, 023 | **Audit log** | One row per action with operator, target, reason and time; filter by target type and date | happy |
| ADM-034 | Audit is read-only | | | Look for edit or delete | None | edge |
| ADM-035 | Per-account history | | | Account detail | "Operator actions on this account" lists the same events | happy |
