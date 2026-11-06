# 00 — Test setup & demo data

Every scenario in Part B starts from a freshly seeded demo account, unless the scenario says otherwise.

## 1. Run the stack locally

Needs Node 22 (see `.nvmrc`) and Docker.

```bash
npm install
docker compose up -d                       # Postgres 16, MinIO (S3), Azurite, Mailpit
cp apps/api/.env.example apps/api/.env
```

In `apps/api/.env`, set:

```bash
DEMO_OTP=true                              # phone OTP 123456 is accepted (development only)
SEED_DEMO_ACCOUNT=true
DEMO_ACCOUNT_EMAIL=gowtham@vertextraders.in
DEMO_ACCOUNT_PASSWORD=demo1234             # development only; production needs 12+ characters
```

Then:

```bash
npm run db:migrate -w @esmart/db           # schema + reference data + demo account
npm run api                                # http://localhost:4000/v1
npm run web                                # web app (Expo) in the browser
npm run mobile                             # Expo dev server for phone testing
```

For the admin console (only for the `ADM-` scenarios):

```bash
npm run db:platform-admin -w @esmart/db -- --email gowtham@vertextraders.in --role superadmin
npm run admin                              # http://localhost:5174
```

| Tool | URL | Used for |
|---|---|---|
| Mailpit | http://localhost:8025 | Password-reset and invitation emails |
| MinIO console | http://localhost:9001 | Uploaded logos, receipts and attachments |

**Reset between runs.** `npm run db:seed -w @esmart/db -- --reset` rebuilds the demo account. `npm run db:reset -w @esmart/db` drops everything and migrates again.

**Time-sensitive data.** Demo documents are dated backwards from the day you seed, so aging buckets, "expiring soon" e-way bills and financial-year prefixes move with the seed date. Re-seed before a test run that depends on them.

**Simulated providers.** In development the SMS, email, WhatsApp, PDF, GST portal (GSP), Razorpay and exchange-rate providers are simulators or log-only. A scenario that passes locally confirms the app's behaviour, not the real vendor. These scenarios are tagged **[sim]**.

## 2. Demo logins

All active demo users share `DEMO_ACCOUNT_PASSWORD`.

| User | Email | Role | Businesses / branches |
|---|---|---|---|
| Gowtham Mohan | `gowtham@vertextraders.in` | Owner | Vertex Traders (MUM, PUN), Aurora Design Studio (BLR) |
| Meera Iyer | `meera@vertextraders.in` | Accountant | Vertex Traders — Mumbai |
| Rahul Shetty | `rahul@vertextraders.in` | Sales | Vertex Traders — Pune |
| Priya Nair | `priya@vertextraders.in` | Viewer, **invited** (no password yet) | Vertex Traders — Mumbai |

- **Phone OTP:** with `DEMO_OTP=true`, the code `123456` works for any number. `TEST_OTP_PHONES` sets numbers that always take `123456`, even in production.
- **Sign-in form prefill:** `EXPO_PUBLIC_DEMO_LOGIN_EMAIL` / `EXPO_PUBLIC_DEMO_LOGIN_PASSWORD` prefill the form. Use them only on demo builds.

## 3. Demo data cheat-sheet

### Vertex Traders — Smart Pro

| | |
|---|---|
| Legal name | Vertex Traders Pvt Ltd (wholesale) |
| GSTIN | `27AABCV1234F1ZO` (Maharashtra) |
| Address | 14 Linking Road, Bandra West, Mumbai |
| Turnover | ₹8.4 crore, so **e-invoicing applies** (threshold ₹5 crore) |
| Branches | Mumbai — Head office `MUM` (primary), Pune — Warehouse `PUN` |
| Payment accounts | Cash in hand, HDFC Current — 8842 (default), ICICI Current — 3310, UPI wallet |
| Exchange rates (to INR) | AED 23.85 · USD 87.4 · EUR 94.2 · GBP 110.6 · SGD 64.8 |
| Transporters | Konkan Roadlines `27AABCT5512M1Z6` (default, 340 km), Garuda Freight Carriers, Sarathi Express Cargo |

**Customers.** Pick one by the tax treatment you want to test:

| Code | Customer | State | Use it to test |
|---|---|---|---|
| C-001 | Sunrise Retail | 27 Mumbai | Intra-state → **CGST + SGST** |
| C-002 | Kumar Electronics | 29 Bengaluru | Inter-state → **IGST** |
| C-003 | Mehta Hardware | 27 Mumbai | Intra-state |
| C-004 | Blue Ocean Traders | 24 Ahmedabad | IGST, 45-day terms |
| C-005 | Galaxy Superstore | 07 New Delhi | **No GSTIN** (B2C, no e-invoice) |
| C-006 | Anand Enterprises | 33 Chennai | IGST |
| C-007 | Crescent Distributors | 36 Hyderabad | IGST |
| C-008 | Pearl Home Needs | 32 Kochi | IGST, 15-day terms |
| C-009 | Nova Office Supplies | 27 Pune | Intra-state, Pune branch |
| C-010 | Skyline Interiors | 29 Bengaluru | **No GSTIN** |
| C-011 | Metro Mart | 27 Mumbai | Intra-state |
| C-012 | Zenith Corporate | 09 Noida | **Inactive** contact |
| C-013 | Harbour Supplies FZE | Dubai (overseas) | **AED** export, FX settlement |

**Suppliers:** S-001 Precision Components, S-002 Global Packaging Co, S-003 Nexus Wholesale, S-004 Apex Steel Works, S-005 Urban Logistics, S-006 Delta Paper Mills, S-007 Sigma Fasteners, S-008 Orion Electricals.

**Items.** There are 32 in all. Useful ones:

| SKU | Item | Price | GST | Notes |
|---|---|---|---|---|
| `BRG-6203` | Steel Ball Bearing 6203 | ₹180 | 18% | HSN 84821011, stock-tracked |
| `LED-18` | LED Panel 18W | | 12% | |
| `SFT-GLV` | Safety Gloves Pair | | 5% | |
| `TLK-42` | Tool Kit 42 pcs | | | |
| `SRV-INST` | On-site Installation | | | Service (no stock, no e-way bill) |
| `SRV-CAL` | Equipment Calibration | | | Service |
| `SRV-FRT` | Freight & Delivery | | 5% | Service |
| `SRV-AMC` | Annual Maintenance Contract | ₹24,000 | | **Inactive** |

**Documents.** About 78 in Vertex Traders:
- Sales: 35 invoices across every status and aging bucket (`INV/<FY>/0001` is today's draft; `0036` is the AED invoice), 8 quotes, 6 sales orders, 4 delivery notes, 3 sales returns.
- Purchases: 5 purchase orders, 4 goods receipts, 10 purchase bills, 2 purchase returns.
- Payments and 24 expenses, for example "Godown rent — Bhosari" ₹55,000 and "CA quarterly retainer" ₹35,000.
- Seven e-way bill cases: active (640 km), expiring soon, expired, cancelled, over-dimensional multi-leg (1,180 km), rail (1,420 km), and regenerated. Vehicles include `MH12AB1234` and `KA01MJ7788`.

### Aurora Design Studio — Smart Basic

| | |
|---|---|
| Legal name | Aurora Design Studio LLP (services) |
| GSTIN | `29AACFA9876P1ZH` (Karnataka) |
| Branch | `BLR` |
| Turnover | ₹1.4 crore, so **e-invoicing does not apply**; e-way bills are off |
| Customer / supplier | Lumen Brand Works / Inkline Print House |
| Item | Brand identity package `SRV-BRAND`, ₹1,85,000 |
| Documents | 1 issued invoice, 1 sent quote |

Aurora is on a **sales plan**, so use it for every plan-gating scenario: purchases, stock and expenses are locked there.

## 4. How to record results

Each module file has a table with these columns:

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|

- **Type** is one of: `happy`, `validation`, `edge`, `permission`, `offline`, `plan`.
- **[sim]** means the result depends on a simulated provider.
- **Blocked** means the feature isn't built yet; the scenario is kept so the gap stays visible. Record a Blocked scenario as "Blocked", not "Fail".
- When a scenario fails, record the platform (iOS, Android, web desktop, web narrow), the build number and the steps to reproduce.

Use **two sessions** wherever a scenario needs two people or devices: two browsers, or a browser and a phone. Offline scenarios need a way to cut the network: airplane mode, or DevTools › Network › Offline.
