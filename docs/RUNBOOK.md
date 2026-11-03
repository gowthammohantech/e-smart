# Runbook

What to do when something goes wrong in production, and the routine checks that keep it from going wrong.

## Services on Railway

| Service | What it runs | Health check |
|---|---|---|
| `api` | The API. Migrations run in its `preDeploy`. Runs background jobs too while `WORKER` is unset or `inline`. | `/health` (database) |
| `worker` | The same build with `WORKER=only`: background jobs, no API. | `/health`, and the API's `/health/worker` |
| `web`, `admin` | Static servers (`tools/static-server.mjs`) | `/health` |
| `site` | The marketing and legal pages | `/` |

### Moving jobs to the worker

1. Copy the API's variables to the `worker` service. Railway's Shared Variables is the simplest way.
2. Deploy, and check that `worker` is healthy.
3. Set `WORKER=off` on `api`.

Both running jobs at once is safe: jobs are claimed with `SKIP LOCKED`, and scheduled periods are queued once (`job_schedule_runs`).

## Background jobs

They live in the `jobs` table; the code is in `apps/api/src/jobs/` and the schedule in `registry.ts`. Times are IST.

| Job | When | Notes |
|---|---|---|
| `einvoice.reconcile` | every 5 min | Settles IRNs whose portal answer was lost |
| `compliance.recover` | every 5 min | Settles e-way bill generates and IRN cancels whose answer was lost (`compliance_attempts`) |
| `idempotency.purge`, `backups.due` | hourly | Automatic backups for companies that turned them on |
| `expenses.recur` | 00:10 | Recurring expenses |
| `db.backup` | 02:00 | Only with `DB_BACKUP_ENABLED=true`; see below |
| `jobs.prune` | 03:30 | Removes finished jobs after 14 days and dead ones after 90 |
| `exports.expire` | 04:00 | Deletes export files past their keep-until date |
| `accounts.purge` | 04:30 | Erases closed accounts after 8 years. Only logs while `PURGE_DRY_RUN=true` (the default). |
| `invoices.overdue` | 09:30 | Tells each team once about invoices that fell overdue in the past week |

**Is it keeping up?** Check `GET /health/worker`. It answers 503 when the oldest due job has waited more than 15 minutes; alert on that. `deadLastDay` counts jobs that gave up after their last try.

**A dead job:**
- `select kind, last_error, attempts from jobs where status = 'dead' order by finished_at desc limit 20`
- To run one again: `update jobs set status = 'queued', attempts = 0, run_at = now() where id = '…'`

## Backups and restore

There are two copies:
1. **Railway's own Postgres backups**, with point-in-time recovery. Turn them on in the database service's Backups tab, daily, and keep at least 7.
2. **The nightly `db.backup` job.** A `pg_dump` custom-format file goes to object storage under `db-backups/YYYY-MM-DD.dump`, kept 30 days. Before setting `DB_BACKUP_ENABLED=true`:
   - The worker image needs a `pg_dump` **at least as new as the server**. Debian's default `postgresql-client` is older than Railway's Postgres 16 or later, and an older `pg_dump` refuses a newer server. Install the matching `postgresql-client-16`/`-17` from the PGDG repository (RAILPACK_DEPLOY_APT_PACKAGES alone won't do), then confirm one dump appears.
   - A separate bucket, with credentials the API can't use to delete, is safer than the same bucket. Until then the dumps share the uploads bucket.

### Restoring to a point in time
- Use Railway, in the database's Backups tab: restore it into a **new** database, check it, then point `DATABASE_URL` at it.
- Never restore over the live database.

### Restoring a dump into staging
```bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "$STAGING_DATABASE_URL" 2026-11-03.dump
```

### The restore drill (quarterly)
1. Restore last night's dump into staging.
2. Sign in as the demo account, and open an invoice and a report.
3. Write the date, how long the restore took, and anything that broke in the log below.

| Date | Restored from | Took | Result |
|---|---|---|---|
| | | | |

## Deploys and migrations

- Migrations are forward-only. **Expand, then contract:** a release only adds tables, columns and nullable fields. Removing one is a later release, after nothing reads it.
- A migration that drops, renames or retypes something fails `npm run check:migrations` unless its statement is marked `-- contract: <what stopped using it, which release>`.
- Rolling back a bad deploy means redeploying the previous build in Railway. That's safe because the database only gained things.
- If a migration itself is wrong, fix it forward with a new migration. Restore only for data loss.

## Secrets rotation

Rotate a secret at once if it may have leaked, and every 12 months otherwise.

| Secret | How | What it breaks |
|---|---|---|
| `JWT_SECRET` | Set a new 32+ character value and redeploy `api` and `worker` | Access tokens die within 15 min; the apps refresh on their own. Refresh tokens are unaffected. |
| `CREDENTIALS_KEY` | **Not yet rotatable.** It encrypts stored portal logins and operators' authenticator secrets. Rotating needs a re-encryption script (old key, then new key). Until one exists, a leak means: new key, then every business re-enters its portal logins, and every operator resets MFA (`db:platform-admin -- --reset-mfa`). | Portal logins, operator MFA |
| Webhook secrets | Change in Razorpay or Meta, then in Railway, within minutes of each other | Webhooks fail signature checks in between; Razorpay retries |
| Vendor keys (MSG91, email, GSP, Razorpay, Expo, Anthropic) | New key at the vendor, set in Railway, redeploy, revoke the old key | Nothing, if done in that order |

## When the API won't start

- **"Refusing to start in production: …"** The config check lists exactly what's wrong (`apps/api/src/config.ts`, `productionProblems`). Fix those variables.
- **Healthcheck timeout after deploy.** Look at the `preDeploy` logs. A failed migration stops the deploy, and the old build keeps running.
- **Database connections refused.** Check the Railway Postgres service and that `DATABASE_URL` still matches it.

## Web and admin security headers

Both start with `CSP_REPORT_ONLY=true`. To switch to enforcing:
1. Open the deployed web app with the browser console open.
2. Sign in, open an invoice, print it, upload an attachment and a logo, export a CSV.
3. Check that no `Content-Security-Policy` reports appear.
4. Set `CSP_REPORT_ONLY=false` on `web` and `admin`.

If uploads are blocked, `STORAGE_ORIGIN` on `web` is missing or wrong.

## Closed-account purge

`PURGE_DRY_RUN` stays `true` until a dry run looks right. The first real purges fall due in 2034, eight years after the first account deletion, so there is time.
1. On staging, delete a test account.
2. Set its `purge_after` in the past.
3. Read the job's "would erase" log.

## Load test baseline

Run `tools/load/api.js` against staging (k6; see the header of the file) after any change to sync, documents or PDFs. Record results here.

| Date | Build | pull p95 | push p95 | finalize p95 | pdf p95 | Errors |
|---|---|---|---|---|---|---|
| | | | | | | |
