# 28 — Company archive & your data

Where your books are kept, how to take a copy of them, and what happens to them when you downgrade, close a business or delete your account.

- **Plan:** exports, backups and archiving work on every plan.
- **Roles:** exports and backup settings are for the owner or admin. Archiving and restoring a business are for the owner only.

---

### Where your data lives

- Your books live on the server, and nothing is kept on the device. Every change is saved straight to the server, which checks it before it counts. That is why the app needs a connection to make changes (**More › About › About your data**).
- Each business's records are kept apart on the server. Someone you add to one business sees only that business, and only the branches you give them ([14](14-team-roles-plans.md)).
- Every change is written to the audit trail, which can't be edited or deleted ([13 › Audit trail](13-settings.md#audit-trail)).

---

### Export a business

**Goal:** take a full copy of one business's books, for an auditor, for Tally, or for safekeeping.
**Who / plan:** owner or admin · every plan · needs a connection.

**More › Data › Backup & export**

**Steps**
1. Check **What's included**: counts of **Customers & suppliers**, **Items**, **Documents**, **Payments**, **Expenses**, **Stock movements** and **Audit events**.
2. Pick a format under **Formats**:
   - **Machine-readable JSON**: full records, ready to import elsewhere.
   - **CSV files**: every table as a CSV file, zipped together.
   - **Tally XML**: ledgers and vouchers to import into Tally.
   - The **Export this business** button at the foot exports JSON.
3. Confirm **Export company data?** with **Export**. The package contains customer details and financial records, so share it only with people who should see them.
4. You see **Preparing your export…**, then **Export package prepared**. 📱 The file is offered for sharing. 🖥 It downloads in a new tab.

**What happens**
- The server builds the package and hands back a download link. The link works for an hour; the file is kept for 7 days.
- The export and its download are recorded in the audit trail.

**Rules & gotchas**
- The export covers **this business only**. Your other businesses stay out of the package, so you can hand an auditor exactly one set of books.
- A large business may see **The export is taking longer than expected. Try again shortly.** The app waits up to two minutes.
- One report at a time can also be exported as PDF, Excel or CSV from the report itself ([12](12-reports.md#export-a-report)). GST returns have their own exports ([21](21-gst-returns.md)).

---

### Back up automatically

**Goal:** have the server take a copy of the books on its own.
**Who / plan:** owner or admin · every plan.

**Steps**
1. **Backup & export › Automatic backup**.
2. Switch on **Back up automatically**. The card shows **Nightly**.

**What happens**
- About once a day the server makes a JSON backup of the business and keeps it for 35 days.
- You get a **Backup ready** notification. Tapping it opens **Backup & export**.
- The card shows **Last backup 〈when〉**, or **No backup has run yet.**
- Backups stop while a business is archived, and never run for the public demo.

> **Not available yet.**
> - The app has no list of past backups, so a scheduled backup can't be downloaded from the app. To keep a copy yourself, use [Export a business](#export-a-business).
> - There is no way to pick **Weekly** in the app; backups run daily.
> - **Google Drive backup** shows **Coming soon** under Integrations, so backups can't go to your Drive yet ([13](13-settings.md#integrations)).

Financial records under statutory retention are kept even if you remove them from the device.

---

### What happens to your data when you downgrade

**Goal:** know what you keep when you move to a smaller plan.

- **Nothing is deleted.** Every plan has the same records; a plan only decides what you can open.
- On Free or Basic, purchases, suppliers, payables, stock, expenses, bill capture, the books and extra branches are hidden. Opening one shows the upgrade page, and the server refuses changes to them.
- Pro reports leave the Reports list ([12](12-reports.md#a-report-is-locked)).
- Upgrade again and everything comes back as it was.
- A module the owner switched off works the same way: hidden, kept, and back when it's on again ([13 › Modules](13-settings.md#modules)).
- Seat and invoice limits are in [14](14-team-roles-plans.md).

---

### Archive a business

**Goal:** close one business for good while keeping its books, without touching your other businesses.
**Who / plan:** the owner, on the account the business belongs to · needs a connection.

**Before you start**
- You need at least one other open business on the account. With only one, the row reads *"This is your only open business. To close it, delete your account under Profile instead."* and is greyed out.
- A business shared with you from another account can only be archived by that account's owner.
- Take an export first if you'll need the records ([Export a business](#export-a-business)).

**Steps**
1. **More › Business setup › Business profile**, scroll to **Close this business**.
2. Tap **Archive this business**.
3. Read **Archive 〈name〉?**. Tap **Download a backup first** if you want one.
4. **Type 〈name〉 to confirm.** Upper or lower case doesn't matter.
5. Prove it's you: enter your password, or ask for a code by text and enter it.
6. Tap **Archive business**. You see **Archiving…**, then **Business archived**.

**What happens**
- Its subscription is cancelled now, and the business moves to the Free plan.
- It leaves the business list for you and everyone you gave it to. Nobody lands in it on their next sign-in.
- Its invoices, bills and books stay as they are, read-only. The server refuses every change with *"This business is archived, so its books are read-only. An owner can restore it in Settings."*
- Background work for it stops, including automatic backups.
- The books are kept for **8 years**, as GST law requires, then erased (see [The 8-year purge](#the-8-year-purge)).
- The archive is written to the audit trail.

**Rules & gotchas**
- If the subscription can't be cancelled just then, nothing changes: *"We couldn't cancel this business's subscription just now, so it wasn't archived. Try again in a few minutes."*
- **That password isn't right.** or **That code isn't right, or has expired. Ask for a new one.** means the check failed; nothing was archived.
- Offline you see **You're offline. Connect to the internet to archive this business.**

---

### Restore an archived business

**Who / plan:** the owner, on the account the business belongs to.

**Steps**
1. Open any open business, then **Business profile › Close this business**.
2. Each archived business is listed with **Archived 〈date〉 · erased after 〈date〉**.
3. Tap **Restore**. You see **Business restored**.

**What happens**
- The business is back in the business list, for you and the people it was shared with, and can be changed again.
- It stays on the **Free** plan. Upgrade it to open the modules it used before ([14](14-team-roles-plans.md#change-the-plan)); its records are all still there.
- The erase date is cleared.

To look at an archived business's books, or export them, restore it first. The app doesn't open an archived business.

---

### The 8-year purge

- GST law requires books to be kept for 72 months after the annual return's due date. Eight years from the day you archive covers it.
- Once that date passes, a daily job erases the archived business: its records and files. Your account and its other businesses stay.
- Restoring before then cancels the purge.
- A closed account follows the same rule: see [Delete your account](#delete-your-account).

---

### Delete your account

**Goal:** erase your own login and personal details.
**Who / plan:** everyone, for themselves · needs a connection.

**Steps**
1. **Your profile › Delete account**.
2. Read **Delete your account?**. Tap **Download a backup first** if you'll need the records.
3. Enter **Your password**, or tap **Use a code sent to my phone instead** and **Send a code to 〈phone〉**.
4. **Type DELETE to confirm**, then tap **Delete my account**. You see **Your account was deleted.**

**What happens**
- Your name, email, phone and logins are erased, and you're signed out on every device. This can't be undone.
- If you're the only person on your account, it closes too: the subscription is cancelled, and your invoices and records are kept locked for 8 years, as GST law requires, then erased.

**Rules & gotchas**
- If other people use a business you own, you see *"Other people use 〈names〉. Make one of them an owner under Users first, then delete your account."* with **Open Users**.

---

**Related:** [13 Settings](13-settings.md) · [14 Team, roles & plans](14-team-roles-plans.md) · [12 Reports](12-reports.md) · [19 Books › Tally export](19-books.md)
