# 07 — GST: e-invoice, e-way bill, GSTR-1

Tests for e-invoice (IRN) eligibility, validation, generation and cancellation; e-way bill generation, Part-B, extension and cancellation; the compliance register; GSTR-1 with its amendments; exports and the LUT; and the compliance settings. GSTR-2B, GSTR-3B, the set-off and filing are in [14](14-accounting-gst-returns.md). Setup and demo data are in [00 — Test setup](00-test-setup.md). The user guide is [11](../part-a-user-guide/11-gst-compliance.md).

Every portal call goes through the simulated GSP in development, so all generate, cancel and extend results here are **[sim]**. The live Adaequare and WhiteBooks adapters haven't been tested against the GSP sandboxes yet.

Default: owner, **Vertex Traders**. Turnover is ₹8.4 crore, above the ₹5 crore threshold, so e-invoicing applies and **6-digit HSN** is mandatory. E-way bill threshold: ₹50,000.

### E-invoice: eligibility

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| EIN-001 | B2B invoice qualifies | Owner | Issued invoice to Kumar Electronics | Open → Compliance | E-invoice status **Not reported**; **Generate IRN** offered | happy |
| EIN-002 | Draft not reportable | | Draft | Open | Not applicable ("The document has not been finalised yet") | edge |
| EIN-003 | Unregistered buyer | | Issued invoice to Galaxy Superstore (no GSTIN) | Open | **Not applicable** ("A sale to an unregistered buyer is outside e-invoicing") | edge |
| EIN-004 | Below the threshold | Owner / Basic | Aurora (₹1.4 crore) | Issued invoice to Lumen Brand Works | Not applicable: "Turnover is below the e-invoicing threshold" | edge |
| EIN-005 | Switched off | | Turn off **Report invoices to the portal** | **GST compliance** | "E-invoicing is switched off for this business. Turn it on under Settings to report invoices." | edge |
| EIN-006 | Composition dealer | | Company on composition | Issued B2B invoice | Not applicable ("Composition dealers are outside e-invoicing") | edge |
| EIN-007 | Only invoices and notes | | Delivery note, quote | Open | No e-invoice action ("Only invoices and credit notes are reported") | edge |
| EIN-008 | Sales return (CRN) qualifies | | Processed return to a registered buyer | Open | **Generate IRN** offered | happy |
| EIN-009 | Export | | Issued AED invoice to Harbour Supplies FZE | Generate sheet | Supply type Export (with or without tax, depending on the LUT) | happy |
| EIN-010 | Value-only notes qualify | | Issued credit note and debit note against an invoice to Kumar Electronics | Open each | **Generate IRN** offered; reported as CRN and DBN | happy |
| EIN-011 | SEZ buyer | | Customer type **SEZ unit or developer**, LUT on file | Generate sheet | Supply type **SEZ without payment of tax**; without an LUT, **SEZ with payment of tax** | edge |
| EIN-012 | Financial note without GST | | Direct credit note, **Financial note — no GST**, to a registered buyer | Open | Should be not reportable (no GST). **Known issue:** the app offers **Generate IRN** today | edge |

### E-invoice: validation (portal checks)

All findings are listed at once, with "Fix N problems before reporting."

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| EIN-020 | Every check passes | | EIN-001 | **Generate IRN** | "Every portal check passes."; payload preview and "The IRN this will produce" | happy |
| EIN-021 | 4-digit HSN at ₹5 crore+ | | Line HSN `8482` | Generate | 2311 "\"…\" needs a 6-digit HSN: it is mandatory for businesses with turnover of 5 crore or more" | validation |
| EIN-022 | Number longer than 16 characters | | Turn on **Include branch code** in Numbering → finalise (number like `INV/MUM/2026-27/0001`, 20 characters) | Generate | 2233 "The document number must be at most 16 characters…"; the Numbering screen already warned "Longer than 16 characters — the e-invoice portal will reject this number." | validation |
| EIN-023 | Buyer GSTIN against address | | Customer with a 29 GSTIN but a Maharashtra address | Generate | 2265 "The buyer GSTIN is registered in state 29, but their address is in 27" | validation |
| EIN-024 | Older than the reporting window | | Invoice dated 31+ days ago | Generate | 2235 "The document is older than the 30-day reporting window" | validation |
| EIN-025 | Dated in the future | | Future-dated invoice | Generate | 2234 "The document is dated in the future" | validation |
| EIN-026 | Missing buyer address parts | | Customer with no PIN | Generate | 5002 "The buyer PIN code must be six digits" | validation |
| EIN-027 | No buyer email or phone | | | Generate | Warning W002 (not blocking) | edge |
| EIN-028 | Unknown unit | | Line unit "BOX2" | Generate | Warning W001: reported as OTH | edge |
| EIN-029 | Duplicate IRN | | IRN already generated for this number | Generate again (API) | 2150 "An IRN already exists for this document number in this financial year" | validation |
| EIN-030 | Invoice with TCS | | Invoice to a customer under TCS 206C(1) scrap, issued | **Generate IRN** | **Known issue, Not available yet:** blocked by 2182 "The document total does not reconcile with its lines" (the check leaves TCS out of the total). Expected once fixed: passes, TCS sent as other charges | validation |
| EIN-031 | IGST within the state | | Line with IGST on a Maharashtra buyer (edit via API) | Generate | 2172 "IGST is charged on a supply within the state" | validation |
| EIN-032 | Reimbursement line | | Invoice with a **Reimbursement at cost** line | Generate sheet | Payload carries it as other charges (`OthChrg`), not an item; no HSN needed | edge |

### E-invoice: generate & cancel

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| EIN-040 | Generate | Accountant | EIN-020 | Confirm | "IRN generated"; IRN, **Ack No.**, **Ack date**; signed QR on the PDF | happy [sim] |
| EIN-041 | Copy IRN | | | **Copy IRN** | "IRN copied" | happy |
| EIN-042 | Automatic on finalise | | Turn on **Report on finalising** | Finalise a B2B invoice | IRN generated without asking | happy [sim] |
| EIN-043 | Connection lost | | Network off on the device | Generate | "Connect to the internet to reach the GST portal, then try again." | edge |
| EIN-044 | Cancel within 24 h | Accountant | IRN under 24 h old | **Cancel IRN** → reason **Data entry mistake** → **Cancel the IRN** | Warning "…the document number cannot be used again this financial year…"; "IRN cancelled"; status **IRN cancelled** | happy [sim] |
| EIN-045 | Reason "Other" needs a remark | | | Reason **Other**, empty remark | "Say what happened" | validation |
| EIN-046 | After 24 h | | IRN over 24 h old (re-seed or change the clock) | Cancel | Refused: "The 24-hour cancellation window has closed; issue a credit note instead" | validation |
| EIN-047 | Cancellable-until hint | | Fresh IRN | Open the compliance panel | "Cancellable until <date>, <time>" (generation + 24 h) | happy |
| EIN-048 | Sales role | Sales (Rahul) | | Generate an IRN | Refused by the server (owner, admin or accountant). The FRD matrix lets sales do this; see the report | permission |
| EIN-049 | Viewer | Viewer | | Generate | Refused | permission |
| EIN-050 | Portal refusal | | Simulator configured to reject | Generate | "The portal refused the invoice"; status **Rejected**; the button reads **Try again**; shown on Home, in the register and as a count beside **GST compliance** in the menu | edge [sim] |
| EIN-051 | No edit after IRN | Owner | Latest invoice in its series, IRN generated | Open detail | No **Edit**; "Can't edit: it has an IRN (e-invoice)" | validation |
| EIN-052 | Cancel order: IRN before invoice | | IRN live, no e-way bill | Cancel the invoice | "Cancel the e-invoice (IRN) before cancelling this document" | validation |

### E-way bill: requirement

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| EWB-001 | Required above ₹50,000 | | Issued invoice: BRG-6203 qty 300 @ ₹180 (taxable ₹54,000 + 18% = ₹63,720) | Open | E-way status **Not raised**; **Generate e-way bill** offered | happy |
| EWB-002 | Exactly ₹50,000 isn't above | | One-off goods line, ₹50,000 rate-inclusive | Open | **Not required** ("at or below the threshold") | edge |
| EWB-003 | Services only | | Invoice of SRV-INST worth ₹80,000 | Open | Not required ("The document has no goods on it") | edge |
| EWB-004 | Delivery note | | Delivered note over ₹50,000 | Open | E-way bill can be raised | happy |
| EWB-005 | Only invoices and delivery notes | | Sales order | Open | No e-way bill action | edge |
| EWB-006 | Switched off | Owner / Basic | Aurora (e-way off) | Any invoice | Not applicable | edge |
| EWB-007 | Cancelled document | | Cancelled invoice over ₹50,000 | Open | Not required ("The document is cancelled") | edge |
| EWB-008 | Foreign-currency document | | AED invoice of goods worth over ₹50,000 at the invoice rate | Open | Required (value converted to rupees first) | edge |

### E-way bill: generate (Part-A + Part-B)

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| EWB-010 | Generate by road | Accountant | EWB-001 to Kumar Electronics | **Generate e-way bill** → mode **Road**, transporter Konkan Roadlines, vehicle `MH12AB1234`, distance 640 → **Generate e-way bill** | "E-way bill generated"; validity preview "4 days · valid to <date>" (one day per 200 km, ending at midnight) | happy [sim] |
| EWB-011 | Validity edges | | | Distance 200, then 201, then 400, then 401 | 1 day, 2 days, 2 days, 3 days | edge |
| EWB-012 | Over-dimensional cargo | | | Cargo **Over-dimensional**, 1,180 km | 59 days ("one day per 20 km, or part thereof") | edge |
| EWB-013 | Distance limit | | | 4,001 km | "The portal accepts at most 4000 km on one bill" | validation |
| EWB-014 | Distance missing | | | Distance empty | "Enter the approximate distance in kilometres" | validation |
| EWB-015 | Vehicle in lower case | | | `mh12ab1234` | "Use capital letters, as on the registration plate" | validation |
| EWB-016 | Vehicle with spaces | | | `MH 12 AB 1234` | "Enter the number without spaces or hyphens" | validation |
| EWB-017 | Rail with a vehicle | | Mode **Rail** | Enter a vehicle number | "A vehicle number does not belong on a rail, air or ship consignment" | validation |
| EWB-018 | Rail needs a transport document | | Rail, no RR number | Generate | "Enter the transport document number"; date required, not in the future | validation |
| EWB-019 | Bad transporter ID | | | Transporter ID `ABC` | "The transporter ID is not a valid GSTIN or TRANSIN" | validation |
| EWB-020 | Unregistered receiver | | Galaxy Superstore | Receiver GSTIN | Accepts `URP` ("URP if the party is not registered") | edge |
| EWB-021 | Place fields | | | Clear the PIN / place / address | "Enter the PIN code", "Enter the place", "Enter the address", "Choose a state" | validation |
| EWB-022 | Automatic on finalise | | **Raise on finalising** on | Finalise a road invoice over ₹50,000 | Prompts for a vehicle number (road needs one), then raises | edge |
| EWB-023 | Connection lost | | Network off on the device | Generate | "Connect to the internet to reach the GST portal…" | edge |
| EWB-024 | Sales role | Sales | | Generate | Refused (owner, admin or accountant) | permission |
| EWB-025 | Sub-supply "Others" | | | Sub-supply type **Others**, no description | Asks to **Describe the sub-supply** | validation |
| EWB-026 | No edit with an e-way bill | Owner | Latest invoice in its series, active bill | Open detail | No **Edit**; "Can't edit: it has an e-way bill". After cancelling the bill (and with no IRN), **Edit** returns | validation |

### E-way bill: after generation

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| EWB-030 | Update Part-B | Accountant | Active bill | **Update Part-B** → reason **Vehicle breakdown** → new vehicle `KA01MJ7788` → **Save Part-B** | "Part-B updated"; History shows both vehicles (added, not overwritten) | happy [sim] |
| EWB-031 | Part-B on an expired bill | | Demo "expired" bill | Update Part-B | Refused: "The bill has expired" | validation |
| EWB-032 | Part-B on a cancelled bill | | Demo cancelled bill | Update Part-B | Refused: "The bill has been cancelled" | validation |
| EWB-033 | Extend before the window | | Bill with more than 8 h left | **Extend** | "Extension opens eight hours before expiry"; the window is shown | validation |
| EWB-034 | Extend inside the window | | Demo "expiring soon" bill (within 8 h) | **Extend validity** → reason **Transhipment**, distance left 150, current place and PIN → **Continue** | "Validity extended"; new validity counted from now for 150 km (1 day); History "Extended · Transhipment" | happy [sim] |
| EWB-035 | Extend up to 8 h after expiry | | Expired less than 8 h ago | Extend | Allowed | edge |
| EWB-036 | Extend too late | | Expired more than 8 h ago | Extend | "Extension closed eight hours after expiry" | validation |
| EWB-037 | Cancel within 24 h | Accountant | Fresh bill | **Cancel this bill** → reason **Order cancelled** → **Cancel the bill** | "E-way bill cancelled"; status **Cancelled**; intro text shows the deadline | happy [sim] |
| EWB-038 | Cancel after 24 h | | Bill over 24 h old | Cancel | "The 24-hour cancellation window has closed" | validation |
| EWB-039 | Cancel twice | | Cancelled | Cancel | "The bill has already been cancelled" | validation |
| EWB-040 | Regenerate after cancel | | EWB-037 | **Raise a new e-way bill** | New bill linked to the same document (demo has a "regenerated" case) | happy [sim] |
| EWB-041 | Cancel the document first? | | Active bill on an invoice | Cancel the invoice | Blocked (SAL-084) until the e-way bill is cancelled | validation |
| EWB-042 | Expiry labels | | Demo bills | Open each | "N h left", "expires within the hour", "expired N h ago" or "expired N days ago" | happy |

### Compliance register & Home

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| GST-001 | Register tabs | | Fresh seed | **GST › GST compliance** | Tabs **E-invoices** / **E-way bills**; filters All / Reported / Not reported / Rejected / Cancelled and All / Needs e-way bill / Active / Expired / Cancelled; tiles **Reported**, **Needs attention**, **Active bills**, **Expiring in 24 h** | happy |
| GST-002 | Expiring banner | | Demo expiring bill | Open the register | "1 e-way bill expires within 24 hours." | happy |
| GST-003 | Search | | | Search an IRN, or a bill number / party | Matching row | happy |
| GST-004 | Home tiles | | | Home | E-invoices tile (rejected or reported) and e-way bills tile (expiring in 24 h or active) | happy |
| GST-005 | Needs your attention | | Rejected e-invoice or expiring bill | Home | Listed in "Needs your attention" | happy |
| GST-006 | Needs e-way bill | | Issued goods invoice over ₹50,000 with no bill | **E-way bills** tab | Banner "1 invoice above the threshold still needs an e-way bill. Tap to see it."; **Needs e-way bill** lists it with status **Needs bill**; tap → e-way bill form | happy |
| GST-007 | Nothing unbilled | | Every such document billed | **Needs e-way bill** | "Nothing waiting for a bill" | edge |
| GST-008 | Sales plan GST tab | Owner / Basic | Aurora | 📱 **GST** tab | Tiles **GSTR-1**, **GST returns**, **GST & e-invoicing**; no GSTR-2B, Utilization, challan or GST journal tiles; register below | plan |
| GST-009 | Full plan navigation | Owner / Pro | Vertex | 📱 **More**; 🖥 sidebar **GST** | Group **GST** with GST compliance, GSTR-1, GSTR-2B, 2B reconciliation, GST returns, Utilization entry, GST challan, GST journal | happy |

### GSTR-1

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| GST-010 | Open GSTR-1 | Owner | | **GST › GSTR-1** → **Return month** this month | Tables B2B, B2CL, B2CS, EXP, CDNR, CDNUR, NIL, HSN, DOCS, 11A/B, AMEND; each with Taxable, IGST, CGST, SGST, Cess columns; **Rate-wise summary** card | happy |
| GST-011 | B2B rows | | | B2B | Invoices to registered buyers (Sunrise, Kumar, …) by GSTIN, place of supply, rate, taxable | happy |
| GST-012 | B2CS | | Invoice to Galaxy Superstore | B2CS | Consolidated by place of supply and rate | happy |
| GST-013 | B2CL | | Inter-state B2C invoice over ₹1 lakh | B2CL | Listed individually; one at exactly ₹1 lakh goes to B2CS | edge |
| GST-014 | Export | | AED invoice | EXP | Listed | happy |
| GST-015 | Credit notes | | Processed return to a registered buyer; credit note against a B2CL invoice | CDNR / CDNUR | Listed in CDNR and CDNUR respectively | happy |
| GST-016 | HSN summary | | | HSN | "Quantities and values rolled up by HSN, as table 12 of the return wants them." | happy |
| GST-017 | Docs table | | A cancelled invoice in the period | Docs | Series with issued and cancelled counts | edge |
| GST-018 | Empty table | | | A table with no rows | "Nothing in this table" | edge |
| GST-019 | Export | Owner | Range is one whole month, one GSTIN | **Export** | PDF, Excel and CSV of the current table, plus **GSTN JSON (for the portal)** | happy |
| GST-020 | Drafts left out | | Draft invoice and an unprocessed return in the period | Compare | Not in any table | edge |
| GST-021 | Not a whole month | | Custom range 5th–20th | Look at **Return month** and **Export** | "The range above isn't one whole month. A return is filed for a month."; no GSTN JSON offered | edge |
| GST-022 | Rate-wise summary | | Invoices at 5%, 12%, 18% and a credit note at 18% | Rate-wise summary | One row per rate, net of the credit note; tax split by head | happy |
| GST-023 | Table 11 | | ADV-001 in [14](14-accounting-gst-returns.md) | **11A/B** | 11A row by place of supply and rate | happy |
| GST-024 | Amendment after filing | | GSTR-1 of last month recorded as filed, its 3B not yet (books still open); cancel one of its invoices | This month, **AMEND** | Row in B2BA with original number, date and period; a cancelled one at nil | edge |
| GST-025 | No amendments | | Nothing filed has changed | **AMEND** | "Nothing filed earlier has changed. Amendments show when the range is one month." | edge |
| GST-026 | Financial note left out | | Direct credit note, **Financial note — no GST** | All tables, HSN and DOCS | Not listed anywhere | edge |
| GST-027 | Time-barred sales return | | Invoice from FY 2024-25 | Sales return dated after 30 Nov 2025 | Refused (`NOTE_TIME_BARRED`) "A credit note for … had to be issued by …" | validation |
| GST-028 | Branch GSTIN | | Branch with its own GSTIN in another state | GSTR-1, filter that branch | Only its documents; JSON names its GSTIN | edge |

### Compliance settings & transporters

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| GST-030 | Switches and thresholds | Admin | | **Settings › GST & e-invoicing › E-invoicing & e-way bill** → change turnover, thresholds, window → **Save** | "Compliance settings saved" | happy |
| GST-031 | Credentials | Admin | | Enter usernames and passwords → **Save credentials** | "Credentials saved. They are encrypted on the server and never shown again."; later "Connected as <username>" | happy |
| GST-032 | Test without credentials | | Blank | **Test connection** | "Enter the portal username and password first." | validation |
| GST-033 | Test connection | | GST-031 | **Test connection** | "Connected." or "Could not sign in to the portal." [sim] | happy |
| GST-034 | Accountant can't change settings | Accountant | | Save settings | Refused (owner or admin) | permission |
| GST-035 | Add a transporter | Accountant | | **Settings › GST & e-invoicing › Transporters › Add a transporter** → name, ID `27AABCT5512M1Z6` | "Transporter added"; offered in Part-B and as **Default transporter** | happy |
| GST-036 | Bad transporter ID | | | ID `XYZ` | "Transporter ID must be a valid 15-character GSTIN or TRANSIN" | validation |
| GST-037 | GSTIN lookup | | Production | Look up a GSTIN | Falls back to manual entry if the lookup is unavailable (503). **Blocked** for PIN and distance lookup | edge |
| GST-038 | Credentials per portal | Admin | | **Portal credentials**: tabs **E-invoice** and **E-way bill**; save a different login on each | Each tab shows its own "Connected as <username>" | happy |
| GST-039 | Keep a saved password | | GST-031 | Save again with the password blank | "Already saved. Type a new password only to change the login." | edge |
| GST-040 | Duplicate transporter ID | | GST-035 | Add another with the same ID | "Another transporter already has this ID" | validation |
| GST-041 | Vehicles master | Accountant | | **Settings › Business setup › Vehicles › Add vehicle** `MH04XY1111` | "Vehicle saved"; offered on expenses and documents, not on the e-way bill (vehicle number is typed there) | happy |

### Exports, SEZ and the LUT

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| LUT-001 | Export under LUT | Owner | **LUT number (exports)** and **LUT valid till** after today | Invoice to Harbour Supplies FZE, place of supply **Other country (export)** | "Export or SEZ supply under LUT — zero-rated, no IGST charged."; no tax; GSTR-1 EXP; 3B 3.1(b) | happy |
| LUT-002 | No LUT | | LUT number cleared | Same invoice | "Export or SEZ supply — IGST applies. Add an LUT in the business profile to zero-rate it."; IGST charged; e-invoice **Export with payment of tax** | edge |
| LUT-003 | LUT run out | | **LUT valid till** before the invoice date | Same invoice | IGST charged, as LUT-002 | edge |
| LUT-004 | SEZ under LUT | | LUT active; customer **SEZ unit or developer** | Invoice | Zero-rated; IGST, not CGST/SGST, without the LUT | edge |
