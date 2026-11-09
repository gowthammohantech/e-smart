# Desktop width audit — web app

_Audit date: 9 Nov 2026. Read-only: nothing was changed. Every `.tsx` file under `packages/ui`, `packages/app` and `apps/web` was read (about 550 files), split across six passes: shared components, sales, purchases, books and reports, GST and stock, settings and the rest._

**The problem.** On desktop web, fields, buttons, tabs, tiles and cards stretch across the whole page. Creation flows suffer most. At the same time, every picker (customer, item, state…) opens as a narrow modal centred on the page. On a phone the same screens look right.

**The short answer.** The screens are mobile-first and nothing limits their width on desktop. Phone defaults like `flex: 1`, full-width fields and stretched buttons fill whatever space they get. The desktop content column is up to **1280px** wide, and **1464px** with the sidebar folded. The width limits that do exist are either missing on most screens or switched off on purpose. Meanwhile every sheet is held to the phone form width of 520px.

## How to read this

**Severity:** **H** = creation flow or main screen, very visible · **M** = secondary screen · **L** = minor.

The tables use these codes for the type of problem:

| Code | Problem |
|---|---|
| P1 | No width limit on the page or form, or the limit is overridden (`maxWidth: '100%'`, 960, 1100) |
| P2 | A single field or picker fills the whole row (`flex: 1`, or alone in a column) |
| P3 | A button stretches to full width (`fullWidth`, `flex: 1`, or the default stretch — see Root cause 1) |
| P4 | Tabs (`Segmented`) stretch, because every option is `flex: 1` |
| P5 | Tiles, stat cards or charts stretch (`flexGrow`, `%` widths, `StatGrid` / `StatRow` with only 1–2 tiles) |
| P6 | The search bar is full width |
| P7 | A sheet or picker becomes a narrow 520px centred modal; it should be a drawer, an anchored menu or a combobox |
| P8 | An empty state or placeholder box is full width |
| P9 | A multi-line notes field is full width |
| P10 | A list row is full width: content at the left, amount or badge about 1000px away at the right. A table, or a narrower list, would read better |
| P11 | A phone-only pattern shows on desktop: bottom padding for a bottom bar, swipe carousel, step wizard, camera prompt, gesture settings |
| P12 | Another width problem, including things that are **too narrow** |

---

## 1. Root causes: shared defaults that spread to every screen

Each of these is set once in a shared component, and every screen that uses the component inherits it. Usage counts are `<Tag` occurrences across `packages/` and `apps/`, written as uses / files.

| # | Root cause | Where | Reach | Effect on desktop |
|---|---|---|---|---|
| 1 | **Buttons stretch even without `fullWidth`.** The style is `alignSelf: fullWidth ? 'stretch' : 'auto'`. With `'auto'` a button takes its parent's `alignItems`, and the default for that is `stretch`. | [Button.tsx:140](../packages/ui/components/Button.tsx#L140) | Button 371 / 129, plus 91 explicit `fullWidth` | Any button placed directly in a Card, FormSection, Panel or column becomes a wide bar. A button only keeps its own width inside a row. |
| 2 | **Fields have no desktop width.** None of TextField, PickerField, AmountField, PhoneField, DateField, SwitchField or CityField takes a width or `maxWidth`. `DateField.web` doesn't even accept `containerStyle`. | [Field.tsx](../packages/ui/components/Field.tsx), [DateField.web.tsx:30-47](../packages/ui/components/pickers/DateField.web.tsx#L30-L47) | TextField 224 / 73, PickerField 108 / 42, SwitchField 62 / 32, DateField 46 / 34, AmountField 35 / 20 | A 6-digit PIN, a 15-character GSTIN, a 2-digit percentage or a date fills 400–1200px. A unit suffix or currency code sits at the far end of the box. A SwitchField's toggle sits up to about 1000px from its label. |
| 3 | **Every sheet becomes a 520px modal centred on the page.** `dialog = useIsDesktop()`, `maxWidth: FORM_MAX_WIDTH`. There is no drawer or size variant. Footer buttons stretch. `fillHeight` takes 86% of the window height even for 8 options. The window height is read once, so the sheet doesn't follow a resize. | [Sheet.tsx:73, 117-129, 228-238](../packages/ui/components/Sheet.tsx#L73), [SelectSheet.tsx:147-251](../packages/ui/components/pickers/SelectSheet.tsx#L147) | Sheet 49 / 40, SelectSheet 116 / 47 | The customer and item pickers, the line editor and every master-data form are narrow phone lists in the middle of the page, with the form hidden under an overlay. A sheet opened from another sheet stacks a modal on a modal. Picker rows are 52px tall with no hover state, and descriptions are cut to one line. |
| 4 | **The page itself has no width limit.** `Screen`'s content container has no `maxWidth`. The shell caps the content column at 1280px, growing to 1464px with the sidebar folded. Settings pages are capped at 880px. | [Screen.tsx:40-44](../packages/ui/components/Screen.tsx#L40-L44), [(app)/_layout.tsx:93-109](../apps/web/app/(app)/_layout.tsx#L93-L109) | Every screen | A screen that doesn't wrap itself in a limit fills 1280px. |
| 5 | **`FormContainer` is rarely used, and often switched off.** Only 23 screens use it. Eight forms override it with `maxWidth: '100%'` and three with a larger number (see section 3). | [Layout.tsx:51-68](../packages/ui/components/Layout.tsx#L51-L68) | — | The creation flows (invoice, bill, expense, payment, party, budget, import, approvals) are 1250px wide. |
| 6 | **Layout helpers split the width equally.** `FieldRow`, `Columns`, `StatGrid` and `SplitPane` give every child `flex: 1`. `SplitPane`'s main column has no limit. | [Layout.tsx:24-148](../packages/ui/components/Layout.tsx#L24) | FieldRow 46 / 11, SplitPane 14 / 14, StatGrid 9 / 8, Columns 3 / 3 | A row with one visible child (for example, when the other field is hidden) gives that child the full width. Two stat tiles take about 620px each; one takes 1280px. |
| 7 | **Stat tiles stretch.** `StatTile` is `flex = 1` by default, and `StatRow` is a row of flex children. | [StatTile.tsx:24, 49, 117-128](../packages/ui/components/StatTile.tsx#L24) | StatTile 95 / 19, StatRow 24 / 14 | The GST hub, inventory, purchases and list pages show 1–2 tiles, each half the page wide or more. |
| 8 | **Tabs stretch.** Every `Segmented` option is `flex: 1`. | [Field.tsx:657](../packages/ui/components/Field.tsx#L657) | 54 / 42 | "E-invoices \| E-way bills" becomes two 620px tabs; GSTR-1's 11 tabs span the page. |
| 9 | **Hub tiles grow.** Tiles are 22%, 30% or 47.5% wide plus `flexGrow: 1`, and the filler tiles also grow. | [HubTiles.tsx:25-41, 84](../packages/ui/components/HubTiles.tsx#L25-L41) | 4 hubs (GST, Sales, Purchases, Money) | Each tile is 300–400px wide for an icon and a label, with mostly empty space. |
| 10 | **Rows push content to opposite edges** (`space-between`, or title `flex: 1`). | [ListRow.tsx:44-94](../packages/ui/components/ListRow.tsx#L44-L94), [DocumentRow.tsx:42-76](../packages/ui/components/DocumentRow.tsx#L42-L76), [TotalsPanel.tsx:23](../packages/ui/components/TotalsPanel.tsx#L23), [Screen.tsx:79-117](../packages/ui/components/Screen.tsx#L79) SectionHeader, chart legends | ListRow 63 / 41, SectionHeader 47 / 10, DocumentRow 8 / 6, TotalsPanel 4 / 2, plus BarChart / RankedBars / Donut / Aging / StatusBar / Waterfall | The title is at the left and the value, badge or chevron about 1000px away. TotalsPanel's labels and amounts end up about 850px apart. |
| 11 | **The search bar has no limit.** It is 44px tall unless `compact`. | [SearchBar.tsx:37-52](../packages/ui/components/SearchBar.tsx#L37-L52) | 21 / 17 | Full width, except where a caller wraps it (DocumentListView uses 380px, which is the right pattern). |
| 12 | **Charts draw wide slabs.** Bars are `flex: 1` with SVG `width="100%"` and no maximum bar width. | [BarChart.tsx:76-104](../packages/ui/components/charts/BarChart.tsx#L76-L104), [PairedBars.tsx:76-96](../packages/ui/components/charts/PairedBars.tsx#L76-L96) | 17 / 9 | With 6–12 points in a 1280px card, each bar is 80–200px wide. |
| 13 | **Table columns share space equally.** Columns without a `width` get `flex: 1` with `minWidth` 120. | [DataTable.tsx:48-50](../packages/ui/components/DataTable.tsx#L48-L50) | All tables | A 2–4-column table spreads across 1280px. |
| 14 | **Loading skeletons aren't limited either.** `LoadingView`'s `Screen` and `FormSkeleton` draw 50% fields across the full column, and skeleton fields are 44px tall while real fields are 40px. | [LoadingView.tsx:29-42](../packages/app/components/LoadingView.tsx#L29-L42), [ScreenSkeleton.tsx:93-160](../packages/app/components/ScreenSkeleton.tsx#L93), [Skeleton.tsx:260-353](../packages/ui/components/Skeleton.tsx#L260) | LoadingView 58 / 58 | The skeleton is wider than the form it stands in for, then jumps to the real width when the form loads. |
| 15 | **The page title doesn't line up with the form.** `PageHeader` is drawn at the left of the full column, while `FormContainer` centres the form. | [Layout.tsx:51-68](../packages/ui/components/Layout.tsx#L51-L68), [PageHeader.tsx:122-165](../packages/ui/components/PageHeader.tsx#L122) | 23 FormContainer pages | The title sits about 380px to the left of the form below it. |
| 16 | **Phone bottom padding is left on desktop.** `paddingBottom: 120 + insets.bottom` and `bottomInset={80…120}` reserve room for a FAB or bottom bar that desktop moves into the page header. | about 20 screens (listed below) | — | A dead band at the bottom of the page. |
| 17 | **The web inventory layout opts out of its own limit.** `TwoColumns` caps at 1100px and is left-aligned (FormContainer is centred), and `fill` removes the cap entirely. Its `Row` children are `flexGrow: 1, flexBasis: 200`. | [apps/web/src/screens/inventory/parts.tsx:9-49](../apps/web/src/screens/inventory/parts.tsx#L9-L49) | 5 desktop screens | The item form spreads over the full 1280px. A single field in a `Row` takes the whole row. |
| 18 | **The onboarding wizard is wider than the form limit** (760px against `WIDE_FORM_MAX_WIDTH` of 720). | [WizardShell.tsx:20, 99, 120](../packages/ui/components/WizardShell.tsx#L20) | Onboarding | Every field and button in it is 760px wide. |
| 19 | **There are no width tokens** for a field, picker, drawer or button. | [breakpoints.ts:13-19](../packages/ui/theme/breakpoints.ts#L13-L19) | — | Components have nothing to fall back on, so every screen sets widths by hand. |

**What already works and could be copied:**
- the `Combobox` (anchored, matches the field width; 1 use);
- `Menu` as `CompanySwitcher` and `LineGrid`'s `LineMenu` use it;
- `TransportersDesktop`'s own 560px dialog with buttons aligned right;
- `DocumentListView`'s desktop toolbar (380px search) and `DataTable`;
- the desktop branch in `(tabs)/contacts.tsx`;
- `catalog/items/index.tsx`, `expenses/index.tsx`, `receipts/index.tsx`, `PaymentListView`;
- `StockMovementsDesktop`;
- `done.tsx` in onboarding (640px with buttons aligned right);
- `LixiPanel` (a fixed 420px side panel, which is effectively a drawer).

---

## 2. Bugs found along the way (not width — verified in code)

| # | Bug | Where | Effect |
|---|---|---|---|
| B1 | **The TCS register and TCS payable reports are blank on desktop.** The list of reports kept on the phone layout includes `tds-*` and `msme-payables` but not `tcs-*`, so they are handed to `ReportDesktop`, which has no TCS branch and returns `null`. | [reports/[report].tsx:853](../packages/app/screens/(app)/reports/[report].tsx#L853), [ReportDesktop.tsx:426](../packages/app/features/reports/ReportDesktop.tsx#L426) | A desktop user sees only the explanation card at the top. |
| B2 | **The desktop item form has no GST treatment fields, and editing an item there wipes its `gst`.** `ItemFormDesktop` builds a whole new `record` without a `gst` key, and `saveItem` replaces the item rather than merging (`appStore.ts:681`). The phone `ItemForm` has `GstTreatmentFields` and keeps `gst`. It also doesn't pass `errors` to `CustomFieldsSection`. | [ItemFormDesktop.tsx:124-147](../apps/web/src/screens/inventory/ItemFormDesktop.tsx#L124-L147), [appStore.ts:678-681](../packages/app/store/appStore.ts#L678-L681) | GST treatment can't be set on desktop, and is lost whenever an item is edited there. I confirmed the replace in the local store; I didn't trace whether the server sync also replaces. |
| B3 | **New e-way bill and e-way bill detail show "not found" on a reload or shared link.** The desktop screens read only the local store (`useDocument` / `useEwayBill`). The phone routes fetch the record first (`useDocumentRecord` / `useEwayBillRecord`) and show a loading state. | [EwayBillFormDesktop.tsx:181](../apps/web/src/screens/EwayBillFormDesktop.tsx#L181), [EwayBillDetailDesktop.tsx:113](../apps/web/src/screens/EwayBillDetailDesktop.tsx#L113) | Opening the link directly shows an empty "not found" page. |
| B4 | **Bank-reconciliation record sheets vanish and reappear.** `visible={!partyOpen && !methodOpen}` hides the dialog while a picker opens in its place. | [LineSheets.tsx:121, 228-286, 321-353](../packages/app/features/banking/LineSheets.tsx#L121) | On desktop the dialog flickers out and back. |
| B5 | Contact import on web still uses the paste screen. Items use `ImportFlow`, which has column mapping and a table preview. | [ImportContacts.tsx](../packages/app/features/contacts/ImportContacts.tsx) | Inconsistent; there is no column mapping for contacts. |
| B6 | AI-usage settings shows "Ways to open Lixi" gesture switches (hold a tab, swipe up, floating orb, pull down) on desktop, where none of these apply. | [LixiAccessCard.tsx:23-63](../packages/app/features/company/LixiAccessCard.tsx#L23-L63) | Settings that do nothing on desktop. |

---

## 3. Width limits switched off on purpose

| File:line | Override | Screen |
|---|---|---|
| [DocumentEditor.tsx:1457](../packages/app/features/documents/DocumentEditor.tsx#L1457) | `maxWidth: '100%'` | Every invoice, quote, proforma, order, delivery, credit/debit note, return, bill, PO and goods receipt — new and edit |
| [ExpenseForm.tsx:595](../packages/app/features/expenses/ExpenseForm.tsx#L595) | `maxWidth: '100%'` | New and edit expense |
| [payments/new.tsx:1075](../packages/app/screens/(app)/payments/new.tsx#L1075) | `maxWidth: '100%'` | Make payment / receive payment |
| [PartyForm.tsx:651](../packages/app/features/contacts/PartyForm.tsx#L651) | `maxWidth: '100%'` | New and edit customer or supplier |
| [BudgetForm.tsx:96](../packages/app/features/books/BudgetForm.tsx#L96) | `maxWidth: '100%'` | New and edit budget |
| [ImportFlow.tsx:260](../packages/app/features/import/ImportFlow.tsx#L260) | `maxWidth: '100%'` | Item, bank statement and opening balance imports |
| [gst/utilization.tsx:195](../packages/app/screens/(app)/gst/utilization.tsx#L195) | `maxWidth: '100%'` | GST utilisation entry |
| [settings/approvals.tsx:54](../packages/app/screens/(app)/settings/approvals.tsx#L54) | `maxWidth: '100%'` | Approval settings |
| [settings/custom-fields.tsx:56](../packages/app/screens/(app)/settings/custom-fields.tsx#L56) | `maxWidth: '100%'` | Custom fields |
| [VoucherForm.tsx:178](../packages/app/features/books/VoucherForm.tsx#L178) | 1100 | Journal, contra, GST journal, TDS challan |
| [receipts/adjust.tsx:145](../packages/app/screens/(app)/receipts/adjust.tsx#L145) | 1100 | Adjust advances |
| [gst/challan.tsx:107](../packages/app/screens/(app)/gst/challan.tsx#L107) | 960 | GST challan |
| [ItemFormDesktop.tsx:187](../apps/web/src/screens/inventory/ItemFormDesktop.tsx#L187) | `TwoColumns fill` (no limit) | New and edit item |

**One constraint to keep in mind when fixing this:** `LineGrid` needs about 712px ([LineGrid.tsx:24-26](../packages/app/features/documents/LineGrid.tsx#L24-L26)). Capping the document editor at 720px while keeping its 360px side panel would leave a main column of about 330px and make the grid scroll sideways. The editor needs a cap of roughly 1100–1200px with tight fields inside it, or the summary panel has to move.

---

## 4. Findings by area

### 4.1 Sales and documents

**Document editor** — [DocumentEditor.tsx](../packages/app/features/documents/DocumentEditor.tsx). Used for every sales and purchase document, new and edit. **H.**

| Line | Element | Code | Desktop effect |
|---|---|---|---|
| 1457 | `FormContainer` override | P1 | Fills about 1248px (main about 860px plus 360px side) |
| 1503-1526 | Party, items and extras stacked in the main column | P11/P12 | One long single column; no grid on desktop |
| 773-823 | Select customer / supplier card | P2/P5 | One tap target about 860px wide, chevron at the far right |
| 825-861 | Date + due date `FieldRow` | P2 | For orders, deliveries, notes, returns, POs and GRNs only the date shows, so it is about 860px wide |
| 863-901 | Reference (with supplier number, bill of entry, ISD) | P2/P12 | For sales only Reference shows, at about 860px. For an imported bill the bill-of-entry block packs three nested rows into one cell, giving inputs of about 100px (**too narrow**) |
| 903-943 | Branch, place of supply, currency | P2 | With one branch and no FX, place of supply is alone at full width |
| 946-954 | Note reason picker | P2 | Full width |
| 961-968 | With GST / without GST `Segmented` (direct notes) | P4 | About 860px |
| 993-1001 | Exchange rate | P2 | Full width |
| 1009 | "Add item" `Button fullWidth` | P3 | An 860px button |
| 1012 / [BillableExpenses.tsx:55-77](../packages/app/features/documents/BillableExpenses.tsx#L55-L77) | Billable expenses rows | P10 | "Add" button about 800px from its text |
| 1042-1051 | Empty-lines card | P8 | A large empty box |
| 1158 | Reverse charge `SwitchField` | P2 | Toggle about 860px from its label |
| 1167, 1196, 1213 | TDS section, TDS rate, TCS section | P2 | Each full width |
| 1222, 1224 | Cost centre and vehicle pickers | P2 | Each full width |
| 1225 | `CustomFieldsSection` | P2 | One field per row, full width |
| 1228-1264 | "Paid into" bank card | P5/P10 | "Change in settings" button about 860px from the text |
| 1267-1289 | Discount: `Segmented` (130px) + input `flex: 1` | P2 | A 2–5 digit value in a box about 720px wide |
| 1293 | Other charges | P2 | Full width |
| 1306, 1315-1333, 1335 | Round-off switch, Auto/Manual `Segmented`, manual amount | P2/P4 | Each full width |
| 1351, 1359 | Notes, terms | P9 | About 860px multi-line boxes |
| 147 / edit routes | `LoadingView items-form` | P1/P12 | Skeleton wider than the editor |

Sheets the editor opens (all **P7**, 520px modals):
- **Customer/supplier picker** (1653) — server search, footer "Add customer" `fullWidth`. **Drawer.**
- **Add item** (1683) — multi-select, with stock, price and tax; footer "One-off line" / "New item" `flex: 1`. **Drawer.**
- **`LineEditorSheet`** (1787 → [LineEditorSheet.tsx:158](../packages/app/features/documents/LineEditorSheet.tsx#L158)) — the whole line form (name, multi-line description, quantity, unit, HSN, rate, discount, tax, inclusive, reimbursement, purchase GST, cost centre, breakdown). Footer Remove `flex: 1` and Save `flex: 2`. Unit and tax pickers open on top of it (340, 353). **Drawer — the strongest candidate.**
- TDS (1625, about 30 rows), TCS (1635), note reason (1644, 5 options), currency (1753, about 150), place of supply (1764, 37), branch (1777). **Combobox or dropdown.**
- `LineGrid` cell pickers — tax (333), ITC eligibility (345), cost centre (357). **Anchored `Menu`**, as `LineMenu` at 478 already does.

**Return / note source picker** — [ReturnSourcePicker.tsx](../packages/app/features/documents/ReturnSourcePicker.tsx). Credit notes, debit notes, sales and purchase returns. **H.**
- 131-235 — no desktop branch and no limit (P1/P11).
- 134-146 — "Raise direct note" primary `Button fullWidth`, about 1200px (P3).
- 156-158 — search box in `flex: 1`, about 1000px (P6).
- 178-235 — phone `DocumentRow` list instead of a `DataTable` (P10).
- 189-202 — empty / failed states (P8).
- 237 — party filter `SelectSheet` (P7).
- 248-290 — "Choose lines" `Sheet` with checkbox rows and a `fullWidth` Create button (P7/P3). **Drawer.**

**Document detail** — [DocumentDetail.tsx](../packages/app/features/documents/DocumentDetail.tsx). All sales and purchase kinds. **H.**
- 957-1003 — `SplitPane` with no limit; main column about 880px (P1).
- 469-545 — header party row with the chevron about 850px away (P10).
- 642-694 — `TotalsPanel` in the main column, labels and amounts about 850px apart (P10). Belongs in the side panel, or in a right-aligned block of about 360px.
- 828-843 — custom-fields card (P10).
- 851-868 — notes and terms: long lines about 880px wide (P9).
- 582-596 — side panel "Record payment" / "Adjust advance" `fullWidth` (P3, L).

Its sheets:
- **Actions `Sheet`** (1046-1163) — up to about 15 actions in a 520px modal (P7). Should be an **anchored `Menu`**.
- **Change status** (1166-1196) (P7) — a dropdown.
- `RecurrenceSheet` ([RecurrenceSheet.tsx:56-73](../packages/app/features/documents/RecurrenceSheet.tsx#L56)) — the 5-option `Segmented` stretches and Save is `fullWidth` (P7/P4/P3).
- `EInvoiceSheet` — cancel IRN (138: reasons, multi-line remark, `fullWidth` danger button) and generate/view (218: issue lists, JSON payload cramped at 520px, QR card, `fullWidth` Copy IRN and Generate) (P7/P9/P3). **Drawer.**

**`ApprovalBanner`** ([ApprovalBanner.tsx:87-97](../packages/app/features/approvals/ApprovalBanner.tsx#L87-L97)) — the reason box is multi-line (P9); the Cancel / Send back and Reject / Approve pairs are `flex: 1` (P3).

**Print preview** — [documents/[id].tsx:120-145](../packages/app/screens/(app)/documents/[id].tsx#L120-L145): the phone bottom bar with Print and Save PDF (`flex: 1`) also shows on desktop, about 1248px wide (P3/P11). There is no header-action version. **M.**

**Sales lists** — [DocumentListView.tsx:367-387](../packages/app/components/DocumentListView.tsx#L367-L387): `StatGrid` with 1–4 tiles, so with 1–2 statuses each tile is 620–1248px (P5). The empty state inside the table is P8 (L). The toolbar and table are fine.

**Sales approvals** — [sales/approvals.tsx](../packages/app/screens/(app)/sales/approvals.tsx). This is also where held payments go. **M.**
- 130-235 — no limit (P1).
- 159-231 — `ListRow`s with Reject / Approve about 1200px from the text; should be a table (P10).
- 138-147, 237-241 — empty states (P8).
- 243-268 — reject / send-back `Sheet` with a multi-line reason and a stretched danger button (P7/P9/P3).

**Receipts**
- [ReceiptForm.tsx](../packages/app/features/receipts/ReceiptForm.tsx) (720px):
  - amount (181), date (187), party (188-196) and "From" (197) are each alone at 720px (P2);
  - 198-201 — `CostCentreField` returns `null`, but `FieldRow` still reserves a `flex: 1` cell, so Reference gets half the row next to an empty gap (P12);
  - 202 — narration (P9);
  - 245, 255, 256 — `SelectSheet`s (P7).
- [receipts/[id]/index.tsx:90-112](../packages/app/screens/(app)/receipts/[id]/index.tsx#L90-L112) — no limit, the amount card is full width, and label/value `ListRow`s are about 1200px apart (P1/P5/P10).
- [receipts/adjust.tsx](../packages/app/screens/(app)/receipts/adjust.tsx):
  - 145 — limit is 1100 (P1);
  - 147 — intro text up to 1100px per line;
  - 150 — party picker alone (P2);
  - 152-163 — `Segmented` (P4);
  - 109-140 — rows (P10);
  - 217 — per-document amount fills the column (P2);
  - 250 — Back button stretches (P3);
  - 253 — picker (P7).
- The receipts list is fine.

### 4.2 Purchases, expenses, payments, OCR

**Purchases hub** — [(tabs)/purchases.tsx](../packages/app/screens/(app)/(tabs)/purchases.tsx). No desktop branch. **H.**
- 222-225 — no limit (P1).
- 227-235 — Purchases | Expenses `Segmented`, two tabs of about 640px (P4).
- 72-111, 146-161 — `StatGrid`, about 300px per tile; the spacer at 92 holds a lone tile at about 620px (P5).
- 114 — `HubTiles` (P5).
- 117-138 — recent bills `DocumentRow` (P10).
- 119-126 — empty state (P8).
- 169-171 — bar chart; 181-183 — a small donut in a 1280px card; 186-188 — ranked bars (all P5).
- 191-214 — recurring rows (P10).
- 223 — `paddingBottom: 120` (P11).

**Purchase lists** — same `DocumentListView` stat-tile issue. POs, GRNs, returns and supplier notes often have only 1–2 tiles, so 640–1280px each (P5).

**Purchase editor and detail** — same as 4.1 (the shared `DocumentEditor` and `DocumentDetail`). The supplier picker, add item, `LineEditorSheet` and Actions sheet are the drawer and menu candidates.

**Expense form** — [ExpenseForm.tsx](../packages/app/features/expenses/ExpenseForm.tsx). **H.**
- 595 — limit switched off (P1).
- 500-515 — `FieldRow`s (amount + date, category + supplier, method + account, reference + repeats), about 430px per field (P2).
- 516 — notes (P9).
- 521-525, 529-533 — tax or ITC beside an empty `<View />` filler (P2).
- 528 — reverse charge alone (P2).
- 564-571 — the tablet layout (768–1023px) stacks everything with no limit (P1).
- 598-602 — `FormActions` is a full-width bottom bar under a 1280px form (P11/P12); it could go in the header.
- Sheets (P7):
  - pickers — bill-to customer (609), ITC (619), category (628, `fullWidth` footer), payment method (666), paid from (678), supplier (690), tax (704), recurrence (713), cost centre ([CostCentreField.tsx:17](../packages/app/features/books/CostCentreField.tsx#L17)), vehicle ([VehicleField.tsx:22](../packages/app/features/vehicles/VehicleField.tsx#L22));
  - add-category `Sheet` (651) with one field.

**Expense detail** — [expenses/[id]/index.tsx](../packages/app/screens/(app)/expenses/[id]/index.tsx):
- 122-139 — header badges about 800px from the amount (P10).
- 143-154 — 50/50 details (P12, L).
- 157-163 — notes (P9).
- 225-246 — tablet stacking (P1/P10).

The expenses list is fine.

**Make payment** — [payments/new.tsx](../packages/app/screens/(app)/payments/new.tsx). **H.**
- 1075 — limit switched off (P1).
- 1001-1018 — field rows about 430px each (P2); the filler at 1017 (P2).
- 635-645 — advance card, button about 800px away (P10).
- 696-795 — allocation table: number column `flex: 1`, about 500px from the amounts (P10).
- 833 — per-row TDS and discount amounts at 280–420px (P2).
- 672-693 — empty states (P8).
- **Too narrow:** 920-940 — service-advance field rows in the 360px side card, about 150px per field with labels cut off; the TDS picker is cramped the same way (P12).
- 1041-1048 — tablet stacking (P1).
- 1080-1084 — `FormActions` bottom bar (P11).
- Sheets (P7): supplier (1104), currency (1119), method (1132), pay from (1145), TDS (902), advance tax rate (955), place of supply (956).

**Payment edit** — [PaymentEditForm.tsx](../packages/app/features/payments/PaymentEditForm.tsx). Correctly limited to 520px; only its pickers (129, 141) are P7.

**Payment detail (desktop)** — [PaymentDetailDesktop.tsx](../apps/web/src/screens/PaymentDetailDesktop.tsx):
- 143 — no limit (P1).
- 145-180 — headline card with facts spread about 300px apart (P5).
- 196-235 — allocation table with only 2 columns (P10).
- 238-251 — unallocated note with buttons pushed far right (P10).
- 263-299 — refunds and FX card (P10).
- 384 — `RefundAdvanceSheet` (P7).

**Payables / receivables** — [AgingScreen.tsx](../packages/app/features/ledger/AgingScreen.tsx):
- 202-223 — `StatGrid` of 3 tiles at about 400px (P5).
- 225 — at 1024–1439px the aging card is full width above the list (P5).
- 384-473 — party group rows: number column `flex: 1`, far from the amounts (P10).
- 144 — `PaymentReminderSheet` (P7; acceptable as a modal).

**Scan a bill** — [ocr/capture.tsx](../packages/app/screens/(app)/ocr/capture.tsx):
- 184-194 — no limit (P1).
- 112-143 — drop zone about 880px with a small illustration (P8).
- 146-151 — note banner (P12).
- 186-190 — tablet (P1).

**OCR review** — [ocr/review.tsx](../packages/app/screens/(app)/ocr/review.tsx):
- 289-303 — no limit (P1).
- 200-208 — extracted fields about 430px each (P2), plus a filler at 206.
- 212-243 — lines table (P10, L).
- **Too narrow:** 260-266 — the bill photo is only 240px tall in the 340px side panel, yet it is what the user needs to check against. The photo should be the large part of this screen (P12).

### 4.3 Books, banking, reports, dashboard

**Shared report frame** — [ReportShell.tsx](../packages/app/features/reports/ReportShell.tsx), used by every report. **H.**
- 232-253 — no limit (P1).
- 237 — explanation card full width (P12).
- 273-305 — **Export** `Sheet`, 3–4 rows (P7). Should be an anchored `Menu`.
- 307-369 — **Date range** `Sheet`: presets plus custom dates in a `flex: 1` row, `fullWidth` Apply (P7/P3). Should be a popover attached to the period chip.
- 371-382 — branch picker; 384-396 — contact picker (P7). Dropdown and combobox.

**Report parts** — [reportParts.tsx](../packages/app/features/reports/reportParts.tsx):
- 43-69 — `KeyFigures`: label and value 1200px apart, on almost every report (P10/P5).
- 72-99 — `HeroFigure`: one number in a full-width card (P5).
- 132-199 — 2–3-column tables at 1280px (P10).

**Report view picker** — [ColumnsReport.tsx:22-31](../packages/app/features/books/ColumnsReport.tsx#L22-L31): `StatementViewPicker`, 5 tabs across the page (P4).

**Desktop reports** — [ReportDesktop.tsx](../packages/app/features/reports/ReportDesktop.tsx): `Kpis` tiles at about 400px (430-433); aging, stock and payments-by-account bar charts full width (196-200, 237-244, 325-329) (P5). TDS and MSME reports keep the phone column, with single-row `KeyFigures` at 1280px (P10). **Plus bug B1.**

**Books hub and lists**

| Screen | Findings |
|---|---|
| [books/index.tsx:32-48](../packages/app/screens/(app)/books/index.tsx#L32-L48) | 9 `ListRow`s, chevron about 1200px away (P1/P10) |
| [books/vouchers/index.tsx](../packages/app/screens/(app)/books/vouchers/index.tsx) | 44-48 status `Segmented` (P4); 60-79 rows where a table belongs (P10); 52 `paddingBottom` 120 (P11); 86-88 empty state (P8); no search or date filter on desktop |
| [vouchers/[id]/index.tsx](../packages/app/screens/(app)/books/vouchers/[id]/index.tsx) | 74 no limit (P1); 97-144 amounts about 1000px from account names (P10); 145-157 Edit and Post `flex: 1` (P3) |
| [budgets/index.tsx](../packages/app/screens/(app)/books/budgets/index.tsx), [budgets/[id]](../packages/app/screens/(app)/books/budgets/[id]/index.tsx) | Rows (P10), `paddingBottom` (P11), empty state (P8), `KeyFigures` (P10), stretched Edit button (P3) |
| [fixed-assets/index.tsx](../packages/app/screens/(app)/books/fixed-assets/index.tsx), [fixed-assets/[id]](../packages/app/screens/(app)/books/fixed-assets/[id]/index.tsx), [schedule.tsx](../packages/app/screens/(app)/books/fixed-assets/schedule.tsx) | `Segmented` (P4); rows where a table belongs (P10); `KeyFigures` (P10); stretched Edit button (P3); no limit (P1); `paddingBottom` (P11) |
| [cost-centres/index.tsx](../packages/app/screens/(app)/books/cost-centres/index.tsx), [profit.tsx](../packages/app/screens/(app)/books/cost-centres/profit.tsx) | Rows (P10); 93-105 add/edit `Sheet` plus 106-113 parent picker, a modal on a modal (P7); 2-column tables at full width (P10) |
| [reconciliation/index.tsx](../packages/app/screens/(app)/books/reconciliation/index.tsx) | Bank rows with the badge far right (P10), empty state (P8) |
| [integrity.tsx](../packages/app/screens/(app)/books/integrity.tsx) | Hero figure (P5), check rows (P10) |
| [cash-forecast.tsx](../packages/app/screens/(app)/books/cash-forecast.tsx) | No limit (P1), `Segmented` (P4), hero figure (P5), weekly rows where a table belongs (P10) |
| [trial-balance.tsx](../packages/app/screens/(app)/books/trial-balance.tsx) | `KeyFigures` (P10) |
| [profit-loss.tsx](../packages/app/screens/(app)/books/profit-loss.tsx) | View picker (P4), hero figure (P5); Trading and Indirect stacked at full width where they could sit side by side (P12) |
| [balance-sheet.tsx](../packages/app/screens/(app)/books/balance-sheet.tsx) | View picker (P4), `KeyFigures` (P10); Liabilities and Assets stacked where the classic side-by-side `ReportRow` layout fits (P12) |
| [day-book.tsx:50-58](../packages/app/screens/(app)/books/day-book.tsx#L50-L58) | Dozens of wide 3-column mini-tables; one grouped table would fit (P10) |
| [accounts/[key].tsx](../packages/app/screens/(app)/books/accounts/[key].tsx) | `KeyFigures` (P10), trend chart full width (P5) |
| [accounts/index.tsx](../packages/app/screens/(app)/books/accounts/index.tsx) (chart of accounts) | 303-306 search in `flex: 1` (P6); 135-184 name column `flex: 1` (P10, L); 395-419 add/edit account `Sheet` with Dr/Cr `Segmented` (P7/P4, **drawer**); 420-427 group picker on top of it (P7) |
| [close.tsx](../packages/app/screens/(app)/books/close.tsx) | 60 no limit (P1); status cards (P5); 71 date alone (P2); 72, 78, 101, 103 buttons stretched (P3); 115-119 `Segmented` (P4) |

**Voucher form** — [VoucherForm.tsx](../packages/app/features/books/VoucherForm.tsx). Journal, contra, GST journal, TDS challan. **H.**
- 178 — limit 1100 (P1).
- 181-189 — kind `Segmented` at 1100px (P4).
- 192 — "Use template" stretches (P3).
- 197 — date alone (P2).
- 221 — narration (P9).
- 224-226 — BSR, challan serial and deposited-on each at full width (P2).
- 229 — reference (P2).
- 230 — "Save as template" stretches (P3).
- 241-276 — templates picker and save-template sheet (P7).
- [VoucherGrid.tsx:220](../packages/app/features/books/VoucherGrid.tsx#L220) — "Add line" stretches (P3). The grid itself is good.

**Other books forms**
- **Transfer (contra)** — [transfer.tsx](../packages/app/screens/(app)/books/transfer.tsx) (720px): 94-98 from / to / amount / date / reference each at full width — they should share rows (P2); 99 narration (P9); 143-150 picker (P7).
- **Journal import** — [ImportJournals.tsx](../packages/app/features/books/ImportJournals.tsx): 168-179 "Choose file" stretches (P3); 181-191 paste box (P9); 207-259 rows (P10); 263-279 Check / Import `flex: 1` (P3).
- **Opening balances import** — [ImportOpenings.tsx:74-86](../packages/app/features/ledger/ImportOpenings.tsx#L74-L86): the `Segmented` sits outside any container at 1280px (P4/P1).
- **Fixed asset form** — [FixedAssetForm.tsx](../packages/app/features/books/FixedAssetForm.tsx) (720px): 151 account alone (P2); 177 SLM / WDV `Segmented` (P4); 179, 181 life and rate (short numbers) at 720px (P2); 197 notes (P9); 203-204 disposal fields (P2); 210 Remove stretches (P3); 140 `paddingBottom` 140 (P11); 222-243 pickers (P7; the 6-option category picker would fit a dropdown).
- **Budget form** — [BudgetForm.tsx](../packages/app/features/books/BudgetForm.tsx): 96 limit switched off (P1); 99 name at 1280px (P2); 105 year `Segmented` (P4); 111-140 one card per account, with the annual amount at 1280px and a stretched "Show months" button (P5/P2/P3). On desktop this should be **one table: accounts × 12 months plus annual**. 143-144 stretched buttons (P3); 150-159 picker (P7).

**Shared import wizard** — [ImportFlow.tsx](../packages/app/features/import/ImportFlow.tsx). Items, bank statements and opening balances. **H.**
- 260 — limit switched off (P1).
- 272 — phone `Stepper` at full width (P11).
- 279 — "Choose file" stretches, and there is no drop zone (P3/P8).
- 297-307 — one full-width picker per mapped column (P2); should be a mapping table (field | file column | sample).
- 316-319, 372-391 — `flex: 1` buttons (P3).
- 396-409 — column picker (P7).
- The preview `DataTable` is good.

**Bank reconciliation**
- [reconciliation/[accountId]/index.tsx:81-86](../packages/app/screens/(app)/books/reconciliation/[accountId]/index.tsx#L81-L86) — 5 tabs across the page (P4).
- [BankLinesView.tsx](../packages/app/features/banking/BankLinesView.tsx) — the table is good.
- [LineSheets.tsx](../packages/app/features/banking/LineSheets.tsx), all P7:
  - `FindMatchSheet` (61-78);
  - **`RecordPaymentSheet`** (120-172): party, a list of invoices to allocate, method, notes (P9), `fullWidth` Save — **drawer**, plus bug B4;
  - `RecordExpenseSheet` (228-286);
  - `RecordVoucherSheet` (321-353, the full chart of accounts; a combobox would fit);
  - `ExcludeSheet` (370-384, fine as a dialog).
- [ImportsView.tsx](../packages/app/features/banking/ImportsView.tsx) — 36 padding applied twice (P12); 37-54 rows with Undo far right where a table belongs (P10); empty states (P8).
- [ReconciliationView.tsx](../packages/app/features/banking/ReconciliationView.tsx) — 111-121 `KeyFigures` and 153-167 difference card (P10).

**Dashboard and hubs**
- **Home** — [(tabs)/index.tsx](../packages/app/screens/(app)/(tabs)/index.tsx):
  - 109-148 — the header **"Create" opens a 520px `Sheet`** listing every quick action (P7); should be an anchored `Menu`;
  - 228-230 — `QuickActions` phone carousel of 84px tiles ([QuickActions.tsx:40-77](../packages/app/components/QuickActions.tsx#L40-L77)), which repeats the Create button (P11);
  - 155-212 — `bottomInset={80}` (P11);
  - 224-226 — setup checklist at full width (P12);
  - 299-548 — `Columns` split 50/50 where about 2:1 would suit the charts (P12);
  - 377-393 — payable card (P10, L).
- [PeriodBar.tsx:110-130](../packages/app/features/dashboard/PeriodBar.tsx#L110-L130) — custom range `Sheet` with a `fullWidth` Apply (P7/P3); should be a popover.
- [HubState.tsx:22-30](../packages/app/features/dashboard/HubState.tsx#L22-L30) — failure card (P8).
- [FirstRunDesktop.tsx:75-110](../packages/app/features/reports/FirstRunDesktop.tsx#L75-L110) — tiles `flex: 1` (P5, L).
- **Sales hub** — [(tabs)/sales.tsx](../packages/app/screens/(app)/(tabs)/sales.tsx): **no desktop branch** (P11). 63 `paddingBottom` 120; 115-117 chart (P5); 120 `HubTiles` (P5); 130-132 ranked bars (P5); 135-156 `DocumentRow`s (P10); 137 empty state (P8).
- **Money** — [(tabs)/money.tsx:27](../packages/app/screens/(app)/(tabs)/money.tsx#L27): the whole page is `HubTiles` (P5).
- **More** — [(tabs)/more.tsx](../packages/app/screens/(app)/(tabs)/more.tsx): 44-60 profile card (P5/P10); 62-64 group cards, the last one stretches to full width (P5); 83-92 sign-out row (P10).
- **Reports tab** — 148-157 failure state (P8), otherwise fine.

### 4.4 GST, compliance, inventory, catalog, contacts

**GST hub** — [(tabs)/gst.tsx](../packages/app/screens/(app)/(tabs)/gst.tsx) → [ComplianceHub.tsx](../packages/app/features/compliance/ComplianceHub.tsx). Also `compliance/index.tsx`. **H.**
- gst.tsx 35 — `HubTiles` (P5); 32 — `bottomInset={120}` (P11).
- ComplianceHub:
  - 94-102 — E-invoices \| E-way bills, two 620px tabs (P4);
  - 105-136 — `StatRow` of 2, each half the page (P5);
  - 140-172 — unbilled / expiring banners, one line spread across the page (P12);
  - 176-178 — "switched off" card (P8);
  - 182-187 — search (P6);
  - 228-304 — `ListRow` lists with the badge far right (P10); should be a `DataTable` (number, party, date, IRN / validity, amount, status);
  - 246, 273, 306 — empty states (P8).

**GSTR-1** — [gst/gstr1.tsx](../packages/app/screens/(app)/gst/gstr1.tsx):
- 315-322 — month picker alone at full width (P2).
- 331-337 — `KeyFigures` (P10).
- 359-363 — **11-tab `Segmented`** across the page (P4).
- 384-392 — empty card (P8).
- 408-416 — month picker with 24 options (P7), plus the `ReportShell` sheets.

**GSTR-2B / 2B reconciliation** — [gst/gstr2b.tsx](../packages/app/screens/(app)/gst/gstr2b.tsx). **H.**
- 232 — no limit (P1).
- 239-248 — GSTIN and period pickers `flex: 1`; with one GSTIN the period picker is full width (P2).
- 261-274 — Download / Upload `flexGrow: 1` (P3).
- 293-300 — `KeyFigures` (P10).
- 302-307 — 4-column table at 1250px (P10).
- 313-329 — Reconcile and Claim `flexGrow: 1` (P3).
- 351-408 — one phone card per 2B line, "In 2B" and "In books" about 600px apart (P10/P11). Should be a **reconciliation table** (supplier, number, date, 2B taxable + tax, books taxable + tax, reasons, status, actions).
- 423 — Chase button stretches (P3).
- 445, 455 — GSTIN and period pickers (P7).
- 446-454 — "Link a bill" picker (P7, **drawer**).

**GST returns** — [gst/returns.tsx](../packages/app/screens/(app)/gst/returns.tsx):
- 328 — no limit (P1).
- 335-344 — pickers `flex: 1` (P2).
- 357-365 — `KeyFigures` (P10).
- 376-386 — info cards (P8).
- 274-321 — GSTR-1 and GSTR-3B cards stacked where they could sit side by side (P5).
- 313, 315 — Send EVC / File stretch (P3).
- 314 — a 6-digit OTP at about 1200px (P2).
- 397-405 — `Segmented` (P4).
- 412-500 — 3- and 6-column tables at full width (P10).
- 512-542 — breakup `Sheet` listing source documents (P7, **drawer**).
- 556-557 — pickers (P7).

**GST utilisation** — [gst/utilization.tsx](../packages/app/screens/(app)/gst/utilization.tsx):
- 195 — limit switched off (P1).
- 200-212 — three fields at about 400px (P2).
- 177-181, 278-294 — amount fields `flexGrow`; a lone credit head is full width (P2).
- 247-264 — voucher `ListRow`s (P10).
- 302-308 — `KeyFigures` (P10).
- 325, 329 — "Record challan" and "Reset prefill" stretch (P3).
- 328 — narration (P2/P9).
- 355-356 — pickers (P7).

**GST challan** — [gst/challan.tsx](../packages/app/screens/(app)/gst/challan.tsx):
- 107 — limit 960 (P1).
- 112 paid-from, 113 CPIN (14 characters) and 122 deposited-on, each about 930px (P2).
- 114-121 — CIN / BRN (P2, L).
- 144-160 — recent rows (P10).
- 172 — picker (P7).

**GST journal** — goes to `VoucherForm` (see 4.3).

**E-invoice** — `ComplianceCard` in the side panel is fine. `EInvoiceSheet`: see 4.1.

**New e-way bill** — [EwayBillFormDesktop.tsx](../apps/web/src/screens/EwayBillFormDesktop.tsx):
- 416-417 — `SplitPane` with no limit (P1).
- 278-284 — saved-transporter picker alone at about 870px (P2).
- 300-326 — mode and cargo `Segmented` at half width (P4, L).
- 360 — distance alone (P2).
- `EwayBillFormSheets` ([EwayBillForm.tsx:461, 477, 492](../packages/app/features/compliance/EwayBillForm.tsx#L461)) (P7): state (36 entries — a combobox would fit), transporter, sub-supply.
- **Plus bug B3.**

**E-way bill detail** — [EwayBillDetailDesktop.tsx](../apps/web/src/screens/EwayBillDetailDesktop.tsx):
- 153 — no side padding (P12).
- 236-241 — facts spread out (P5, L).
- 306 — empty state (P8).
- `EwayBillActionSheets` ([EwayBillDetail.tsx](../packages/app/features/compliance/EwayBillDetail.tsx)), all P7 with `fullWidth` footers:
  - **`PartBSheet`** (516-589);
  - **`ExtendSheet`** (624-690);
  - **`CancelSheet`** (711-735).
  - All have multi-line remarks (P9). Drawers.
- **Plus bug B3.**

**Transporters and vehicles**
- [TransportersDesktop.tsx](../apps/web/src/screens/TransportersDesktop.tsx): 106 no limit; 120-156 rows (P10); 108-118 empty state (P8). Its dialog is the **good pattern**.
- [settings/vehicles.tsx](../packages/app/screens/(app)/settings/vehicles.tsx): 54 no limit (P1, plus `paddingBottom` P11); 63-72 rows (P10); 77 empty state (P8); 83-125 sheet (P7; acceptable as a small dialog).
- [VehicleField.tsx:16-29](../packages/app/features/vehicles/VehicleField.tsx#L16-L29): full-width picker plus sheet (P2/P7).

**Inventory hub** — [(tabs)/inventory.tsx](../packages/app/screens/(app)/(tabs)/inventory.tsx). No desktop branch. **H.**
- 87-104 — `StatRow` of 2, each about 630px (P5).
- 107-124 — search at full width (P6); the barcode-scan button inside it is a camera action on desktop (P11).
- 125-135 — 4-tab `Segmented` (P4).
- 144-238 — custom item rows (P10). The **items list (`catalog/items`) has a `DataTable`; this tab doesn't**.
- 150-158 — empty state (P8).
- 242-291 — header "New" opens a 6-link `Sheet` (P7); should be an anchored `Menu`.
- 79 — `paddingBottom` 120 (P11).

**Low stock** — [inventory/low-stock.tsx](../packages/app/screens/(app)/inventory/low-stock.tsx):
- 61 — no limit (P1).
- 68-77 — `StatRow` of 2 (P5).
- 87-139 — rows (P10); should be a table (item, SKU, on hand, reorder level, suggested quantity, cost).
- 85 — empty state (P8).

**Stock adjust** — [StockAdjustDesktop.tsx](../apps/web/src/screens/inventory/StockAdjustDesktop.tsx):
- 93 — no side padding (P12).
- 97-113 — item picker alone with one branch (P2).
- 148 — reason alone (P2).
- 189-213 — item, branch and reason pickers (P7; the item picker would fit a **combobox**).

**Stock transfer** — [StockTransferDesktop.tsx](../apps/web/src/screens/inventory/StockTransferDesktop.tsx):
- 86 — no side padding (P12).
- 91 — item alone (P2).
- 134-140 — notes (P9).
- 186-208 — pickers (P7).

**Opening stock** — [OpeningStockDesktop.tsx](../apps/web/src/screens/inventory/OpeningStockDesktop.tsx):
- 85 — no side padding (P12).
- 90 — search (P6).
- 92-94 — empty state (P8).
- 146 — date alone (P2).
- 150 — Submit stretches across the side column (P3).

**Scan barcode** — [ScanBarcodeDesktop.tsx](../apps/web/src/screens/inventory/ScanBarcodeDesktop.tsx):
- 41 — no side padding (P12).
- 45-61 — "point the camera" placeholder on desktop (P8/P11).
- 64 — barcode field alone (P2).
- 114-124 — empty state (P8).

**Stock movements** — [StockMovementsDesktop.tsx](../apps/web/src/screens/inventory/StockMovementsDesktop.tsx): fine. Only 203 (the load-more skeleton collapses) is P12.

**Item form (desktop)** — [ItemFormDesktop.tsx](../apps/web/src/screens/inventory/ItemFormDesktop.tsx):
- 187-188 — `TwoColumns fill`, no limit (P1).
- 217 — name at about 700px (P2).
- 219-232 — SKU row holds only SKU for a service (P2).
- 234 — description (P9).
- 251 — custom fields (P2).
- 300 — unit alone; 338 — date alone (P2).
- 357-382 — unit, tax, category and brand pickers (P7).
- **Plus bug B2.**

**Item detail** — [catalog/items/[id]/index.tsx](../packages/app/screens/(app)/catalog/items/[id]/index.tsx):
- 286 — for an untracked item the main column holds only 4 pricing rows (P10/P8).
- 197-248 — movement rows (last 20) where a `DataTable` with a ledger link belongs (P10).
- 263, 319-358 — Actions `Sheet` (P7); should be a `Menu`.

**Item categories** — [settings/item-categories.tsx](../packages/app/screens/(app)/settings/item-categories.tsx): 55 no limit (P1); rows (P10); empty state (P8); 77-144 sheet (P7). There are no unit or price-list screens.

**Party form** — [PartyForm.tsx](../packages/app/features/contacts/PartyForm.tsx). **H.**
- 651 — limit switched off (P1).
- 470 — kind `Segmented` (P4).
- 568 — billing address alone (P2).
- 587 — "Same as billing" switch about 850px from its label (P12).
- 476 — custom fields (P2).
- 622-628 — tablet stacking (P11).
- **Too narrow:** 355-366 — lower-TDS rate and date in the 360px side panel (P12).
- 680-768 — 8 pickers (P7): state, registration type, country (about 200 entries) and currency would fit a **combobox**; TDS, TCS, MSME and payment terms would fit a dropdown.

**Party detail** — [PartyDetail.tsx](../packages/app/features/contacts/PartyDetail.tsx):
- 410-419 — `Segmented` (P4).
- 145-151, 243-254 — `DocumentRow`s (P10).
- 300-331 — payment rows (P10).
- 276 — "See all" stretches (P3).
- **Too narrow:** 202-228 — `StatRow` of 2–3 tiles in the 340px side panel, about 100px per tile (P5).
- 381, 476-524 — Actions `Sheet` (P7); should be a `Menu`.
- 541 — reminder sheet (P7).

**Party statement** — [PartyStatementView.tsx](../packages/app/features/contacts/PartyStatementView.tsx):
- 77 — no limit (P1).
- 78-85 — From / To dates at about 620px each (P2).
- 93-110 — opening and closing figures 1200px apart (P5/P10).
- 113-134 — `ListRow` entries (P10); should be a ledger table (date, type, number, debit, credit, balance).
- 136 — empty state (P8).
- 139 — Download PDF at the bottom of the list; it belongs in the page header (P12).

**Contact import** — [ImportContacts.tsx](../packages/app/features/contacts/ImportContacts.tsx) (720px):
- 92 — `Segmented` (P4).
- 95-106 — "Choose file" stretches (P3).
- 108-115 — paste box (P9).
- 134-151 — preview `ListRow`s (P10).
- 161-168 — `flex: 1` buttons (P3).
- **Plus B5.**

**Custom fields section** — [CustomFieldsSection.tsx:55-93](../packages/app/features/customFields/CustomFieldsSection.tsx#L55-L93): one field per row at the host's full width, with no grid on desktop (P2). Checkbox fields render as a `SwitchField` (P12). Its picker is P7. Used in the document editor, item form and party form.

The contacts list and items list are fine.

### 4.5 Settings

Settings pages sit beside a 240px nav in a column capped at 880px (Plan and Invoice design get about 1000px). **Twelve settings pages have no form limit**, so their fields are 880px wide: company, e-invoicing, gst-portal, approvals, custom-fields, profile, ai-usage, notifications, appearance, about, devices, integrations.

| Page | Findings |
|---|---|
| **Business profile** [company.tsx](../packages/app/screens/(app)/settings/company.tsx) — **H** | 181-185 about 30 fields with no limit (P1). Each alone at 880px (P2): business type 199, website 205, address 208, state 209, account name 221, UPI 245-254, financial-year start 262, GSTIN 272-280, TAN / LUT 306-327, MSME rate and 2B tolerance 342-359 (1–2 digit numbers). 210-213 PIN about 430px; 222-244 IFSC about 430px; 258-261 two disabled pickers. 264-339 switches (P10). 294-301 return-frequency `Segmented` (P4). 370-382 plus `CityField` — 4 short pickers as modals (P7; combobox or dropdown). [LogoSection](../packages/app/features/company/LogoSection.tsx#L80) and [SignatureSection](../packages/app/features/company/SignatureSection.tsx#L88) cards at 880px (P12); signature preview / view sheets (P7, fine as a lightbox). [ArchiveSection:53-89](../packages/app/features/company/ArchiveSection.tsx#L53-L89) rows (P10). [ArchiveCompanySheet:93-172](../packages/app/features/company/ArchiveCompanySheet.tsx#L93-L172) stretched buttons at 103, 112, 141, 147 (P3; keep it a modal) |
| **Branches** [branches.tsx](../packages/app/screens/(app)/settings/branches.tsx) | 196 `paddingBottom` (P11); 208-227 rows where a table belongs (P10); 210 empty state (P8); **237-312 add/edit branch `Sheet` with 9 fields — drawer** (P7, address P9); 297 city and 314-324 state pickers open on top of it (P7, modal on modal) |
| **Users** [users.tsx](../packages/app/screens/(app)/settings/users.tsx) | 168 `paddingBottom` (P11); 169-188 rows where a table belongs (P10); 191-202 roles card (P12); **207-272 invite / edit `Sheet` — drawer**, footer Remove `flex: 1`, Resend / Save `flex: 2` (P7/P3); 274-282 role picker on top of it (P7) |
| **Approvals** [approvals.tsx](../packages/app/screens/(app)/settings/approvals.tsx) | 54 limit switched off (P1); 65-66 nine amount fields at 880px and switches (P2/P10) |
| **Custom fields** [custom-fields.tsx](../packages/app/screens/(app)/settings/custom-fields.tsx) | 56 limit switched off (P1); 58 `paddingBottom` (P11); 62 `Segmented` (P4); 64-76 rows (P10); 86-130 sheet whose 5-option `Segmented` is too tight at 520px (P7/P4) |
| **Taxes** [taxes.tsx](../packages/app/screens/(app)/settings/taxes.tsx) | 100 `paddingBottom` (P11); 101-113 card (P12); 115-133 rows where a table belongs (P10); 117 empty state (P8); 136-153 label / value rows (P10); 159-203 sheet (P7/P9) |
| **Payment accounts** [accounts.tsx](../packages/app/screens/(app)/settings/accounts.tsx) | 110 `paddingBottom` (P11); 111-117 total card (P5); 121-141 rows where a table belongs (P10); **146-206 add / edit account `Sheet` — drawer** (P7, `Segmented` P4) |
| **Currencies** [currencies.tsx](../packages/app/screens/(app)/settings/currencies.tsx) | 94 `paddingBottom` (P11); 95-103 card (P5); 107-145 rows and history where a table belongs (P10); 109 empty state (P8); 150-187 sheet plus 189-196 currency picker on top of it (P7) |
| **Numbering** [numbering.tsx](../packages/app/screens/(app)/settings/numbering.tsx) | 101-105 card (P12); 107-121 rows where a table belongs (P10); 124-183 sheet (P7), 1-digit "Digits" field at sheet width (P2), 128 `fullWidth` Save (P3); 185-193 3-option reset picker on top of it (P7; a `Segmented` would do) |
| **Brands / item categories / expense categories / vehicles** | `paddingBottom` (P11) at brands 49, item-categories 55, expense-categories 59, vehicles 54; rows (P10); empty states (P8); one- or two-field sheets as 520px modals (P7) — brands 63-102, item-categories 77-144, expense-categories 88-127, vehicles 83-125 |
| **E-invoicing** [e-invoicing.tsx](../packages/app/screens/(app)/settings/e-invoicing.tsx) | 149-153 no limit (P1); 174-195, 216-232, 263-290 fields alone at 880px — turnover, window (1–2 digits), username / password, threshold, transporter, distance (P2); 199-209, 294-303, 308-315 `Segmented`s (P4); switches (P10); 320-341 status rows (P10); 358-378 transporter picker with a `fullWidth` footer (P7/P3) |
| **GST portal** [gst-portal.tsx](../packages/app/screens/(app)/settings/gst-portal.tsx) | 86 no limit (P1); 87-94 card (P12); 120-147 per-GSTIN card — badge far right (P10), username and 6-digit OTP at 880px (P2), Disconnect / Connect / Send OTP stretched (P3); 96-110 states (P8) |
| **Security** [security.tsx](../packages/app/screens/(app)/settings/security.tsx) (520px) | 113, 114, 123-134, 149-157, 164-166 Turn on / Turn off / Confirm / Cancel / Copy codes / "I've saved them" all stacked full width (P3) |
| **Devices** [devices.tsx](../packages/app/screens/(app)/settings/devices.tsx) | 31 no limit (P1); cards (P12); 36-55 rows where a table belongs (P10) |
| **Audit trail** [audit.tsx](../packages/app/screens/(app)/settings/audit.tsx) | 59-64 search (P6); 74-131 expandable rows where a table belongs (P10); 78 empty state (P8); 134-137 card (P12) |
| **Backup** [backup.tsx](../packages/app/screens/(app)/settings/backup.tsx) | 111 `paddingBottom` 140 (P11); cards (P12); 127-161 count / format rows (P10); 163-192 switch (P10), skeleton (P8) |
| **Notifications settings** [notifications.tsx](../packages/app/screens/(app)/settings/notifications.tsx) | 59 no limit (P1); 68-69 buttons stretch (P3); 74-78 switches (P10); 80-95 states (P8) |
| **AI usage** [ai-usage.tsx](../packages/app/screens/(app)/settings/ai-usage.tsx) | 55-65 no limit (P1); 75-97 bar (P12); 134-143 budget field at 880px (P2); 147 `LixiAccessCard` (B6, P11) |
| **Appearance** [appearance.tsx](../packages/app/screens/(app)/settings/appearance.tsx) | 109 no limit (P1); 110-140 radio rows with the check far right (P10); 148-162 `StatRow` of 2 (P5); 164-173 card (P12) |
| **Profile** [profile.tsx](../packages/app/screens/(app)/settings/profile.tsx) | 72-76 no limit (P1); 77-83 avatar card (P5); 85-87 name / email / phone each at 880px (P2); 90-106 rows (P10); [DeleteAccountSheet:95-175](../packages/app/features/session/DeleteAccountSheet.tsx#L95-L175) stretched buttons at 100, 108, 126, 151, 157 (P3) |
| **About** [about.tsx](../packages/app/screens/(app)/settings/about.tsx) | 28 no limit (P1); 29-34 brand card (P5); 36-45 rows (P10); 47-52 card (P12) |
| **Integrations** [integrations.tsx](../packages/app/screens/(app)/settings/integrations.tsx) | 48 no limit (P1); 49-53 card (P12); 66-145 rows with the switch far right where a card grid belongs (P10) |
| **Invoice design** [invoice-design.tsx:113](../packages/app/screens/(app)/settings/invoice-design.tsx#L113) | Preview `flex: 1` keeps widening with the window; needs an A4 ratio or a maximum width (P12) |
| **Plan** [PlanBillingDesktop.tsx](../apps/web/src/screens/PlanBillingDesktop.tsx) | 126-141 the last plan card stretches when the cards wrap (P5, L); 178 `fullWidth` button (P3, L) |
| **Expense categories** [expense-categories.tsx](../packages/app/screens/(app)/settings/expense-categories.tsx) | 59-84 no limit, rows with the total far right (P1/P10) |
| Modules | Fine (520px) |

### 4.6 Sign-in, onboarding, search, notifications, Lixi

- **Sign-in screens** — fine. The form column is 380px. Only [welcome.tsx:52-55](../packages/app/screens/(auth)/welcome.tsx#L52-L55) has `fullWidth` buttons that stretch at tablet width (L).
- **Onboarding** (`WizardShell`, 760px):
  - [country.tsx](../packages/app/screens/(onboarding)/country.tsx) — 37-43 picker alone (P2); 74-108 three pickers (P7).
  - [business.tsx](../packages/app/screens/(onboarding)/business.tsx) — 170-176 address alone (P2); 250-273 pickers plus city (P7).
  - [tax.tsx](../packages/app/screens/(onboarding)/tax.tsx) — 92-110 a 15-character GSTIN at 760px (P2); switches (P10).
  - [numbering.tsx](../packages/app/screens/(onboarding)/numbering.tsx) — 36-47 card (P5); 68-73 switch (P10).
  - [branches.tsx](../packages/app/screens/(onboarding)/branches.tsx) — 110-163 stacked fields, including a 5-character code at 760px (P2); 162 "Add branch" stretches (P3); 88-108 cards (P10); 180-190 pickers (P7).
  - `done.tsx` is fine.
- **Search** — [search.tsx](../packages/app/screens/(app)/search.tsx): 33-41 search at 1280px (P6); 44-59 empty states (P8); 70-149 result rows (P10).
- **Notifications** — [notifications.tsx](../packages/app/screens/(app)/notifications.tsx): has a desktop branch, but 113-203 rows still span 1280px with the time at the far right (P10); 104-111 empty state (P8).
- **Lixi** — `LixiPanel` (420px) is fine. [lixi.tsx:457](../packages/app/screens/(app)/lixi.tsx#L457) — the 640px bubble cap is larger than the 420px panel, so it does nothing (L). 403-423 — confirm dialogs centre over the whole app rather than the panel (L).
- **Security gate / update gate** — fine (420px cards).

---

## 5. Every sheet, grouped by what it should become on desktop

**Right-side drawer** — long forms, or lists the user compares while the form stays visible:
- **Document editor:** customer / supplier picker; add item; `LineEditorSheet`.
- **Returns and notes:** "Choose lines" in `ReturnSourcePicker`.
- **Compliance:** `EInvoiceSheet` (generate / view, cancel); e-way bill Part B, Extend and Cancel; GSTR-2B "Link a bill"; GST return breakup.
- **Bank reconciliation:** `RecordPaymentSheet`, `RecordExpenseSheet`, `FindMatchSheet`.
- **Masters:** add / edit account (chart of accounts); add / edit cost centre; branch; user; payment account.

**Anchored dropdown `Menu`** — lists of actions:
- the document detail Actions sheet and Change status;
- item detail Actions;
- party detail Actions;
- Home "Create";
- Inventory "New";
- report Export;
- `LineGrid` tax, ITC and cost-centre cells.

**Combobox or anchored dropdown** — choosing one value:
- long lists: state / place of supply, country, currency, city, TDS / TCS section, chart-of-accounts account, item (stock adjust and transfer), party (report filters, statements);
- short lists: branch, unit, tax rate, payment method, paid-from account, category, brand, registration type, MSME type, payment terms, note reason, ITC eligibility, recurrence, financial-year month, business type, role, reset policy, GSTIN, period / month.

**Popover attached to the control:**
- the report date range (`ReportShell`);
- the dashboard custom range (`PeriodBar`).

**Fine as a centred dialog** (destructive or very small; mainly right-align the buttons):
- `ConfirmDialog`, `ExcludeSheet`, `ArchiveCompanySheet`, `DeleteAccountSheet`, `PaymentReminderSheet`, `RefundAdvanceSheet`;
- the signature preview / view;
- the brand, item-category, expense-category and vehicle one-field forms, the save-template sheet and the add-category sheet (or replace them with inline add).

---

## 6. Phone-only patterns showing on desktop (P11)

- **Bottom padding for a FAB or bottom bar:**
  - hubs — `(tabs)/sales` 63, `(tabs)/purchases` 223, `(tabs)/inventory` 79, `(tabs)/gst` 32 (`bottomInset` 120), Home `bottomInset={80}`;
  - books — vouchers 52, budgets 32, fixed assets 42, cost centres 67, `FixedAssetForm` 140;
  - settings — branches, users, taxes, accounts, currencies, custom fields, brands, item categories, expense categories, vehicles, backup.
- **Bottom action bars:** the print-preview bottom bar, and `FormActions` as a full-width bar (`ExpenseForm`, `payments/new`).
- **Carousels and gestures:** the `QuickActions` carousel on Home; `LixiAccessCard` gesture settings.
- **Camera:** the barcode-scan button in the inventory search; the scan-barcode camera placeholder.
- **Wizard stepper:** in `ImportFlow`.
- **No desktop layout at all:** the Sales hub, Purchases hub, Inventory hub, low stock, `ReturnSourcePicker`, sales approvals, party statement, search.
- **Tablet width (768–1023px) stacks with no limit:** `ExpenseForm`, `payments/new`, expense detail, OCR capture and review, `PartyForm`.

---

## 7. Too narrow (the opposite problem)

- The 520px sheet limit, applied to every picker and editor (root cause 3).
- `payments/new` side card: service-advance fields at about 150px, and the cramped TDS picker.
- `PartyForm` side panel: lower-TDS rate and date.
- `PartyDetail` side panel: 2–3 stat tiles at about 100px each.
- Document editor: the bill-of-entry block packed into one cell (about 100px inputs).
- OCR review: the bill photo at 240px tall.
- The custom-fields 5-option `Segmented` inside a 520px sheet.
- `ConfirmDialog` at 380px for long messages (L).
- The `EmptyState` message capped at 280px (L).
- The `Sheet` description and note text cut to one line.
