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

## 2. Vendor accounts and secrets to provision

Each needs an account, a contract where applicable, and its secrets set in
Railway (never committed). `apps/api/.env.example` names every variable.

| Vendor | Variables | Owner | Status |
|---|---|---|---|
| MSG91 (SMS, OTP): DLT-registered sender and template | `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | Product, Ops | ⬜ Todo |
| Azure Communication Services or Amazon SES (email): verified sender domain, SPF/DKIM | `EMAIL_PROVIDER=acs` + `ACS_CONNECTION_STRING`, or `ses` + AWS keys; `EMAIL_FROM` | Ops | ⬜ Todo |
| WhatsApp (Meta app): business verification, phone number, approved templates, webhook | `WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_SECRET` | Product, Ops | ⬜ Todo |
| Expo push: project credentials (APNs key, FCM) | `PUSH_PROVIDER=expo` | Mobile/Web, Ops | ⬜ Todo |
| GSP with IRP and EWB sandbox certification, then production access | `COMPLIANCE_PROVIDER=gsp`, `TAXATION_GSP_PROVIDER_CODE`, `TAXATION_ADAEQUARE_BASE_URL`, `TAXATION_ADAEQUARE_APP_ID`/`_SECRET`; the portal username and password are entered per company in the app | Product, Backend | ⬜ Todo |
| Razorpay: live keys, webhook secret, plan IDs for subscriptions | `PAYMENTS_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Product, Ops | ⬜ Todo |
| Open Exchange Rates | `FX_PROVIDER=openexchangerates`, `OPENEXCHANGERATES_APP_ID` | Ops | ⬜ Todo |
| Anthropic (Lixi) | `ASSISTANT_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `LIXI_MODEL` | Ops | ⬜ Todo |
| Azure Blob Storage or S3: container, CORS rule for the web origin, lifecycle rules | `STORAGE_PROVIDER`, `AZURE_STORAGE_CONNECTION_STRING` / `S3_*` | Ops | ⬜ Todo |
| Chromium for PDF rendering in the API image | `PDF_PROVIDER=chromium`, `CHROMIUM_PATH` | Ops | ⬜ Todo |
| KMS / Vault for the credentials key, instead of a static `CREDENTIALS_KEY` | `CREDENTIALS_KEY` | Ops, Backend | ⬜ Todo |

## 3. Dead links

Links the API already hands out, or buttons the apps no longer show, with
nothing behind them yet.

| Item | Where | Owner | Status |
|---|---|---|---|
| Public `/share/:token` page: view, download and pay a shared document | `apps/api/src/modules/documents/outbound.ts` builds the URL | Mobile/Web, Backend | ⬜ Todo |
| Public `/pay/:id` page for payment links (or use the gateway's hosted page) | `apps/api/src/providers/payments.ts` | Mobile/Web, Backend | ⬜ Todo |
| OAuth callback `/v1/oauth/google-drive/callback` (backup to Google Drive) | `apps/api/src/modules/integrations/handlers.ts` | Backend | ⬜ Todo |
| OAuth callback `/v1/oauth/razorpay/callback` (Razorpay connect) | `apps/api/src/modules/integrations/handlers.ts` | Backend | ⬜ Todo |
| Google sign-in: removed from the sign-in screen with the local mode; needs an API endpoint and the native/web OAuth flows | `packages/app/screens/(auth)/sign-in.tsx` | Backend, Mobile/Web | ⬜ Todo |
| Plan limits (businesses, users) in `GET /subscription`, so Settings → Plan can show "3 of 6" again; it shows plain counts today | `packages/api-contract/openapi.yaml` (`Subscription`), `settings/plan.tsx`, `PlanBillingDesktop.tsx` | Backend, Mobile/Web | ⬜ Todo |

## 4. Background work

| Item | Where | Owner | Status |
|---|---|---|---|
| A job queue for exports and OCR, which run inside the request today (an export of a large company can time out) | `apps/api/src/modules/exports/handlers.ts`, `apps/api/src/modules/ocr/handlers.ts` | Backend | ⬜ Todo |
| Move the in-memory Lixi rate limiter to Postgres or Redis, so it holds across instances and restarts | `apps/api/src/modules/lixi/handlers.ts:51` | Backend | ⬜ Todo |
| Move the messaging `Outbox` (log providers' sent messages) out of memory, or drop it in production | `apps/api/src/providers/messaging.ts` (`Outbox`) | Backend | ⬜ Todo |
| Schedule recurring expenses (`materializeRecurringExpenses`), automatic backups and reminder runs | `apps/api/src/modules/expenses/engine.ts`, `modules/exports` | Backend, Ops | ⬜ Todo |

## 5. Client-computed views to move server-side

The apps compute these from the synced store. The API already has endpoints
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
| Observability: structured logs shipped somewhere searchable, traces, error tracking (API and apps), alerts on 5xx rate, latency and failed syncs | Ops | ⬜ Todo |
| Database backups with point-in-time recovery, and a restore drill on a schedule | Ops | ⬜ Todo |
| Secret rotation runbook (JWT, credentials key, webhook secrets, vendor keys) | Ops | ⬜ Todo |
| Rate limits per route and per tenant, reviewed (`RATE_LIMIT_PER_MINUTE` is global today) | Backend, Ops | ⬜ Todo |
| Load testing: sync push/pull, document finalise, exports, PDF rendering | QA, Backend | ⬜ Todo |
| Deploy and migration rollback plan (migrations are forward-only; rehearse a down path) | Ops, Backend | ⬜ Todo |
| A staging environment mirroring production, with sandbox vendor keys and the demo account (`SEED_DEMO_ACCOUNT=true`) | Ops | ⬜ Todo |
| Railway env checklist, below, completed for production | Ops | ⬜ Todo |

### Railway env checklist (production)

`.railway/railway.ts` keeps these as `preserve()`: set them in Railway. The
API will not start until the provider rows are real.

**api**

- [ ] `DATABASE_URL`, `JWT_SECRET` (32+ chars), `CREDENTIALS_KEY` (`openssl rand -base64 32`)
- [ ] `PUBLIC_BASE_URL`, `APP_URL` (the deployed web app, not localhost)
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

**web / admin**

- [ ] `EXPO_PUBLIC_API_URL` / `VITE_API_URL`
- [ ] `EXPO_PUBLIC_DEMO_LOGIN_*` / `VITE_DEMO_LOGIN_*` unset (they are compiled into the bundle)

## 8. QA and release

| Item | Owner | Status |
|---|---|---|
| End-to-end tests of the API-backed flow on web and mobile: sign-up, onboarding, invoice to payment, offline edit and sync, conflict, OCR, e-invoice against the GSP sandbox | QA | ⬜ Todo |
| Security review: auth and refresh tokens, tenant isolation, upload validation, webhook signatures, secrets handling, dependency audit | Backend, external | ⬜ Todo |
| App store builds: EAS build profiles, signing, store listings, privacy labels, review submission | Mobile/Web | ⬜ Todo |
| Legal pages: privacy policy, terms, refund policy (the About screen links to placeholders) | Product | ⬜ Todo |
| Data privacy: DPDP Act consent and retention, data export and deletion on request, sub-processor list | Product, Backend | ⬜ Todo |
