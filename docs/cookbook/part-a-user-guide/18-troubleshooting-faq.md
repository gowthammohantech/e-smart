# 18 — Troubleshooting & FAQ

This chapter has three parts:
- common messages and how to fix them;
- answers to frequent questions;
- the honest list of what isn't available yet.

---

## Common errors

Messages are grouped by where you meet them. A short code, for example `PLAN_LIMIT_REACHED`, is what support and QA see in logs.

### Signing in and accounts

| You see | Why | What to do |
|---|---|---|
| *That code is not valid* (`OTP_INVALID`) | The OTP was wrong, expired (codes last 5 minutes), or already used | Tap resend after 30 seconds. You get up to 5 codes an hour and 5 tries per code. |
| *Verify your phone number again to sign up* | More than 15 minutes passed since the OTP was verified | Request a new code |
| *An account with this email already exists* (`EMAIL_TAKEN`) | Signing up with an email that's already registered | Sign in instead, or use **Forgot password** |
| *This person is already on your team* | Inviting someone who is already a member | Edit their role instead |
| *This invite link is invalid or has expired* (`INVITE_INVALID`) | Old, used or mistyped invitation | Ask the owner or admin to **Resend invite** |
| *This user has been disabled* (`USER_DISABLED`) | Your access to the business was switched off, or a platform operator disabled your login | Contact the business owner, or support |
| *This account has been suspended. Contact support.* (`ACCOUNT_SUSPENDED`) | A platform operator suspended the account | Contact support |
| Too many requests (`RATE_LIMITED`) | Too many attempts in a short time | Wait a minute and try again |

### Plans and permissions

| You see | Why | What to do |
|---|---|---|
| **〈Module〉 is on Smart Pro** (upgrade page), or `PLAN_UPGRADE_REQUIRED` | The plan doesn't include purchases, stock, expenses, OCR, currencies, branches or that report | An owner upgrades ([14](14-team-roles-plans.md#upgrade-or-downgrade-the-plan)) |
| *Your free plan includes 20 invoices a month. Upgrade your plan to issue more.* (`PLAN_LIMIT_REACHED`) | Free plan's monthly invoice cap is used up | Upgrade, or finalise next month. Drafts are still allowed. |
| **Upgrade to invite more people** (`PLAN_LIMIT_REACHED`) | Every seat is taken. Pending invitations count. | Remove someone, cancel a pending invitation, or upgrade |
| *This needs one of: owner, admin, …* (`ROLE_FORBIDDEN`) | Your role can't do this action | Ask someone with the right role ([14](14-team-roles-plans.md#role-matrix)) |
| *Only an owner can manage owners* | An admin tried to create, change or remove an owner | Ask an owner |
| *The account needs at least one active owner* (`LAST_OWNER`) | Demoting or removing the only owner | Make someone else an owner first |
| *You can't disable yourself* | Disabling your own user | Ask another owner or admin |

### Documents

| You see | Why | What to do |
|---|---|---|
| *〈Item〉: 3 Nos in stock at this branch on 〈date〉, 10 needed* (`INSUFFICIENT_STOCK`) | Finalising would sell more than the branch holds on that date | Record the purchase or receipt, transfer stock from another branch, or turn on **Allow negative stock** ([13](13-settings.md#business-profile)) |
| **Credit limit exceeded**: *"… With this invoice they would owe …"* | The customer would go over their credit limit | **Continue anyway**, or collect a payment first. This is a warning, not a block. |
| *HSN/SAC code is required for a GST-registered business* | A line has no HSN/SAC | Add it to the line, or to the item so it fills in next time |
| *HSN/SAC code should be 4, 6 or 8 digits* | Malformed code | Fix the code. From ₹5 crore turnover, e-invoicing wants 6 digits. |
| *The books are closed through 〈date〉; an owner must reopen them…* (`PERIOD_LOCKED`) | The document is dated in a closed period | Ask the owner to reopen the period, or date the document after the lock |
| *A 〈document〉 cannot go from 〈status〉 to 〈status〉* (`INVALID_TRANSITION`) | That status change isn't allowed for this document type | See the lifecycles in [05](05-sales.md) and [06](06-purchases.md) |
| *A 〈document〉 cannot be converted to a 〈document〉*, or *… is cancelled* (`INVALID_CONVERSION`) | Converting a cancelled or rejected document, or to a type that isn't allowed | Duplicate the document instead |
| *Cancel the e-invoice (IRN) before cancelling this document* | The invoice has a live IRN | Cancel the IRN first, within 24 hours; after that, issue a sales return ([11](11-gst-compliance.md#cancel-an-irn)) |
| *Cancel e-way bill 〈number〉 before cancelling this document* (`EWAY_BILL_ACTIVE`) | The document has an active e-way bill | Cancel the e-way bill first, within 24 hours |
| *Another party already uses the code 〈code〉* (`PARTY_CODE_TAKEN`) | Duplicate customer or supplier code | Choose another code |

### GST portal

| You see | Why | What to do |
|---|---|---|
| **Fix N problems before reporting** | The pre-check found problems: GSTIN, HSN, number length, place of supply, totals | Fix each listed problem, then generate again |
| **The portal refused the invoice** (`IRP_REJECTED`) | The IRP rejected it. Reasons are listed. | Fix and resubmit. Rejections also show on Home. |
| **The bill could not be raised** (`EWB_REJECTED`) | The e-way bill portal rejected it | Check the vehicle number, PIN codes, distance (max 4,000 km) and GSTINs |
| **Could not sign in to the portal** | Wrong portal username or password | Re-enter them in **E-invoicing & e-way bill › Portal credentials** and **Test connection** |
| *The GST gateway refused this application's credentials* (`GSP_AUTH`) / gateway not configured (`GSP_NOT_CONFIGURED`) | The server's GSP setup is incomplete | Server-side; contact support |
| *The GST gateway is unavailable* (`GSP_UNAVAILABLE`) | The government or GSP side is down | Try again later. Watch the e-way bill validity. |
| *Connect to the internet to reach the GST portal, then try again.* | You're offline | Reconnect |
| *The 24-hour cancellation window has closed; issue a credit note instead* | Too late to cancel the IRN | Issue a sales return ([05](05-sales.md)) |
| *Longer than 16 characters — the e-invoice portal will reject this number.* | The numbering series is too long | Shorten the prefix or drop the branch code ([13](13-settings.md#document-numbering)) |

### Files and connection

| You see | Why | What to do |
|---|---|---|
| *That image is over 5 MB…* / *The logo must be 5 MB or smaller* (`FILE_TOO_LARGE`) | Logo too large | Use a smaller PNG or JPEG |
| *The upload failed (〈status〉). Try again.* | Upload interrupted; nothing was saved | Try again online |
| *The server did not return the PDF* / *a link* | PDF or link service hiccup | Try again |
| *The export is taking longer than expected…* | A large export | Try again shortly |
| **No internet connection** in the header, save buttons greyed out | The server can't be reached | Reconnect. What's on screen stays readable; nothing is saved until you're back online. |
| **You're offline** screen when opening the app | No connection at launch | Reconnect, then tap **Try again** |
| A toast saying the server refused the change, and the screen goes back | The server refused the save, or the connection dropped mid-save. The change was undone; nothing waits to be sent later. | Read the reason, fix it and save again |
| The record changed elsewhere and your edit was refused | Someone else saved it first | The screen now shows the server's copy. Make your change again on it. |
| **Update required** | This version of the app is no longer supported | Tap **Update the app** and install the latest version |
| *The server returned an incomplete session. Sign in again.* | Session problem | Sign out and back in. Your books are on the server, so nothing is lost. |
| *GSTIN should look like 27AABCV1234F1ZO* / *…fails its check digit — look for a typo* | Mistyped GSTIN | Re-check all 15 characters |
| *PIN code 〈pin〉 is in 〈state〉, not 〈state〉* | PIN and state don't match | Fix one of them |
| *An unregistered or overseas party has no GSTIN* | A GSTIN entered for an unregistered or overseas contact | Change the registration type, or clear the GSTIN |
| Lookup or OCR returns *feature unavailable* (`FEATURE_UNAVAILABLE`) | The server has no provider for GSTIN lookup or OCR | Enter details by hand (see [Not available yet](#not-available-yet)) |

---

## FAQ

**Why can't I edit an invoice I issued?**
Once finalised, a document is permanent and its number is never reused. To correct it:
- cancel it (cancel the IRN and e-way bill first, if any) and raise a new one; or
- issue a **sales return** (credit note) against it ([05](05-sales.md)).

**Why did my invoice get IGST instead of CGST + SGST?**
The place of supply is in a different state from your business, or from the branch's GSTIN. Check the customer's billing state, or change **Place of supply** on the document.
- Example: Vertex Traders in Maharashtra (27) invoicing Kumar Electronics in Karnataka (29) gets IGST.
- Invoicing Sunrise Retail in Mumbai (27) gets CGST + SGST.

**Why can't I mark an invoice as "Paid" myself?**
**Paid**, **Partly paid** and **Overdue** are worked out from the payments allocated to the document; you can't set them by hand. Record the payment and allocate it to the invoice ([07](07-payments.md)).

**My dashboard and reports don't match a colleague's.**
They're worked out from what the server sends when each screen opens. Check that you're both on the same business, branch and period, then reopen the screen (or reload the page on the web) to fetch the latest.

**Can I create a second business from inside the app?**
Not yet. New businesses come from onboarding on a new account, or are added on the server. Switching between businesses you already have is in the header ([03](03-navigation.md)).

**What does downgrading do to my data?**
Nothing is deleted. Purchases, stock and expenses are hidden until you upgrade again.

**Is Tamil supported everywhere?**
Most screens, yes, and PDFs are generated in your chosen language. A few things stay in English: GST terms by design, plus server messages, some GST tab tiles, and parts of the server-made PDFs.

**Where's the balance sheet / TDS / GSTR-3B?**
On full plans: the balance sheet, trial balance and P&L are under **More › Books** ([19](19-books.md)); TDS and reverse charge are worked out on bills ([20](20-tds-rcm-itc.md)); GSTR-2B and GSTR-3B are under **Data & compliance** ([21](21-gst-returns.md)). Payroll and batch/serial tracking are still outside the product.

**How do I close the books for a period?**
**Books › Close the books**, owner only ([19](19-books.md#close-the-books)). Filing GSTR-3B through the app closes its month on its own. Once closed, any change dated in that period is refused with `PERIOD_LOCKED`.

**Can I file GSTR-1 and GSTR-3B from the app?**
The app saves both to the portal. Filing from the app stays switched off until a chartered accountant signs off the rules ([`docs/accounting/RULES.md`](../../accounting/RULES.md)) and the GSP's returns routes pass its sandbox. Until then, file on the portal, where the saved return is waiting.

---

## Not available yet

These features are planned or partly built. They are **not working today**, and the cookbook doesn't describe them as if they were. They come from the project's readiness audit (`docs/PRODUCTION_READINESS.md`, `docs/WHY_NOT_READY.md`).

### Features you might look for

| Feature | Status today | Workaround |
|---|---|---|
| **Shared document links** (customer view, download, pay) | Links are created, but the public page they open doesn't exist yet | Share the PDF, or send by email or WhatsApp |
| **Online payment links** (`/pay/…`) | The payment page doesn't exist yet | Collect by UPI QR (printed on the invoice), bank transfer or cash, and record the payment |
| **Razorpay and Google Drive connections** | The sign-in step that completes the connection isn't built | — |
| **Recurring expenses** | The repeat schedule is saved but nothing creates the next expense | Record each one by hand |
| **Automatic backups** (nightly or weekly) | The switch is saved but no backup runs | Export manually from **Backup & export** |
| **Scheduled payment reminders** | No automatic runs | Use **Remind** on Receivables, which prepares a message you send |
| **Bill scanning (OCR) in the browser** | Not available; server-side reading isn't built | Use the installed Android or iPhone app, or type it in |
| **GSTIN lookup** (fill in a business from its GSTIN) | Partly built; some PIN codes and road distances aren't found | Enter the details by hand |
| **Camera barcode scanning** | The scan screen accepts a typed or pasted code only | Type or paste the code |
| **Google sign-in** | Not built | Use email and password, or phone OTP |
| **Filing GSTR-1 and GSTR-3B from the app** | Built; switched off until CA sign-off and the GSP sandbox | Save from the app, file on the portal |
| **Filing with a DSC** | EVC only | Companies save from the app and file on the portal |
| **Refunding an advance** | Built | Open the receipt, tap **Refund** under the advance it holds; the refund prints as the refund voucher |
| **Imports of goods (bill of entry) and ISD credit in 3B** | Always zero | Adjust on the portal before filing |
| **GSTR-1 amendment tables** (B2BA, CDNRA) | Not produced | Correct in a later period's ordinary tables |
| **Delete my account** in the app | Not built (app stores require it) | Contact support |
| **Push notifications** | The phone app doesn't register for push yet | Check **Notifications** in the app |
| **"3 of 6 users" on Plan & billing** | Shows plain counts only | Count against the plan table ([14](14-team-roles-plans.md#compare-plans-and-see-usage)) |
| **In-app purchase** on iPhone | Plans are bought through a web checkout | — |
| **Bank feeds or reconciliation; CSV/Excel import** | Not in the product | Record payments by hand |

### Waiting on providers (production)

The production server won't start until each of these is set up. In demo and development they are simulated, so they appear to work:

| Service | What depends on it |
|---|---|
| SMS (OTP) | Phone sign-in. In demo, `123456` works. |
| Email | Password reset, invitations, sending documents by email |
| WhatsApp Business | Sending documents and reminders on WhatsApp |
| GST gateway (GSP) | Real IRNs and e-way bills; the GST portal connection, GSTR-2B and filing. The adapters are built, but not yet certified on the government sandboxes, and the QR signature is generated locally. |
| Razorpay | Plan checkout and payment links |
| PDF rendering | Server-made PDFs (with IRN, QR and e-way bill number) |
| File storage | Logos, receipts, attachments |
| Exchange-rate feed | Automatic currency rates. Manual rates work. |
| AI provider | Lixi's answers |

### Known limitations

- **The app is online only.** Nothing can be saved without a connection; what's on screen stays readable.
- **Dashboard, search, aging, reports and GSTR-1 are worked out in the app** from the records the server sends, not by the server. They're as current as the last time the screen loaded.
- **Legal links** (privacy, terms, support) in **About** are placeholders.
- **Tamil:** some server text and PDFs are still English.
- **Very large businesses** may be slow to load on the web, which downloads the whole app on first visit, and very old phones may struggle.

---

**Related:** [README](../README.md) · [14 Team, roles & plans](14-team-roles-plans.md)
