# Elixir Books Smart Migrator

A desktop tool (Tauri) that brings a business's existing data into Elixir Books Smart.

**Sources today:** an Excel or CSV file, from any software. Elixir Books is shown as "Coming soon".

**What it imports:**

| Group | Kind | How it is saved |
|---|---|---|
| Masters | Customers & suppliers | Server import, checked first (dry run) |
| Masters | Items & services (with opening stock) | Server import, checked first. Opening stock is counted as of a date the person picks |
| Opening balances | Outstanding invoices & bills | Server import under their original numbers and due dates, checked first |
| Opening balances | Journal entries | Server import, checked first. Posted or as drafts |
| Transactions | Sales invoices, Purchase invoices | One document per number, saved as drafts (or issued, if chosen) |
| Transactions | Payments & receipts | Recorded on account, to be matched to invoices in Elixir Books |
| Transactions | Expenses | By category; a category that does not exist is added |

## Flow

1. Pick where the data comes from (`src/lib/sources.ts`).
2. "Do you already have an account?" Sign in, or sign up and set up a business.
3. Choose the business to import into.
4. Tick what to bring over and download one template, or choose any Excel / CSV. Columns are matched automatically and can be fixed by hand.
5. Review: rows we could not read are listed. The server checks the rest before anything is saved.
6. Import, in dependency order (contacts, items, opening balances, journals, sales, purchases, payments, expenses). Rows left out are downloadable with the reason beside each.

## How it is built

- `src/lib/kit.ts` the shapes every kind of data shares. `entities.ts` (contacts, items and the registry) and `transactions.ts` (the rest) define each kind once: its fields, its template sheet, how rows are read, and how they are sent. The template, the column matching, the review and the report all come from that one definition.
- Reading rows reuses `packages/core`, so the Migrator and the app agree on every rule.
- Contacts, items, opening balances and journals go through the API's import endpoints. Documents, payments and expenses go through the ordinary create endpoints, a few at a time. A check ("dry run") for those resolves every contact, item and account without saving.
- A re-run does not duplicate. The server refuses duplicates it can see; for the rest (`src/lib/ledger.ts`) this computer remembers what it imported.

## Run it

```
npm run migrator          # the UI in a browser at http://localhost:5175 (API at http://localhost:4000)
npm run migrator:app      # the desktop window (needs Rust)
npm run migrator:build    # a build (needs Rust)
```

The server a build talks to: the live API (`https://api-production-4abd.up.railway.app`) unless `VITE_API_URL` is set when building, and `http://localhost:4000` in `npm run migrator` (development), so trying things out never reaches live data. Anyone can change it on the first screen ("Change server"), with or without `/v1`; that choice is kept on their computer and wins over the default. If the live address ever changes, new builds carry the new default and people with a saved one change it there. The API must list the desktop app's origin in `CORS_ORIGINS` (on Windows `http://tauri.localhost`).

Building needs Rust. On Windows that means the "Desktop development with C++" build tools, or the GNU toolchain with MinGW. A GNU build puts `WebView2Loader.dll` next to the `.exe`: keep them together. The `Migrator installers` workflow builds Windows and macOS installers with no local setup.

## Demo tools

For demos and testing there is "Load sample data" and "Load sample with mistakes" on the *Bring in your data* screen: made-up records for every kind of data, read through the same code as a real file, so nothing has to be prepared in Excel. They are **hidden from ordinary users**: press **Ctrl+Shift+D** to show or hide them (it is remembered), or build with `VITE_DEMO_TOOLS=1` to start with them on (they are on in `npm run migrator`). Each load is a fresh set tagged "(Demo XYZ)", so it can be loaded again into the same business and is easy to find and delete. The review screen says it is sample data. The sample is in `src/lib/demo.ts`.

## Tests

```
npm test -w @esmart/migrator                                    # reading templates and other people's sheets
E2E_API=http://localhost:4000 DATABASE_URL=postgres://… \
  npx vitest run e2e                                            # every kind of data against a live local server
```

The end-to-end run signs up a throwaway account on that server. `DATABASE_URL` (a local database only) lifts its business off the Free plan so purchases, payments out, expenses and books can be tried.

## Adding a platform

Add an entry to `src/lib/sources.ts`, write an adapter that produces the same records the Excel path does, and flip its status to `available`. The review, check and import steps are shared.

## Adding something to import

Add an entity (see `transactions.ts`): fields, template sheet, how to read rows, how to send them. Register it in `ENTITIES` in `entities.ts`.

## Not yet

Undo of an import; mapping profiles saved for reuse; credit and debit notes, quotes and orders; keychain storage of the sign-in; code signing; Mac testing.
