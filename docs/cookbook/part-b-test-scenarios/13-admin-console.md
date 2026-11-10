# 13 — Admin console

Tests for the platform operator console at `apps/admin` (http://localhost:5174 in development). Setup and demo data are in [00 — Test setup](00-test-setup.md).

The first superadmin is granted from the command line; after that, a superadmin can grant roles in the console (**Users › Make operator**):

```bash
npm run db:platform-admin -w @esmart/db -- --email <email> --role superadmin|support|none [--reset-mfa]
```

The user must sign up first. For these tests, make `gowtham@vertextraders.in` a superadmin and `meera@vertextraders.in` support. Keep an authenticator app ready: every operator must set one up.

### Granting & sign-in

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ADM-001 | Superadmin sign-in | superadmin | Granted, authenticator set up | Sign in with email and password → 6-digit code → **Continue** | Overview opens; role badge "superadmin" | happy |
| ADM-002 | Not an operator | — | Rahul (no platform role) | Sign in | "This account is not a platform operator." and signed straight back out | permission |
| ADM-003 | Revoke | superadmin | Meera is support | **Users** → Meera → **Change role** → None → reason → **Remove access** (or `--role none`) | Meera is signed out everywhere; her next console sign-in is refused (ADM-002) | permission |
| ADM-004 | Grant before sign-up | | Email with no account | Run the CLI | "No user with email … Sign up first, then run this again."; exit code 1 | validation |
| ADM-005 | Every page is protected | — | Signed out | Open `/accounts` | Redirects to `/sign-in` | permission |
| ADM-006 | Admin console sessions | | ADM-001 | App › **Settings › Devices** | Session listed as "Admin console" | edge |
| ADM-007 | First sign-in sets up two-step | support | Meera just granted | Sign in | "Two-step verification": QR code, **Can't scan? Enter this key instead**; enter **Code from the app** → **Turn on**; recovery codes shown, **Continue** disabled until **I've saved them somewhere safe** is ticked | happy |
| ADM-008 | Wrong code | | ADM-007 done | Enter a wrong code five times | Refused each time; then "Too many wrong codes. Try again in 15 minutes." | validation |
| ADM-009 | Recovery code | | Saved codes | Enter a recovery code at the code step | Signs in; the same code refused next time; audit shows the recovery code used | edge |

### Overview, accounts & companies

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ADM-010 | Overview | support | | Overview → 30 days / 90 days / 12 months | Tiles: Accounts (new in range), Companies (% on a paid plan), Users, Active users (last 30 days), Suspended accounts; charts Signups per day, Documents created per day, Companies by plan; **Show as table** on each | happy |
| ADM-011 | Plan override | superadmin | Aurora company page | **Change plan** → Smart Pro, status Active, optional "Period ends" → reason → **Change plan** | Company is on Pro; the app unlocks purchases after a reload; Plan history shows "Changed by an operator" | happy |
| ADM-012 | Override warning | superadmin | Company with a billing provider on its subscription | **Change plan** | Dialog shows "This company is billed through 〈provider〉. Its next billing event (a renewal, a failed payment) may change the plan back." before you confirm | edge |
| ADM-013 | "Period ends" is only a label | | ADM-011 with a date | Let the date pass | Nothing downgrades automatically ("Nothing downgrades automatically when it passes.") | edge |
| ADM-014 | Support can't override | support | | Company page | No **Change plan**; API returns 403 `PLATFORM_FORBIDDEN` | permission |
| ADM-015 | Account list | support | | **Accounts** → search "vertex", filter by status and plan, page through | Demo account found; filters apply | happy |
| ADM-016 | Account detail | support | | Open the demo account | Owner, Created, Last active, Companies / users; Companies (plan, subscription, tax ID, onboarded); Users with role and status | happy |
| ADM-017 | Company detail | support | | Vertex Traders | Legal name, Location, Tax ID, Team members, Onboarded, Created; Subscription (Billing "Manual" with no provider); Documents by type; AI cost; Plan history | happy |
| ADM-018 | Period end in the past | superadmin | | **Change plan** with Period ends = yesterday (via API) | "The period end must be in the future" | validation |
| ADM-019 | AI cost | support | Vertex used Lixi this month | Company page › **AI cost** | One row per month: Actions, Tokens in, Tokens out, Cost; header total in USD. Actions match the app's **AI usage** count. On a provider that doesn't report price (Anthropic, OpenAI direct) Cost is estimated from list prices; $0.00 only for a model with no known price | happy |

### Suspend & users

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ADM-020 | Suspend an account | superadmin | Demo account (no operators on it) | **Suspend account** → reason "Support ticket #1234" → **Suspend account** | Suspended; app requests fail with "This account has been suspended. Contact support." | happy |
| ADM-021 | Team members and guests are cut off too | | ADM-020 | Meera (same account) opens Vertex; a user from another account who was invited into Vertex opens it | Meera: "This account has been suspended. Contact support." Guest: "This business has been suspended. Contact support."; the guest's own businesses still work | permission |
| ADM-022 | Reactivate | superadmin | Suspended | **Reactivate account** → reason → **Reactivate** | Access restored; sessions ended by the suspension stay signed out | happy |
| ADM-023 | Disable a user | superadmin | | **Users** → Rahul → **Disable** → reason → **Disable user** | Rahul's requests fail with "This user has been disabled" | happy |
| ADM-024 | Enable | superadmin | ADM-023 | **Enable** → **Enable user** | Rahul can sign in again | happy |
| ADM-025 | Operators can't be disabled | superadmin | | **Users** → a platform operator | **Change role** only, no Disable button; API 409 `PLATFORM_OPERATOR` "Remove their platform role first (Change role), then disable them." | permission |
| ADM-026 | Support is read-only | support | | Accounts, Users | No Suspend, Disable, Enable, Make operator or Change role buttons; API 403 if called | permission |
| ADM-027 | Account with an operator | superadmin | Account that contains Meera (support) | **Suspend account** | "This account has platform operators; remove their platform role first" | edge |
| ADM-028 | Own role | superadmin | | **Users** → yourself | Shows "You"; no role button; API: "You can't change your own platform role" | permission |
| ADM-029 | Last superadmin | superadmin | Only one superadmin besides a second one being demoted | Demote every other superadmin, then try to remove the last via the CLI | "There must always be at least one superadmin" | edge |

### Reason dialog & audit

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ADM-030 | Reason too short | superadmin | Any action dialog | Reason "ok" (2 characters) | Confirm stays disabled (minimum 3) | validation |
| ADM-031 | Reason limit | | | Paste 600 characters | Input stops at 500 | validation |
| ADM-032 | Reason only spaces | | | "   " | Treated as empty; confirm disabled | validation |
| ADM-033 | Audit log | support | After ADM-011, 020, 022, 023 | **Audit log** | One row per action with When, Action, Target, Reason, By; filter by Target and From/To dates | happy |
| ADM-034 | Audit is read-only | | | Look for edit or delete | None | edge |
| ADM-035 | Per-account history | | | Account detail | "Operator actions on this account" lists the same events | happy |
| ADM-036 | Views are recorded | support | | Open an account, a company, search Users | Audit rows **Viewed account**, **Viewed company**, **Searched users** with reason "Viewed" | edge |
| ADM-037 | Role changes are recorded | superadmin | ADM-003, and one CLI grant | Audit log, target Users | "Changed platform role" / "Removed platform access" rows for both the console and the CLI change | happy |
| ADM-038 | Two-step events are recorded | | ADM-007, ADM-008 | Audit log | **Set up two-step sign-in**, **Failed two-step sign-in**, **Passed two-step sign-in** rows against the operator | edge |

### Sessions

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ADM-040 | 12-hour session | superadmin | Signed in | Wait 12 hours (or move the clock) and use the console | "Your session ended. Sign in again." | edge |
| ADM-041 | Reset a lost authenticator | | Operator lost their phone and codes | `--reset-mfa` for them; they sign in | Two-step setup starts again; audit shows "Authenticator reset from the command line" | happy |
| ADM-042 | Password lockout | | | Five wrong passwords at the console sign-in | "Too many wrong passwords. Try again in 15 minutes, or reset your password." | validation |
