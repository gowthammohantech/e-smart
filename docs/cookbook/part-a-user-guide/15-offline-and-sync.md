# 15 — Working offline & sync

Your books live on the server. Each device keeps a working copy, so you can carry on without a connection:
- Changes you make offline are saved on the device and queued.
- They are sent, in order, as soon as you're back online.
- The server checks every finalised record before it counts, so the server's books are always the authoritative ones.

This works the same on every plan and role, on the phone and in the browser.

---

### Know when you're offline

- 📱 The header shows an **Offline** badge. 🖥 The top bar shows it.
- When something couldn't be sent, a **N failed** badge appears next to it. Tap it to open **Sync status**.
- Saving while offline shows: **Saved on this device. It will sync when you are back online.**

### What you can do offline

| Works offline | Needs a connection |
|---|---|
| Create and edit drafts of every document | Sharing a PDF, email, WhatsApp, copy link, payment link |
| **Finalise** documents (they get a provisional number, below) | E-invoice (IRN) and e-way bill: generate, update, extend, cancel |
| Record payments, expenses, stock adjustments and transfers | Uploading a logo |
| Add and edit customers, suppliers, items | Exports: reports are fine, but backup & export needs the server |
| Browse everything already on the device; run reports | Lixi |
| Attach a receipt; it uploads later | Bill scanning upload; plan checkout; inviting people |

### Finalise a document offline: provisional numbers

**Goal:** issue an invoice at a customer's site with no signal.

**Steps**
1. Create the invoice as usual and tap **Finalise**.
2. The invoice shows a **Provisional number** badge.
3. When the device is back online, the queue is sent. The server assigns the real number and the badge disappears.

**Rules & gotchas**
- The final number comes from the server's series, so it may differ from the provisional one if someone else issued invoices meanwhile. A finalised number is never reused.
- Share or print the invoice **after** it has synced, so the customer gets the final number.
- If stock or credit-limit checks fail on the server, the change shows as failed. See [Fix a failed change](#fix-a-failed-change).

### When sync happens

You don't have to do anything. The app syncs:
- about half a second after each change;
- when the app starts, when the connection comes back, and when you bring the app to the foreground;
- once a minute while it's open.

After a failure it retries by itself, at increasing intervals up to once a minute. To sync immediately, use **Sync now** on the Sync status screen.

---

### Check the sync status

**More › Data & compliance › Sync status.** 🖥 Click the offline or failed badge in the top bar.

| You see | Meaning |
|---|---|
| **Everything is synced** · **Nothing queued** | Every change has reached the server |
| **N waiting to sync** | Changes queued on this device. Each row shows **Queued 〈when〉 · N attempts**. |
| **Working offline** | No connection. You can keep drafting; everything is queued. |
| **Waiting on "〈change〉"** | This change depends on an earlier one that hasn't gone through yet |
| **Last sync problem: …** | The last error the server returned |
| **Last synced 〈when〉** / **Not synced yet** | When this device last talked to the server |

Buttons:
- **Sync now**: send the queue immediately.
- **Retry all**: resend every failed change.
- **Reload everything from the server**: throw away this device's copy and download the books again. Use it if the device's data looks wrong. Changes still in the queue are sent first. Needs a connection.

---

### Fix a failed change

A change can fail in two ways. Each is shown on **Sync status** with its own actions.

**1. Changed on another device (conflict)**

Someone saved the same record after you started editing it.
- The screen says **Changed on another device**: *"Someone saved this after you started editing. You now see their version."*
- Choose:
  - **Send my change again**: your version replaces theirs.
  - **Discard my change**: keep theirs.

**Nothing is ever overwritten silently.** You always decide.

*Example:* Meera, on her laptop, and Rahul, on his phone, both edit Sunrise Retail's phone number. Rahul's phone was offline.
1. Meera saves first.
2. When Rahul reconnects, his change shows as a conflict. His screen now shows Meera's number.
3. He either sends his number again or discards his change.

**2. The server refused this change**

The server checked the change and rejected it. Common reasons:
- not enough stock at the branch;
- the books are closed for that date;
- your role doesn't allow the action;
- the plan doesn't include the module.

The row shows **The server refused this change** with the server's reason.
- Fix the cause (add stock, ask an owner, upgrade), then tap **Send my change again**.
- Or tap **Discard my change** to drop it. You see **Change discarded**.

**Rules & gotchas**
- Several edits to the same record made before it's sent are merged into one change.
- Deleting something that never reached the server just removes it from the queue.
- A change that depends on a failed earlier change waits for it. Fix the first one and the rest follow.
- Today you can only keep your version or theirs. There's no side-by-side view to merge the two.

---

### Several browser tabs (web)

- You can open the app in several tabs. Only one tab syncs at a time; the others skip their turn.
- Tabs follow each other: a change saved in one tab appears in the others, and a tab never saves its stale copy back over another tab's work.

### Sign out with unsynced changes

**More › Sign out** warns you: *"Changes not yet synced stay on this device until you do."*
- Sign back in on the **same device** and they're sent.
- If you sign in on a different device, those changes aren't there. Sync before signing out.

### A new or second device

When you sign in on a new device, or join another business, the app downloads that business's books in full. On a large business the first download may take a moment.

---

> **Not tested on real devices yet.** Offline sync has passed automated tests, but airplane mode, killing the app mid-sync, and two-device conflicts haven't yet been run on a physical iPhone or Android phone. Two cases can still need a manual fix:
> - A payment queued offline, followed by an edit of its invoice, can conflict with itself.
> - If the e-way bill portal's reply is lost on a bad connection, the bill may exist on the portal without the app knowing.
>
> See [18](18-troubleshooting-faq.md#not-available-yet).

**Related:** [05 Sales](05-sales.md) · [13 Settings](13-settings.md) · [18 Troubleshooting](18-troubleshooting-faq.md)
