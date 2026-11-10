# 23 — Fixed assets

The fixed asset register: machinery, computers, vehicles and furniture the business owns and uses for more than a year. The asset's cost is already in the books from the bill or voucher it was bought on. The register adds when it was put to use and how it wears out, and the app writes it off month by month (RULES 6.15).

- **Plan:** full plans (Pro and Business).
- **Roles:** reading the register and the schedule: every role. Adding, editing, disposing of and removing assets: **owner, admin or accountant**.
- **Online only.**

Where to find it: 📱 **More › Money › Fixed assets**. 🖥 **Money › Fixed assets** in the sidebar (under **Accounts**).

---

## How it posts

| When | Debit | Credit |
|---|---|---|
| The bill or voucher you bought it on | *Plant and machinery* (or your own account under Fixed assets) | The supplier, or cash or bank |
| Each month end while it is in use, and on the day it is disposed of | *Depreciation* (indirect expense) | *Accumulated depreciation* (under Fixed assets, set against cost) |
| Bought before the books began here: the depreciation already written off | *Opening balances* | *Accumulated depreciation* |
| Disposed of | *Accumulated depreciation* and *Profit or loss on assets sold* for what it still stood at | Its fixed-asset account, for its cost |

The register itself posts no cost: the bill already did. Depreciation shows in the day book as **Fixed asset**.

**Methods**
- **Straight line:** cost less residual value, evenly over its useful life, by the day, from the day it was put to use (Companies Act, Schedule II).
- **Written down value:** the rate on what is left at the start of each financial year (on cost in the first year), by the days it was in use.
- Neither goes below the **Residual value**.
- Tax depreciation under the Income-tax Act (block of assets, half rate under 180 days) is **Not available yet**.

## Add an asset from a purchase bill

**Goal:** put capital goods you bought on a bill into the register.

**Before you start:** a finalised purchase bill with lines marked **Capital goods** ([06](06-purchases.md), [20](20-tds-rcm-itc.md)).

**Steps**
1. Open the bill. Under the totals you see "Capital goods worth ₹… on this bill are in your fixed assets. Add them to the register so they depreciate."
2. Tap **Add to fixed asset register**.
3. The form opens filled in: the line names as **Asset**, their taxable value (in base currency) as **Cost**, the bill's date as **Acquired on** and **Put to use on**, and "Bought on bill [number]" in **Notes**.
4. Check the dates and the depreciation method (below), then tap **Add asset**.

**What happens:** you see **Asset added to the register** and its page opens. The asset is linked to the bill, and the prompt no longer shows on it.

## Add an asset by hand

**Goal:** register an asset whose cost was posted by a voucher, or bought before the books began here.

**Steps**
1. **Fixed assets › Add asset**.
2. Fill in:
   - **Asset** (for example *CNC lathe*), **Kind of asset** (**Plant and machinery**, **Computers**, **Furniture and fittings**, **Vehicles**, **Office equipment**, **Buildings**; optional) and **Asset code** (for example *PM-001*; optional).
   - **Cost is in**: the fixed-asset account its bill or voucher put the cost in. *Plant and machinery* by default, or one of your own under **Fixed assets** ([19](19-books.md#chart-of-accounts)).
   - **Acquired on** and **Put to use on**. Depreciation runs from the day it was put to use.
   - **Cost** (before GST you claim back) and **Residual value** (what it should fetch at the end; never written off).
   - **Depreciation**: **Straight line** with **Useful life (years)** (5 by default), or **Written down value** with **Rate (% a year)** (15 by default).
   - **Bought before the books began here**: turn on and give **Written off already** and **As of**, the day that figure stood at.
   - **Notes**.
3. Tap **Add asset**.

**Rules & gotchas**
- "Give the asset a name", "Enter what it cost", "It is put to use on or after the day it was acquired", "Enter its useful life", "Enter a rate from 0 to 100".
- The residual value must be less than the cost. What was written off already can't be more than cost less residual value, and its **As of** day is on or after the day it was acquired.
- No two assets can have the same asset code.
- **The cost isn't posted by the register.** If you add an asset whose cost was never posted, post it first with a bill or a journal to the fixed-asset account.

## Read the register

**Fixed assets** shows **In use**, **Disposed of** or **All**, with totals for **Cost**, **Written off** and **Book value**. Each row shows the code, kind, method ("Straight line, 5 years" or "Written down, 15% a year") and "In use from [date]" or "Disposed of [date]".

Tap an asset for its page: status badge, "Acquired [date] · in use from [date]", **Cost**, **Written off**, **Book value**, and **Depreciation by year** (at the start, depreciation, at the end). **Edit** opens the form.

## Dispose of an asset

**Goal:** record an asset sold, scrapped or lost.

**Steps**
1. Open the asset, tap **Edit**.
2. Turn on **Disposed of**. Give **Disposed of on** (not a future day) and **What happened** (for example *Sold for ₹40,000*).
3. Tap **Save**. You see **Asset saved**.

**What happens:** depreciation runs to that day and stops. Its cost and what was written off come out of the books, and what it still stood at goes to *Profit or loss on assets sold*.

**Rules & gotchas**
- **Record what it fetched** as a receipt ([07](07-payments.md)) or an invoice line to *Profit or loss on assets sold*, so that account shows the gain or loss.
- The disposal date is on or after the day it was put to use, and after the day of its opening figure.

## Remove an asset from the register

Open the asset, **Edit**, then **Remove from register** and confirm. Its depreciation comes out of the books; its cost stays where its bill or voucher put it. You see **Asset removed from the register**. Use this for an asset entered by mistake; use **Disposed of** for one that has gone.

## Closed periods

An edit or removal that would change what the asset posts on or before the books' close is refused (`PERIOD_LOCKED`: "The books are closed through …; this changes the asset's depreciation from …"). Changes that only affect later months are fine.

## Fixed asset schedule

**Fixed assets › Fixed asset schedule** shows, for the period you pick, as the notes to the accounts do:
- **Cost:** **Cost at start**, **Bought**, **Disposed of**, **Cost at end**;
- **Depreciation:** **Written off at start**, **For the period**, **On disposals**, **Written off at end**;
- **Book value at end**.

Each asset is a row, with a **Total**. It can be exported.

---

**Related:** [06 Purchases](06-purchases.md) · [19 Books](19-books.md) · [20 TDS, reverse charge, credit](20-tds-rcm-itc.md) · [26 Imports & opening balances](26-imports-and-opening-balances.md)
