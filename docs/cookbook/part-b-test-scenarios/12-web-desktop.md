# 12 — Web desktop

Tests for the browser layout: the sidebar and its drop-downs, the folded sidebar's panels, the **Next filing** card, the top bar and its pickers, the command palette, desktop-only page layouts (drawers, dropdown pickers, header menus, tables) and the breakpoints. Setup and demo data are in [00 — Test setup](00-test-setup.md). User guide: [03 — Finding your way around](../part-a-user-guide/03-navigation.md#38-the-web-desktop-layout).

Run in Chrome, Safari and Firefox. "Desktop" means a window 768 px or wider. Breakpoints: under 768 phone layout; 768–1023 icons-only sidebar ("tablet"); 1024–1439 desktop; 1440 and up wide.

### Layout & breakpoints

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| WEB-001 | Desktop shell | Owner / Pro | Width 1280 | Sign in | Sidebar: logo (links Home), Home; rule; Sell, Buy, Stock; rule; Money, GST; rule; People, Reports; Settings and the fold button at the foot. Top bar with the business and branch pickers, search and the right-hand buttons | happy |
| WEB-002 | Narrow window | | Width under 768 | Resize | Switches to the phone layout (header, bottom tab bar, step-by-step editor) | edge |
| WEB-003 | 768–1023 px | | Width 900 | Resize | Sidebar shows icons only; hovering an icon shows its name; the latency badge hides | edge |
| WEB-004 | Fold the sidebar | | 1280 | **Collapse sidebar** → reload | Stays folded in this browser; the page column grows into the space; **Expand sidebar** brings it back | edge |
| WEB-005 | Section drop-down | Owner / Pro | | Click **Sell** | Its pages drop down under the row: "Sell overview", then **Documents** (Invoices, Quotations, Proforma invoices, Waiting for approval, Sales orders, Delivery notes) and **Adjustments** (Sales returns, Credit notes, Debit notes); click Sell again to close | happy |
| WEB-006 | Sales plan sidebar | Owner / Basic | Aurora | Look at the sidebar and open each section | No Buy; Stock shows only Items & services; Money has no Books, Payables, Payments made or Expenses | plan |
| WEB-007 | Business picker | Owner | | Top bar business picker → Aurora | Menu **Businesses** lists each with type and currency; picking one shows "Switched to Aurora Design Studio"; books, numbering and sidebar switch; no Vertex data flashes during the switch | happy |
| WEB-008 | Settings navigation | | | Click **Settings** in the sidebar foot | Settings side menu listing every settings page by group; the main sidebar folds to icons for the visit | happy |
| WEB-009 | No horizontal scroll | | 768, 1024 and 1440 | Visit every page | No page-level horizontal scroll | edge |
| WEB-030 | One section open at a time | | | Open Sell, then click Money | Sell closes, Money opens with its headings (Accounts, Cash flow, Dues, Spending) | happy |
| WEB-031 | Arriving opens the section | | | Open an invoice from search | Sell drops down with Invoices highlighted (tinted, not filled) | happy |
| WEB-032 | "+" beside a page | | | Hover Invoices in the drop-down → click **+** | A new invoice opens | happy |
| WEB-033 | Section actions | Owner / Pro | | Open Buy and Money | **Scan a bill** at the end of Buy; **Advance receipt** at the end of Money's actions | happy |
| WEB-034 | Badges roll up | Owner / Pro | A rejected e-invoice exists | Close GST | The GST row shows the count; open it and the count moves to **GST compliance** | edge |
| WEB-035 | Folded panel | | Sidebar folded at 1280 | Click the Money icon | A panel opens beside the sidebar with Money overview and the pages in columns by heading, each with **+**; focus moves into it | happy |
| WEB-036 | Panel closes | | WEB-035 | Press **Esc**; reopen and click outside; reopen and pick a page | Each closes it; Esc returns focus to the Money icon | edge |
| WEB-037 | Tablet opening is temporary | | Width 900 | Expand the sidebar by hand → pick a page | It folds back to icons after the page opens | edge |
| WEB-038 | Settings fold doesn't stick | | Sidebar open at 1280 | Open Settings → leave to Home | Folded during Settings; open again on Home (saved choice untouched) | edge |
| WEB-039 | Plan hides sections everywhere | Owner / Pro | Switch off a module in **Settings › Modules** (e.g. Stock) | Look at the sidebar, palette and More | That section and its pages are gone in all three | plan |

### Next filing card

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| WEB-040 | Card shows | Owner / Pro | Height 900+, sections closed, a return due | Look at the sidebar foot | **Next filing**: the return and period, "Due {date} · in N days", "+N more due" when there are more | happy |
| WEB-041 | Colours by urgency | Owner | Returns due today, in 2 days, and overdue (move the clock or seed date) | Look at the card | Overdue first, red, "N days late"; within 3 days amber; "today" / "tomorrow" said so | edge |
| WEB-042 | Nothing due | Owner | Every return in the next 60 days filed | Look at the card | "All filings up to date" / "Nothing left to file in the next 60 days." | edge |
| WEB-043 | Room taken back | Owner | WEB-040 | Open Money (long list) | The card hides while the list needs the room; closing Money brings it back; it never overlaps a row | edge |
| WEB-044 | Opens GST returns | Owner | WEB-040 | Click the card | **GST returns** opens; with unsaved changes on the page, "Leave without saving?" asks first | happy |
| WEB-045 | When it hides | Owner | Sidebar folded; or the filing calendar request failing (stop the API after load) | Look at the sidebar | No card while folded, while loading or after a failure; nothing broken around it | edge |

### Top bar & command palette

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| WEB-010 | Open the palette | | | ⌘K (Mac) / Ctrl+K, or "/" outside a text field, or click the search box | Command palette opens with **Quick actions** and **Go to**; the hint reads "↑↓ to move · Enter to open · Esc to close" | happy |
| WEB-011 | Jump to a record | | | Type "Kumar" → Enter | Opens Kumar Electronics | happy |
| WEB-012 | Quick action | | | Type "new invoice" → Enter | New invoice editor (the action comes first) | happy |
| WEB-013 | "/" while typing | | Focus in a text field | Type "/" | Typed as a character; palette doesn't open | edge |
| WEB-014 | Connection badge | | Network off | Top bar | "No internet connection"; save buttons disabled; turning the network on clears it | offline |
| WEB-015 | Ask Lixi panel | | | **Ask Lixi** | Right-hand panel; the page stays usable beside it; top-bar buttons keep their size | happy |
| WEB-016 | Notifications | | | Bell | Latest notifications, **Mark all read**, **View all**; "You're all caught up" when none (placeholders while loading, never a false "caught up") | happy |
| WEB-017 | Account menu | | | Avatar | Name and email, then **Your profile**, **Plan & billing**, **Appearance & language**, **All settings**, **Sign out** (with "Sign out?" confirm) | happy |
| WEB-018 | Pages in the palette | | | Type "budg" | **Pages** lists Budgets with its section; Enter opens it | happy |
| WEB-019 | Branch picker | Owner / Pro | Vertex | Branch picker → Pune — Warehouse | "Now showing Pune — Warehouse"; lists, stock and Home follow; **All branches** puts it back | happy |
| WEB-046 | Pickers shorten | Owner | Width 1024, Lixi panel open | Look at the top bar | Business and branch names shorten; search keeps its room; nothing overlaps | edge |
| WEB-047 | Latency badge | | 1280 | Click the coloured dot | Round trip split into **Server** and **Network**, with the slowest and last request time | happy |
| WEB-048 | Demo chip | Demo | Signed in to the public demo | Look at the top bar → click **Demo** | "You're exploring a demo" dialog | happy |
| WEB-049 | Skip link | | | Load a page → press Tab once | **Skip to content** appears; Enter moves focus to the page | edge |

### Desktop page layouts

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| WEB-020 | Sortable tables | | | Invoices list → sort by date, amount, **Balance due** | Rows sort; the sort indicator shows | happy |
| WEB-021 | One-page editor | | | New invoice | All sections on one page, head laid out like an invoice, totals beside the lines; Ctrl/⌘+Enter finalises (with confirmation) | happy |
| WEB-022 | More as a card grid | | | Open `/more` | Grid of cards: the sections that aren't on the phone tab bar, More sections, Tools, Business setup, GST & e-invoicing, Data, Account | happy |
| WEB-023 | Desktop variants | Owner / Pro | | Open payment detail, e-way bill detail and form, plan, transporters, item new/edit, stock adjust, transfer, opening stock, movements | Each uses the wide desktop layout | happy |
| WEB-024 | Copy link | | Issued invoice | **Copy link** | Copied to the clipboard; "Link copied" | happy |
| WEB-025 | Email and WhatsApp on the web | | | **Send by email** / **Send on WhatsApp** | Opens your mail app / `wa.me`; nothing sent by the server | edge |
| WEB-026 | OCR unavailable | | | **Scan a bill** | "Bill scanning works in the installed Elixir Books app on Android or iPhone. It is not available in the browser…" | edge |
| WEB-027 | Deep links and refresh | | | Reload on `/sales/invoices/<id>` | Same page reopens after the session restores; no flash of Home or Welcome | edge |
| WEB-028 | Browser back | | Editor → detail → list | Back | Goes back through the history; unsaved edits ask "Leave without saving?" | edge |
| WEB-029 | Keyboard only | | | Tab through sign-in, the sidebar, the palette and the invoice editor | Focus visible; every control reachable; menus move with the arrow keys | edge |
| WEB-060 | Sheets become drawers or dialogs | | | Open a picker sheet (customer, item), the invite-user form and a confirmation | Long forms open as a drawer from the right; short choices and confirmations as a centred dialog; Esc closes; focus stays inside | happy |
| WEB-061 | Short pickers drop down | | | Click a short picker (state, unit, payment terms) | Its list drops down under the field instead of a sheet, and flips up near the bottom of the window | happy |
| WEB-062 | Header Create menu | | | Home › **Create** | The menu opens under the button with the quick actions | happy |
| WEB-063 | Readable widths | | 1440+ | Open sign-in, a form, a report and a settings list | Sign-in and forms keep a narrow column; reports and lists cap at the content width; settings pages use the full width with tables and three fields to a row | edge |
| WEB-064 | Home on desktop | Owner / Pro | | Open Home | Charts in the wider column, money cards beside; no swipeable quick-action row (they are in **Create**) | happy |
| WEB-065 | Onboarding rail | New owner | 🖥 | Sign up → onboarding | Left rail "Set up your business" with the three steps ticked as you go; finished steps can be clicked | happy |
| WEB-066 | First-run Home | New owner | Just onboarded | Open Home | "Getting started", "Welcome, {name}", **Create your first invoice**, **Add customer**, the checklist three to a row, quick actions as a grid | happy |

### Desktop shell (Tauri)

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| WEB-050 | Desktop window | Owner | `npm run tauri:dev -w @esmart/desktop` | Sign in, walk Home, an invoice and settings | Opens at 1366 × 860; can't shrink below 1024 × 640, so the full sidebar shows; behaves as the web app. **Not available yet** to customers: no published installer | edge |
