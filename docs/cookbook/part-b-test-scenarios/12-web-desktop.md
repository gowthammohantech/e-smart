# 12 — Web desktop

Tests for the browser layout: the sidebar, the top bar, the command palette, desktop-only page layouts and the breakpoints. Setup and demo data are in [00 — Test setup](00-test-setup.md).

Run in Chrome, Safari and Firefox. "Desktop" means a window 768 px or wider.

### Layout & breakpoints

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| WEB-001 | Desktop shell | Owner / Pro | Width 1280 | Sign in | Sidebar: Home; Transactions (Sell, Buy, Stock); Compliance (GST); Manage (People, Reports). Top bar with search | happy |
| WEB-002 | Narrow window | | Width under 768 | Resize | Switches to the phone layout (bottom tab bar, wizard editor) | edge |
| WEB-003 | 768–1023 px | | Width 900 | Resize | Sidebar shows icons only; hovering shows fly-outs | edge |
| WEB-004 | Collapse the sidebar | | 1280 | Collapse → reload | Stays collapsed in this browser | edge |
| WEB-005 | Expand a section | | | Click Sell | Shows its pages (Invoices, Quotes, Orders, Deliveries, Returns, Receivables, Payments in) | happy |
| WEB-006 | Sales plan sidebar | Owner / Basic | Aurora | Look at the sidebar | No Buy or Stock; purchase pages absent | plan |
| WEB-007 | Business switcher | Owner | | Sidebar `CompanySwitcher` → Aurora | Books, numbering and sidebar switch to Aurora | happy |
| WEB-008 | Settings navigation | | | Open Settings | Settings side menu listing every settings screen | happy |
| WEB-009 | No horizontal scroll | | 768 and 1280 | Visit every page | No page-level horizontal scroll | edge |

### Top bar & command palette

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| WEB-010 | Open the palette | | | ⌘K (Mac) / Ctrl+K, or "/" outside a text field | Command palette opens with pages, quick actions and records | happy |
| WEB-011 | Jump to a record | | | Type "Kumar" → Enter | Opens Kumar Electronics | happy |
| WEB-012 | Quick action | | | Type "new invoice" → Enter | New invoice editor | happy |
| WEB-013 | "/" while typing | | Focus in a text field | Type "/" | Typed as a character; palette doesn't open | edge |
| WEB-014 | Status badges | | Offline / failed | Top bar | **Offline** and "N failed" badges | offline |
| WEB-015 | Ask Lixi panel | | | **Ask Lixi** | Right-hand panel; the page stays usable | happy |
| WEB-016 | Notifications | | | Bell | Notifications list; mark one or all as read | happy |
| WEB-017 | Account menu | | | Avatar | Profile, Plan, Appearance, All settings, Sign out | happy |

### Desktop page layouts

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| WEB-020 | Sortable tables | | | Invoices list → sort by date, amount, **Balance due** | Rows sort; the sort indicator shows | happy |
| WEB-021 | One-page editor | | | New invoice | All sections on one page; Ctrl/⌘+Enter finalises (with confirmation) | happy |
| WEB-022 | More as a card grid | | | Open More | Grid of cards grouped Money, Tools, Business setup, Data & compliance, Account | happy |
| WEB-023 | Desktop variants | Owner / Pro | | Open payment detail, e-way bill detail, plan, sync, transporters, item new/edit, stock adjust, transfer, opening stock, movements, scan | Each uses the wide two-column layout | happy |
| WEB-024 | Copy link | | Issued invoice | **Copy link** | Copied to the clipboard; "Link copied" | happy |
| WEB-025 | Email and WhatsApp on the web | | | **Send by email** / **Send on WhatsApp** | Opens your mail app / `wa.me`; nothing sent by the server | edge |
| WEB-026 | OCR unavailable | | | **Scan with OCR instead** | "Bill scanning works in the installed Elixir Books app…" | edge |
| WEB-027 | Deep links and refresh | | | Reload on `/sales/invoices/<id>` | Same page reopens after the session restores; no flash of Home or Welcome | edge |
| WEB-028 | Browser back | | Editor → detail → list | Back | Goes back through the history; the editor doesn't lose a saved draft | edge |
| WEB-029 | Keyboard only | | | Tab through the sign-in and invoice editor | Focus visible; every control reachable | edge |
