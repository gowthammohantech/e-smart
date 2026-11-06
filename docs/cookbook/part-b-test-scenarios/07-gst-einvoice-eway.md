# 07 — GST: e-invoice, e-way bill, GSTR-1

Tests for e-invoice (IRN) eligibility, validation, generation and cancellation; e-way bill generation, Part-B, extension and cancellation; the compliance register; GSTR-1; and the compliance settings. Setup and demo data are in [00 — Test setup](00-test-setup.md).

Every portal call goes through the simulated GSP in development, so all generate, cancel and extend results here are **[sim]**. The live Adaequare and WhiteBooks adapters haven't been tested against the GSP sandboxes yet.

Default: owner, **Vertex Traders**. Turnover is ₹8.4 crore, above the ₹5 crore threshold, so e-invoicing applies and **6-digit HSN** is mandatory. E-way bill threshold: ₹50,000.

### E-invoice: eligibility

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| EIN-001 | B2B invoice qualifies | Owner | Issued invoice to Kumar Electronics | Open → Compliance | E-invoice status **Not reported**; **Generate IRN** offered | happy |
| EIN-002 | Draft not reportable | | Draft | Open | Not applicable ("The document has not been finalised yet") | edge |
| EIN-003 | Unregistered buyer | | Issued invoice to Galaxy Superstore (no GSTIN) | Open | **Not applicable** ("A sale to an unregistered buyer is outside e-invoicing") | edge |
| EIN-004 | Below the threshold | Owner / Basic | Aurora (₹1.4 crore) | Issued invoice to Lumen Brand Works | Not applicable: "Turnover is below the e-invoicing threshold" | edge |
| EIN-005 | Switched off | | Turn off **Report invoices to the portal** | GST hub | "E-invoicing is switched off for this business. Turn it on under Settings to report invoices." | edge |
| EIN-006 | Composition dealer | | Company on composition | Issued B2B invoice | Not applicable ("Composition dealers are outside e-invoicing") | edge |
| EIN-007 | Only invoices and credit notes | | Delivery note, quote | Open | No e-invoice action | edge |
| EIN-008 | Sales return (CRN) qualifies | | Processed return to a registered buyer | Open | **Generate IRN** offered | happy |
| EIN-009 | Export | | Issued AED invoice to Harbour Supplies FZE | Generate sheet | Supply type Export (with or without tax, depending on the LUT) | happy |

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

### E-invoice: generate & cancel

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| EIN-040 | Generate | Accountant | EIN-020 | Confirm | "IRN generated"; IRN, **Ack No.**, **Ack date**; signed QR on the PDF | happy [sim] |
| EIN-041 | Copy IRN | | | **Copy IRN** | "IRN copied" | happy |
| EIN-042 | Automatic on finalise | | Turn on **Report on finalising** | Finalise a B2B invoice | IRN generated without asking | happy [sim] |
| EIN-043 | Offline | | Network off | Generate | "Connect to the internet to reach the GST portal, then try again." | offline |
| EIN-044 | Cancel within 24 h | Accountant | IRN under 24 h old | **Cancel IRN** → reason **Data entry mistake** → **Cancel the IRN** | Warning "…the document number cannot be used again this financial year…"; "IRN cancelled"; status **IRN cancelled** | happy [sim] |
| EIN-045 | Reason "Other" needs a remark | | | Reason **Other**, empty remark | "Say what happened" | validation |
| EIN-046 | After 24 h | | IRN over 24 h old (re-seed or change the clock) | Cancel | Refused: "The 24-hour cancellation window has closed; issue a credit note instead" | validation |
| EIN-047 | Cancellable-until hint | | Fresh IRN | Open the compliance panel | "Cancellable until <date>, <time>" (generation + 24 h) | happy |
| EIN-048 | Sales role | Sales (Rahul) | | Generate an IRN | Refused by the server (owner, admin or accountant). The FRD matrix lets sales do this; see the report | permission |
| EIN-049 | Viewer | Viewer | | Generate | Refused | permission |
| EIN-050 | Portal refusal | | Simulator configured to reject | Generate | "The portal refused the invoice"; status **Rejected**; shown on Home and the GST hub | edge [sim] |

### E-way bill: requirement

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| EWB-001 | Required above ₹50,000 | | Issued invoice: BRG-6203 qty 300 @ ₹180 (taxable ₹54,000 + 18% = ₹63,720) | Open | E-way status **Not raised**; **Generate e-way bill** offered | happy |
| EWB-002 | Exactly ₹50,000 isn't above | | One-off goods line, ₹50,000 rate-inclusive | Open | **Not required** ("at or below the threshold") | edge |
| EWB-003 | Services only | | Invoice of SRV-INST worth ₹80,000 | Open | Not required ("The document has no goods on it") | edge |
| EWB-004 | Delivery note | | Delivered note over ₹50,000 | Open | E-way bill can be raised | happy |
| EWB-005 | Only invoices and delivery notes | | Sales order | Open | No e-way bill action | edge |
| EWB-006 | Switched off | Owner / Basic | Aurora (e-way off) | Any invoice | Not applicable | edge |

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
| EWB-023 | Offline | | Network off | Generate | "Connect to the internet to reach the GST portal…" | offline |
| EWB-024 | Sales role | Sales | | Generate | Refused (owner, admin or accountant) | permission |

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
| GST-001 | Register tabs | | Fresh seed | **GST › Compliance** | Tabs **E-invoices** / **E-way bills**; filters All / Reported / Not reported / Rejected / Cancelled and Active / Expired | happy |
| GST-002 | Expiring banner | | Demo expiring bill | Open the register | "1 e-way bill expires within 24 hours." | happy |
| GST-003 | Search | | | Search an IRN, or a bill number / party | Matching row | happy |
| GST-004 | Home tiles | | | Home | E-invoices tile (rejected or reported) and e-way bills tile (expiring in 24 h or active) | happy |
| GST-005 | Needs your attention | | Rejected e-invoice or expiring bill | Home | Listed in "Needs your attention" | happy |

### GSTR-1

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| GST-010 | Open GSTR-1 | Owner | | **GST › GSTR-1** → current month | Tables B2B (registered buyers), B2CL, B2CS, EXP, CDNR, CDNUR, HSN, Nil-rated, Docs | happy |
| GST-011 | B2B rows | | | B2B | Invoices to registered buyers (Sunrise, Kumar, …) by GSTIN, place of supply, rate, taxable | happy |
| GST-012 | B2CS | | Invoice to Galaxy Superstore | B2CS | Consolidated by place of supply and rate | happy |
| GST-013 | B2CL | | Inter-state B2C invoice over the B2CL limit | B2CL | Listed individually | edge |
| GST-014 | Export | | AED invoice | EXP | Listed | happy |
| GST-015 | Credit notes | | Processed return | CDNR / CDNUR | Listed under "Credit notes" | happy |
| GST-016 | HSN summary | | | HSN | "Quantities and values rolled up by HSN, as table 12 of the return wants them." | happy |
| GST-017 | Docs table | | A cancelled invoice in the period | Docs | Series with issued and cancelled counts | edge |
| GST-018 | Empty table | | | A table with no rows | "Nothing in this table" | edge |
| GST-019 | Export JSON, CSV, Excel | Owner | Online | Export each | GSTN JSON, CSV and .xlsx download [sim] | happy |
| GST-020 | Drafts left out | | Draft invoice in the period | Compare | Not in any table | edge |

### Compliance settings & transporters

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| GST-030 | Switches and thresholds | Admin | | **Settings › E-invoicing** → change turnover, thresholds, window → **Save** | "Compliance settings saved" | happy |
| GST-031 | Credentials | Admin | | Enter usernames and passwords → **Save credentials** | "Credentials saved. They are encrypted on the server and never shown again."; later "Connected as <username>" | happy |
| GST-032 | Test without credentials | | Blank | **Test connection** | "Enter the portal username and password first." | validation |
| GST-033 | Test connection | | GST-031 | **Test connection** | "Connected." or "Could not sign in to the portal." [sim] | happy |
| GST-034 | Accountant can't change settings | Accountant | | Save settings | Refused (owner or admin) | permission |
| GST-035 | Add a transporter | Accountant | | **Settings › Transporters › Add a transporter** → name, ID `27AABCT5512M1Z6` | Saved; offered in Part-B | happy |
| GST-036 | Bad transporter ID | | | ID `XYZ` | "Transporter ID must be a valid 15-character GSTIN or TRANSIN" | validation |
| GST-037 | GSTIN lookup | | Production | Look up a GSTIN | Falls back to manual entry if the lookup is unavailable (503). **Blocked** for PIN and distance lookup | edge |
