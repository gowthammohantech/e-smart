# Production readiness

What is still pending before the production release. The apps are API-only,
the demo dataset lives only in the database (`SEED_DEMO_ACCOUNT`), and a
production API refuses to start on any simulator or log-only provider
(`apps/api/src/config.ts`, `productionProblems`). Everything below is what
that leaves.

Each item has an owner and a status. Owners are roles until someone takes the
item; replace the role with a name when you do.

| Status | Meaning |
|---|---|
| ⬜ Todo | Not started |
| 🟨 In progress | Someone is on it |
| ✅ Done | Merged, or provisioned and verified |
| ⏸ Blocked | Waiting on something outside the team (vendor, legal) |

Roles: **Backend**, **Mobile/Web**, **Ops** (infrastructure, Railway, secrets),
**Product** (vendor contracts, legal), **QA**.

## 1. Provider adapters to build

Production runs these two as `disabled` (503 `FEATURE_UNAVAILABLE`, the apps
fall back to manual entry) until a real adapter exists.

| Item | Where | Owner | Status |
|---|---|---|---|
| GSP GSTIN search is built (`GSTIN_PROVIDER=gsp`, Adaequare or Whitebooks). Still open: PIN codes the India Post directory lacks and the EWB portal road distance, which answer 503 so the apps fall back to manual entry | `apps/api/src/providers/gstin.ts`, `providers/gsp/` | Backend | 🟨 Partly |
| Document AI OCR: read an uploaded bill image server-side, so OCR works on the web and without ML Kit. `OCR_PROVIDER=document-ai` currently throws at boot | `apps/api/src/providers/ocr.ts` (`createOcrProvider`) | Backend | ⬜ Todo |
| GSP e-invoice / e-way bill adapters (Adaequare, Whitebooks) are built; run them against each GSP's sandbox and settle the routes flagged unconfirmed in the GSP README before production | `apps/api/src/providers/gsp/` | Backend | 🟨 Built, unverified |
| GSP returns adapter (taxpayer session, GSTR-2B, save, offset, proceed, EVC, file, track) is built for Adaequare; every route is unconfirmed until the sandbox run. Whitebooks has none yet | `apps/api/src/providers/gsp/returns.ts` | Backend | 🟨 Built, unverified |

## 2. Vendor accounts and secrets to provision

Each needs an account, a contract where applicable, and its secrets set in
Railway (never committed). `apps/api/.env.example` names every variable.

| Vendor | Variables | Owner | Status |
|---|---|---|---|
| MSG91 (SMS, OTP): DLT-registered sender and template | `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | Product, Ops | ⬜ Todo |
| Azure Communication Services or Amazon SES (email): verified sender domain, SPF/DKIM | `EMAIL_PROVIDER=acs` + `ACS_CONNECTION_STRING`, or `ses` + AWS keys; `EMAIL_FROM` | Ops | ⬜ Todo |
| WhatsApp (Meta app): business verification, phone number, approved templates, webhook | `WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_SECRET` | Product, Ops | ⬜ Todo |
| Expo push: an Expo project (its id in `app.json` `extra.eas.projectId`; the app registers no device without it), an APNs key (team 93XKQVM4YX) and FCM (`google-services.json`). Code is done (PR 5, `remote/push.ts`) | `PUSH_PROVIDER=expo` | Mobile/Web, Ops | ⬜ Todo |
| GSP with IRP and EWB sandbox certification, then production access | `COMPLIANCE_PROVIDER=gsp`, `TAXATION_GSP_PROVIDER_CODE`, `TAXATION_ADAEQUARE_BASE_URL`, `TAXATION_ADAEQUARE_APP_ID`/`_SECRET`; the portal username and password are entered per company in the app | Product, Backend | ⬜ Todo |
| Razorpay: live keys, webhook secret, plan IDs for subscriptions | `PAYMENTS_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Product, Ops | ⬜ Todo |
| Open Exchange Rates | `FX_PROVIDER=openexchangerates`, `OPENEXCHANGERATES_APP_ID` | Ops | ⬜ Todo |
| Lixi's model: Anthropic, or any OpenAI-compatible server (OpenAI, Azure, OpenRouter, Groq, Gemini, Ollama…) | `ASSISTANT_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, or `ASSISTANT_PROVIDER=openai` + `OPENAI_BASE_URL`, `OPENAI_API_KEY`; `LIXI_MODEL` + `LIXI_SECONDARY_MODEL` (OpenRouter defaults to free models) | Ops | ⬜ Todo |
| Azure Blob Storage or S3: container, CORS rule for the web origin, lifecycle rules | `STORAGE_PROVIDER`, `AZURE_STORAGE_CONNECTION_STRING` / `S3_*` | Ops | ⬜ Todo |
| Chromium for PDF rendering in the API image | `PDF_PROVIDER=chromium`, `CHROMIUM_PATH` | Ops | ⬜ Todo |
| KMS / Vault for the credentials key, instead of a static `CREDENTIALS_KEY` | `CREDENTIALS_KEY` | Ops, Backend | ⬜ Todo |

## 3. Dead links

Links the API already hands out, or buttons the apps no longer show, with
nothing behind them yet.

| Item | Where | Owner | Status |
|---|---|---|---|
| Public `/share/:token` page: view, download and pay a shared document | `apps/api/src/modules/documents/share.ts` | Mobile/Web, Backend | ✅ Done |
| Public `/pay/:id` page for payment links: production uses Razorpay's hosted `short_url`; `/pay/:id` is only the simulator's | `apps/api/src/providers/payments.ts` | Mobile/Web, Backend | ✅ Not needed |
| OAuth callback `/v1/oauth/google-drive/callback` (backup to Google Drive). Hidden as "Coming soon" until built (`COMING_SOON`) | `apps/api/src/modules/integrations/handlers.ts` | Backend | ⏸ Phase 2 |
| OAuth callback `/v1/oauth/razorpay/callback` (Razorpay connect). Hidden as "Coming soon"; keys sent directly still connect | `apps/api/src/modules/integrations/handlers.ts` | Backend | ⏸ Phase 2 |
| Google sign-in: removed from the sign-in screen with the local mode; needs an API endpoint and the native/web OAuth flows | `packages/app/screens/(auth)/sign-in.tsx` | Backend, Mobile/Web | ⬜ Todo |
| Plan limits (businesses, users) in `GET /subscription`, so Settings → Plan can show "3 of 6" again; it shows plain counts today | `packages/api-contract/openapi.yaml` (`Subscription`), `settings/plan.tsx`, `PlanBillingDesktop.tsx` | Backend, Mobile/Web | ⬜ Todo |

## 4. Background work

| Item | Where | Owner | Status |
|---|---|---|---|
| A job queue for exports and OCR. Done: a Postgres queue (`jobs`, `apps/api/src/jobs/`); exports build in the background, OCR of an image by a network provider is queued (text read on the phone stays instant) | `apps/api/src/jobs/`, `modules/exports`, `modules/ocr` | Backend | ✅ Done |
| Move the in-memory Lixi rate limiter to Postgres or Redis, so it holds across instances and restarts | `apps/api/src/modules/lixi/handlers.ts:51` | Backend | ⬜ Todo |
| Move the messaging `Outbox` (log providers' sent messages) out of memory, or drop it in production | `apps/api/src/providers/messaging.ts` (`Outbox`) | Backend | ⬜ Todo |
| Schedule recurring expenses, automatic backups, overdue notices, export expiry and the closed-account purge. Done (`SCHEDULES` in `apps/api/src/jobs/registry.ts`); automatic payment *reminders* to customers are not built | `apps/api/src/jobs/registry.ts` | Backend, Ops | ✅ Done |

## 5. Client-computed views to move server-side

The apps compute these from the records they load from the server (nothing
is kept on the device; the app is online only). The API already has endpoints
for each; switching the screens to them keeps the numbers authoritative and
the devices light as books grow.

| View | API | Owner | Status |
|---|---|---|---|
| Dashboard | `GET …/dashboard` | Mobile/Web | ⬜ Todo |
| Search | `GET …/search` | Mobile/Web | ⬜ Todo |
| Receivables and payables aging | `GET …/receivables`, `…/payables` | Mobile/Web | ⬜ Todo |
| Reports | `GET …/reports/{reportKey}` | Mobile/Web | ⬜ Todo |
| GSTR-1 | `GET …/gst/gstr1` | Mobile/Web | ⬜ Todo |

## 6. Device features

| Item | Owner | Status |
|---|---|---|
| Barcode scanning with the camera (`expo-camera` is installed); the scan screen takes a typed code today | Mobile/Web | ⬜ Todo |

## 7. Ops

| Item | Owner | Status |
|---|---|---|
| Observability: request ids (`x-request-id`), redacted logs, `/health/worker` for the job queue are done; an error-tracking service, log shipping and alerts are not (`setErrorReporter` is the seam) | Ops | 🟨 Partly |
| Database backups with point-in-time recovery (Railway dashboard), a nightly `pg_dump` (`db.backup` job, off until the worker has a matching `pg_dump`), and a quarterly restore drill (`docs/RUNBOOK.md`) | Ops | 🟨 Built, not switched on |
| Secret rotation runbook: `docs/RUNBOOK.md`. `CREDENTIALS_KEY` still needs a re-encryption script to rotate without making businesses re-enter portal logins | Ops | 🟨 Partly |
| Rate limits per route and per tenant, reviewed. Auth routes now have per-IP limits (`AUTH_RATE_LIMIT_PER_MINUTE`); per-tenant limits remain | Backend, Ops | 🟨 Partly |
| Load testing: `tools/load/api.js` (k6) written; run it on staging and record the baseline in `docs/RUNBOOK.md` | QA, Backend | 🟨 Written, not run |
| Deploy and migration rollback plan: expand-then-contract, enforced by `npm run check:migrations` in CI; rollback is redeploying the previous build (`docs/RUNBOOK.md`) | Ops, Backend | ✅ Done |
| A staging environment mirroring production, with sandbox vendor keys and the demo account (`SEED_DEMO_ACCOUNT=true`). `.railway/railway.ts` now takes a non-production environment's URLs from Railway; the environment itself is still to create | Ops | 🟨 Config ready |
| Railway env checklist, below, completed for production | Ops | ⬜ Todo |

### Railway env checklist (production)

`.railway/railway.ts` keeps these as `preserve()`: set them in Railway. The
API will not start until the provider rows are real.

**api**

- [ ] `DATABASE_URL`, `JWT_SECRET` (32+ chars), `CREDENTIALS_KEY` (`openssl rand -base64 32`)
- [ ] `PUBLIC_BASE_URL`, `APP_URL` (https, not localhost: the API refuses to start otherwise; `APP_URL` is set in `.railway/railway.ts`)
- [ ] `TRUST_PROXY_HOPS` (default 1, Railway's edge proxy): confirm against a real request's `X-Forwarded-For`
- [ ] `CORS_ORIGINS`: the web and admin origins, comma-separated, no `*`
- [ ] `SMS_PROVIDER`, `EMAIL_PROVIDER` + `EMAIL_FROM`, `WHATSAPP_PROVIDER`, `PUSH_PROVIDER`, with their credentials
- [ ] `STORAGE_PROVIDER` (`azure` or `s3`) and its connection settings
- [ ] `PDF_PROVIDER=chromium`
- [ ] `COMPLIANCE_PROVIDER=gsp`, `TAXATION_GSP_PROVIDER_CODE=ADAEQUARE_GSP`, `TAXATION_ADAEQUARE_BASE_URL`, `TAXATION_ADAEQUARE_APP_ID`, `TAXATION_ADAEQUARE_APP_SECRET`
- [ ] `GSTIN_PROVIDER=gsp` (or `disabled`), `OCR_PROVIDER=disabled` (until section 1 is done)
- [ ] `FX_PROVIDER=openexchangerates`, `PAYMENTS_PROVIDER=razorpay`, `ASSISTANT_PROVIDER=anthropic`, with their keys
- [ ] `RAZORPAY_WEBHOOK_SECRET`, `WHATSAPP_WEBHOOK_SECRET` from the vendors' dashboards
- [ ] `DEMO_OTP` unset
- [ ] `SEED_DEMO_ACCOUNT` unset in production (or `true` with a 12+ character `DEMO_ACCOUNT_PASSWORD` on a demo environment)
- [ ] The public demo: on by default (`DEMO_ENABLED`); its account is read-only and its password public. `DEMO_EMAIL` must not belong to a real account. `DEMO_ENABLED=false` to switch it off

**web / admin**

- [ ] `STORAGE_ORIGIN` on web: the storage account uploads go to, for the Content-Security-Policy
- [ ] `CSP_REPORT_ONLY=false` on web and admin once invoices, uploads, PDFs and printing were checked with the browser console open

- [ ] `EXPO_PUBLIC_API_URL` / `VITE_API_URL`
- [ ] `EXPO_PUBLIC_DEMO_LOGIN_*` / `VITE_DEMO_LOGIN_*` unset (they are compiled into the bundle). The "Give it a try" button needs nothing here: it asks the API (`GET /auth/demo`)

### Before deploying the server changes

- [ ] Check production for duplicate issued document numbers: migration `0008` fails if any exist
- [ ] Postgres 13 or newer (`change_log.tx_id` is `xid8`)
- [ ] Have a CA confirm the tax rules: credit note deadline (warning only), return and backdated rates, 16-character numbers, future-date rule
- [ ] Add a screen for closing the books: `lockedThroughDate` is API-only today

## 8. QA and release

| Item | Owner | Status |
|---|---|---|
| End-to-end tests of the API-backed flow on web and mobile. The web online-only scenarios (a save reaches the server and nothing is kept in the browser; with the API unreachable the app says so, saving is off and nothing waits to be sent) run in CI (`e2e` job); sign-up, invoice to payment, OCR, the GSP sandbox and mobile (Maestro) are still to add | QA | 🟨 Partly |
| Online-only release: once 1.0.5 is in the stores, set `MIN_APP_VERSION` on the API so older native builds see "Update required" (426 `APP_UPDATE_REQUIRED`); the first 1.0.5 launch sends what an old build left unsent, then deletes its on-device copy. Not yet checked on a device | Mobile/Web, Ops | ⬜ Todo |
| Remove `/sync/push` and `/sync/pull` from the API once no build before 1.0.5 is in use; new apps don't call them | Backend | ⬜ Todo |
| Security review: auth and refresh tokens, tenant isolation, upload validation, webhook signatures, secrets handling, dependency audit | Backend, external | ⬜ Todo |
| Tenant isolation in Postgres: row-level security on all company data (0061, docs/database/rls.md). Built and tested; in production `DATABASE_URL` still has to be switched to `esmart_app`, with `SYSTEM_DATABASE_URL`, `MIGRATION_DATABASE_URL`, the two role passwords and `RLS_ENFORCE=true` | Backend, Ops | 🟨 Partly |
| App store builds: profiles, signing and the privacy manifest are done (`apps/mobile/eas.json`, `app.json`); store listings, labels and submission follow `docs/STORE_SUBMISSION.md` | Mobile/Web | 🟨 Partly |
| Legal pages: drafts at `/privacy`, `/terms`, `/refund`, `/delete-account`, `/support` on the site (`apps/site/content/legal.ts`); a lawyer must review them and a grievance officer be named | Product | 🟨 Drafted |
| Data privacy: consent is recorded at sign-up (`users.terms_version`), deletion is self-serve (`POST /me/delete`), export exists, sub-processors are listed in the privacy page. Still open: the purge job for `accounts.purge_after` | Product, Backend | 🟨 Partly |

## 9. Accounting and GST returns (Phase 3)

The books, TDS, reverse charge, credit, notes, GSTR-2B, GSTR-3B and filing are built and tested
against the simulator. Filing stays off in production (`GST_FILING_ENABLED=false`) until the first
three rows below are done; preparing and saving returns works without it.

| Item | Owner | Status |
|---|---|---|
| A chartered accountant reviews and signs off `docs/accounting/RULES.md`, including its open questions (late-fee cap by turnover, bank rate, agreed day, reimbursement accounting) | Product | ⬜ Todo |
| A worked month on a test company, checked to the paisa by the CA: TDS over the threshold, GTA reverse charge, a blocked credit, capital goods, a credit and a debit note, an advance for services, a reimbursement, an MSME bill. Expected GSTR-1 JSON, 3B tables and set-off | QA, CA | ⬜ Todo |
| The returns routes confirmed on the GSP sandbox, and one return filed end to end on a test GSTIN (`docs/RUNBOOK.md`, GST returns) | Backend | ⏸ Blocked: needs GSP taxpayer-API access |
| Tally Prime (education mode) imports the Tally XML export, and its trial balance equals the app's | QA | ⬜ Todo |
| On a phone: a journal and a contra saved, and the trial balance matches the server's | QA | ⬜ Todo |
| Turn on `GST_FILING_ENABLED` in production | Ops | ⏸ Blocked on the rows above |
| Known gaps, documented in the FAQ: DSC filing, imports of goods and ISD in 3B, GSTR-1 amendment tables, a document split across cost centres | Product | Decision needed |
