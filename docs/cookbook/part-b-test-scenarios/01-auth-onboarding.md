# 01 — Auth & onboarding

Tests for the welcome and launch screens, the public demo, sign-up, sign-in (email and phone OTP), lockout, the authenticator app, password reset, invitations, your profile and devices, account deletion and the onboarding wizard. Setup and demo logins are in [00 — Test setup](00-test-setup.md). User guide: [01 — Getting started](../part-a-user-guide/01-getting-started.md), [02 — Onboarding](../part-a-user-guide/02-onboarding.md).

### Welcome, launch & routing

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-001 | Signed-out start | — | Fresh install or cleared storage | Open the app | Welcome screen shows the pitch, **Get started** and **I already have an account** | happy |
| AUTH-002 | Get started | — | On Welcome | Tap **Get started** | **Create your account** opens | happy |
| AUTH-003 | Signed in, not onboarded | New user | Account created, onboarding not finished | Relaunch the app | Lands on onboarding step 1, **Tax registration** ("Step 1 of 3 · Tax"), not Home | edge |
| AUTH-004 | Signed in and onboarded | Owner | Demo owner signed in | Relaunch | Lands on Home; no Welcome flash before it | happy |
| AUTH-005 | First load placeholders | Owner | Signed in | Relaunch on a slow network (DevTools › Slow 3G) | "Loading your books…" in the header; screens show shimmer placeholders, never zeroes or "You're all caught up" before the data arrives | edge |
| AUTH-006 | Server busy at launch | Owner | Signed in; API returning 5xx or restarting | Relaunch | "The server is busy" / "We'll try again in a few seconds."; it retries by itself and opens Home once the API is back; the session is kept | edge |

### Public demo ("Give it a try")

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-080 | Try the demo | — | API running with the demo built (00 §3) | **I already have an account** → **Give it a try** | The form fills with the demo email and password, then signs in; Home opens; a **Demo** chip shows in the header / top bar | happy |
| AUTH-081 | Demo chip | Demo | AUTH-080 | Tap **Demo** | "You're exploring a demo" with **Create your free account** and **Keep exploring** | happy |
| AUTH-082 | From the demo to sign-up | Demo | AUTH-081 | **Create your free account** | Signed out of the demo; **Create your account** opens | happy |
| AUTH-083 | Demo is read-only | Demo | Signed in to the demo | Try to save an invoice, a contact, a setting and your profile | Each refused: "This is a demo, so changes aren't saved. Create your free account to keep your own books."; nothing changes | permission |
| AUTH-084 | Eight businesses | Demo | Signed in | Open the business picker | Eight businesses, one per business type (Meridian Wholesale Traders … Nirmal Seva Trust); each on Smart Business, so Buy, Stock and the books are open | happy |
| AUTH-085 | Website link | — | Signed out | Open `/sign-in?demo=1` | Signs in to the demo without a tap | edge |
| AUTH-086 | Demo off | — | `DEMO_ENABLED=false`, API restarted | Open sign-in | No **Give it a try**; anyone in the demo is signed out | edge |
| AUTH-087 | Demo never locks | — | | Sign in as the demo email with a wrong password 6 times, then the right one | Each wrong one: "Email or password is incorrect."; the right one still works (no lockout) | edge |
| AUTH-088 | Demo password can't be reset | — | Mailpit | **Forgot password?** with the demo email | Same "Check your inbox" screen; no reset email arrives | edge |
| AUTH-089 | Rebuild swaps cleanly | Demo | Signed in to the demo | Run `npm run demo:seed -w @esmart/api -- --force` and wait for it to finish | The old demo keeps working during the build; once swapped, the old session must sign in again and sees the fresh data | edge |

### Sign up

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-010 | Create an account | — | Unused email | Fill **Your name**, **Email**, **Mobile number**, a password of 8+ characters → tick **I accept the terms and privacy policy** → **Create account** | Account created; onboarding starts at Tax | happy |
| AUTH-011 | Terms not accepted | — | | Leave the terms box unticked → **Create account** | "Please accept the terms to continue"; nothing is created | validation |
| AUTH-012 | Short password | — | | Password `abc123` | Refused; the "At least 8 characters" hint applies | validation |
| AUTH-013 | Email already used | — | | Sign up with `gowtham@vertextraders.in` | "An account with this email already exists. Sign in instead." | validation |
| AUTH-014 | Invalid email | — | | Email `gowtham@` | "Enter a valid email address" | validation |
| AUTH-015 | Phone already registered | — | Another account has verified the number | Sign up with that verified number | "This phone number is already registered." | validation |
| AUTH-016 | Unverified mobile can't sign in by OTP | New user | Signed up with a mobile but never verified it | Sign out → **Phone OTP** with that number → enter the code | Treated as no account: the app routes to sign-up with the phone verified and locked (see AUTH-033) | edge |
| AUTH-017 | Terms links | — | | Tap **Read the terms** and **Read the privacy policy** | Each opens its page | happy |

### Sign in — email

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-020 | Correct credentials | Owner | Demo seeded | **Email** tab → `gowtham@vertextraders.in` + password → **Sign in** | Home for Vertex Traders | happy |
| AUTH-021 | Wrong password | | | Wrong password | "Email or password is incorrect." | validation |
| AUTH-022 | Unknown email | | | `nobody@example.in` | Same message as AUTH-021, so the app doesn't reveal which emails exist | validation |
| AUTH-023 | Invited user has no password yet | Viewer | Priya Nair still invited | Sign in as `priya@vertextraders.in` | Sign-in fails; she must accept the invitation first (AUTH-060) | edge |
| AUTH-024 | Disabled user | | Operator disabled Meera (ADM-030) | Sign in as Meera | Refused with "This user has been disabled" | permission |
| AUTH-025 | Suspended account | | Operator suspended the demo account (ADM-020) | Sign in as owner | Refused with "This account has been suspended. Contact support." | permission |
| AUTH-026 | Server unreachable | | API stopped | **Sign in** | "Can't reach the server. Check your connection and try again." | offline |
| AUTH-027 | Prefill on demo builds | | `EXPO_PUBLIC_DEMO_LOGIN_*` set | Open sign-in | Email and password fields come prefilled; with the variables unset they are empty | edge |
| AUTH-028 | App opened offline | Owner | Signed in; network off | Close and reopen the app | "You're offline" screen with **Try again**; turn the network on → **Try again** → Home loads, still signed in | offline |
| AUTH-029 | Old build | Owner | Server `MIN_APP_VERSION` set above the installed build (or a native build before 1.0.5) | Open the app | "Update required" (HTTP 426 `APP_UPDATE_REQUIRED`) naming the minimum version, with **Update the app** opening the store; nothing else can be used. Signing in itself isn't blocked | edge |
| AUTH-090 | Fifth wrong password locks | Owner | Real account | Wrong password 5 times → right password | Locked: "Too many wrong passwords, so this account is locked for a while…"; the right password is refused for 15 minutes | validation |
| AUTH-091 | Lockout doubles | Owner | AUTH-090, wait 15 min | 5 more wrong passwords | Locked for 30 minutes (doubling, capped at a day) | edge |
| AUTH-092 | OTP and reset get past a lockout | Owner | Locked (AUTH-090) | Sign in by **Phone OTP**, or reset the password (AUTH-052) | Gets in | edge |

### Sign in — phone OTP

`DEMO_OTP=true` makes `123456` a valid code. Rate-limit tests need `DEMO_OTP` or `TEST_OTP_PHONES` and a clock you can control, or patience.

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-030 | OTP sign-in | Owner | Owner's phone verified | **Phone OTP** → number → **Send code** → `123456` → **Verify and continue** | Signed in [sim] | happy |
| AUTH-031 | Wrong code | | | Enter `000000` | "That code isn't right. Check the SMS and try again." | validation |
| AUTH-032 | Incomplete code | | | Enter 5 digits | **Verify and continue** asks you to "Enter all six digits" | validation |
| AUTH-033 | Correct code, no account | — | Number not on any account | Send code → `123456` | Goes to **Create your account** with the mobile shown as "Verified by OTP." and locked | edge |
| AUTH-034 | Sign-up must follow verification within 15 min | — | AUTH-033 done | Wait more than 15 minutes → **Create account** | Refused: "Verify your phone number again to sign up" | edge |
| AUTH-035 | Resend timer | | Code just sent | Watch the OTP screen | "Resend code in 30s" counts down; **Resend code** appears at 0; using it shows "New code sent" | happy |
| AUTH-036 | Resend inside 30 s (API) | | | Request a second code within 30 s (API or a race) | 429 "Wait 30 seconds before asking for another code" | validation |
| AUTH-037 | Code expires after 5 min | | Real OTP mode (`DEMO_OTP` off) | Wait more than 5 min → enter the code | "That code has expired. Request a new one." | edge |
| AUTH-038 | 5 wrong attempts lock the code | | | Enter a wrong code 5 times, then the right one | Refused ("Too many wrong attempts; request a new code"); a new code works | validation |
| AUTH-039 | 5 codes an hour | | | Request a 6th code within one hour for the same number | "Too many attempts. Wait a little and try again." | validation |
| AUTH-040 | Paste the code | | | Paste `123456` into the first box | All six boxes fill | happy |
| AUTH-041 | Test phone numbers | | `TEST_OTP_PHONES=9876543210` | Send a code to that number | No SMS is sent; `123456` works, even with `NODE_ENV=production` | edge |

### Authenticator app

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-093 | Turn on | Owner | Authenticator app on a phone | **Your profile › Sign-in security › Turn on** → scan → code → **Turn on** | "Save your recovery codes" with **Copy codes** and **I have saved them**; status **On** with the codes left | happy |
| AUTH-094 | Code asked on a new device | Owner | AUTH-093 | Sign in from another browser | "Enter your code" after the password; a correct code or a recovery code continues; a wrong one is refused | happy |
| AUTH-095 | Recovery code used once | Owner | AUTH-093 | Sign in with a recovery code, then try the same code again | First works; second is refused; the count of codes left drops by one | edge |
| AUTH-096 | Turn off | Owner | AUTH-093 | **Turn off** → a code → confirm | "Authenticator turned off"; the next sign-in asks no code | happy |

### Forgot & reset password

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-050 | Send reset link | Owner | Mailpit running | **Forgot password?** → email → **Send reset link** | "Check your inbox" / "Reset link sent"; email in Mailpit [sim] | happy |
| AUTH-051 | Unknown email gives the same answer | | | Use `nobody@example.in` | Same success screen; no email sent (doesn't reveal which accounts exist) | edge |
| AUTH-052 | Reset | Owner | AUTH-050 | Open the link → new password twice → **Set password** | "Password changed. Sign in with the new one." | happy |
| AUTH-053 | Mismatched passwords | | | Different confirmation | "The two passwords don't match" | validation |
| AUTH-054 | Link expires after 1 hour | | | Open the link more than 60 min later | "This link has expired" with **Send a new link** | edge |
| AUTH-055 | Link works only once | | AUTH-052 done | Open the same link again | Invalid / expired message | edge |
| AUTH-056 | Reset signs out every device | Owner | Signed in on web and phone | Reset the password from one | The other session must sign in again | edge |

### Invitations

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-060 | Accept as a new user | Viewer | Owner resends Priya's invite (TEAM-004) | Open the Mailpit link | "Join Vertex Traders" shows the inviter, business and role **Viewer** → password twice → **Join** → "You joined Vertex Traders"; signed in | happy |
| AUTH-061 | Accept with an existing account | | Invite sent to an email that already has an account | Open the link while signed in | Shows **Accept invitation** without password fields; afterwards the business appears in the business picker | happy |
| AUTH-062 | Invalid or used invite | | | Open a used or tampered link | "Invitation unavailable" / "This invitation is invalid or has expired. Ask for a new one." | validation |
| AUTH-063 | Open in the app (mobile web) | | Phone browser | Open the invite link | **Open in the app** link is offered | edge |

### Profile, devices & account

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-070 | List devices | Owner | Signed in on 2 devices | **Your profile** (📱 More › name card; 🖥 account menu › **Your profile**) → devices list | Both listed with "Active now" / "Last active …"; the current one is marked "This device" | happy |
| AUTH-071 | Sign out another device | Owner | | Pick the other device → **Sign out** → confirm "Sign out …?" | "Device signed out"; that device's next request is refused and it returns to sign-in | happy |
| AUTH-072 | Edit profile | Owner | | Change **Name** → **Save changes** | "Profile updated"; the new name shows in the greeting and account menu | happy |
| AUTH-073 | Old settings links | Owner | | Open `/settings/devices` and `/settings/security` | Both land on **Your profile** | edge |
| AUTH-074 | Switch from Your businesses | Owner | | **Your profile › Your businesses** → Aurora | Switches; Aurora is marked **Active** | happy |
| AUTH-075 | Sign out | Owner | | 📱 **More › Sign out** / 🖥 account menu › **Sign out** → confirm "Sign out?" | Back on Welcome; nothing of the business is left on the device | happy |
| AUTH-076 | Delete account with teammates | Owner | Vertex has other users | **Delete account** | "Other people use … Make one of them an owner under Users first" with **Open Users**; nothing deleted | validation |
| AUTH-077 | Delete account | New owner | A one-person account | **Delete account** → password → type `DELETE` → **Delete my account** | "Your account was deleted."; signed out everywhere; signing in again fails | happy |
| AUTH-078 | Delete confirmation guards | New owner | | Wrong password, or text other than `DELETE` | "That password isn't right." / the button stays off; nothing deleted | validation |
| AUTH-079 | Share usage data | Owner | | **Your profile › Share usage data** off → reload | Stays off | happy |

### Onboarding

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ONB-001 | Three steps for everyone | New owner | AUTH-010 | Walk the wizard | "Step 1 of 3 · Tax", then Business, then Numbering, then the done screen; 🖥 the left rail lists the three steps and ticks them | happy |
| ONB-002 | No plan, country or branches to choose | New owner | | Look at the Business step and the step list | **Plan** shows **Free** (not pickable) with the sales-plan hint; no Country or Branches step (India, INR, April year and one head office assumed) | plan |
| ONB-003 | Required fields | | Business step | Leave **Business name**, **State** or **City** empty → **Continue** | "… is required" on each; can't continue | validation |
| ONB-004 | PIN against state | | | State Maharashtra, PIN `560034` | "PIN code 560034 is in Karnataka, not Maharashtra. Check the PIN code or the state." | validation |
| ONB-005 | PIN shape | | | PIN `4000` | "Enter a six-digit PIN code, e.g. 400001" | validation |
| ONB-006 | Logo too big | | | Pick a 6 MB image | "That image is over 5 MB. Choose a smaller one." | validation |
| ONB-007 | Logo wrong type | | | Pick a GIF or WebP | "Use a PNG or JPEG image." | validation |
| ONB-008 | Country step not shown | | | Open `/(onboarding)/country` directly, or look for it in the progress | Not part of the wizard; the business is created with India, INR, April | edge |
| ONB-009 | GSTIN shape | | Tax step, registered on | GSTIN `27AABCV1234` → **Continue** | "GSTIN should look like 27AABCV1234F1ZO" | validation |
| ONB-010 | GSTIN check digit | | | GSTIN `27AABCV1234F1ZP` (last character changed) | "This GSTIN fails its check digit — look for a typo" | validation |
| ONB-011 | GSTIN sets home state | | | Valid GSTIN starting `29` | Business step's state is Karnataka (hint: first two digits set the home state) | happy |
| ONB-012 | Unregistered business | | | Turn off **I'm registered for GST** | Note: invoices raised without a tax breakdown; no GSTIN asked | edge |
| ONB-013 | Composition scheme | | | Turn on **Composition scheme** | Invoices show no tax breakdown; e-invoicing won't apply (EIN-004) | edge |
| ONB-014 | Numbering preview | | | Prefix `INV`, start 1, **Include financial year** on | "Your next invoice will be INV/26-27/0001" (current short FY) | happy |
| ONB-015 | Numbering without FY | | | Turn off FY | Preview drops the FY segment (`INV/0001`) | happy |
| ONB-016 | Branches step not shown | New owner | | Finish the wizard | No Branches step; the business has one branch, **Head office** (`HO`); adding more needs a full plan (SET- branches) | plan |
| ONB-017 | Skip steps | | | **Skip** on Tax (registered on, GSTIN empty) and on Numbering | Registration turns off; numbering keeps `INV`, 1, FY on; the wizard moves on | edge |
| ONB-018 | Done screen | | Finished | — | "<Business> is ready" with three tips; **Create my first invoice** opens a new invoice; **Go to dashboard** opens Home; "Your business is ready" toast | happy |
| ONB-019 | Defaults created | | ONB-018 | Check Settings | 23 numbering series (invoice with the chosen settings, the rest default prefixes such as `QT`, `BILL`, `PAY`), GST slabs 0/5/12/18/28%, default expense categories, a **Cash** payment account (default), Free plan | happy |
| ONB-020 | Resume after kill | | Mid-wizard, fields typed | Kill and reopen the app (or reload the browser) | Returns to onboarding with the typed answers still there, not Home | edge |
| ONB-021 | Finish offline | New owner | On the done screen; network off | **Go to dashboard** | "Not saved: can't reach the server. Try again when online."; stays on the done screen; no business is created; back online → tap again → created once | offline |
| ONB-022 | Second business from inside the app | Owner | Onboarded | Look for "Add business" | **Blocked**: no in-app way to create a second business | edge |
| ONB-023 | GSTIN prefills the business | New owner | Tax step | Enter a valid GSTIN known to the simulator | "Fetching the registered details…" then "Verified on the GST portal, and its details filled in"; the Business step has the name, legal name, address, state, city and PIN filled; all editable [sim] | happy |
| ONB-024 | GSTIN lookup misses | New owner | | A valid-shape GSTIN the portal doesn't know; then with the GSTIN provider down | "The GST portal has no taxpayer with this GSTIN" / "Couldn't reach the GST portal; fill the details in yourself"; can still continue [sim] | edge |
| ONB-025 | Back to Tax doesn't overwrite | New owner | ONB-023, then edit the business name | Go back to Tax → **Continue** | The edited name stays | edge |
| ONB-026 | Double tap on done | New owner | Done screen | Tap **Go to dashboard** twice quickly | One business is created | edge |
| ONB-027 | Sign out mid-wizard | New owner | Mid-wizard | **Sign out** → confirm | Signed out; signing in again starts the wizard with a cleared draft | edge |
