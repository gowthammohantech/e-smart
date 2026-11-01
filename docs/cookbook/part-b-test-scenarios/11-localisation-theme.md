# 11 — Language & theme

Tests for English and Tamil (தமிழ்), the light, dark and device themes, and the Lixi open-gesture settings. Setup and demo data are in [00 — Test setup](00-test-setup.md).

The settings live at **More › Settings › Appearance**.

### Language

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| L10N-001 | Options | Any | | Open Language | **Match device**, English, தமிழ் | happy |
| L10N-002 | Match device by default | | Fresh install, device set to Tamil | Launch | UI in Tamil | happy |
| L10N-003 | Switch to Tamil | | | Pick தமிழ் | Tabs, buttons and messages switch at once, without a restart | happy |
| L10N-004 | GST terms stay English | | Tamil | Open an invoice and the GST hub | GST, GSTIN, HSN, IRN stay in English ("Tax terms like GST, GSTIN and HSN stay in English…") | happy |
| L10N-005 | Every screen translated | | Tamil | Walk every screen in Part A | No English strings left except tax terms. **Known gap**: GST tab tiles "Invoices", "GSTR-1", "Transporters", "GST settings" are hard-coded English | edge |
| L10N-006 | Validation messages | | Tamil | Trigger ONB-010, SAL-055, PAY-008 | Messages in Tamil | happy |
| L10N-007 | Plurals | | Tamil | Lists with 1 and with many entries | Correct singular and plural | edge |
| L10N-008 | Long text fits | | Tamil, 📱 small phone (iPhone SE) | Tab bar, buttons, document editor | No clipping or overflow; labels wrap or shorten | edge |
| L10N-009 | Numbers and dates | | Tamil | Amounts and dates | Indian grouping (₹1,85,000.00) unchanged; dates readable | edge |
| L10N-010 | Tamil PDF | | Online, Tamil | **Share PDF** | Tamil labels; tax terms and amounts correct [sim] | happy |
| L10N-011 | Language kept | | Tamil | Kill and relaunch | Still Tamil | happy |
| L10N-012 | Tamil on the web | | 🖥 | Switch language | Sidebar, top bar and command palette in Tamil | happy |
| L10N-013 | Screen reader | | Tamil, VoiceOver or TalkBack | Navigate the OTP and invoice screens | Labels read in Tamil (e.g. OTP digit labels) | edge |

### Theme

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| L10N-020 | Default theme | | Fresh install | Launch | **Light**. Note: the Dark option's hint says "The default look…", which is wrong | edge |
| L10N-021 | Dark | | | Pick **Dark** | Whole app dark, including charts and status colours | happy |
| L10N-022 | Match device | | | Pick **Match device**, then flip the OS theme | Follows the device setting live | happy |
| L10N-023 | Contrast | | Dark | Status chips (Overdue, Paid) and charts | Readable; status colours not reused as chart series colours | edge |
| L10N-024 | Web theme | | 🖥 | Switch | Sidebar, tables and dialogs follow | happy |

### Lixi open gestures (same screen)

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| L10N-030 | Hold a tab | | 📱 on | Press and hold the Sell tab | Lixi opens already answering about Sell | happy |
| L10N-031 | Swipe up | | 📱 on | Swipe up on the tab bar | Orb locks in → Lixi opens | happy |
| L10N-032 | Floating orb | | Off by default → turn on | Drag the orb, then tap it | Moves; tap opens Lixi | happy |
| L10N-033 | Pull down on Home | | On | Pull Home down | Lixi opens | happy |
| L10N-034 | All gestures off | | Turn every gesture off | — | Note "With every way off, Lixi is still under More → Ask Lixi"; works from there | edge |
| L10N-035 | Show tips again | | | **Show gesture tips again** | "Gesture tips will show again above the tab bar" | happy |
| L10N-036 | Lixi offline | | Offline | Ask a question | Needs a connection | offline |
| L10N-037 | Lixi action needs confirming | Owner | Online | Ask "remind Kumar Electronics about overdue invoices" | Lixi proposes the action and waits for you to confirm before doing anything [sim] | happy |
