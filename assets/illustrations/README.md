# Illustrations

Every file here is a **placeholder** drawn in the spirit of Storyset's
**Rafiki** style, so the app looks finished before the real artwork lands.

## Swapping in the real Storyset art

1. Go to [storyset.com](https://storyset.com) and find the illustration.
2. Switch the style to **Rafiki**.
3. Open the colour picker and set the accent to **`#007AFF`** — that is the
   app's brand blue, and it keeps the set looking like one system.
4. Download **GIF** for the four heroes and **PNG** for everything else, at
   roughly **480px** wide. Keep each GIF under ~300KB.
5. Save it over the file of the same name in this folder.

**That is the whole job — no code changes.** `src/illustrations/registry.ts`
resolves each name to the filename, so replacing the file replaces the art.

## What belongs in each file

### Heroes — animated GIF

| File | Where it appears | Suggested Storyset search |
|---|---|---|
| `welcome.gif` | Sign-in welcome screen | "business deal", "startup life" |
| `setup-complete.gif` | End of the onboarding wizard | "completed", "celebration" |
| `empty-dashboard.gif` | Home, before the business has any data | "data analysis", "dashboard" |

### Full-size empty states — PNG

| File | Where it appears | Suggested Storyset search |
|---|---|---|
| `not-found.png` | Any document, contact, item or payment that no longer exists | "no data", "page not found" |
| `mail-sent.png` | Password reset confirmation | "mail sent", "confirmed" |
| `search-idle.png` | Global search before typing | "search", "searching" |
| `search-empty.png` | Global search with no matches | "no results", "not found" |
| `single-location.png` | Branch transfer with only one branch | "warehouse", "location" |

### Compact empty states — PNG

| File | Where it appears | Suggested Storyset search |
|---|---|---|
| `no-documents.png` | Empty invoice / quote / bill lists, Home and tab recents | "add file", "documents" |
| `no-contacts.png` | Contacts tab with no customers or suppliers | "add user", "contacts" |
| `no-items.png` | Inventory and opening stock with no items | "empty box", "products" |
| `no-payments.png` | Payment lists and party payment history | "wallet", "payment" |
| `all-settled.png` | Receivables and payables with nothing outstanding, sync queue clear | "completed", "done" |
| `no-notifications.png` | Notifications, all caught up | "notification", "bell" |

## Regenerating the placeholders

```bash
node tools/illustrations/generate.mjs
```

That redraws every file from `tools/illustrations/art.mjs`. It is only needed
while the placeholders are still in use — once the real art is in place, do not
run it or it will overwrite the downloads.

## Licence

Storyset illustrations are free to use with attribution. The app credits them
on **Settings → About**, and the README carries the same credit. If you move to
a Freepik premium licence that waives attribution, remove the `ListRow` in
`app/(app)/settings/about.tsx` that renders `ILLUSTRATION_CREDIT`.
