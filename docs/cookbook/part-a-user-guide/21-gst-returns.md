# 21 — GST returns: GSTR-2B, GSTR-3B and filing

The app connects to the GST portal through your own taxpayer session. It downloads GSTR-2B and matches it to your bills. It builds GSTR-3B from the books, and can save and file GSTR-1 and GSTR-3B.

- **Plan:** full plans.
- **Roles:** owner, admin or accountant for connecting, matching and filing.
- **Connection:** every step needs the internet.

> **Before go-live:** filing through the app is switched off (`GST_FILING_ENABLED`) until a chartered accountant has signed off the rules ([`docs/accounting/RULES.md`](../../accounting/RULES.md)) and the GSP's returns routes have been tested on its sandbox. Until then you can save the returns from the app, then file them on the GST portal, where the saved data is waiting. In demo and development the portal is a simulator: its OTP and EVC code are `575757`.

---

## Connect to the GST portal

1. On the GST portal, open **Profile → Manage API Access**, switch it on and choose how long it lasts (up to 30 days).
2. In the app, open **More › Data & compliance › GST portal connection**.
3. Enter your **GST portal username** and tap **Send OTP**. The OTP goes to the phone registered with GST.
4. Enter the **OTP** and tap **Connect**.

The session renews on its own until the date shown. Each GSTIN (each branch with its own registration) connects separately.

## GSTR-2B: matching your bills

**More › Data & compliance › GSTR-2B and purchase match**:
1. Pick the GSTIN and the period, then tap **Download GSTR-2B**. GSTN makes it on the 14th of the next month. Before then you see that it isn't ready. A daily job downloads it on its own from the 14th and tells you.
2. Each line your suppliers reported is matched to your purchase bills:

   | Status | Meaning |
   |---|---|
   | **Matched** | Same supplier GSTIN, number (ignoring case, leading zeros and separators) and date, with tax within ₹1 |
   | **Differs** | Same supplier and number; the amount or date differs |
   | **Likely match** | Same supplier and amount, within 3 days; a suggestion only |
   | **Not in your books** | No bill for it: **Add the bill** opens a new bill filled from the line |
   | **Not ours** / **Later** | What you decided |

3. For each line that differs or is a likely match, choose **Accept**, **Claim later** or **Not ours**. **Undo** reverses a decision. Downloading the period again keeps every decision.
4. **Bills your suppliers haven't reported** lists your bills that aren't in 2B. Their credit can't be claimed until the supplier files them. **Ask the suppliers** shares the list.
5. Tap **Claim matched credit**. Each matched bill's credit is then claimed in this period's GSTR-3B.

## GSTR-3B

**More › Data & compliance › GSTR-1 and 3B filing**, then pick the GSTIN and period. The screen shows:
- **Due date:** the 20th of the next month, or the 22nd or 24th under QRMP depending on your state.
- **Paid from credit** and **Cash to pay**.
- **Late fee and interest**, if you filed today: ₹50 a day (₹20 for a nil return), and 18% a year on tax paid in cash late.

It also shows the 3B tables, all from the books:

| Table | From |
|---|---|
| **3.1** Outward supplies | The period's invoices and notes: taxable, zero-rated, nil and exempt, non-GST. Reverse charge on your bills. Advances for services received less those invoiced (table 11). |
| **3.2** | Inter-state supplies to unregistered buyers, by state |
| **4** Input tax credit | Bills claimed from this period's 2B, reverse charge, expenses with credit; reversals for blocked credit and 180 days unpaid; reclaims |
| **5** | Exempt and nil purchases |
| **6.1** Paying the tax | The set-off below |

**Set-off** follows the order the law sets (s.49, rule 88A):
- IGST credit is used first, on IGST and then on CGST and SGST in the order that leaves the least to pay in cash.
- CGST credit pays CGST, then IGST. SGST credit pays SGST, then IGST.
- CGST and SGST credit never pay each other. Cess credit pays only cess.
- Reverse-charge tax is always paid in cash.
- Credit left over carries into next month's return.

## Saving and filing

Each return has its own card. GSTR-1 must be filed before the period's GSTR-3B.

**GSTR-1:** **Save to the portal** › **Freeze for filing** › **Send the EVC** › enter the **EVC code** › **File the return**.

**GSTR-3B:** **Save to the portal** › **Set off the tax** › **Send the EVC** › enter the **EVC code** › **File the return**.

- **Saving again:** a return can be saved again any time before filing; each save replaces the last.
- **The EVC code** goes to the authorised signatory's phone, who may not be you.
- **Never filed twice:** before filing, the app asks the portal whether the return is already filed. A filed return can't be saved or filed again (`RETURN_FILED`). Corrections go in a later period.
- **If the portal doesn't answer** a filing, the app checks the portal's own record straight away. If it still can't tell, it says **don't file it on the portal yet**, and checks again every 15 minutes until it knows.
- **When filed,** the card shows the **ARN** and date.
- **After GSTR-3B is filed:**
  - the books close through the end of the month ([19](19-books.md#close-the-books));
  - the credit used is posted as a GST journal, output tax against input tax;
  - tax paid in cash stays on the output accounts until you record the challan payment.

Companies, which must file with a DSC, can save from the app and file on the portal.

## GSTR-1 table 11

On **GST › GSTR-1**, the **11A/B** view lists:
- **11A:** advances for services received in the period and not yet invoiced in it, by place of supply and rate;
- **11B:** earlier advances invoiced in it.

Both are in the GSTN JSON export as `at` and `txpd`.

---

**Related:** [11 GST compliance](11-gst-compliance.md) · [19 Books](19-books.md) · [20 TDS, reverse charge, credit and adjustments](20-tds-rcm-itc.md)
