# 18 — Troubleshooting & FAQ

This chapter has three parts:
- common messages and how to fix them;
- answers to frequent questions;
- the honest list of what isn't available yet.

Elixir Books Smart is **online only**: your books live on the server, and nothing is kept on the device to send later.

---

## Common errors

Messages are grouped by where you meet them. A short code, for example `PLAN_LIMIT_REACHED`, is what support and QA see in logs.

### Signing in and accounts

| You see | Why | What to do |
|---|---|---|
| *Email or password is incorrect.* (`INVALID_CREDENTIALS`) | Wrong email or password | Check both, or use **Forgot password** |
| *Too many wrong passwords, so this account is locked for a while…* (`ACCOUNT_LOCKED`) | Five wrong passwords in a row. The lock lasts 15 minutes and doubles each time. | Wait, or reset your password to get in now |
| *That code isn't right. Check the SMS and try again.* (`OTP_INVALID`) | The OTP was wrong | Re-enter it. You get up to 5 tries per code. |
| *That code has expired. Request a new one.* (`OTP_EXPIRED`) | Codes last 5 minutes, or the code was used up | Tap resend after 30 seconds. You get up to 5 codes an hour. |
| *Verify your phone number again to sign up* | More than 15 minutes passed since the OTP was verified | Request a new code |
| *An account with this email already exists. Sign in instead.* (`EMAIL_TAKEN`) | Signing up with an email that's already registered | Sign in instead, or use **Forgot password** |
| *No account uses this phone number. Sign up first.* | Phone sign-in for a number that isn't registered | Sign up, or sign in by email |
| *Enter the code from your authenticator app* (`MFA_REQUIRED`) | You turned on sign-in security | Enter the 6-digit code, or a recovery code ([01](01-getting-started.md)) |
| *This person is already on your team* | Inviting someone who is already a member | Edit their role instead |
| *This invite link is invalid or has expired* (`INVITE_INVALID`) | Old (over 7 days), used or mistyped invitation | Ask the owner or admin to **Resend invite** |
| *This user has been disabled* (`USER_DISABLED`) | Your access to the business was switched off, or a platform operator disabled your login | Contact the business owner, or support |
| *This account has been suspended. Contact support.* (`ACCOUNT_SUSPENDED`) | A platform operator suspended the account | Contact support |
| *This business has been suspended. Contact support.* | You're a guest in a business whose account was suspended | Contact the business owner. Your own businesses still work. |
| *Too many attempts. Wait a little and try again.* (`RATE_LIMITED`) | Too many attempts in a short time | Wait a minute and try again |
| *This is a demo, so changes aren't saved. Create your free account to keep your own books.* (`DEMO_READ_ONLY`) | You're in the public **Give it a try** demo, which is read-only | Create your own free account |

### Plans and permissions

| You see | Why | What to do |
|---|---|---|
| **〈Module〉 is on Smart Pro** (upgrade page), or `PLAN_UPGRADE_REQUIRED` | The plan doesn't include purchases, stock, expenses, OCR, the books, GSTR-2B matching or that report | Ask support to change the plan ([14](14-team-roles-plans.md#change-the-plan)) |
| *〈module〉 is switched off for this business; an owner can switch it on in Settings* (`MODULE_OFF`) | The owner switched the module off under **Modules** | The owner switches it back on |
| *Your free plan includes 20 invoices a month. Upgrade your plan to issue more.* (`PLAN_LIMIT_REACHED`) | Free plan's monthly invoice cap is used up | Finalise next month, or change the plan. Drafts are still allowed. |
| **Upgrade to invite more people** (`PLAN_LIMIT_REACHED`) | Every seat is taken. Pending invitations count. | Remove someone, remove a pending invitation, or change the plan |
| *This business has used its 〈n〉 AI actions for 〈month〉…* (`AI_LIMIT_REACHED`) | The month's AI allowance (or the owner's lower budget) is used up | Wait for the 1st, or the owner raises the budget up to the plan's ([16](16-lixi-assistant.md#ai-usage-and-the-monthly-allowance)) |
| *This needs one of: owner, admin, …* (`ROLE_FORBIDDEN`) | Your role can't do this action | Ask someone with the right role ([14](14-team-roles-plans.md#role-matrix)) |
| *Only an owner can close or reopen the books*, *…switch modules on or off*, *…set what needs approval*, *…change how stock is costed* (`OWNER_ONLY`) | These settings are owner-only | Ask an owner |
| *Only an owner can manage owners* | An admin tried to create, change or remove an owner | Ask an owner |
| *The account needs at least one active owner* (`LAST_OWNER`) | Demoting or removing the only owner | Make someone else an owner first |
| *You can't disable yourself* / *You can't remove yourself* | Changing your own access | Ask another owner or admin |
| *The books cover every branch; ask an owner or admin* (`BOOKS_ALL_BRANCHES`) | You're limited to some branches, and the books cover all of them | Ask an owner or admin |
| *You do not work in this branch* (`BRANCH_NOT_ALLOWED`) | Opening a branch you're not assigned to | Ask an owner or admin |
| *This business is archived, so its books are read-only. An owner can restore it in Settings.* (`COMPANY_ARCHIVED`) | The business was archived | Read and export only, or the owner restores it ([28](28-company-archive-and-data.md)) |

### Documents

| You see | Why | What to do |
|---|---|---|
| *〈Item〉: 3 Nos in stock at this branch on 〈date〉, 10 needed* (`INSUFFICIENT_STOCK`) | Finalising would sell more than the branch holds on that date | Record the purchase or receipt, transfer stock from another branch, or turn on **Allow negative stock** ([13](13-settings.md#business-profile)) |
| **Credit limit exceeded**: *"… With this invoice they would owe …"* | The customer would go over their credit limit | **Continue anyway**, or collect a payment first. This is a warning, not a block. |
| A document waits for approval instead of being issued | The owner set an approval rule and you aren't an owner or admin | An owner or admin approves it ([25](25-approvals.md)) |
| *HSN/SAC code is required for a GST-registered business* | A line has no HSN/SAC | Add it to the line, or to the item so it fills in next time |
| *HSN/SAC code should be 4, 6 or 8 digits* | Malformed code | Fix the code. From ₹5 crore turnover, e-invoicing wants 6 digits. |
| *The books are closed through 〈date〉; an owner must reopen them…* (`PERIOD_LOCKED`) | The document is dated in a closed period | Ask the owner to reopen the period, or date the document after the lock |
| *A 〈document〉 cannot go from 〈status〉 to 〈status〉* (`INVALID_TRANSITION`) | That status change isn't allowed for this document type | See the lifecycles in [05](05-sales.md) and [06](06-purchases.md) |
| *A 〈document〉 cannot be converted to a 〈document〉*, or *… is cancelled* (`INVALID_CONVERSION`) | Converting a cancelled or rejected document, or to a type that isn't allowed | Duplicate the document instead |
| *Cancel the e-invoice (IRN) before cancelling this document* | The invoice has a live IRN | Cancel the IRN first, within 24 hours; after that, issue a sales return ([11](11-gst-compliance.md#cancel-an-irn)) |
| *Cancel e-way bill 〈number〉 before cancelling this document* (`EWAY_BILL_ACTIVE`) | The document has an active e-way bill | Cancel the e-way bill first, within 24 hours |
| *Another party already uses the code 〈code〉* (`PARTY_CODE_TAKEN`) | Duplicate customer or supplier code | Choose another code |
| *This branch has 〈…〉* / *The primary branch cannot be deleted…* (`BRANCH_IN_USE`) | Deleting a branch with documents, or the primary branch | Keep it, or make another branch primary first |

### GST portal

| You see | Why | What to do |
|---|---|---|
| **Fix N problems before reporting** | The pre-check found problems: GSTIN, HSN, number length, place of supply, totals | Fix each listed problem, then generate again |
| **The portal refused the invoice** (`IRP_REJECTED`) | The IRP rejected it. Reasons are listed. | Fix and resubmit. Rejections also show on Home. |
| **The bill could not be raised** (`EWB_REJECTED`) | The e-way bill portal rejected it | Check the vehicle number, PIN codes, distance (max 4,000 km) and GSTINs |
| **Could not sign in to the portal** | Wrong portal username or password | Re-enter them in **E-invoicing & e-way bill › Portal credentials** and **Test connection** |
| *The GST gateway refused this application's credentials* (`GSP_AUTH`) / gateway not configured (`GSP_NOT_CONFIGURED`) | The server's GSP setup is incomplete | Server-side; contact support |
| *The GST gateway is unavailable* (`GSP_UNAVAILABLE`) | The government or GSP side is down | Try again later. Watch the e-way bill validity. |
| *Connect to the internet to reach the GST portal, then try again.* | No connection | Reconnect |
| *The 24-hour cancellation window has closed; issue a credit note instead* | Too late to cancel the IRN | Issue a sales return ([05](05-sales.md)) |
| *Filing through the app is not switched on yet; file on the GST portal, using the saved return* (`FILING_DISABLED`) | Filing from the app is off until CA sign-off | File on the portal ([21](21-gst-returns.md)) |
| *Longer than 16 characters — the e-invoice portal will reject this number.* | The numbering series is too long | Shorten the prefix or drop the branch code ([13](13-settings.md#document-numbering)) |

### Lixi

| You see | Why | What to do |
|---|---|---|
| *I can't reach the server right now, so I can't read your books…* | No connection, or the AI model is down or not set up | **Try again**. The question isn't counted against the allowance. |
| *Lixi needs a moment; try again shortly* | About 20 questions a minute per person | Wait a few seconds |
| *That expired. Ask me again and I'll prepare it afresh.* | A prepared action is valid for 5 minutes | Ask again |
| *That didn't go through: …* | The change was refused (role, plan or a missing field) | Read the reason; fix it or ask someone with the right role |
| *Open or set up a business first…* | No business is open | Finish onboarding or pick a business |

### Files and connection

| You see | Why | What to do |
|---|---|---|
| *That image is over 5 MB…* / *The logo must be 5 MB or smaller* (`FILE_TOO_LARGE`) | Logo too large | Use a smaller PNG or JPEG |
| *The upload failed (〈status〉). Try again.* | Upload interrupted; nothing was saved | Try again |
| *The server did not return the PDF* / *a link* | PDF or link service hiccup | Try again |
| *The export is taking longer than expected…* | A large export | Try again shortly |
| *Can't reach the server. Check your connection and try again.* | The save didn't reach the server | Reconnect and save again. Nothing waits to be sent later. |
| **No internet connection** in the header | The server can't be reached | Reconnect. What's on screen stays readable; nothing is saved until you're back online. |
| **You're offline**: *"Elixir Books Smart needs an internet connection…"* when opening the app | No connection at launch | Reconnect, then tap **Try again** |
| **The server is busy**: *"It couldn't open your books just now…"* | The server is overloaded or restarting | It retries on its own in a few seconds |
| A toast saying the server refused the change, and the screen goes back | The server refused the save. The change was undone. | Read the reason, fix it and save again |
| The record changed elsewhere and your edit was refused | Someone else saved it first | The screen now shows the server's copy. Make your change again on it. |
| **Update required** | This version of the app is no longer supported | Tap **Update the app** (or **Reload** on the web) and install the latest version |
| *The server returned an incomplete session. Sign in again.* | Session problem | Sign out and back in. Your books are on the server, so nothing is lost. |
| *GSTIN should look like 27AABCV1234F1ZO* / *This GSTIN fails its check digit — look for a typo* | Mistyped GSTIN | Re-check all 15 characters |
| *PIN code 〈pin〉 is in 〈state〉, not 〈state〉. Check the PIN code or the state.* | PIN and state don't match | Fix one of them |
| *An unregistered or overseas party has no GSTIN* | A GSTIN entered for an unregistered or overseas contact | Change the registration type, or clear the GSTIN |
| Lookup or OCR returns *feature unavailable* (`FEATURE_UNAVAILABLE`) | The server has no provider for GSTIN lookup or bill reading | Enter details by hand (see [Not available yet](#not-available-yet)) |

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
The server works them out when each screen opens. Check that you're both on the same business, branch and period, then reopen the screen (or reload the page on the web) to fetch the latest. Someone limited to some branches sees only those branches.

**Does the app work without the internet?**
No. Every screen reads from the server and every save goes straight to it. Without a connection you can read what's already on screen, but nothing is saved.

**How do I upgrade or downgrade my plan?**
Not from the app yet: online plan payments aren't live, so the plan page has no buy or downgrade buttons, and the phone apps show no prices. Contact support and an operator changes the plan ([14](14-team-roles-plans.md#change-the-plan)).

**Can I create a second business from inside the app?**
Not yet. New businesses come from onboarding on a new account, or are added on the server. Switching between businesses you already have is in the header ([03](03-navigation.md)).

**What does downgrading do to my data?**
Nothing is deleted. Purchases, stock, expenses and the books are hidden until the plan goes up again.

**Why did Lixi stop answering?**
Either the server can't be reached, or the business has used its monthly AI allowance. Check **More › Account › AI usage** ([16](16-lixi-assistant.md#ai-usage-and-the-monthly-allowance)).

**Who can approve documents and payments?**
Owners and admins. Only the owner sets the rules ([25](25-approvals.md)).

**Is Tamil supported everywhere?**
Most screens, yes, and PDFs are generated in your chosen language. Lixi answers in Tamil too. A few things stay in English: GST terms by design, plus server messages, some GST tab tiles, and parts of the server-made PDFs.

**Where's the balance sheet / TDS / GSTR-3B?**
On full plans: the balance sheet, trial balance and P&L are under **More › Books** ([19](19-books.md)); TDS and reverse charge are worked out on bills ([20](20-tds-rcm-itc.md)); GSTR-2B and GSTR-3B are under **Data & compliance** ([21](21-gst-returns.md)). Payroll and batch/serial tracking are still outside the product.

**How do I close the books for a period?**
**Books › Close the books**, owner only ([19](19-books.md#close-the-books)). Filing GSTR-3B through the app closes its month on its own. Once closed, any change dated in that period is refused with `PERIOD_LOCKED`.

**Can I file GSTR-1 and GSTR-3B from the app?**
The app saves both to the portal. Filing from the app stays switched off until a chartered accountant signs off the rules and the GSP's returns routes pass its sandbox. Until then, file on the portal, where the saved return is waiting.

**How do I delete my account?**
**More › Account › Your profile › Delete account** ([01](01-getting-started.md)). If others use your businesses, make one of them an owner first. Records stay locked for 8 years, as GST law requires, then are erased.

---

## Not available yet

These features are planned or partly built. They are **not working today**, and the cookbook doesn't describe them as if they were.

### Features you might look for

| Feature | Status today | Workaround |
|---|---|---|
| **Buying, changing or cancelling a plan in the app** | Online plan payments aren't live; no buttons on **Plan & billing**, and the phone apps don't sell plans | Contact support; an operator changes the plan |
| **Adding a second business in the app** | Only through onboarding on a new account | Contact support |
| **Integrations other than the GST portals** (Razorpay, UPI / QR, WhatsApp Business, SMS gateway, Tally export, Google Drive backup) | Shown as **Coming soon** on **Integrations**; they can't be switched on | The UPI QR prints from your bank details; Tally XML is under **Backup & export**; WhatsApp sends open your own WhatsApp with the link filled in |
| **Filing GSTR-1 and GSTR-3B from the app** | Built; switched off until CA sign-off and the GSP sandbox | Save from the app, file on the portal |
| **Filing with a DSC** | EVC only, once filing is switched on | Save from the app and file on the portal |
| **Scheduled payment reminders to customers** | No automatic runs. The daily overdue job only notifies your own team. | Use **Remind** on Receivables |
| **Camera barcode scanning** | The scan screen accepts a typed or pasted code only | Type or paste the code |
| **Google sign-in** | Not built | Use email and password, or phone OTP |
| **Limiting a person to certain branches from the app** | The server supports branch limits, but **Users & roles** has no branch picker | Ask support |
| **Live bank feeds** | Only statement files can be imported and reconciled ([22](22-banking-and-reconciliation.md)) | Download the statement from your bank and import it |
| **Operator controls for the AI allowance, archive or purge** | Not in the admin console | Owners manage these in the app; purges run on the server |

### Waiting on providers (production)

In production, the server refuses to start until each of these is set up, unless the operator deliberately starts it without them (then the feature doesn't work). In demo and development they are simulated, so they appear to work:

| Service | What depends on it |
|---|---|
| SMS (OTP) | Phone sign-in. In demo, `123456` works. |
| Email | Password reset, invitations, sending documents by email |
| WhatsApp Business | Sending documents and reminders from the server on WhatsApp. Without it, the send fails with the reason. |
| Push notifications | Notifications on your phone. **Notifications** in the app always work. |
| GST gateway (GSP) | Real IRNs and e-way bills; the GST portal connection, GSTR-2B, GSTIN lookup and filing. The adapters are built, but not yet certified on the government sandboxes. |
| Razorpay | Online payment links (**Pay now** on a shared document) and plan checkout |
| PDF rendering | Server-made PDFs (with IRN, QR and e-way bill number) |
| File storage | Logos, receipts, attachments, exports and automatic backups |
| Bill reading (OCR) | Bill scanning in the browser, and bills the phone can't read itself |
| Exchange-rate feed | Automatic currency rates. Manual rates work. |
| AI model | Lixi's answers. Works with Anthropic or any OpenAI-compatible service. |

### Known limitations

- **The app is online only.** Nothing can be saved without a connection; what's on screen stays readable.
- **Plan cards promise more than the app enforces.** Businesses per plan isn't enforced, and receivables, GSTR-1, roles and backups work on every plan ([14](14-team-roles-plans.md#plans)).
- **AI cost** is recorded per business only when the model provider reports a price.
- **Tamil:** some server text and PDFs are still English.

---

**Related:** [README](../README.md) · [14 Team, roles & plans](14-team-roles-plans.md) · [16 Lixi](16-lixi-assistant.md) · [17 Admin console](17-admin-console.md)
