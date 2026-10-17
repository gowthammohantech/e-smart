# Why Elixir Books Smart is not ready to ship — by app

_Audit date: 13 Oct 2026, branch `claude/monorepo` @ `31ffef3`. Read-only review, one agent per app. Items marked *(inferred)* were not reproduced._

## Summary

| App | Verdict | Typecheck | Lint | Tests |
|---|---|---|---|---|
| `apps/api` | ❌ Not ready | ✅ | ✅ | ⚠️ 232 DB tests not run locally (no Postgres); 47/47 non-DB tests pass |
| `apps/mobile` | ❌ Not ready | ✅ | ✅ | ❌ No tests in the app; shared packages pass |
| `apps/web` | ❌ Not ready | ✅ | ✅ | ❌ No tests in the app; no e2e tests |
| `apps/admin` | ❌ Not ready | ✅ | ✅ | ✅ 6/6 (only auth + dialog covered) |

All four apps build and pass their static checks. They are blocked by missing infrastructure, a few real bugs, security gaps, and app-store policy problems.

## Shared across apps (fix once)

1. **No vendor providers are provisioned.** Every item in `docs/PRODUCTION_READINESS.md` §2 is Todo: SMS (MSG91), email, WhatsApp, push, storage, PDF, GSP, Razorpay, FX and the assistant. With `NODE_ENV=production` the API refuses to boot until all of them are set (`apps/api/src/config.ts:94-138`), which leaves every client app without a backend.
2. **Production `APP_URL` is `http://localhost:8081`** (`.railway/railway.ts:28-29`), so password-reset and invite emails link to localhost.
3. **The rate limiter can be bypassed and sign-in has no lockout.**
   - The limiter key is `authorization?.slice(-24) ?? req.ip` (`apps/api/src/app.ts:65-66`). A random `Authorization` header on each request gets a fresh bucket.
   - `trustProxy: true` lets clients spoof their IP through `X-Forwarded-For`.
   - Sign-in has no per-account lockout (`auth/handlers.ts:85-93`).
   - Together these allow unlimited brute force on tenant users and superadmins.
4. **Missing public pages.** `/share/:token`, `/pay/:id` and the OAuth callbacks for Google Drive and Razorpay don't exist. Invoice share links customers receive will 404.
5. **No observability anywhere.** None of the apps has Sentry or other error tracking, tracing or alerting. The client apps also have no React error boundary.
6. **Clients silently fall back to `http://localhost:4000`** when the API URL env var is missing at build time (`packages/app/remote/config.ts:17`, `apps/admin/src/lib/api.ts:7`).
7. **Legal and compliance work isn't done.** The privacy, terms and support links are `example.com` placeholders (`packages/app/screens/(app)/settings/about.tsx:44-46`). DPDP consent, data retention, data export and data deletion are not built. No security review has been done (`PRODUCTION_READINESS.md` §8).
8. **Ops work isn't done.** Backups with point-in-time recovery, a restore drill, a migration rollback plan, a staging environment, load tests and e2e tests are all Todo. The production API URL is a generated Railway domain hardcoded in `.railway/railway.ts`.

---

## 1. `apps/api`

### Blockers
- **The GSP compliance adapter is only a skeleton** (`providers/compliance.ts:182-205`). Its paths aren't mapped to a vendor, it doesn't cache tokens, and it doesn't handle duplicate-IRN (2150) or fetch-before-resubmit. Production forbids the simulator, so e-invoice and e-way bill can't work.
- **Sync can miss changes.** `/sync/pull` pages by `change_log.seq > since`, but `seq` is a bigserial assigned inside concurrent transactions (`modules/sync/handlers.ts:196-203`, `lib/audit.ts:43`). A change that commits after a higher `seq` is skipped forever by any device whose cursor is already past it. *(Found by reading the code; not reproduced.)*
- **Shared links are dead.** `${PUBLIC_BASE_URL}/share/:token` has no route (`modules/documents/outbound.ts:68`).
- The provider and boot problems listed under "Shared" items 1–2.

### High
- The rate-limit bypass, IP spoofing and missing lockout from "Shared" item 3.
- **Scheduled jobs never run.** `materializeRecurringExpenses` (`modules/expenses/engine.ts:100`) is never called. The only scheduled job is the idempotency purge (`src/server.ts:14`), so recurring expenses, automatic backups and reminders never happen.
- **The `/pay/:id` route and the OAuth callbacks don't exist**, so the Google Drive and Razorpay connect flows can never finish (`modules/integrations/handlers.ts:28,35`).
- **No error tracking.** There is no Sentry or OpenTelemetry, and no `unhandledRejection`/`uncaughtException` handlers. Logs go to stdout only.
- **Migrations are forward-only.** They run automatically in `preDeploy`, with no backup or rollback plan.
- **`npm audit` reports 1 high and 7 moderate** vulnerabilities in production dependencies (source-map-js, uuid via exceljs).

### Medium
- **State is kept in process memory.**
  - The rate limiter uses an in-memory store, so limits are per instance and there are no per-route limits.
  - The Lixi limiter `Map` is never evicted (`lixi/handlers.ts:51-60`).
  - The `Outbox` array is unbounded (`providers/messaging.ts:9`).
- **Razorpay has two problems.** Its `fetch` calls have no timeout. Plan IDs are cached in memory, so each restart creates duplicate plans (`providers/payments.ts:100-119`).
- **Sign-in timing reveals which emails exist**, because argon2 is skipped for unknown emails (`auth/handlers.ts:87`). `forgotPassword` has no per-email throttle.
- **Exports and OCR run inside the request** with no job queue, so large exports can time out.
- **No real GSTIN or OCR adapters exist.** Both features will return 503 in production.
- **PDF rendering will likely fail on deploy.** Production requires `PDF_PROVIDER=chromium`, but nothing installs Chromium in the Railpack image. *(inferred)*
- **Config validation is weak.** `CREDENTIALS_KEY` length isn't checked, localhost values for `APP_URL`/`PUBLIC_BASE_URL`/`DATABASE_URL` aren't rejected, and S3 credentials aren't validated.
- **`syncPush` dedup has a race.** It checks then inserts outside a transaction, so two concurrent pushes can both replay the same entry (`sync/handlers.ts:86-150`).
- **No coverage reporting**, no e2e tests and no load tests.

### Low
- `rewriteIds` replaces offline IDs that appear inside free-text fields.
- Webhook deliveries with an invalid signature are stored with no size cap or retention limit.
- Upload completion trusts the MIME type the client declares.
- `/health` checks only the database.
- `preDeploy` runs migrations through `tsx`, which is a devDependency.

**Verified as solid:** tenant isolation, argon2id passwords, refresh-token rotation with reuse detection, OTP limits, HMAC verification on webhooks, production rejection of insecure dev settings, and request validation driven by the contract.

---

## 2. `apps/mobile` (iOS / Android)

### Blockers
- **No in-app account deletion.** Apple 5.1.1(v) and Google Play both require it.
- **Subscriptions are sold through external Razorpay checkout** (`packages/app/remote/install.ts:47-52`). Apple 3.1.1 expects in-app purchase for this, so iOS rejection is likely. Errors are also swallowed, and `settings/plan.tsx:37-44` shows "switched" before any payment happens.
- **No `eas.json`.** There are no build profiles, no per-environment API URL, no build-number auto-increment and no submit config.
- **A release build would point at localhost**, because there is no `.env` and the code falls back to localhost.
- The placeholder legal links and the backend not starting (no providers, so OTP can't be sent). See "Shared".

### High: data loss risks
- **Sign-out deletes unsynced changes.** `clearLocal()` resets `syncQueue` (`remote/session.ts:68-76`), yet the confirm dialog promises those changes stay on the device.
- **Any failed token refresh wipes the outbox.** A 5xx or 429 from `/auth/refresh` signs the user out and runs `clearLocal` (`api-client/src/index.ts:72-75`).
- **"Send yours again" can never resolve a conflict.** The retry reuses the old `baseVersion` and so conflicts again every time (`remote/retry.ts:5-8`). There is no diff or merge UI.
- **Pull overwrites local rows that still have pending edits** (`remote/apply.ts:84-110`).

### High: other
- **No crash reporting and no error boundary.**
- **The whole store is persisted as a single AsyncStorage key.** It is re-serialised on every `setState`. *(inferred)* Large books may exceed Android's roughly 2 MB per-row read limit and break rehydration.
- **Unused permissions will draw review questions.** `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW` and a generic microphone string come from the default `expo-camera` config.
- **No push notification client.** `expo-notifications` isn't installed and the app never registers a push token.

### Medium
- **The iOS privacy manifest declares no collected data**, and the App Store privacy labels and Play data-safety form are not done.
- **Financial data is stored unencrypted in AsyncStorage** with `android:allowBackup="true"`.
- **Android release signing can fall back to the debug key**, and the keystore password is weak.
- **Version numbers disagree.**
  - The About screen shows "1.0.0 (1)".
  - `app.json` says 1.0.1 with `versionCode` 2.
  - The iOS project says 1.0 (1).
- **The root config conflicts with the app's bundle ID.** The root `app.json` and the untracked `ios/esmart.xcodeproj` use bundle ID `com.gowtham.mohan.e-smart`, while the app uses `com.elixir.bookssmart`.
- **Barcode scanning by camera isn't built.** The screen only accepts a typed code, yet it says "point camera".
- **Reports and the dashboard are computed on the device** rather than the server, so the numbers aren't authoritative.
- **The expenses list isn't virtualised.**
- **Possible sign-in flash on launch.** The app forces `hydrated=true` after 400 ms. *(inferred)*
- **The OTP screen can dead-end** when `requestId` is null.
- **Phone handling is India-only.**
- **Google sign-in is not built.**
- **CI never builds iOS or Android.**

### Low
- About 14 hardcoded English strings. Apart from these, the Tamil catalogue is complete.
- `.catch(() => {})` swallows errors silently.
- Dev-client `Info.plist` entries are still present, and `ITSAppUsesNonExemptEncryption` is unset.
- iPad support adds review work: iPad screenshots and layout QA.
- The UUID fallback uses `Math.random`.
- Sync lists are cut off at 4,000 rows without warning.

---

## 3. `apps/web`

### Blockers
- **No error boundary.** A single render exception blanks the whole app.
- **No tests.** There is no `test` script and no e2e tests. CI only runs `expo export`.
- **Emailed links point to localhost**, so `/reset-password` and `/accept-invite` can't be reached from them ("Shared" item 2).
- **No working backend** until the providers are provisioned.

### High
- **Tokens, including the refresh token, are stored in `localStorage`** (`packages/app/remote/tokens.ts:18-30`).
- **No CSP and no other security headers.** `apps/web/serve.mjs` sets none of CSP, frame-ancestors, HSTS, Referrer-Policy or nosniff, and doesn't compress responses.
- **The whole synced store goes into one localStorage key** (`ebs.remote.v1`). *(inferred)* It will hit the roughly 5 MB limit for larger companies and fail to save.
- **No coordination between tabs.** *(inferred)* Two tabs can overwrite each other's `syncQueue`, and signing out doesn't propagate to other tabs.
- **Share links, `/pay/:id` and the OAuth callback pages are missing.**
- **OCR is shipped but doesn't work.** The browser path returns null, and server-side OCR is disabled in production.
- **The legal links are placeholders**, and there is no DPDP flow.
- **No error tracking.**

### Medium
- **CSV export uses `navigator.share`.** *(inferred)* It fails on desktop Firefox and similar browsers.
- PDF export only opens the print dialog.
- Barcode scanning has no camera input.
- There is no `+not-found` route.
- Reports are computed in the browser.
- Scrollbars are hidden globally, which hurts mouse users.
- About 33 hardcoded English strings in the desktop screens skip i18n.
- **The JS bundle is one 4.5 MB file** with no code splitting and no compression, so first load is slow on mobile networks.
- Google sign-in has no web flow.

### Low
- `<html lang>` is fixed to `en`.
- SEO and PWA support is minimal: no manifest, Open Graph tags or `robots.txt`.
- `body { overflow: hidden }` is set and there is no static rendering.
- There is no browserslist or stated browser-support target.
- Accessibility is only partly covered.
- **Demo-login env vars could be compiled into the public bundle.** They are `preserve()`d in the deploy config.

---

## 4. `apps/admin` (platform operator console)

The console's features are complete: role guards, superadmin-only writes, audit events written in the same transaction, confirmation dialogs that require a reason, and loading and error states. **Its security posture is the blocker.**

### Blockers
- **Operator passwords can be brute-forced.** This is the rate-limit bypass and missing lockout from "Shared" item 3. Operators have cross-tenant suspend, disable and plan powers.

### High
- **Operators have no MFA.** A superadmin session is password-only.
- **Operators may be able to sign in with SMS OTP alone**, because the guard checks only `platformRole`. *(inferred)*
- **Granting or revoking operator roles isn't audited.** It is a direct database update (`packages/db/src/platform-admin.ts:18-22`) that records no actor.
- **Operator reads and sign-ins aren't audited.** Viewing tenants' PII leaves no trail, which matters for DPDP.
- **The security review hasn't been done.**

### Medium
- **IP addresses in the audit log can be spoofed** (`trustProxy: true`). *(inferred)*
- **No CSP or frame-ancestors** on the `sirv-cli` server, and tokens are kept in sessionStorage.
- **The destructive flows have no tests**: suspend, reactivate, plan override, and enabling or disabling users.
- **The plan-override warning comes too late.** The warning that billing may revert the change appears only after the operator confirms.
- **Operator sessions last as long as tenant ones.** Refresh tokens last 30 days for both.

### Low
- Falls back to localhost when `VITE_API_URL` is missing.
- Demo credentials can be compiled into the bundle.
- No router `errorElement`.
- Error states have no retry button.
- Every action invalidates every cached query, not just the affected ones.
- Operators can't be managed in the UI; removing a compromised operator needs database access and the CLI script.
- The README promises "plans" but there's no plans page.

---

## Suggested order to unblock

1. Provision the vendors and fix `APP_URL` and the client API URLs, so the API boots and links work.
2. Fix the rate-limit key and `trustProxy`, add a sign-in lockout, and add MFA for operators.
3. Fix the ordering of the sync cursor and the client-side outbox loss on sign-out and refresh failure.
4. Add Sentry and error boundaries to all apps.
5. Mobile store requirements: account deletion, a decision on IAP vs. external payments, `eas.json`, privacy manifest and labels, real legal URLs.
6. Build the missing `/share`, `/pay` and OAuth callback pages.
7. Finish the GSP adapter, the job scheduler, backups and PITR, and e2e tests.
