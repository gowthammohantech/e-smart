# 11 — Language & theme

Tests for English and Tamil (தமிழ்), the light, dark and device themes, loading placeholders, and the Lixi open-gesture settings. Setup and demo data are in [00 — Test setup](00-test-setup.md).

The settings live at 📱 **More › Appearance & language**, 🖥 account menu › **Appearance & language**.

### Language

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| L10N-001 | Options | Any | | Open **Language** | **Match device** (*Follows your phone, where Elixir Books Smart has the language.*), English, தமிழ் | happy |
| L10N-002 | Match device by default | | Fresh install, device set to Tamil | Launch | UI in Tamil | happy |
| L10N-003 | Switch to Tamil | | | Pick தமிழ் | Tabs, buttons and messages switch at once, without a restart; the tab swipe peek names tabs in Tamil too | happy |
| L10N-004 | GST terms stay English | | Tamil | Open an invoice and the GST hub | GST, GSTIN, HSN, IRN stay in English ("Tax terms like GST, GSTIN and HSN stay in English…") | happy |
| L10N-005 | Every screen translated | | Tamil | Walk every screen in Part A | No English strings left except tax terms, names and codes. Every English key has a Tamil one today; log any English text as a bug with its screen | edge |
| L10N-006 | Validation messages | | Tamil | Trigger ONB-010, SAL-055, PAY-008 | Messages in Tamil | happy |
| L10N-007 | Plurals | | Tamil | Lists with 1 and with many entries; the sidebar due card "in 1 day" / "in 5 days" | Correct singular and plural | edge |
| L10N-008 | Long text fits | | Tamil, 📱 small phone (iPhone SE) | Tab bar, buttons, document editor, onboarding steps | No clipping or overflow; labels wrap or shorten | edge |
| L10N-009 | Numbers and dates | | Tamil | Amounts and dates | Indian grouping (₹1,85,000.00) unchanged; dates readable | edge |
| L10N-010 | Tamil PDF | | Online, Tamil | **Share PDF** | Tamil labels; tax terms and amounts correct [sim] | happy |
| L10N-011 | Language kept | | Tamil | Kill and relaunch | Still Tamil | happy |
| L10N-012 | Tamil on the web | | 🖥 | Switch language | Sidebar sections and headings, top bar, business and branch pickers, command palette and the **Next filing** card in Tamil | happy |
| L10N-013 | Screen reader | | Tamil, VoiceOver or TalkBack | Navigate the OTP and invoice screens | Labels read in Tamil (e.g. OTP digit labels) | edge |
| L10N-014 | Newer screens in Tamil | | Tamil | Welcome, **Give it a try** and the Demo sheet, Home period bar and filing cards, Accounts & P&L, Your profile (security, privacy, delete account), Update required, You're offline | All in Tamil | happy |
| L10N-015 | Server messages | | Tamil | Trigger a refusal from the server (AUTH-090 lockout, AUTH-083 demo write) | Shown in Tamil from the app's own text, not the server's English | edge |

### Theme

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| L10N-020 | Default theme | | Fresh install | Launch | **Light**, whose hint says "The default look, with higher contrast in bright sunlight."; **Dark** says "Easy on the eyes indoors and at night." | edge |
| L10N-021 | Dark | | | Pick **Dark** | Whole app dark, including charts, status colours, the sidebar and drawers | happy |
| L10N-022 | Match device | | | Pick **Match device**, then flip the OS theme | Follows the device setting live | happy |
| L10N-023 | Contrast | | Dark | Status chips (Overdue, Paid), charts and the Preview on the Appearance page | Readable; status colours not reused as chart series colours | edge |
| L10N-024 | Web theme | | 🖥 | Switch | Sidebar, tables, dialogs, drawers and menus follow | happy |
| L10N-025 | Shimmer in both themes | | Slow network (DevTools › Slow 3G) | Open Home, a list, a report and a document in Light, then Dark | Grey placeholders shaped like the page sweep while loading; visible in both themes; no zero amounts or empty states before the data comes | edge |
| L10N-026 | Reduced motion | | OS "reduce motion" on | Load a page | Placeholders show without a sweeping animation, or with a calm one; nothing flashes | edge |

### Lixi open gestures (same screen)

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| L10N-030 | Hold a tab | | 📱 on | Press and hold the Sell tab | Lixi opens already answering about Sell | happy |
| L10N-031 | Swipe up | | 📱 on | Swipe up on the tab bar | Orb locks in → Lixi opens | happy |
| L10N-032 | Floating orb | Full plan | Off by default → turn on | Drag the orb, then tap it | Moves; tap opens Lixi. On a sales plan the orb sits in the tab bar instead and the floating one doesn't show | happy |
| L10N-033 | Pull down on Home | | On | Pull Home down | Lixi opens | happy |
| L10N-034 | All gestures off | | Turn every gesture off | — | Note "With every way off, Lixi is still under More → Ask Lixi"; works from there | edge |
| L10N-035 | Show tips again | | | **Show gesture tips again** | "Gesture tips will show again above the tab bar" | happy |
| L10N-036 | Lixi offline | | Offline | Ask a question | Needs a connection; nothing is queued | offline |
| L10N-037 | Lixi action needs confirming | Owner | Online | Ask "remind Kumar Electronics about overdue invoices" | Lixi proposes the action and waits for you to confirm before doing anything [sim] | happy |
