# 17 — Lixi assistant

Tests for Lixi: opening it, asking, prepared actions and confirmation, plan and role limits, and the monthly AI allowance. Setup and demo data are in [00 — Test setup](00-test-setup.md). User guide: [Part A › 16 Lixi](../part-a-user-guide/16-lixi-assistant.md).

**Server setup.** Lixi answers come from the model set by `ASSISTANT_PROVIDER` (`anthropic`, `openai` for any OpenAI-compatible service with `OPENAI_BASE_URL` and `LIXI_MODEL`, or `simulator` in development). Note which one you test against; answer wording differs between models, so check the figures and the behaviour, not exact sentences. Scenarios marked [sim] can run on the simulator.

### Opening Lixi

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| LIXI-001 | Menu | Any / any | Vertex | **More › Tools › Ask Lixi** | Lixi opens: "What can I dig up?", greeting with a heads-up or "Your books look tidy today.", suggestion chips | happy [sim] |
| LIXI-002 | Desktop panel | Any | Browser ≥ 768 px | Top bar **Ask Lixi** | Panel opens on the right beside the page; header with Lixi, "Answers from your books", close button | happy [sim] |
| LIXI-003 | Hold a tab | Any | Phone, **Hold a tab** on | Hold the Stock tab | Lixi opens and asks "What is low on stock?" straight away | happy |
| LIXI-004 | Swipe up, pull down, floating orb | Any | Phone | Use each gesture with its switch on, then off (**More › Account › AI usage › Ways to open Lixi**) | Opens when on; does nothing when off. With all off, the note points to More › Ask Lixi | happy |
| LIXI-005 | Old assistant link | Any | | Open `/(app)/assistant` | Redirects to Lixi | edge |
| LIXI-006 | Gesture settings hidden on desktop | Any | Browser ≥ 768 px | **AI usage** | No **Ways to open Lixi** card | edge |
| LIXI-007 | Suggestions follow the plan | Owner / Basic | Aurora | Open Lixi | No "What is low on stock?" or "What did I spend last month?" chips; greeting has no low-stock flag | plan [sim] |

### Asking

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| LIXI-010 | Sales this month | Owner / Pro | Vertex | Ask "How are sales this month?" | "Reading your books…", then an answer whose figures match the Sales summary report for this month; up to 4 figures and up to 3 buttons | happy |
| LIXI-011 | Receivables | Owner / Pro | | "Who owes me money?" | Outstanding and overdue match **Receivables** | happy |
| LIXI-012 | One customer | Owner / Pro | | "How much does Kumar Electronics owe?" | Matches Kumar's statement; a button opens the contact or an invoice | happy |
| LIXI-013 | Document number | Owner / Pro | | "INV/2026-27/0012" | Its status and total; button opens the invoice | happy |
| LIXI-014 | GST health | Accountant / Pro | Seeded rejection or expiring EWB | "Anything wrong with GST?" | Mentions the rejection or expiring e-way bill; matches the compliance register | happy |
| LIXI-015 | Tamil | Any | App language Tamil | Ask in Tamil | Reply in Tamil | happy |
| LIXI-016 | Buttons only for allowed screens | Owner / Basic | Aurora | Ask about payables | No button to a full-plan screen; a short "not in your plan" reply, possibly with a button to **Plan & billing** | plan |
| LIXI-017 | New chat | Any | A conversation on screen | Tap **Start a new chat** while an answer is loading, then after | Disabled while loading; afterwards clears the chat. An answer arriving after the clear isn't shown | edge [sim] |
| LIXI-018 | No business open | Any | Signed in, no company yet (mid-onboarding) | Ask | "Open or set up a business first, and I'll answer from its books." | edge [sim] |
| LIXI-019 | Server unreachable | Any | Network off, or API stopped | Ask | "I can't reach the server right now, so I can't read your books. Check your connection and try again." + **Try again**; the AI usage count doesn't go up | edge [sim] |
| LIXI-020 | Asking too fast | Any | `LIXI_RATE_LIMIT_PER_MINUTE` low (e.g. 2) | Ask 3 questions within a minute | Third: "Lixi needs a moment; try again shortly", no **Try again** | edge [sim] |
| LIXI-021 | Branch limits apply | Sales / Pro | Rahul limited to Pune | Ask about Mumbai sales | Answers only from what Rahul may see | permission |
| LIXI-022 | No model in production | — | `NODE_ENV=production`, `ASSISTANT_PROVIDER=simulator` | Ask | API 502 `LIXI_UNAVAILABLE`; app shows the "can't reach the server" message | edge |
| LIXI-023 | Fallback model | Owner | `LIXI_SECONDARY_MODEL` set, primary key wrong | Ask | Answer comes from the secondary model; the server log warns that the primary failed | edge |

### Prepared actions

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| LIXI-030 | Draft an invoice | Sales / Pro | Vertex | "Draft an invoice for Sunrise Retail for 10 LED panels" → **Review and confirm** → **Confirm** | Dialog shows the summary and "Nothing is saved until you confirm."; after confirm "Done: …" with a button that opens the **draft**; the invoice is not finalised | happy |
| LIXI-031 | Cancel | Sales / Pro | LIXI-030 dialog open | Close the dialog, then reopen from the message | Nothing saved; **Review and confirm** still offered on the message | happy |
| LIXI-032 | Record a payment | Accountant / Pro | Open invoice for Sunrise | "Record ₹5,000 received from Sunrise Retail by UPI" → confirm | Payment saved as Meera; appears in Payments and in the audit trail under her name | happy |
| LIXI-033 | Add a customer | Sales | | "Add a customer Lotus Traders, GSTIN 27…" → confirm | Customer created | happy |
| LIXI-034 | Record an expense | Accountant / Pro | | "Record a ₹1,200 courier expense today" → confirm | Expense created | happy |
| LIXI-035 | Send a reminder | Sales / Pro | Overdue invoice, email provider simulated | "Send Kumar a payment reminder" → confirm | Reminder sent, or the provider's reason if messaging isn't set up | happy |
| LIXI-036 | Expiry | Any | Prepared action | Wait 5 minutes → **Confirm** | "That expired. Ask me again and I'll prepare it afresh." | edge |
| LIXI-037 | Role refuses on confirm | Viewer | Priya | Ask Lixi to draft an invoice → confirm | "That didn't go through: This needs one of: owner, admin, accountant, sales" | permission |
| LIXI-038 | Plan refuses | Owner / Basic | Aurora | Ask for a purchase bill draft | Not prepared, or refused on confirm with the plan reason; nothing saved | plan |
| LIXI-039 | One action at a time | Any | | Ask for two drafts in one message | Only one prepared | edge |
| LIXI-040 | Token is personal | Sales | Prepared action token | Replay `lixiConfirmAction` with the token as Meera, or from another session | 403 `LIXI_ACTION_FORBIDDEN` "This action was prepared for someone else" | permission |
| LIXI-041 | Confirm twice | Sales | LIXI-030 | Send the same confirm twice (double tap or replay) | One draft only | edge |
| LIXI-042 | Public demo | Demo | **Give it a try** | Ask a question; then prepare and confirm a draft | Question answered; confirm shows "This is a demo, so changes aren't saved. Create your free account to keep your own books." | permission |
| LIXI-043 | Archived business | Owner | Business archived ([28](../part-a-user-guide/28-company-archive-and-data.md)) | Ask a question | Refused with the archived message (`COMPANY_ARCHIVED`); the books stay read-only | edge |

### AI usage and allowance

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| LIXI-050 | Usage screen | Owner / Pro | Some Lixi questions this month | **More › Account › AI usage** | "〈n〉 of 1500 used this month", bar, "Lixi: 〈n〉 · Bill scans: 〈n〉", "Your plan includes 1500 a month." | happy [sim] |
| LIXI-051 | Allowance per plan | Owner | Set the plan by override | Check **AI usage** on each plan | Free 30, Basic 300, Pro 1,500, Business 5,000 | plan [sim] |
| LIXI-052 | Lower budget | Owner / Pro | | **Set a lower monthly budget** → 5 → **Save** | "AI budget saved"; usage shows "of 5" | happy [sim] |
| LIXI-053 | Budget above the plan | Owner / Free | | Budget 100 on Free | Saved, but the limit stays 30 (never above the plan's) | edge [sim] |
| LIXI-054 | Only the owner | Admin | | Open **AI usage** | Switch disabled; "Only the owner can change the budget."; no Save button | permission |
| LIXI-055 | Allowance used up | Owner | Budget 2, two questions asked | Ask a third | "This business has used its 2 AI actions for 〈YYYY-MM〉. It resets on the 1st, or the owner can raise the budget (up to the plan's)." with no **Try again**; **AI usage** shows "The allowance is used up. Lixi and bill scanning pause until the 1st." in red | edge [sim] |
| LIXI-056 | Bill scans count | Accountant / Pro | Browser (server OCR) | Scan a bill | Bill scans goes up by one; a bill the phone reads itself does not | happy |
| LIXI-057 | Failed answer isn't counted | Any | Model returns an error | Ask | Count unchanged | edge |
| LIXI-058 | Month rolls over | Owner | Usage at the limit | Move to the 1st (India time) | Count back to 0; Lixi answers again | edge |
| LIXI-059 | Bar colours | Owner | | Usage at 50%, 80%, 100% | Blue, amber, red | edge [sim] |
| LIXI-060 | Cost recorded for operators | Operator | LIXI-010 run | Admin console › company › **AI cost** | This month's row has the actions and tokens; cost is OpenRouter's own, or estimated from list prices on Anthropic and OpenAI direct; $0.00 only for a model with no known price | happy |
| LIXI-061 | Admin changes the budget via API | Admin | | `saveCompany` with `aiMonthlyLimit` | Refused 403 `OWNER_ONLY` "Only an owner can set the monthly AI budget"; the rest of the profile still saves | permission |
