# 01 — Auth & onboarding

Tests for sign-up, sign-in (email and phone OTP), password reset, invitations, devices and the onboarding wizard. Setup and demo logins are in [00 — Test setup](00-test-setup.md).

### Welcome & routing

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-001 | Signed-out start | — | Fresh install or cleared storage | Open the app | Welcome screen shows **Get started** and **I already have an account** | happy |
| AUTH-002 | Get started | — | On Welcome | Tap **Get started** | **Create your account** opens | happy |
| AUTH-003 | Signed in, not onboarded | New user | Account created, onboarding not finished | Relaunch the app | Lands on onboarding step 1 (**Tell us about your business**), not Home | edge |
| AUTH-004 | Signed in and onboarded | Owner | Demo owner signed in | Relaunch | Lands on Home; no Welcome flash before it | happy |

### Sign up

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-010 | Create an account | — | Unused email | Fill **Your name**, **Email**, **Mobile number**, a password of 8+ characters → tick **I accept the terms and privacy policy** → **Create account** | Account created; onboarding starts | happy |
| AUTH-011 | Terms not accepted | — | | Leave the terms box unticked → **Create account** | "Please accept the terms to continue"; nothing is created | validation |
| AUTH-012 | Short password | — | | Password `abc123` | Message that the password must be at least 8 characters ("At least 8 characters" hint) | validation |
| AUTH-013 | Email already used | — | | Sign up with `gowtham@vertextraders.in` | "An account with this email already exists. Sign in instead." | validation |
| AUTH-014 | Invalid email | — | | Email `gowtham@` | "Enter a valid email address" | validation |
| AUTH-015 | Phone already registered | — | Another account has verified the number | Sign up with that verified number | "This phone number is already registered." | validation |
| AUTH-016 | Unverified mobile can't sign in by OTP | New user | Signed up with a mobile but never verified it | Sign out → **Phone OTP** with that number → enter the code | Treated as no account: the app routes to sign-up with the phone verified and locked (see AUTH-033) | edge |

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

### Sign in — phone OTP

`DEMO_OTP=true` makes `123456` a valid code. Rate-limit tests need `DEMO_OTP` or `TEST_OTP_PHONES` and a clock you can control, or patience.

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-030 | OTP sign-in | Owner | Owner's phone verified | **Phone OTP** → number → **Send code** → `123456` → **Verify and continue** | Signed in [sim] | happy |
| AUTH-031 | Wrong code | | | Enter `000000` | "That code isn't right. Check the SMS and try again." | validation |
| AUTH-032 | Incomplete code | | | Enter 5 digits | **Verify and continue** asks you to "Enter all six digits" | validation |
| AUTH-033 | Correct code, no account | — | Number not on any account | Send code → `123456` | Goes to **Create your account** with the mobile shown as "Verified by OTP." and locked | edge |
| AUTH-034 | Sign-up must follow verification within 15 min | — | AUTH-033 done | Wait more than 15 minutes → **Create account** | Refused: "Verify your phone number again to sign up" | edge |
| AUTH-035 | Resend timer | | Code just sent | Watch the OTP screen | "Resend code in 30s" counts down; **Resend code** appears at 0 | happy |
| AUTH-036 | Resend inside 30 s (API) | | | Request a second code within 30 s (API or a race) | 429 "Wait 30 seconds before asking for another code" | validation |
| AUTH-037 | Code expires after 5 min | | Real OTP mode (`DEMO_OTP` off) | Wait more than 5 min → enter the code | "That code has expired. Request a new one." | edge |
| AUTH-038 | 5 wrong attempts lock the code | | | Enter a wrong code 5 times, then the right one | Refused ("Too many wrong attempts; request a new code"); a new code works | validation |
| AUTH-039 | 5 codes an hour | | | Request a 6th code within one hour for the same number | "Too many attempts. Wait a little and try again." | validation |
| AUTH-040 | Paste the code | | | Paste `123456` into the first box | All six boxes fill | happy |
| AUTH-041 | Test phone numbers | | `TEST_OTP_PHONES=9876543210` | Send a code to that number | No SMS is sent; `123456` works, even with `NODE_ENV=production` | edge |

### Forgot & reset password

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-050 | Send reset link | Owner | Mailpit running | **Forgot password?** → email → **Send reset link** | "Check your inbox" / "Reset link sent"; email in Mailpit [sim] | happy |
| AUTH-051 | Unknown email gives the same answer | | | Use `nobody@example.in` | Same success screen; no email sent (doesn't reveal which accounts exist) | edge |
| AUTH-052 | Reset | Owner | AUTH-050 | Open the link → new password twice → **Set password** | "Password changed. Sign in with the new one." | happy |
| AUTH-053 | Mismatched passwords | | | Different confirmation | "The two passwords don't match" | validation |
| AUTH-054 | Link expires after 1 hour | | | Open the link more than 60 min later | "This link is invalid or has expired. Ask for a new one." | edge |
| AUTH-055 | Link works only once | | AUTH-052 done | Open the same link again | Invalid / expired message | edge |
| AUTH-056 | Reset signs out every device | Owner | Signed in on web and phone | Reset the password from one | The other session must sign in again | edge |

### Invitations

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-060 | Accept as a new user | Viewer | Owner resends Priya's invite (TEAM-004) | Open the Mailpit link | "Join Vertex Traders" shows inviter, business and role **Viewer** → password twice → **Accept invitation** → signed in | happy |
| AUTH-061 | Accept with an existing account | | Invite sent to an email that already has an account | Open the link while signed in | Shows **Accept invitation** without password fields; afterwards the business appears in the switcher | happy |
| AUTH-062 | Invalid or used invite | | | Open a used or tampered link | "Invitation unavailable" / "This invitation is invalid or has expired. Ask for a new one." | validation |
| AUTH-063 | Open in the app (mobile web) | | Phone browser | Open the invite link | **Open in the app** link is offered | edge |

### Devices & sign-out

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| AUTH-070 | List devices | Owner | Signed in on 2 devices | **More › Settings › Devices** | Both listed; the current one is marked "This device" | happy |
| AUTH-071 | Sign out another device | Owner | | Pick the other device → **Sign out** → confirm | "Device signed out"; that device's next request is refused and it returns to sign-in | happy |
| AUTH-072 | Sign out with unsynced changes | Owner | Offline edit queued | **Sign out** | Warning that unsynced changes stay on this device | offline |

### Onboarding

| ID | Scenario | Role / plan | Preconditions | Steps | Expected result | Type |
|---|---|---|---|---|---|---|
| ONB-001 | Full plan: 5 steps | New owner | AUTH-010 | Step 1 choose **Plan** "Buy & sell" | Progress shows "Step 1 of 5 · Business"; Country and Branches steps are included | happy |
| ONB-002 | Sales plan skips 2 steps | New owner | | Choose the "Sell" plan | Country and Branches are skipped (India, INR, Head office assumed); 3 steps | plan |
| ONB-003 | Required fields | | | Leave **Business name** or **State** empty → continue | "Business name is required" (and the same for State); can't continue | validation |
| ONB-004 | PIN against state | | | State Maharashtra, PIN `560034` | "PIN code 560034 is in Karnataka, not Maharashtra. Check the PIN code or the state." | validation |
| ONB-005 | PIN shape | | | PIN `4000` | "Enter a six-digit PIN code, e.g. 400001" | validation |
| ONB-006 | Logo too big | | | Pick a 6 MB image | "That image is over 5 MB. Choose a smaller one." | validation |
| ONB-007 | Logo wrong type | | | Pick a GIF or WebP | "Use a PNG or JPEG image." | validation |
| ONB-008 | Country & FY | | Full plan | Country India, base currency INR, FY starts April | GST pack described; next step | happy |
| ONB-009 | GSTIN shape | | Tax step, registered on | GSTIN `27AABCV1234` | "GSTIN should look like 27AABCV1234F1ZO" | validation |
| ONB-010 | GSTIN check digit | | | GSTIN `27AABCV1234F1ZP` (last character changed) | "This GSTIN fails its check digit — look for a typo" | validation |
| ONB-011 | GSTIN sets home state | | | Valid GSTIN starting `29` | Home state is Karnataka (hint: first two digits set the home state) | happy |
| ONB-012 | Unregistered business | | | Turn off **I'm registered for GST** | Note: invoices raised without a tax breakdown; no GSTIN asked | edge |
| ONB-013 | Composition scheme | | | Turn on **Composition scheme** | Invoices show no tax breakdown; e-invoicing won't apply (EIN-004) | edge |
| ONB-014 | Numbering preview | | | Prefix `INV`, start 1, **Include financial year** on | "Your next invoice will be INV/2026-27/0001" (current FY) | happy |
| ONB-015 | Numbering without FY | | | Turn off FY | Preview drops the FY segment | happy |
| ONB-016 | Add a branch | | Full plan | **Add branch** → name, code, city → **Finish setup** | Primary location "Head office" plus the new branch | happy |
| ONB-017 | Skip branches | | | **Finish setup** with none added | Only the Head office ("created automatically") | happy |
| ONB-018 | Done screen | | Finished | — | "<Business> is ready"; **Create my first invoice** opens a new invoice; **Go to dashboard** opens Home | happy |
| ONB-019 | Defaults created | | ONB-018 | Check Settings | 11 numbering series, default tax slabs, expense categories, a payment account | happy |
| ONB-020 | Resume after kill | | Mid-wizard | Kill and reopen the app | Returns to onboarding, not Home | edge |
| ONB-021 | Onboard offline | New owner | Network off | Complete the wizard | The business is created on the device and sent first when the network returns (OFF-040) | offline |
| ONB-022 | Second business from inside the app | Owner | Onboarded | Look for "Add business" | **Blocked**: no in-app way to create a second business | edge |
