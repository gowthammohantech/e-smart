# 21 — GST returns: GSTR-2B, GSTR-3B, set-off and filing

The app connects to the GST portal through your own taxpayer session. It reads GSTR-2B, downloaded through that session or uploaded as the portal's file, and matches it to your bills. It builds GSTR-3B from the books, records the set-off and the GST challans that pay it, and can save GSTR-1 and GSTR-3B to the portal.

- **Plan:**
  - **GST returns** (GSTR-3B and the save and file steps) and **GST portal connection**: every plan.
  - **GSTR-2B** and **2B reconciliation**: full plans (they need Purchases).
  - **Utilization entry**, **GST challan** and **GST journal**: full plans (they need Books).
- **Roles:** owner, admin or accountant for everything in this chapter. Sales and viewer users are refused by the server.
- **Where:** 📱 **More › GST** on full plans, or the **GST** tab's **GST returns** tile on sales plans. 🖥 **GST › Returns** in the sidebar.

> **Filing is switched off.** Filing through the app stays off until a chartered accountant has signed off the rules and the GSP's returns routes have been tested on its sandbox. The switch is the server setting `GST_FILING_ENABLED`, off by default. While it is off:
> - GSTR-3B is worked out from the books, and you can still save both returns to the portal, freeze GSTR-1 and set off GSTR-3B there.
> - **Send the EVC**, the **EVC code** and **File the return** don't appear. The screen says: **Filing through the app is not switched on yet. Save the returns here, then file them on the GST portal, where the saved data is waiting.** The server refuses a filing with `FILING_DISABLED`.
> - On a server where the returns connection isn't set up at all, connecting and downloading say **Filing through the GSP is not set up on this server**. Upload the 2B file instead, and file on the portal.
>
> In demo and development the portal is a simulator: its OTP and EVC code are `575757`.

---

## Connect to the GST portal

**Goal:** open your own GST portal session, for 2B downloads, saving and filing.
**Who / plan:** owner, admin or accountant · every plan.

**Steps**
1. On the GST portal, open **Profile → Manage API Access**, switch it on and choose how long it lasts (up to 30 days).
2. In the app, open **More › GST & e-invoicing › GST portal connection**.
3. Each GSTIN of the business (each branch with its own registration) is listed with **Connected** or **Not connected**. Enter its **GST portal username** and tap **Send OTP**. The OTP goes to the phone registered with GST (**OTP sent to the registered phone**).
4. Enter the **OTP** and tap **Connect**. You see **Connected to the GST portal**.

**What happens:** the row shows **As 〈username〉, renews on its own until 〈date〉.** **Disconnect** stops 2B downloads and filing for that GSTIN until you connect again with a new OTP.

**Rules & gotchas**
- With no GSTIN in the business profile you see **Add your GSTIN in company settings first.**
- Asking for a second OTP within a minute is refused: "Wait a minute before asking for another OTP".
- When the session lapses, portal steps say "The GST portal session has ended; connect again with a new OTP".

---

## GSTR-2B: matching your bills

There are two pages:
- **GSTR-2B**: get the period's 2B and check its totals.
- **2B reconciliation**: settle each line, chase suppliers, and claim the credit.

### Get the period's 2B

**Who / plan:** owner, admin or accountant · full plans.

**Steps**
1. Open **GSTR-2B**. Pick the GSTIN and the **Return period**.
2. Either:
   - tap **Download GSTR-2B** (with a portal session). GSTN makes it on the 14th of the next month. Before then you see that it isn't made yet (`GSTR2B_NOT_GENERATED`). A daily job downloads it on its own from the 14th and tells you. You see **GSTR-2B downloaded and matched**.
   - or tap **Upload 2B file** and pick the JSON or Excel file from the portal (**Returns → GSTR-2B → Download**). You see **GSTR-2B file read and matched**. Without a session this is the only way: *"This GSTIN isn’t connected to the GST portal. Download GSTR-2B there … and upload the file here."*
3. Read the key figures: **Credit you can claim**, **Matched**, **To review** and **Bills not in 2B**.
4. **Totals by status** lists each status's lines, taxable value and tax, with **All lines in 2B** at the foot. Check that total against the portal's own GSTR-2B summary.
5. Tap **2B reconciliation** to go on, or **Export Excel** / **Export CSV**.

**Rules & gotchas**
- A file for another GSTIN or month is refused (`GSTR2B_WRONG_GSTIN`, `GSTR2B_WRONG_PERIOD`). A file that isn't a 2B is refused, and so is one over 6 MB.
- Downloading or uploading the period again keeps every decision you made.

### Reconcile and claim

**Steps**
1. Open **2B reconciliation** for the GSTIN and period. Each line your suppliers reported is matched to your purchase bills and supplier notes:

   | Status | Meaning |
   |---|---|
   | **Matched** | Same supplier GSTIN, number (ignoring case, separators, leading zeros and a year segment such as 24-25) and date, with taxable value and tax within ₹1 |
   | **Matched, dates differ** | The same, but dated apart by no more than the **GSTR-2B date tolerance** (business profile, 3 days by default) |
   | **Mismatch** | Same supplier and number; the amount differs, or the date is further off. It says **Differs in** taxable value, tax, date or number. |
   | **Likely match** | Same supplier and tax within 3 days, under another number. A suggestion only. |
   | **Not in your books** | No bill for it |
   | **Linked by you** | You accepted a suggestion or linked it to a bill |
   | **Claimed** | Its bill was already claimed for this period |
   | **Not ours** / **Later** | What you decided |

   🖥 Each row shows **In 2B** and **In your books** side by side, with the choices in the row's menu. A line marked **credit not available** by 2B is never claimed.
2. Act on the lines that need you:
   - **Accept** a mismatch or likely match.
   - **Link to a bill** picks one of the supplier's unclaimed bills (**Which bill is it?**).
   - **Add the bill** opens a new bill filled from a line that isn't in your books.
   - **Claim later** or **Not ours**. **Undo** reverses a decision.
3. **N bills your suppliers haven’t reported** lists your bills dated in or before the period that aren't in 2B. Their credit can't be claimed until the supplier files them. **Ask the suppliers** shares the list.
4. Tap **Claim matched credit** and confirm (**Claim the credit for 〈period〉?**). You see **Credit claimed for the period**. Matched, dated-apart, linked and claimed lines are claimed in this period's GSTR-3B; lines still to review aren't.

**Related figures:** Home's filing calendar shows **ITC from GSTR-2B** with **Claimable credit** and **₹… of credit waits on suppliers**.

---

## GSTR-3B

**Who / plan:** owner, admin or accountant · every plan.

**Steps**
1. Open **GST returns**. Pick the GSTIN (the business's and each registered branch's are listed, connected or not) and the **Return period**.
2. Read the key figures:
   - **Due date:** the 20th of the next month, or the 22nd or 24th under QRMP depending on your state.
   - **Paid from credit** and **Cash to pay**.
   - **GST cash ledger:** what your challans have paid in and set-offs haven't used.
   - If filed today: **Filed today, it carries ₹… of late fee and interest, paid in cash.**
3. Switch between **Summary** and **Detailed sheet**. The detailed sheet is laid out like the portal's form, every row of 3.1, 3.1.1, 3.2, 4A–4D, 5, 5.1 and 6.1, with IGST, CGST, SGST/UTGST and cess columns, and the **Credit utilisation** matrix.
4. Under a table, tap a row's button (for example **3.1(a) · 12**) to see **What makes up 3.1(a)**: the documents, expenses and advances behind it.
5. **Export PDF**, **Export Excel** or **Export CSV**.
6. **Utilization entry** and **Record a challan** open the set-off and challan screens below.

Without a portal session the screen says **Worked out from your books. Connect the GST portal to save and file it.** With no GSTIN at all you see **No GSTIN yet** and a link to the **Business profile**.

**The tables, all from the books**

| Table | From |
|---|---|
| **3.1** Outward supplies | The period's invoices and notes: taxable, zero-rated, nil and exempt, non-GST. Reverse charge on your bills and expenses (3.1(d)). Advances for services received less those invoiced (table 11). |
| **3.1.1** E-commerce supplies | Always nil: the books don't keep s.9(5) supplies apart |
| **3.2** | Inter-state supplies to unregistered buyers, by place of supply. Supplies to composition dealers and UIN holders are nil. |
| **4** Input tax credit | 4A(1) customs IGST on bills of entry; 4A(3) reverse charge; 4A(4) ISD invoices; 4A(5) bills claimed from this period's 2B and expenses with credit; 4B reversals for blocked credit and 180 days unpaid; 4C net; 4D(1) reclaims. 4D(2) is nil. |
| **5** | Exempt, nil and non-GST purchases, inter-state and intra-state |
| **5.1** | Interest and late fee |
| **6.1** Paying the tax | The set-off below, forward charge and reverse charge separately |

**Set-off** follows the order the law sets (s.49, rule 88A; RULES 7.3):
- IGST credit is used first, on IGST and then on CGST and SGST in the order that leaves the least to pay in cash.
- CGST credit pays CGST, then IGST. SGST credit pays SGST, then IGST.
- CGST and SGST credit never pay each other. Cess credit pays only cess.
- Reverse-charge tax is always paid in cash.
- Credit left over carries into next month's return.

**Late fee and interest** (RULES 7.6): ₹25 + ₹25 a day (₹10 + ₹10 for a nil return), capped by turnover: ₹1,000 + ₹1,000 up to ₹1.5 crore, ₹2,500 + ₹2,500 up to ₹5 crore, ₹5,000 + ₹5,000 above (₹250 + ₹250 for a nil return). Interest is 18% a year on tax paid in cash late.

---

## Pay the tax: GST challan

**Goal:** record money you deposited on the portal (PMT-06) into the GST cash ledger.
**Who / plan:** owner, admin or accountant · full plans.

**Steps**
1. Open **GST challan**, or **Record a challan** from GST returns or the Utilization entry.
2. Pick **Paid from** (the bank or cash account).
3. Enter the **CPIN** (14 letters and digits), and the **CIN** and **BRN** if you have them, and **Paid on**.
4. For each head (IGST, CGST, SGST, cess), enter what was paid under **Tax**, **Interest**, **Penalty**, **Fee** and **Others**. The screen shows **Challan total: ₹…**.
5. Tap **Record challan**. You see **Challan recorded**. It appears under **Recent challans**.

**What happens:** the money moves from the bank into *GST cash ledger IGST/CGST/SGST/cess*, an asset in the books. Money left there carries forward.

**Rules & gotchas**
- A CPIN that isn't 14 characters says **The CPIN has 14 letters and digits**. A challan with nothing under any head says **Enter what was paid under at least one head**.
- The date can't be in the future, and the bank must hold the money.
- A challan whose money a set-off has used can't be deleted (`CHALLAN_USED`): reverse the set-off first.

## Set off the tax: Utilization entry

**Goal:** record a period's set-off in the books: tax paid from credit, and the rest from the GST cash ledger (RULES 6.21).
**Who / plan:** owner, admin or accountant · full plans.

**Steps**
1. Open **Utilization entry**, or tap it on GST returns. Pick the GSTIN, the period and the **Set-off date** (on or after the period's last day, not in the future).
2. **This period** shows, per head, the tax **Payable**, the **Reverse charge**, the **Credit available** (this period's net credit plus what last period carried forward) and the cash ledger.
3. **Paid from credit** is filled in the order the law sets. Change it if you need to, within the rules. **Start again from the suggested set-off** puts it back.
4. **Paid from the cash ledger** holds **Tax paid in cash**, **Older reverse charge payable**, **Interest** and **Late fee**. Reverse charge is paid in cash in full.
5. If the cash ledger holds too little, you see **The GST cash ledger holds too little. Record a challan first.** with a **Record a challan** button.
6. Add a narration if you like, then tap **Post set-off**. You see **Set-off posted**.

**What happens:** one GST journal posts: Output against Input for the credit used, and Output (with interest and late fee as expenses) against the GST cash ledger for the cash part.

**Rules & gotchas**
- **Once a period:** a period already set off shows **Already set off** with its journal. To change it, tap **Reverse** (**Set-off reversed**) and post it again (`SET_OFF_EXISTS`).
- **Output doesn't match:** if the Output ledgers carry a different amount for the period than GSTR-3B says is owed, you see **Output tax in the books does not match the return**, with **Output in books**, **Owed in 3B** and **Difference**. Look for documents dated in another month, or journals posted to Output by hand, before you set off.
- **Older reverse charge:** reverse charge from before November 2026 still in *… payable on reverse charge* is shown, and can be paid from the cash ledger here.
- **Filing 3B** posts its own set-off only when none was posted here.

## GST journal

**GST journal** opens a new voucher of the GST journal kind: an adjustment to the GST ledgers, such as a credit reversed, interest, or a correction. It must touch a GST ledger. Saving it opens the voucher ([19](19-books.md#vouchers)).

---

## Saving and filing

**Who / plan:** owner, admin or accountant · every plan · a connected portal session.

Each return has its own card on **GST returns**, with its state: **Not saved**, **Saved on the portal**, **Ready to file**, **Filed** or **The portal found errors**.

**GSTR-1:** **Save to the portal** › **Freeze for filing** › **Send the EVC** › enter the **EVC code** › **File the return**.

**GSTR-3B:** **Save to the portal** › **Set off the tax** › **Send the EVC** › enter the **EVC code** › **File the return**.

The last three steps appear only while filing is switched on (see the note at the top).

- **Saving again:** a return can be saved again (**Save again**) any time before filing; each save replaces the last.
- **GSTR-1 first:** GSTR-3B can't be filed until the period's GSTR-1 is (**File the period’s GSTR-1 first.**).
- **The EVC code** goes to the authorised signatory's phone, who may not be you.
- **Asked first:** **File the return** asks **File 〈return〉 for 〈period〉?**: a filed return can't be changed or withdrawn.
- **Never filed twice:** before filing, the app asks the portal whether the return is already filed. A filed return can't be saved or filed again (`RETURN_FILED`). Corrections go in a later period, through the GSTR-1 amendment tables ([11](11-gst-compliance.md#gstr-1)).
- **If the portal doesn't answer** a filing, the app checks the portal's own record straight away. If it still can't tell, it says **don't file it on the portal yet**, and checks again every 15 minutes until it knows.
- **When filed,** the card shows **ARN 〈arn〉, filed 〈date〉**.
- **After GSTR-3B is filed:**
  - the books close through the end of the month ([19](19-books.md#close-the-books));
  - the credit used is posted as a GST journal, output tax against input tax, unless the period was already set off by hand;
  - tax paid in cash stays on the output accounts until a set-off takes it from the GST cash ledger.
- **An invoice in a filed or frozen GSTR-1 month** can't be edited ("Can't edit: its GSTR-1 month is filed").

Companies, which must file with a DSC, can save from the app and file on the portal. Filing with a DSC is **Not available yet**.

## The filing calendar

Home's **Filing calendar** lists what falls due in the next 60 days: **GSTR-1** (the 11th; under QRMP the 13th after the quarter), **IFF (optional)**, **GSTR-3B**, **PMT-06 tax payment** for QRMP filers, and **TDS deposit**, each **Due**, **Overdue** or **Filed**. It files nothing. 🖥 The sidebar's **Next filing** card shows the next one and opens GST returns.

## GSTR-1 table 11

On **GSTR-1**, the **11A/B** view lists:
- **11A:** advances for services received in the period and not yet invoiced in it, by place of supply and rate;
- **11B:** earlier advances invoiced in it, and refunds.

Both are in the GSTN JSON export as `at` and `txpd`.

---

**Related:** [11 GST compliance](11-gst-compliance.md) · [19 Books](19-books.md) · [20 TDS, reverse charge, credit and adjustments](20-tds-rcm-itc.md) · [04 Home dashboard](04-home-dashboard.md)
