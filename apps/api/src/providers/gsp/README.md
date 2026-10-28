# GSP gateway: e-invoice, e-way bill, GSTIN search

Adaequare and Whitebooks behind the `ComplianceProvider` and `GstinProvider`
interfaces. Ported from the Elixir Books platform's taxation service
(`elixir-books-smart/apps/platform/taxation/api`); the environment variable names
are the same, so the same values drop in.

It **files** documents. Tax calculation, applicability, validation and the
24-hour windows stay in `@esmart/core`; the handlers in `modules/compliance`
decide those before a gateway is called, and a portal refusal comes back as
`{ ok: false, errors }` with the NIC code in `errors[].code`, never as a throw.

```text
providers/gsp/
  provider-name.ts  which gateway, and which application pair a product reads
  transport.ts      fetch + timeouts, GspRequestError; no retry, on purpose
  envelope.ts       reading a GSP's envelope, NIC errors, IST dates
  common.ts         payloads (IRN, e-way bill, Part B, extension), failure mapping
  adaequare.ts      AdaequareGateway
  whitebooks.ts     WhitebooksGateway
  taxpayer.ts       the register's record -> GstinRecord
  index.ts          createGspGateway(config): one shared instance per config
```

## Switching it on, and switching provider

```bash
COMPLIANCE_PROVIDER=gsp      # e-invoice + e-way bill
GSTIN_PROVIDER=gsp           # GSTIN search
TAXATION_GSP_PROVIDER_CODE=WHITE_BOOKS_GSP   # or ADAEQUARE_GSP: the only line to change to switch GSP
```

Each provider keeps its own variables (`TAXATION_ADAEQUARE_*`,
`TAXATION_WHITEBOOKS_*`: base URL, application pairs, Whitebooks' account email
and IP), all set side by side, so nothing else moves when the code changes.
`apps/api/.env.example` lists them. The platform's un-prefixed `TAXATION_GSP_*`
names still work as a fallback for a value its provider-specific variable leaves
blank.

`COMPLIANCE_PROVIDER` and `GSTIN_PROVIDER` stay independent switches, but the
gateway behind both is the one `TAXATION_GSP_PROVIDER_CODE` names, so an e-way
bill by IRN is always raised under the session that registered the IRN.

## Two credentials per filing

| Account | Proves | Scope | Lives in |
| --- | --- | --- | --- |
| GSP application (`client_id`/`client_secret`) | we may use the pipe | the deployment | environment (`TAXATION_<PROVIDER>_*_APP_ID/_SECRET`) |
| Taxpayer's NIC portal login | which taxpayer this is filed against | one company, **per portal** | `compliance_credentials` (one row per company and portal), sealed with `CREDENTIALS_KEY` (saved through the app) |

The e-invoice (IRP) and e-way bill portals take separate logins, which need not match, so each is
stored on its own row (`portal` = `einvoice` | `ewaybill`) with its own username
(`compliance_settings.irp_username` / `ewb_username`). Every IRN call uses the e-invoice
login and every e-way bill call the e-way bill one; the credentials endpoint takes
`portal: einvoice | ewaybill | both`, and the screen's "same login for e-way bill" switch
sends `both`. Migration `0006` copied each existing login to the e-way bill portal so
nothing stopped working.

The application pair is ours and the business is never asked for it: the e-invoicing
settings screen takes the portal username and password only, and the credentials
endpoint ignores any `clientId`, `clientSecret` or `gspProvider` an older client
still sends (the provider recorded against the company is `TAXATION_GSP_PROVIDER_CODE`).

The reference platform kept the application pair encrypted in a `tax_providers`
table and cached the Adaequare token behind a row lease. Here the pair is
environment-only and the token is cached in memory with one in-flight exchange,
so there is no migration; behind a load balancer each instance mints its own
(one authenticate per instance per token lifetime).

## The two gateways

| | Adaequare (production-ready) | Whitebooks (**sandbox only**) |
| --- | --- | --- |
| Application token | one bearer per application, `POST /gsp/authenticate` | none: `client_id`/`client_secret` headers on every call |
| Taxpayer token | none: `user_name`/`password`/`gstin` headers per call | `GET /einvoice/authenticate`, one per GSTIN, kept with its `irp` |
| Application pairs | one, for everything | three: taxpayer lookup (bare), e-invoice, standalone e-way bill |
| Envelope | `{ success, message, result }` | `{ irp, status_cd, status_desc, data, info }` |
| Duplicate IRN (2150) | `irnbydocdetails` lookup, then adopt | adopt the registration the refusal carries in `info` |
| Extra settings | none | `TAXATION_WHITEBOOKS_ACCOUNT_EMAIL`, `TAXATION_WHITEBOOKS_IP_ADDRESS` |

`TAXATION_GSTIN_ALLOW_SANDBOX=true` is the one switch for NIC's sandbox, and it is the deployment's
own choice: nothing here looks at `NODE_ENV`, so a hosted staging deployment running with
`NODE_ENV=production` can use it. It admits the sandbox GSTIN shape (`29AAGCB1286Q000`) in
`isValidGstin` (`@esmart/core`), and it is what allows the sandbox-only settings. Without it the app
refuses to start with the Whitebooks gateway, `TAXATION_SANDBOX_BUYER_GSTIN` or
`TAXATION_GSP_AUTH_REQUIRED=false`. Leave it unset on a live deployment.

## What was confirmed, and what was not

Confirmed against the sandboxes by the reference service (and carried over
as-is): Whitebooks authenticate, IRN generate, IRN cancel, e-way bill by IRN,
GSTIN details, public search and standalone `canewb`; Adaequare generate and
`irnbydocdetails`.

**Not confirmed, and worth a sandbox run before anyone relies on them:**

- Adaequare's IRN and e-way bill **cancel** routes (inferred from NIC's schema).
- Everything the reference never did, added here because the app's e-way bill
  flow needs it: a bill raised **without an IRN** (`GENEWAYBILL`), **Part B**
  (`VEHEWB`) and **extension** (`EXTENDVALIDITY`), on both gateways. Routes are
  NIC's own action names in each gateway's standalone family. The bill record
  keeps only its main HSN and totals, so a direct bill's item list is one line
  summarising them.
- NIC's Part B and extension **reason codes differ from the app's** and are
  translated in `common.ts` (`PART_B_REASON_TO_NIC`, `EXTEND_REASON_TO_NIC`).
  Passing the app's code straight through files a wrong reason that the portal
  accepts. The translation is from NIC's published codes; confirm it.
- The register's record is passed on as received by the gateways; `taxpayer.ts`
  maps GSTN's public-search field names (`lgnm`, `tradeNam`, `pradr.addr`, …).
- Whitebooks' sandbox register knows four GSTINs; any other is searched as the
  first of them, so a sandbox lookup can answer for a different taxpayer.

PIN code lookup and the EWB portal's road distance have no route on either
gateway here, so with `GSTIN_PROVIDER=gsp` they answer 503 FEATURE_UNAVAILABLE
and the apps fall back to manual entry.

## Rules worth keeping

- **A cancellation counts only when the portal acknowledged one** (`CancelDate`
  present). A false success cannot be walked back.
- **NIC 9999 "invoice is not active" stays a refusal**, not a quiet success.
- **No retry.** A filing that timed out may already be registered. Recovery is
  the by-document lookup (Adaequare also tries it after a transport failure).
- **Codes, never wording**, decide behaviour (`hasErrorCode` is word-bounded).
- Reason codes: the IRN's `CnlRsn` is a string and its 2/3 are *data entry
  mistake / order cancelled*; the e-way bill's `cancelRsnCode` is a number and
  its 2/3 are the other way round. The app's two reason tables already follow
  that, so the codes go through untouched.
- Cess fields are sent at zero (NIC 2194) and blank strings are dropped from
  every payload.

## Tests

`gsp.test.ts` drives both gateways against a fake `GspTransport`: no network,
no database. Run it without the API suite's Postgres global setup:

```bash
npx vitest run --config <a config without globalSetup> src/providers/gsp
```
