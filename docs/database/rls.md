# Row-level security

Each business's data is separated twice:

- **In the API:** every query filters by `company_id`, and the guards check membership.
- **In Postgres:** row-level security (RLS). If a query forgets its filter, the request role still sees and writes only the businesses of the current request. With no request scope set, it sees no business at all.

RLS covers 64 tables: every table with company data. That is the 52 tables with a `company_id` column, `companies` itself (by `id`), and 11 child tables that follow their parent row. Account and user tables, the job queue, platform records and reference data are global and stay outside RLS. Branch limits are enforced in the API only.

## Roles

| Role | URL | RLS | Used by |
|---|---|---|---|
| Owner (Railway's `postgres`, local `esmart`) | `MIGRATION_DATABASE_URL` | bypassed | Migrations, `db:roles`, `db:seed`, `db:platform-admin`, and the tests' own fixtures |
| `esmart_app` | `DATABASE_URL` | **applies** | Every API request |
| `esmart_system` (BYPASSRLS) | `SYSTEM_DATABASE_URL` | bypassed | Background jobs, webhooks, the platform console, sign-in and sign-up, invites, share-link lookup, GSTIN and PIN code lookups, the demo seed, `pg_dump` backups |

Neither app role owns a table or can change the schema, and neither has TRUNCATE.

`npm run db:roles -w @esmart/db` (`packages/db/src/roles.ts`) creates the two app roles and grants them access. It is idempotent and runs after every migrate (Railway `preDeploy`, docker-compose, CI and the test setup).

- Passwords come from `APP_DB_PASSWORD` and `SYSTEM_DB_PASSWORD`. On a local database, a role's password is its own name.
- Run it again after restoring a dump: restores use `--no-privileges`, which leaves the grants out.

## How a request's businesses reach Postgres

1. `apps/api/src/openapi/routes.ts` (`databaseFor`) picks the database for each operation:
   - A route with `{companyId}` runs on `esmart_app`, scoped to that business.
   - Any other signed-in route runs on `esmart_app`, scoped to the businesses the caller belongs to.
   - Public, platform (`/admin`) and webhook routes, and the operations in `SYSTEM_OPERATIONS` (`createCompany`), run on the system database.
2. The scope is held in AsyncLocalStorage (`apps/api/src/lib/dbScope.ts`, `withCompanies`).
3. The request pool is a `ScopedPool` (`packages/db/src/index.ts`). On every connection checkout it runs `set_config('app.company_ids', '{…}', false)` with the current scope, or `'{}'` when there is none.
   - It runs on every checkout, so a connection never keeps the businesses of whoever used it last.
   - The value is cached per connection, so an unchanged scope costs no extra round trip.
4. Each policy calls `app_company_ids()`, which reads that setting (migration 0061).

Requests are not wrapped in one long transaction. That would hold a connection through PDF, OCR and AI calls, could deadlock nested `server.inject` calls, and would hold back the sync cursor.

## Adding a table

- **It holds a business's data:** give it a `company_id`, or a foreign key to a parent that has one. In the same migration, add:
  ```sql
  ALTER TABLE "x" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "x" FORCE ROW LEVEL SECURITY;
  CREATE POLICY "tenant" ON "x" FOR ALL
    USING ("company_id" = ANY (app_company_ids()))
    WITH CHECK ("company_id" = ANY (app_company_ids()));
  ```
  For a child table, use `EXISTS (SELECT 1 FROM "parent" p WHERE p."id" = "x"."parent_id")`. Index the column the policy reads.
- **It is global:** add it to `GLOBAL` in `apps/api/test/rls.test.ts`.

Either way, `rls.test.ts` fails until the table is one or the other.

## When the system database is allowed

Use `deps.systemDb`, or `asSystem(deps)`, only for work that has to span businesses or happens before a business is known. Examples: a lookup by a token or a gateway id, a scheduled job that sweeps every business, or the platform console.

Once that lookup has found the business, run the rest on `deps.db` inside `withCompanies([companyId], …)`. The share pages work this way.

If you find a cross-business read failing under RLS, route that one path to the system database. Never loosen a policy.

## Turning it on in a deployment

The policies exist as soon as 0061 is applied. Until `DATABASE_URL` points at `esmart_app`, they are bypassed, because the owner is a superuser.

1. Deploy. `preDeploy` runs migrate, then `db:roles`, which creates the roles.
2. Set the variables on both the api and worker services:
   - `APP_DB_PASSWORD` and `SYSTEM_DB_PASSWORD`, then redeploy so `db:roles` sets the passwords.
   - `MIGRATION_DATABASE_URL`: the current owner URL.
   - `SYSTEM_DATABASE_URL`: the same URL as `esmart_system`.
   - `DATABASE_URL`: the same URL as `esmart_app`.
   - `RLS_ENFORCE=true`: the API then refuses to start if `DATABASE_URL` skips RLS.
3. Watch the logs for `violates row-level security policy`, and for screens that come up empty.
4. **Rollback:** point `DATABASE_URL` back at the owner. No code or migration change is needed.
