# 16 — Lixi assistant

Lixi answers questions from your books in plain language: sales, who owes you, what you owe, stock, spending, GST and e-way bills. It can also prepare a draft, a payment, a contact, an expense or a message for you, but **it never changes your books without asking**. Every change waits for you to confirm it.

- **Plan:** every plan, within the plan's monthly AI allowance ([AI usage](#ai-usage-and-the-monthly-allowance)).
- **Roles:** every role can ask questions. An action Lixi prepares runs with your own permissions; if your role can't do it, it fails when you confirm.
- **Connection:** Lixi runs on the server and needs the internet. If the server can't be reached, you see *"I can't reach the server right now, so I can't read your books. Check your connection and try again."* with **Try again**.
- **How it answers:** the server passes your question to an AI model. The model reads your books through the same checks the app uses (your role, your plan, your branches) and replies in two or three short sentences, in English or Tamil to match the app. Figures come only from your books; if it can't find something, it says so.

---

### Open Lixi

**Goal:** start a conversation with Lixi.
**Who / plan:** any role · any plan.

| Where | How |
|---|---|
| 📱 Any tab | **Hold a tab**: Lixi opens already answering about that tab. On Stock, for example, it asks "What is low on stock?" |
| 📱 Tab bar | **Swipe up on the tab bar** and let go once the orb locks in |
| 📱 Sales plans | Tap the **orb in the middle of the tab bar** |
| 📱 Home | **Pull down on Home**, the way you'd refresh |
| 📱 Anywhere | The **Floating orb** (off by default): drag it anywhere, tap it to open |
| 📱🖥 Menu | **More › Tools › Ask Lixi** |
| 🖥 Top bar | **Ask Lixi** opens a panel on the right, next to the page you're on |

📱 Turn the phone gestures on or off in **More › Account › AI usage**, under **Ways to open Lixi**. With every way off, Lixi is still under **More › Ask Lixi**. **Show tips again** brings back the gesture hints.

Old links to the **assistant** page open Lixi.

---

### Ask a question

**Goal:** get an answer from your books.
**Who / plan:** any role · any plan.

**Before you start**
- Open a business. With none open, Lixi says *"Open or set up a business first, and I'll answer from its books."*

**Steps**
1. Open Lixi. It asks **What can I dig up?** and flags anything that needs attention, for example *"Heads up: 3 overdue invoices, 2 items low on stock."* or *"Your books look tidy today."*
2. Tap a suggestion, or type in **Ask Lixi about sales, dues, GST…** and tap **Send**.
3. Lixi shows **Reading your books…**, then answers. Answers can carry up to four key figures and up to three buttons: open a screen, open a document, or ask a follow-up.

**Good questions to try** (the demo is Vertex Traders):

| Ask | Lixi looks at |
|---|---|
| *How are sales this month?* | Your invoices and receipts this month |
| *Who owes me money?* | Receivables: what is outstanding and overdue |
| *What do I owe suppliers?* | Payables (full plans) |
| *Anything wrong with GST?* | IRNs, rejections, e-way bills about to expire |
| *What is low on stock?* | Items at or below their reorder level (full plans) |
| *What did I spend last month?* | Expenses (full plans) |
| *Top customers* | Sales by customer |
| *How much does Kumar Electronics owe?* | That customer's statement |
| *INV/2026-27/0012* | That document and its status |

The suggestion chips leave out modules your plan doesn't include.

**What happens**
- The answer is the model's own wording, so the same question can be phrased differently each time. The figures are your books' figures.
- **Start a new chat** (the broom icon) clears the conversation. It is greyed out while an answer is on its way.
- 🖥 The panel's header has a close button; 📱 the chevron closes Lixi.

**Rules & gotchas**
- Lixi remembers the last 20 messages of the current chat. A new chat starts fresh.
- On a sales plan, asking about purchases, stock or expenses gets a short "that isn't in your plan" answer, often with a button to **Plan & billing**.
- If you ask too fast, you see *"Lixi needs a moment; try again shortly"*. Each person can send about 20 questions a minute.
- If the model is down, you see the "can't reach the server" message above. That question isn't counted against the allowance.
- In an archived business, Lixi can't answer: the business is read-only ([28](28-company-archive-and-data.md)).

---

### Let Lixi prepare something

**Goal:** have Lixi set up a change for you to check and confirm.
**Who / plan:** a role that may make that change · a plan that includes it.

Lixi can prepare:
- a **draft** invoice, quote, sales order, purchase order or purchase bill;
- a payment received or made;
- a new customer or supplier;
- an expense;
- sending a document, or a payment reminder.

**Steps**
1. Ask, for example *"Draft an invoice for Sunrise Retail for 10 LED panels"*.
2. Lixi looks up the customer and item, then says what it has ready. Its message shows **Review and confirm**.
3. Tap **Review and confirm**. A dialog shows exactly what it will do: *"Nothing is saved until you confirm."*
4. Tap **Confirm**, or close the dialog to cancel. You can reopen it from the message while it's still valid.

**What happens**
- Lixi says *"Done: 〈what it did〉."* For a document there's a button to open it (**Open draft**, or its number).
- The change is saved as you, exactly as if you had made it on the normal screen. It shows in the audit trail under your name.

**Rules & gotchas**
- Lixi never **finalises** a document. A draft stays a draft until you issue it yourself.
- Lixi prepares one action at a time.
- A prepared action is valid for **5 minutes**, and only for you, on this device, in this business. After that: *"That expired. Ask me again and I'll prepare it afresh."*
- If the action fails, Lixi says why: *"That didn't go through: …"*. For example, your role doesn't allow it, the plan doesn't include it, or a field is missing.
- In the public demo (**Give it a try**) you can ask questions, but confirming a change gets *"This is a demo, so changes aren't saved. Create your free account to keep your own books."*

---

### AI usage and the monthly allowance

**Goal:** see how much of the month's AI allowance is used, and optionally set a lower budget.
**Who / plan:** anyone can look; only the owner can change the budget · every plan.

Each business has a monthly allowance of **AI actions**. One Lixi question is one action. A bill read by the server's scanning service is also one action. Text your phone reads from a bill on the device is free and isn't counted.

| Plan | AI actions a month |
|---|---|
| Free | 30 |
| Smart Basic | 300 |
| Smart Pro | 1,500 |
| Smart Business | 5,000 |

**Steps**
1. Open **More › Account › AI usage**.
2. Read **〈used〉 of 〈limit〉 used this month**, the bar, and the split **Lixi: 〈n〉 · Bill scans: 〈n〉**. Below that: **Your plan includes 〈limit〉 a month.**
3. *Owner only:* turn on **Set a lower monthly budget**, enter **AI actions a month**, and tap **Save**. You see **AI budget saved**.

**What happens**
- The count starts again on the 1st of each month (India time).
- When the allowance is used up, the screen shows *"The allowance is used up. Lixi and bill scanning pause until the 1st."* Lixi then answers *"This business has used its 〈limit〉 AI actions for 〈month〉. It resets on the 1st, or the owner can raise the budget (up to the plan's)."*, with no **Try again**.

**Rules & gotchas**
- A budget can only be lower than the plan's allowance, never higher: *"Keep AI use below the plan's allowance. It can't go above it."*
- Other roles see *"Only the owner can change the budget."*
- The bar turns amber at 80% and red at 100%.

---

> **Behind the scenes (operators):** Lixi works with Anthropic's Claude or with any OpenAI-compatible service (OpenAI, OpenRouter, Groq, a self-hosted model and so on), set on the server, with an optional second model if the first fails. Tokens per business per month are recorded and shown in the admin console ([17](17-admin-console.md#see-a-companys-ai-cost)). Without a model configured, a production server refuses Lixi questions and the app shows the "can't reach the server" message.

---

**Related:** [03 Navigation](03-navigation.md) · [04 Home dashboard](04-home-dashboard.md) · [10 Expenses & bill scanning](10-expenses-and-ocr.md) · [14 Plans](14-team-roles-plans.md#plans) · [17 Admin console](17-admin-console.md) · Test scenarios: [Part B › 17 Lixi](../part-b-test-scenarios/17-lixi.md)
