# Submitting to the App Store and Google Play

What to set in each store when submitting Elixir Books Smart. Use it with `apps/mobile/app.json`: the answers here must match the privacy manifest there.

## Versions

| | Where it lives | Next value |
|---|---|---|
| Version name | `expo.version` in `apps/mobile/app.json` | `1.0.1` |
| iOS build number | `expo.ios.buildNumber` | `103` (102 was the last upload) |
| Android version code | `expo.android.versionCode` | `7` (6 was the last upload) |

Raise the build number and version code before every upload. Each store refuses a number it has already seen. The app's About screen shows the installed build, for example `1.0.1 (103)`.

## Building

Builds are made locally (Xcode and Gradle). `apps/mobile/eas.json` holds the same settings for EAS if it is adopted later.

1. Export the API URL. A release build without it shows "This build of the app doesn't know where its server is" on launch instead of calling localhost.
   - Production: `EXPO_PUBLIC_API_URL=https://api-production-4abd.up.railway.app`
   - Demo (TestFlight internal and Play internal only): `https://api-demo-e37f.up.railway.app`, with the demo login variables from `apps/mobile/.env.demo.local`. Never submit a demo build for review.
2. Run `npx expo prebuild --clean` in `apps/mobile`. This applies `app.json`: privacy manifest, permissions, `allowBackup`, signing.
3. Android: `cd android && ./gradlew bundleRelease`.
   - It refuses to build without `apps/mobile/credentials/elixir-upload.keystore` and `android-signing.properties`.
   - To check the API host in the bundle, run `grep -ac <host> app/build/generated/assets/**/index.android.bundle`. macOS `strings` misses Hermes strings.
4. iOS: archive in Xcode with team `93XKQVM4YX`, then export with `testFlightInternalTestingOnly=false` for the App Store.
   - In Organizer, **Generate Privacy Report** on the archive. It must list the data types below and no microphone use.

## Data collected (App Store privacy labels, Play data safety)

Everything is **linked to the user**, used **for app functionality only**, **not used for tracking**, and **not sold or shared** with third parties for their own use. Data is **encrypted in transit** (HTTPS). Users can **request deletion** in the app (Settings → Your profile → Delete account) and on the web (`/delete-account` on the site).

| Data | Why |
|---|---|
| Name, email address, phone number | The account, sign-in, and invoices sent to customers |
| User ID | The account |
| Other financial info | Invoices, payments, expenses and GST returns the business records |
| Photos | Receipts, supplier bills and the business logo the user attaches |
| Other user content | Customers, suppliers, items and notes |

Not collected: location, contacts, health, browsing history, advertising data, device identifiers for tracking. No crash data yet; update this when an error-tracking service is added.

## Sign-in for the reviewers

- Give an email-and-password account on the **production** API, with a business set up and a few invoices.
- Do not rely on a fixed OTP. `TEST_OTP_PHONES` is allowed in production but gives anyone who knows the number a fixed code; prefer email sign-in for review.
- In the review notes, say that subscriptions are not sold in the app.

## Payments

The app sells nothing.
- On iOS and Android the plan screen shows the current plan and what each plan includes, with no prices and no buy or upgrade buttons (App Store 3.1.1 and 3.1.3).
- Plans are changed on the web only.
- Keep it this way unless in-app purchase is added.

## Store listing checklist

- [ ] Privacy policy URL: `/privacy` on the site
- [ ] Support URL: `/support` on the site
- [ ] Account deletion URL (Play): `/delete-account` on the site
- [ ] Screenshots: iPhone 6.9" and 6.5", **iPad 13"** (`supportsTablet` is on), Android phone and 10" tablet
- [ ] Age rating questionnaire (no user-generated public content, no gambling)
- [ ] Export compliance: `usesNonExemptEncryption: false` is set, so no annual report is needed
- [ ] Content rights: the illustrations are credited in About (Storyset)
