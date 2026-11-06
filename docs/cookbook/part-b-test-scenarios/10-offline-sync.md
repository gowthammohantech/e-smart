# 10 — Offline & sync

Tests for working without a connection, the sync queue, conflicts, refusals, multiple tabs on the web and sign-out. Setup and demo data are in [00 — Test setup](00-test-setup.md).

To cut the network, use airplane mode, or **DevTools › Network › Offline** on the web. A conflict needs two sessions on the same account. Offline sync has **never been tested on a real device**, so run this file on physical iOS and Android devices as well as the web.

### Indicators

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| OFF-001 | Offline badge | Owner | Online | Go offline | Header (📱) or top bar (🖥) shows **Offline**; the Sync screen says "Offline. Changes are saved on this device and sent when you're back online." | offline |
| OFF-002 | Back online | | OFF-001 | Reconnect | Badge clears; queue drains within seconds; "Everything is synced" | offline |
| OFF-003 | Failed badge | | A change the server refused (OFF-030) | Look at the header | "1 failed" | offline |

### Working offline

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| OFF-010 | Finalise offline | Owner | Offline | Create and finalise an invoice | Toast "Saved on this device. It will sync when you are back online."; **Provisional number** badge | offline |
| OFF-011 | Server assigns the number | | OFF-010 | Reconnect | Badge goes; the server's permanent number replaces it; totals recomputed by the server | offline |
| OFF-012 | Two devices offline | | Phone and web both offline | Finalise an invoice on each → reconnect both | Two different permanent numbers; no duplicate | edge |
| OFF-013 | Edits merge in the queue | | Offline | Edit a draft three times | Sync screen shows one queued change, not three | offline |
| OFF-014 | Delete before it's sent | | Offline | Create a draft → delete it | Removed from the queue; nothing reaches the server | offline |
| OFF-015 | Dependent change waits | | Offline | Create a customer → an invoice for them | Invoice queued "Waiting on “<customer>”" until the customer syncs | offline |
| OFF-016 | Payment offline | | Offline | Record a payment | Queued; invoice status updates after sync | offline |
| OFF-017 | Reading offline | | Offline | Open lists, Home, Receivables, Reports, Search | All render from the local copy | offline |
| OFF-018 | Actions that need a connection | | Offline | PDF, Send, Copy link, IRN, e-way bill, logo, exports, Lixi, OCR | Each fails with a connection message; nothing queued | offline |
| OFF-019 | Receipt offline | | Offline | Expense with a receipt | "Receipt will upload when you are back online. Expense saved." | offline |

### Sync screen

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| OFF-020 | Queue view | | Changes queued | **More › Settings › Sync** | "N waiting to sync"; each row "Queued <when> · N attempts" with Pending, Failed or Offline status | happy |
| OFF-021 | Sync now | | Online with a queue | **Sync now** | Queue drains; "Last synced just now" | happy |
| OFF-022 | Automatic retry | | Server down | Queue a change | Retries itself (about 5 s, 10 s, 20 s… up to 1 min); attempts count goes up | edge |
| OFF-023 | Retry all | | Several failed | **Retry all** | All retried | happy |
| OFF-024 | Reload from the server | | | **Reload everything from the server** | Local copy rebuilt; queued changes kept | edge |
| OFF-025 | Nothing queued | | Synced | Open | "Nothing queued" / "Every change has reached the server." | happy |
| OFF-026 | Sync triggers | | | Edit; reconnect; foreground the app; wait 1 min | Sync runs on each trigger | edge |

### Conflicts & refusals

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| OFF-030 | Server refusal | | Item with 5 on hand; negative stock off. Device A offline finalises an invoice for 5; device B online finalises one for 5 | Reconnect A | A's invoice is refused (`INSUFFICIENT_STOCK`):  "The server refused this change" with the reason; **Send my change again** / **Discard my change** | edge |
| OFF-031 | Conflict | Owner + Accountant | A: phone offline; B: web online | A edits customer Sunrise Retail's phone; B edits the same customer and saves; A reconnects | A sees "Changed on another device": "Someone saved this after you started editing. You now see their version…" | edge |
| OFF-032 | Keep mine | | OFF-031 | **Send my change again** | "Sending again"; A's version replaces B's | edge |
| OFF-033 | Discard mine | | OFF-031 | **Discard my change** | "Change discarded"; B's version stays | edge |
| OFF-034 | Nothing overwritten silently | | | — | "Conflicts are surfaced for you to resolve rather than being overwritten silently."; no side-by-side merge view yet | edge |

### Business created offline & sign-out

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| OFF-040 | Onboarding offline | New owner | ONB-021 | Reconnect | The company is sent first and alone; local defaults (taxes, series, accounts) mapped to the server's copies; later changes follow | offline |
| OFF-041 | Joined on another device | | User invited to a second business on the web | Open the phone app | That business downloads in full | edge |
| OFF-042 | Sign out with unsynced changes | | Queue not empty | **Sign out** | Warning that unsynced changes stay on this device | offline |
| OFF-043 | Old session's answers dropped | | | Sign out during a sync → sign in as another user | No data from the previous session appears | edge |

### Web: multiple tabs

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| OFF-050 | One tab syncs at a time | | 2 tabs open | Edit in both | Only one tab holds the `ebs.sync` lock per run; no double send | edge |
| OFF-051 | Tabs follow each other | | 2 tabs | Save a customer in tab 1 | Tab 2 shows the change without a reload | edge |
| OFF-052 | No echo save | | 2 tabs | Edit in tab 1 → tab 2 re-reads it | Tab 2 doesn't send tab 1's change back as its own (regression for commit `fc5ba4d`) | edge |
