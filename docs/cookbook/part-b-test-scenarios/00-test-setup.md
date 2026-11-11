# 00 — Test setup & demo data

Every scenario in Part B starts from a freshly seeded demo account (Vertex Traders and Aurora Design Studio), unless the scenario says otherwise. A few scenarios use the public read-only demo (section 3); they say so.

The app is online only. Every save goes straight to the server, and nothing is kept on the device. "Offline" scenarios check that the app blocks saves cleanly and recovers when the connection returns.

## 1. Run the stack locally

Needs Node 22 (see `.nvmrc`) and Docker.

```bash
npm install
docker compose up -d                       # Postgres 16, MinIO (S3), Azurite, Mailpit
cp apps/api/.env.example apps/api/.env
```

In `apps/api/.env`:
- Keep the three database URLs from the example. Requests run as `esmart_app` (row-level security applies), jobs and sign-in as `esmart_system`, and migrations as the owner (`MIGRATION_DATABASE_URL`).
- Set:

```bash
DEMO_OTP=true                              # phone OTP 123456 is accepted (development only)
SEED_DEMO_ACCOUNT=true
DEMO_ACCOUNT_EMAIL=gowtham@vertextraders.in
DEMO_ACCOUNT_PASSWORD=<a development password>   # never a real one; production needs 12+ characters
```

Then:

```bash
npm run db:migrate -w @esmart/db           # schema + reference data + demo account
npm run db:roles -w @esmart/db             # the esmart_app / esmart_system roles and grants (after every migrate)
npm run api                                # http://localhost:4000/v1 (also builds the public demo, section 3)
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
| API docs | http://localhost:4000/docs | Swagger UI, behind `DOCS_USERNAME` / `DOCS_PASSWORD` |

**Reset between runs.** `npm run db:seed -w @esmart/db -- --reset` rebuilds the demo account. `npm run db:reset -w @esmart/db` drops everything and migrates again; run `db:roles` after it.

**Time-sensitive data.** Demo documents are dated backwards from the day you seed, so aging buckets, "expiring soon" e-way bills, the dashboard period and financial-year prefixes move with the seed date. Re-seed before a test run that depends on them.

**Simulated providers.** In development the SMS, email, WhatsApp, PDF, GST portal (GSP), GSTIN lookup, Razorpay and exchange-rate providers are simulators or log-only. A scenario that passes locally confirms the app's behaviour, not the real vendor. These scenarios are tagged **[sim]**.

**Version gate.** `MIN_APP_VERSION` in `apps/api/.env` refuses older native builds with 426 `APP_UPDATE_REQUIRED`. Leave it unset unless a scenario sets it (AUTH-029).

**Desktop shell.** `apps/desktop` wraps the web app in a Tauri window (minimum 1024 × 640). `npm run tauri:dev -w @esmart/desktop` runs it against the local web app. It isn't published; test it only when a scenario asks (WEB-050).

## 2. Demo logins

All active demo users share `DEMO_ACCOUNT_PASSWORD` from `apps/api/.env`.

| User | Email | Role | Businesses / branches |
|---|---|---|---|
| Gowtham Mohan | `gowtham@vertextraders.in` | Owner | Vertex Traders (MUM, PUN), Aurora Design Studio (BLR) |
| Meera Iyer | `meera@vertextraders.in` | Accountant | Vertex Traders — Mumbai |
| Rahul Shetty | `rahul@vertextraders.in` | Sales | Vertex Traders — Pune |
| Priya Nair | `priya@vertextraders.in` | Viewer, **invited** (no password yet) | Vertex Traders — Mumbai |

- **Phone OTP:** with `DEMO_OTP=true`, the code `123456` works for any number. `TEST_OTP_PHONES` sets numbers that always take `123456` and get no SMS, even in production.
- **Sign-in form prefill:** `EXPO_PUBLIC_DEMO_LOGIN_EMAIL` / `EXPO_PUBLIC_DEMO_LOGIN_PASSWORD` prefill the form. Use them only on demo builds.
- **Brand-new users** for sign-up and onboarding scenarios: use any unused email, for example `qa+<date>@example.in`. Mailpit catches its mail.

## 3. The public demo ("Give it a try")

A separate, read-only account for visitors, built by the API itself (`apps/api/src/demo`).

| | |
|---|---|
| Sign-in | `DEMO_EMAIL` (default `demo@elixir-books.com`) and `DEMO_PASSWORD`, both in `apps/api/.env`. The sign-in screen's **Give it a try** fills them in; the app gets them from `GET /v1/auth/demo`. |
| Switch | On unless `DEMO_ENABLED=false`. Off signs everyone out and hides the button; the data stays. |
| Built | At API start-up when missing, and rebuilt when it is a week old or its dataset version changes. By hand: `npm run demo:seed -w @esmart/api -- --force`. A build takes a while; the old demo stays until the new one swaps in. |
| Plan | Every business on **Smart Business**, so every module is open |
| Writes | Every non-GET request answers 403 `DEMO_READ_ONLY`: *This is a demo, so changes aren't saved. Create your free account to keep your own books.* |
| Locks | Never locked by wrong passwords; its password can't be reset. Jobs skip it. No usage data is sent. |
| Team | Meera Iyer (Accountant), Rahul Shetty (Sales, one branch), Farah Khan (Viewer), Vikram Rao (Admin, invited). Only the owner, *Demo Owner*, can sign in. |

The eight businesses, one per business type, each with about six months of sales, purchases, payments, stock, books and GST:

| Business | Type | Branches (code) |
|---|---|---|
| Meridian Wholesale Traders | Wholesale / Trading | Mumbai `MUM`, Bhiwandi `BHW`, Ahmedabad `AMD` (own GSTIN) |
| Anand Family Store | Retail shop | T. Nagar `TNR`, Coimbatore `CBE` |
| Deccan FMCG Distributors | Distributor | Hyderabad `HYD`, Vijayawada `VJA`, Bengaluru `BLR` |
| Sahyadri Precision Components | Manufacturer | Pune plant `PNQ`, Nagpur `NAG` |
| Malgudi Kitchen | Restaurant / Café | Indiranagar `IND`, Jayanagar `JAY` |
| Brightline Digital Services | Services | Gurugram `GGN`, Delhi `DEL` |
| Kavya Raman Consulting | Freelancer / Professional | Kochi `KOC`, Bengaluru `BLR` |
| Nirmal Seva Trust | Other, **not GST-registered** | Kolkata `KOL`, Howrah `HWH` |

GSTINs change with each rebuild, so don't hard-code them in a scenario.

## 4. Demo data cheat-sheet

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

`<FY>` is the short financial year, for example `26-27`.

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

Aurora is on a **sales plan**, so use it for every plan-gating scenario: purchases, stock movements, expenses and the books are locked there.

## 5. How to record results

Each module file has a table with these columns:

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|

- **Type** is one of: `happy`, `validation`, `edge`, `permission`, `offline`, `plan`.
- **[sim]** means the result depends on a simulated provider.
- **Blocked** means the feature isn't built yet; the scenario is kept so the gap stays visible. Record a Blocked scenario as "Blocked", not "Fail".
- When a scenario fails, record the platform (iOS, Android, web desktop, web narrow), the build number and the steps to reproduce.

Use **two sessions** wherever a scenario needs two people or devices: two browsers, or a browser and a phone. Offline scenarios need a way to cut the network: airplane mode, or DevTools › Network › Offline. To test the "server busy" and "server unreachable" paths, stop the API instead.
