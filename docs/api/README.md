# Elixir Books Smart: backend API contract

The app is a UI prototype today. Every screen reads and writes a seeded
Zustand store that is persisted to AsyncStorage (`src/store/appStore.ts`), and
the portal calls (IRP, e-way bill, OCR) are simulated in-process. This folder
defines the backend that replaces all of that, so the app can run fully online.

- **[openapi.yaml](openapi.yaml)**: the contract, in OpenAPI 3.1. It has 111
  paths, 152 operations and 2 inbound webhooks, and it passes `redocly lint`.
  Entity schemas mirror `src/types/index.ts` field for field.
- This README lists the APIs, the third-party services behind them, and the
  order to build them in.

View it with `npx @redocly/cli preview-docs docs/api/openapi.yaml`, or paste
the file into <https://editor.swagger.io>. Generate a typed client with
`npx openapi-typescript docs/api/openapi.yaml -o src/api/schema.d.ts`.

## Contract rules, in brief

The full list is in the spec's `info.description`. The rules that shape
every endpoint:

| Rule | What it means |
|---|---|
| Company-scoped paths | Business data lives under `/companies/{companyId}/…`. The server checks the caller's `companyIds` and `branchIds`. |
| Money is `{ minor, currency }` | Amounts are integer minor units, as in `src/lib/money.ts`. There are no floats anywhere. |
| Server is authoritative | The server recomputes totals, tax splits, stock, outstanding amounts and derived statuses (`paid`, `partiallyPaid`, `overdue`) by porting `src/domain/*`. The client keeps its engines for instant previews only. |
| Server assigns numbers | Documents, payments and expenses get their number when finalised, and a number is never reused. |
| `version` + `If-Match` | Optimistic concurrency on every write. A stale write gets `412`. |
| `Idempotency-Key` on POST | Makes offline-queue retries safe. |
| Problem+JSON errors | Each error has a stable `code`. Validation and portal rejections also carry `issues[]` in the same shape as `ComplianceIssue`. |
| Plan gating | A module outside the plan returns `403 PLAN_UPGRADE_REQUIRED`, which mirrors `src/domain/plan.ts`. Operations carry `x-plan-module`. |
| Roles | Operations carry `x-roles` (owner, admin, accountant, sales, viewer). |

## Third-party services required

These are the external dependencies needed to go fully online. Every one of
them sits behind the backend; the mobile app never calls them directly.

| Need | Used by | Candidates |
|---|---|---|
| **GST e-invoice (IRP)** | `generateEInvoice`, `cancelEInvoice` | NIC IRP through a GSP/ASP: ClearTax, Masters India, IRIS, or NIC direct API access |
| **E-way bill portal** | `generateEwayBill`, Part-B, extend, cancel, `getRoadDistance` | NIC EWB API (usually from the same GSP as the IRP) |
| **GSTIN verification** | `lookupGstin`, party and company autofill | GST public search API through a GSP |
| **SMS / OTP** | `requestOtp`, reminders, invites | MSG91, Twilio, Gupshup (India needs a DLT-registered sender and templates) |
| **WhatsApp Business** | `sendDocument`, `sendPaymentReminder`, OTP fallback | Meta Cloud API, Gupshup, Interakt |
| **Email** | invites, password reset, sending documents | Amazon SES, SendGrid, Postmark |
| **Payments** | `createPaymentLink`, `razorpayWebhook` | Razorpay (payment links, UPI) |
| **Subscriptions** | `startCheckout`, plan changes | Razorpay Subscriptions, or App Store / Play Billing if sold in-app |
| **OCR** | `createOcrExtraction` (replaces `mockExtract`) | Google Document AI, AWS Textract, Azure Document Intelligence, or an LLM vision model |
| **Object storage** | attachments, logos, item images, PDFs, exports | S3, GCS, Cloudflare R2 (pre-signed URLs) |
| **PDF rendering** | `getDocumentPdf`, receipts, statements, reports | Headless Chromium (Puppeteer or Gotenberg) running the same template as `documentHtml.ts` |
| **Push notifications** | `registerPushToken`, notification fan-out | Expo Push, or FCM / APNs |
| **FX rates** | `refreshExchangeRates` | Open Exchange Rates, exchangerate.host, RBI reference rates |
| **Reference data** | HSN/SAC search, PIN codes, cities | CBIC HSN master, India Post PIN directory (loaded into your own DB) |
| **Google Drive** | backup destination (`int_drive`) | Google Drive API (OAuth) |
| **Secrets** | IRP/EWB credentials (`saveComplianceCredentials`) | AWS KMS, GCP KMS, Vault |

## Build order

A suggested order. Each phase leaves the app usable online.

1. **Foundation**: Auth, Me, Companies/branches (onboarding), Users, Settings
   masters, Parties, Catalog, Attachments, Reference. The app can sign in for
   real and manage master data.
2. **Selling**: Documents (create, finalise, convert, status, PDF, send),
   Payments, Ledger (receivables), Dashboard, Search, Notifications, Audit.
   This covers everything on the Free and Basic plans except compliance.
3. **Compliance**: compliance settings and credentials, e-invoice, e-way
   bills, GSTIN lookup, GSTR-1. Start against the NIC sandbox; `servers[1]`
   is the sandbox base URL.
4. **Full plan**: purchase-side documents, Expenses, Inventory, OCR,
   payables, FX, all Reports.
5. **Money and ops**: Billing and Razorpay webhooks, payment links,
   Integrations, Exports/backup, and Sync push/pull for offline mode.

## Client changes this implies

- Replace the store actions in `src/store/appStore.ts` with API calls. Each
  action maps to one operation; the `operationId` usually matches the action
  name (`saveParty`, `finalizeDocument`, `generateEwayBill`, …).
- Remove the seed data (`src/data/seed*.ts`) and `resetDemoData` from
  production builds.
- Delete the simulations `src/domain/irpAdapter.ts` and `mockExtract`. The
  validators in `eInvoice.ts` and `ewayBill.ts` stay for instant feedback.
- Keep AsyncStorage only as a read cache and for the offline queue
  (`syncQueue`), which drains through `/sync/push`.
- Store tokens in `expo-secure-store`, not AsyncStorage.

## Gaps the server must close

The prototype allows some things a real backend must refuse:

- Deleting a party, item, tax category or branch that records still reference
  (`removeParty`, `removeItem`, …). The server returns `409 …_IN_USE`.
- Deleting a finalised document. Only drafts can be deleted; anything else is
  cancelled, so its number is never lost.
- Moving a series' `nextNumber` backwards.
- Clients setting `paid`, `partiallyPaid` or `overdue` directly. The server
  derives these statuses.
- Credentials: `irpClientIdMasked` is display-only. Real secrets are
  write-only and encrypted.

## Endpoint list

`…` stands for `/companies/{companyId}`.

### Auth

| Method | Path | Operation |
|---|---|---|
| POST | `/auth/sign-up` | signUp |
| POST | `/auth/sign-in` | signIn |
| POST | `/auth/otp/request` | requestOtp |
| POST | `/auth/otp/verify` | verifyOtp |
| POST | `/auth/password/forgot` | forgotPassword |
| POST | `/auth/password/reset` | resetPassword |
| POST | `/auth/refresh` | refreshToken |
| POST | `/auth/sign-out` | signOut |

### Me

| Method | Path | Operation |
|---|---|---|
| GET | `/me` | getMe |
| PATCH | `/me` | updateProfile |
| POST | `/me/onboarding/complete` | completeOnboarding |
| GET | `/me/devices` | listDevices |
| DELETE | `/me/devices/{deviceId}` | revokeDevice |
| POST | `/me/push-tokens` | registerPushToken |
| DELETE | `/me/push-tokens/{token}` | unregisterPushToken |

### Companies

| Method | Path | Operation |
|---|---|---|
| GET | `/companies` | listCompanies |
| POST | `/companies` | createCompany |
| GET | `…` | getCompany |
| PUT | `…` | saveCompany |
| PUT | `…/logo` | uploadCompanyLogo |
| DELETE | `…/logo` | removeCompanyLogo |
| GET | `…/branches` | listBranches |
| POST | `…/branches` | createBranch |
| PUT | `…/branches/{branchId}` | saveBranch |
| DELETE | `…/branches/{branchId}` | removeBranch |

### Users

| Method | Path | Operation |
|---|---|---|
| GET | `/users` | listUsers |
| POST | `/users` | inviteUser |
| PUT | `/users/{userId}` | saveUser |
| DELETE | `/users/{userId}` | removeUser |
| POST | `/users/{userId}/resend-invite` | resendInvite |
| POST | `/invites/{token}/accept` | acceptInvite |

### Billing

| Method | Path | Operation |
|---|---|---|
| GET | `/plans` | listPlans |
| GET | `…/subscription` | getSubscription |
| POST | `…/subscription/checkout` | startCheckout |
| POST | `…/subscription/cancel` | cancelSubscription |

### Settings

| Method | Path | Operation |
|---|---|---|
| GET | `…/tax-categories` | listTaxCategories |
| POST | `…/tax-categories` | createTaxCategory |
| PUT | `…/tax-categories/{id}` | saveTaxCategory |
| DELETE | `…/tax-categories/{id}` | removeTaxCategory |
| GET | `…/expense-categories` | listExpenseCategories |
| POST | `…/expense-categories` | createExpenseCategory |
| PUT | `…/expense-categories/{id}` | saveExpenseCategory |
| DELETE | `…/expense-categories/{id}` | removeExpenseCategory |
| GET | `…/payment-accounts` | listPaymentAccounts |
| POST | `…/payment-accounts` | createPaymentAccount |
| PUT | `…/payment-accounts/{id}` | savePaymentAccount |
| DELETE | `…/payment-accounts/{id}` | removePaymentAccount |
| GET | `…/exchange-rates` | listExchangeRates |
| POST | `…/exchange-rates` | createExchangeRate |
| PUT | `…/exchange-rates/{id}` | saveExchangeRate |
| DELETE | `…/exchange-rates/{id}` | removeExchangeRate |
| GET | `…/transporters` | listTransporters |
| POST | `…/transporters` | createTransporter |
| PUT | `…/transporters/{id}` | saveTransporter |
| DELETE | `…/transporters/{id}` | removeTransporter |
| POST | `…/exchange-rates/refresh` | refreshExchangeRates |
| GET | `…/numbering-series` | listNumberingSeries |
| PUT | `…/numbering-series/{id}` | saveNumberingSeries |
| GET | `…/numbering-series/{id}/preview` | previewNextNumber |

### Compliance

| Method | Path | Operation |
|---|---|---|
| GET | `…/compliance-settings` | getComplianceSettings |
| PUT | `…/compliance-settings` | saveComplianceSettings |
| PUT | `…/compliance-settings/credentials` | saveComplianceCredentials |
| POST | `…/compliance-settings/test-connection` | testComplianceConnection |
| GET | `…/documents/{id}/e-invoice` | getEInvoice |
| POST | `…/documents/{id}/e-invoice` | generateEInvoice |
| POST | `…/documents/{id}/e-invoice/cancel` | cancelEInvoice |
| GET | `…/eway-bills` | listEwayBills |
| POST | `…/eway-bills` | generateEwayBill |
| GET | `…/eway-bills/{id}` | getEwayBill |
| GET | `…/eway-bills/{id}/pdf` | getEwayBillPdf |
| POST | `…/eway-bills/{id}/part-b` | updateEwayBillPartB |
| POST | `…/eway-bills/{id}/extend` | extendEwayBill |
| POST | `…/eway-bills/{id}/cancel` | cancelEwayBill |

### Parties

| Method | Path | Operation |
|---|---|---|
| GET | `…/parties` | listParties |
| POST | `…/parties` | createParty |
| GET | `…/parties/{id}` | getParty |
| PUT | `…/parties/{id}` | saveParty |
| DELETE | `…/parties/{id}` | removeParty |
| GET | `…/parties/{id}/statement` | getPartyStatement |

### Catalog

| Method | Path | Operation |
|---|---|---|
| GET | `…/items` | listItems |
| POST | `…/items` | createItem |
| GET | `…/items/{id}` | getItem |
| PUT | `…/items/{id}` | saveItem |
| DELETE | `…/items/{id}` | removeItem |
| PUT | `…/items/{id}/image` | uploadItemImage |

### Documents

| Method | Path | Operation |
|---|---|---|
| GET | `…/documents` | listDocuments |
| POST | `…/documents` | createDocument |
| POST | `…/documents/calculate` | calculateDocument |
| GET | `…/documents/{id}` | getDocument |
| PATCH | `…/documents/{id}` | updateDocument |
| DELETE | `…/documents/{id}` | removeDocument |
| POST | `…/documents/{id}/finalize` | finalizeDocument |
| POST | `…/documents/{id}/status` | setDocumentStatus |
| POST | `…/documents/{id}/convert` | convertDocument |
| POST | `…/documents/{id}/duplicate` | duplicateDocument |
| GET | `…/documents/{id}/pdf` | getDocumentPdf |
| POST | `…/documents/{id}/share-link` | createShareLink |
| POST | `…/documents/{id}/send` | sendDocument |
| POST | `…/documents/{id}/payment-link` | createPaymentLink |

### Payments

| Method | Path | Operation |
|---|---|---|
| GET | `…/payments` | listPayments |
| POST | `…/payments` | createPayment |
| GET | `…/payments/{id}` | getPayment |
| PUT | `…/payments/{id}` | savePayment |
| DELETE | `…/payments/{id}` | removePayment |
| GET | `…/payments/{id}/receipt` | getPaymentReceiptPdf |

### Expenses

| Method | Path | Operation |
|---|---|---|
| GET | `…/expenses` | listExpenses |
| POST | `…/expenses` | createExpense |
| GET | `…/expenses/{id}` | getExpense |
| PUT | `…/expenses/{id}` | saveExpense |
| DELETE | `…/expenses/{id}` | removeExpense |

### Inventory

| Method | Path | Operation |
|---|---|---|
| GET | `…/stock/levels` | getStockLevels |
| GET | `…/stock/movements` | listStockMovements |
| POST | `…/stock/adjustments` | adjustStock |
| POST | `…/stock/transfers` | transferStock |

### Attachments

| Method | Path | Operation |
|---|---|---|
| GET | `…/attachments` | listAttachments |
| POST | `…/attachments` | createAttachmentUpload |
| POST | `…/attachments/{id}/complete` | completeAttachmentUpload |
| GET | `…/attachments/{id}` | getAttachment |
| DELETE | `…/attachments/{id}` | removeAttachment |

### OCR

| Method | Path | Operation |
|---|---|---|
| POST | `…/ocr/extractions` | createOcrExtraction |
| GET | `…/ocr/extractions/{id}` | getOcrExtraction |

### Ledger

| Method | Path | Operation |
|---|---|---|
| GET | `…/receivables` | getReceivables |
| GET | `…/payables` | getPayables |
| POST | `…/receivables/reminders` | sendPaymentReminder |

### Reports

| Method | Path | Operation |
|---|---|---|
| GET | `…/reports/{reportKey}` | getReport |

### GST

| Method | Path | Operation |
|---|---|---|
| GET | `…/gst/gstr1` | getGstr1 |
| GET | `…/gst/gstr1/export` | exportGstr1 |

### Dashboard

| Method | Path | Operation |
|---|---|---|
| GET | `…/dashboard` | getDashboard |

### Search

| Method | Path | Operation |
|---|---|---|
| GET | `…/search` | search |

### Notifications

| Method | Path | Operation |
|---|---|---|
| GET | `…/notifications` | listNotifications |
| DELETE | `…/notifications` | clearNotifications |
| POST | `…/notifications/{id}/read` | markNotificationRead |
| POST | `…/notifications/read-all` | markAllNotificationsRead |

### Audit

| Method | Path | Operation |
|---|---|---|
| GET | `…/audit-events` | listAuditEvents |

### Integrations

| Method | Path | Operation |
|---|---|---|
| GET | `…/integrations` | listIntegrations |
| POST | `…/integrations/{integrationId}/connect` | connectIntegration |
| POST | `…/integrations/{integrationId}/disconnect` | disconnectIntegration |

### Exports

| Method | Path | Operation |
|---|---|---|
| GET | `…/exports` | listExports |
| POST | `…/exports` | createExport |
| GET | `…/exports/{id}` | getExport |
| GET | `…/backup-settings` | getBackupSettings |
| PUT | `…/backup-settings` | saveBackupSettings |

### Sync

| Method | Path | Operation |
|---|---|---|
| POST | `/sync/push` | syncPush |
| GET | `/sync/pull` | syncPull |

### Reference

| Method | Path | Operation |
|---|---|---|
| GET | `/reference/countries` | listCountries |
| GET | `/reference/states` | listStates |
| GET | `/reference/cities` | searchCities |
| GET | `/reference/pincodes/{pincode}` | lookupPincode |
| GET | `/reference/distance` | getRoadDistance |
| GET | `/reference/currencies` | listCurrencies |
| GET | `/reference/hsn` | searchHsn |
| GET | `/reference/gstin/{gstin}` | lookupGstin |

### Inbound webhooks

| Path | Source | Effect |
|---|---|---|
| `POST /webhooks/razorpay` | Razorpay | `payment_link.paid` records a payment and allocates it to the document; subscription events update `Company.plan` |
| `POST /webhooks/whatsapp` | WhatsApp provider | Delivery and read receipts for sent documents and reminders |
