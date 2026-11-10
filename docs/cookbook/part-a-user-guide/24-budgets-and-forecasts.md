# 24 — Budgets & cash-flow forecast

Plan the year's income and expenses and compare the books with the plan; and see where cash is heading over the coming weeks.

- **Plan:** full plans (Pro and Business).
- **Roles:**
  - Budgets: reading every role; creating, editing and deleting **owner, admin or accountant**.
  - Cash-flow forecast: **owner, admin or accountant**. Sales and Viewer get an error.
- **Branches:** budget against actual reads the books, which cover every branch. A user limited to some branches is refused ("The books cover every branch; ask an owner or admin").
- **Online only.**

Where to find it: 📱 **More › Money › Budgets** or **Cash-flow forecast**. 🖥 **Money** in the sidebar, under **Accounts**.

---

## Make a budget

**Goal:** set what each income and expense account should come to over a financial year.

**Who / plan:** owner, admin or accountant. Full plans.

**Steps**
1. **Budgets › New budget**.
2. **Name**: "Budget 2026-27" by default. Pick the year: this financial year or the next.
3. Tap **Add an account** and pick an income or expense account (sales, an expense category, your own indirect expenses…). Repeat for each account.
4. For each account enter the figure **For the year**. It is spread evenly over the twelve months ("Spread evenly over the months; open the months to set any on its own").
5. To plan a month on its own (a festive month, an annual fee), tap **Set month by month** and change that month. **Hide months** folds them away. **Remove** takes an account out.
6. Tap **Save budget**. You see **Budget saved** and the budget opens.

**Rules & gotchas**
- **Each account is planned once**, and only income and expense accounts can be planned.
- **No two budgets can have the same name.**
- **A budget posts nothing.** Deleting it ("Only the plan goes; the books stay as they are") changes nothing in the books.
- **The year can't be changed after the budget is made.** Make a new budget for another year.
- **Budgets for one branch or one cost centre are Not available yet** in the app (the server supports them).

## Budget against actual

**Goal:** see how the books are doing against the plan.

**Steps**
1. **Budgets** lists each budget with its year and number of accounts. Tap one.
2. Pick the period (this financial year by default). A period ending after today is counted to today.

**What happens**
- Three tiles: **Income**, **Expenses** and **Profit**, each as actual / planned. Green when you earned more, or spent less, than planned.
- **Income** and **Expenses** tables: **Account**, **Planned**, **Actual**, **Difference** (actual less planned) and **Of plan** (actual as a % of planned), with a total.
- **Edit budget** opens the form; **Delete budget** is at its foot.
- The table can be exported.

**Rules & gotchas** (RULES 6.16)
- **Actual** is what the books show on the account over the period: income as credits less debits, expenses as debits less credits. It is the same figure the profit and loss uses.
- **Planned** is the months of the period. A month the period covers only in part is planned in proportion to its days.

## Cash-flow forecast

**Goal:** see whether cash will run short in the coming weeks.

**Who / plan:** owner, admin or accountant. Full plans.

**Steps**
1. **Money › Cash-flow forecast**.
2. Pick **4 weeks**, **13 weeks** (the default) or **26 weeks**.

**What happens**
- **Cash on [date]**: what cash and bank should hold at the end, red if below zero.
- **Cash and bank today**, **Lowest, week to [date]**, and **Runs short in the week from [date]** if it ever goes below zero.
- One row per week: "In ₹… · out ₹…" and the balance at the week's end. Open a week to see what makes it up: **To receive**, **To pay**, **Recurring invoice**, **Recurring expense**, with overdue items marked **overdue**.

**Rules & gotchas**
- It is worked out from: cash and bank today, plus what customers owe by due date, less bills by due date, plus recurring invoices and expenses still to come. Overdue amounts count in the first week.
- An invoice or bill with no due date counts on its own date. Foreign-currency amounts are counted in rupees at the document's rate.
- It is a forecast: payments you haven't recorded, salaries and other one-off spending aren't in it unless they are recurring expenses ([10](10-expenses-and-ocr.md)).

---

**Related:** [04 Home dashboard](04-home-dashboard.md) · [07 Payments & aging](07-payments.md) · [12 Reports](12-reports.md) · [19 Books](19-books.md)
