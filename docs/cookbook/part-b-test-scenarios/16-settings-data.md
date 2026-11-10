# 16 — Settings, data, archive & privacy

Settings scenarios added after 8 Nov (`SET-052` onwards; `SET-001`–`SET-051` are in [09](09-settings-team-plans.md)), business archive (`ARC-`) and privacy and usage data (`PRV-`). Setup and demo data are in [00 — Test setup](00-test-setup.md). User guide: [13 — Settings](../part-a-user-guide/13-settings.md) and [28 — Company archive & your data](../part-a-user-guide/28-company-archive-and-data.md).

The app is online-only: every save needs a connection.

### Your profile

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SET-052 | Edit your profile | Any | | Name card on **More** → change **Phone** → **Save changes** | "Profile updated"; back on More | happy |
| SET-053 | Profile validation | Any | | Clear **Email** → save | Required error; nothing saved | validation |
| SET-054 | Your businesses | Owner | 2 businesses | Open Your profile | Both listed with type and currency; current one **Active**; tapping doesn't switch | happy |
| SET-055 | Old links land on Profile | Any | | Open `/settings/devices`, `/settings/security`, `/settings/privacy` | Each opens Your profile | edge |
| SET-056 | Turn on an authenticator | Any | | **Sign-in security › Turn on** → scan → code → **Turn on** | Recovery codes shown once; **Copy codes** → "Recovery codes copied"; **I have saved them**; card **On**, "10 recovery codes left" (or the count issued) | happy |
| SET-057 | Authenticator asked on a new device | Any | SET-056 | Sign in on another browser | **Enter your code**; a recovery code also works and the count drops by one | happy |
| SET-058 | Turn off the authenticator | Any | SET-056 | **Turn off** → code | "Authenticator turned off" | happy |
| SET-059 | Sign out a device | Any | Signed in on two devices | **Devices & sessions** → **Sign out** → confirm | "Device signed out"; the other device must sign in again | happy |
| SET-060 | Delete account blocked by others | Owner | Others use the business | **Delete account** | "Other people use … Make one of them an owner under Users first…" with **Open Users** | negative |

### Business profile & bank details

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SET-061 | Link bank details to a book account | Admin | A bank payment account "HDFC Current" | **Bank & signature** → fill bank details → **Account in your books** = HDFC Current → save | Saved; new receipts against invoices default to HDFC Current; details and UPI QR on the invoice PDF | happy |
| SET-062 | Account number mismatch | Admin | SET-061 | Change the account number to one not on HDFC Current | Warning "The account number above isn't the one saved for HDFC Current (…)" | validation |
| SET-063 | No bank account to link | Admin | No bank payment accounts | Open **Account in your books** | "Add a bank account under Cash and bank accounts to link it here." | edge |
| SET-064 | IFSC, account number, UPI checks | Admin | | IFSC `HDFC123`, account `12`, UPI `abc` → save | IFSC, account number and UPI errors; not saved | validation |
| SET-065 | Signature | Owner | | **Add signature** → **Use this signature** | "Signature updated"; prints above "Authorised signatory" | happy |
| SET-066 | GST returns QRMP | Owner | | **GST returns** = Quarterly (QRMP) → save | Saved; returns are quarterly ([14](14-accounting-gst-returns.md)) | happy |
| SET-067 | Rules range checks | Owner | | RBI bank rate 60; 2B tolerance 45 → save | "Enter a rate from 0 to 50%"; "Enter a whole number of days from 0 to 30" | validation |
| SET-068 | Profile by an accountant | Accountant | | Change the business name → save | Refused by the server (owner or admin) | permission |

### Branches & numbering

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SET-069 | One branch on Basic | Owner / Basic | Aurora | Open **Branches** | "Your plan includes one branch…"; can rename; **Add branch** locked ("Upgrade to add more branches.") | plan |
| SET-070 | Delete a branch in use | Admin / Pro | Pune has documents | **Delete** → confirm | Refused: "This branch has documents" | negative |
| SET-071 | Delete the primary branch | Admin / Pro | | Delete Mumbai (primary) | Refused: make another branch primary first | negative |
| SET-072 | Duplicate branch code | Admin / Pro | | Add a branch with code `PUN` | "Another branch already uses the code PUN…" | validation |
| SET-073 | Next number below issued | Admin | INV next is 43 | Set **Next number** 10 | "Numbers below 43 may already be issued; start at 43 or above" | validation |

### Modules

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SET-074 | Switch off a module | Owner / Pro | | **Modules** → Stock off → **Switch off** | "Stock switched off"; Stock tab and pages gone for everyone; stock actions refused by the server | happy |
| SET-075 | Dependent module goes too | Owner / Pro | | Switch off Purchases | Message says it also switches off Payables; both off | edge |
| SET-076 | Switch back on | Owner / Pro | SET-074 | Stock on | "Stock switched on"; records all back | happy |
| SET-077 | Modules by an admin | Admin / Pro | | Open Modules | "Only an owner can switch modules on or off."; switches greyed; server refuses too (OWNER_ONLY) | permission |
| SET-078 | Modules on Basic | Owner / Basic | Aurora | Open Modules | Only **Retail item fields** listed | plan |

### Custom fields

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SET-079 | Add a printed document field | Admin | | **Documents › Add a field** → "Vehicle no.", Text, Printed → **Save** | "Field saved"; shows on the invoice form and PDF | happy |
| SET-080 | Required list field on contacts | Admin | | Contacts → List "Licence type", choices "Retail, Wholesale", Required | New contact can't save without it ("… is required") | validation |
| SET-081 | Mark unused | Admin | SET-079 | **In use** off | **Inactive**; off the form; old invoices keep the value | edge |
| SET-082 | Delete a field | Admin | | **Delete field** → confirm | "Field deleted"; records stop showing it | happy |
| SET-083 | Custom fields by sales | Sales | | Add a field | Refused (owner or admin) | permission |

### AI usage, notifications, integrations, backup, appearance

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| SET-084 | AI usage | Owner / Pro | Some Lixi messages | **AI usage** | "N of 1500 used this month"; Lixi and Bill scans split | happy |
| SET-085 | Lower AI budget | Owner / Pro | | Budget 100 → **Save** | "AI budget saved"; limit reads 100 | happy |
| SET-086 | Budget above the plan | Owner / Basic | | Budget 1000 | Allowance stays 300 (never above the plan) | edge |
| SET-087 | Allowance used up | Owner / Free | 30 actions used | Ask Lixi | "The allowance is used up. Lixi and bill scanning pause until the 1st." | negative |
| SET-088 | Budget by a non-owner | Admin | | Open AI usage | "Only the owner can change the budget."; field read-only | permission |
| SET-089 | Ways to open Lixi | Any | 📱 | **AI usage** → Floating orb on; **Show gesture tips again** | Orb appears; tips show again | happy |
| SET-090 | Notification kinds | Any | 📱 notifications allowed | Turn off **Low stock** | No low-stock push; still in the notification list | happy |
| SET-091 | Notifications on web | Any | 🖥 | Open Notification preferences | "The web app doesn't send notifications…" | edge |
| SET-092 | Integrations coming soon | Admin | | **Integrations** | Razorpay, UPI / QR, WhatsApp Business, SMS gateway, Tally export, Google Drive backup show **Coming soon**, switches greyed; e-Invoice and E-way bill switchable with **Configure** | happy |
| SET-093 | Coming-soon refused by API | Admin | | Connect `int_whatsapp` through the API | 409 INTEGRATION_COMING_SOON | negative |
| SET-094 | Automatic backup runs | Admin | Backup on | Wait for the hourly job (or run `backups.due`) | **Backup ready** notification opens Backup & export; "Last backup <when>." | happy |
| SET-095 | Export link | Admin | | Export JSON | Download link works; the file is gone after 7 days | edge |
| SET-096 | Theme default | Any | New install | Open Appearance | **Light** selected | happy |
| SET-097 | About links | Any | | **About** → Privacy policy, Terms, Support; **Privacy and usage data** | Site pages open; the privacy row opens Your profile | happy |

### Archive (`ARC-`)

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ARC-001 | Archive a business | Owner / Pro | Two businesses on the account | **Business profile › Close this business › Archive this business** → type the name → password → **Archive business** | "Business archived"; it leaves the business list for everyone; plan becomes Free; subscription cancelled | happy |
| ARC-002 | Only open business | Owner | One business | Open the section | Row greyed: "This is your only open business. To close it, delete your account under Profile instead." | negative |
| ARC-003 | Wrong name | Owner | | Type a different name | **Archive business** stays disabled; API returns NAME_MISMATCH | validation |
| ARC-004 | Wrong password or code | Owner | | Wrong password | "That password isn't right."; nothing archived | negative |
| ARC-005 | By phone code | Owner | Phone on the account | Use a code → enter it | Archived | happy |
| ARC-006 | Not the owner | Admin | | Open Business profile | No **Close this business** section; API refuses | permission |
| ARC-007 | Shared from another account | Owner invited from another account | | Open the section | No archive row; API refuses (NOT_ACCOUNT_OWNER) | permission |
| ARC-008 | Read-only while archived | API | ARC-001 | POST an invoice to the archived business | 409 COMPANY_ARCHIVED "…read-only. An owner can restore it in Settings." | negative |
| ARC-009 | Billing can't be cancelled | Owner / paid | Gateway down | Archive | "We couldn't cancel this business's subscription just now…"; not archived | negative |
| ARC-010 | Archived list and dates | Owner | ARC-001 | Open another business's Business profile | Listed "Archived <date> · erased after <date + 8 years>" with **Restore** | happy |
| ARC-011 | Restore | Owner | ARC-010 | **Restore** | "Business restored"; back in the list on Free; records intact | happy |
| ARC-012 | No backups while archived | System | ARC-001, automatic backup was on | Run `backups.due` | No backup queued for it | edge |
| ARC-013 | Purge after 8 years | System | Archived business with purge date in the past | Run `accounts.purge` | Business rows and files erased (or counted only with PURGE_DRY_RUN); account and other businesses stay | edge |
| ARC-014 | Audit | Owner | ARC-001, ARC-011 | Audit trail | "archived" and "restored" events | happy |
| ARC-015 | Offline | Owner | Network off | Open the archive sheet | "You're offline. Connect to the internet to archive this business." | negative |

### Privacy and usage data (`PRV-`)

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| PRV-001 | Default on | Any | New user | **Your profile › Privacy and usage data** | **Share usage data** on; "What is shared" text shown | happy |
| PRV-002 | Opt out | Any | PostHog keys set | Switch off | Saved; no more app or server events for this user | happy |
| PRV-003 | Opt back in | Any | PRV-002 | Switch on | Events resume | happy |
| PRV-004 | Opt-out kept across devices | Any | PRV-002 | Sign in on another device | Switch is off there too (stored on the server) | edge |
| PRV-005 | Demo never shares | Public demo | | Open Privacy | "The demo never shares usage data."; no switch; no events | edge |
| PRV-006 | Save fails | Any | Network off | Flip the switch | Switch goes back; error toast | negative |
| PRV-007 | No personal data | QA | PostHog test project | Create an invoice; inspect the event | Event name and whitelisted properties only: no amounts, names, GSTINs or emails | happy |
