# 01 — Getting started

One Elixir Books Smart account can hold as many businesses as you need. The same account works in the web app, on Android and on iPhone. The app is online only: it needs an internet connection to sign in and to save anything, and it keeps nothing on the device. This chapter covers trying the demo, creating an account, signing in and out, and keeping your sign-in safe.

When you open the app you land on one of these screens:
- **Not signed in:** the **Welcome** screen (*Invoices, payments and stock — with Lixi, your AI assistant, keeping an eye on the books.*), with **Get started** and **I already have an account**.
- **Signed in, business not set up yet:** [Onboarding](02-onboarding.md).
- **Signed in and set up:** your **Home** dashboard ([04](04-home-dashboard.md)).

While the app opens it may show one of these instead:
- **You're offline** (*Elixir Books Smart needs an internet connection…*) with **Try again**. Your sign-in is kept; tap **Try again** once you are back online.
- **The server is busy** (*It couldn't open your books just now. We'll try again in a few seconds.*). It retries by itself.
- **Update required** (*This version of the app is no longer supported…*) with **Update the app** (opens the app store) or, in a browser, **Reload**. See 1.11.
- **Loading your books…** in the header, while the business's setup arrives after sign-in. Screens show grey placeholders (shimmer) until their data is in, never zeroes or another business's data.

---

### 1.1 Try the demo without signing up

**Goal:** Look around a real-looking set of books before you create an account.
**Who / plan:** Anyone. No sign-up needed.

**Steps**
1. On **Welcome**, tap **I already have an account**.
2. Under the sign-in form, after **or**, tap **Give it a try** (*Explore a sample business. No sign-up needed.*).
   - The form fills in the demo's email and password and signs you in, so you can see what happens.
   - The website's "Try the demo" link opens this screen and signs in by itself.

**What happens**
- You are signed in to the public demo. A blue **Demo** chip shows in the header (top bar on desktop).
- Tap **Demo** to read *You're exploring a demo*: *Eight sample businesses, one of each type, with six months of sales, purchases, payments, stock, books and GST.* From there choose **Create your free account** (signs you out of the demo and opens sign-up) or **Keep exploring**.
- The eight businesses, one per business type, all on the Smart Business plan so every module is open:

  | Business | Type | Branches |
  |---|---|---|
  | Meridian Wholesale Traders | Wholesale / Trading | Mumbai, Bhiwandi, Ahmedabad |
  | Anand Family Store | Retail shop | T. Nagar (Chennai), Coimbatore |
  | Deccan FMCG Distributors | Distributor | Hyderabad, Vijayawada, Bengaluru |
  | Sahyadri Precision Components | Manufacturer | Pune plant, Nagpur depot |
  | Malgudi Kitchen | Restaurant / Café | Indiranagar, Jayanagar (Bengaluru) |
  | Brightline Digital Services | Services | Gurugram, Delhi |
  | Kavya Raman Consulting | Freelancer / Professional | Kochi, Bengaluru |
  | Nirmal Seva Trust | Other (not GST-registered) | Kolkata, Howrah |

  Switch between them as in [03 — Finding your way around](03-navigation.md#34-switch-business).

**Rules & gotchas**
- The demo is **read-only**. Anything that would save shows *This is a demo, so changes aren't saved. Create your free account to keep your own books.* Your profile can't be changed either.
- The demo is rebuilt every week, so "overdue" and "this month" stay true. Visitors on the old copy are signed out when the new one goes in.
- A wrong password on the demo never locks it, and its password can't be reset.
- The demo never shares usage data.
- If the demo is switched off on the server, **Give it a try** doesn't appear.

---

### 1.2 Create an account

**Goal:** Get your own account.
**Who / plan:** Anyone. Every new business starts on the Free plan.

**Before you start:** Have an email address you can open, and your mobile number.

**Steps**
1. On **Welcome**, tap **Get started**. (Or on **Welcome back**, tap **Create an account** under **New here?**)
2. On **Create your account** (*One account can hold as many businesses as you need.*), fill in:
   - **Your name**
   - **Email**
   - **Mobile number** (*Saved to your profile. OTP sign-in works only once the number is verified.*)
   - **Password** (*At least 8 characters*)
3. Tick **I accept the terms and privacy policy**. **Read the terms** and **Read the privacy policy** open them.
4. Tap **Create account**.

**What happens:** You are signed in and taken to [Onboarding](02-onboarding.md) to set up your first business.

**Rules & gotchas**
- Without the tick you see *Please accept the terms to continue*.
- If the email already has an account: *An account with this email already exists. Sign in instead.*
- A phone number can belong to only one account (*This phone number is already registered.*).

**Related:** [02 — Onboarding](02-onboarding.md)

---

### 1.3 Sign in with email and password

**Goal:** Get back into your books.
**Who / plan:** Any user.

**Steps**
1. On **Welcome**, tap **I already have an account**.
2. On **Welcome back** (*Sign in to pick up where you left off.*), stay on the **Email** tab.
3. Enter your **Email** and **Password**, then tap **Sign in**.
4. If you turned on an authenticator app (1.8), **Enter your code**: type the 6-digit code from the app, or a recovery code, and tap **Continue**.

**Rules & gotchas**
- A wrong email or password shows *Email or password is incorrect.* The message is the same for an unknown email, so nobody can test which emails have accounts.
- Every fifth wrong password locks password sign-in: 15 minutes the first time, doubling each time, at most a day. You see *Too many wrong passwords, so this account is locked for a while. Try again later, or reset your password to get in now.* Phone OTP and password reset still work.
- Without a connection you see *Can't reach the server. Check your connection and try again.* See [18 — Troubleshooting & FAQ](18-troubleshooting-faq.md#files-and-connection).

---

### 1.4 Sign in with a phone OTP

**Goal:** Sign in without a password, using a code sent by SMS.
**Who / plan:** Any user whose mobile number is verified.

**Steps**
1. On **Welcome back**, switch to the **Phone OTP** tab.
2. Enter your **Mobile number** and tap **Send code**. *We'll text you a 6-digit code.*
3. On **Enter the code** (*We sent a 6-digit code to …*), type or paste the six digits. Pasting into the first box fills all six.
4. Tap **Verify and continue**.

**What happens:** You are signed in.
- If the number has no account yet, the app takes you to **Create your account** with the number already filled in and marked *Verified by OTP.* Finish sign-up within 15 minutes, or you must verify the number again.

**Rules & gotchas**
- The code is valid for **5 minutes**.
- **Resend code** unlocks after 30 seconds (*Resend code in 30s*). If the first code couldn't be sent you see *We couldn't send a code yet. Tap Resend to try again.*
- At most 5 codes per hour, and 5 tries per code. After that: *Too many attempts. Wait a little and try again.*
- Other messages: *Enter all six digits*, *That code isn't right. Check the SMS and try again.* and *That code has expired. Request a new one.*

> **Demo / test:** On a development server with `DEMO_OTP=true`, the code **123456** works for any number. Numbers listed in `TEST_OTP_PHONES` always take 123456 and no SMS is sent.

---

### 1.5 Forgot your password

**Goal:** Choose a new password using an email link.
**Who / plan:** Any user with an email address on their account.

**Steps**
1. On **Welcome back**, tap **Forgot password?**
2. On **Reset your password**, enter your **Email** and tap **Send reset link**.
3. The screen changes to **Check your inbox** with the badge *Reset link sent*. Open the email **on this device**.
4. On **Choose a new password** (*Every device you were signed in on will sign out.*), enter the **New password** and **Confirm new password**, then tap **Set password**.
5. You see *Password changed. Sign in with the new one.* Sign in as in 1.3.

**Rules & gotchas**
- The link expires after **1 hour**. An old or used link shows **This link has expired** with **Send a new link**.
- Resetting signs you out of **every device**.
- The two passwords must match (*The two passwords don't match*).
- An unknown email gets the same "Check your inbox" screen, but no email is sent.

---

### 1.6 Accept an invitation to someone else's business

**Goal:** Join a business your employer or client has invited you to.
**Who / plan:** Someone who has received an invitation by email or SMS.

**Steps**
1. Open the invitation link. On a phone browser, you can tap **Open in the app**.
2. **Join {business}** (*{inviter} invited you to this business on Elixir Books.*) shows the **Business** and **Your role**: Owner, Admin, Accountant, Sales or Viewer.
3. What you do next depends on whether you already have an account:
   - **New to Elixir Books:** enter a **Password** and **Confirm password**, then tap **Join**.
   - **Already have an account:** tap **Accept invitation**.

**What happens:** *You joined {business}.* The business appears in your business picker (see [03 — Finding your way around](03-navigation.md)). What you can do there depends on your role (see [14 — Team, roles & plans](14-team-roles-plans.md)).

**Rules & gotchas**
- An expired or withdrawn invitation shows **Invitation unavailable** (*This invitation is invalid or has expired. Ask for a new one.*). Ask the person who invited you to **Resend invite**.
- *By accepting, you agree to the terms and privacy policy.*

---

### 1.7 Your profile

**Goal:** Change your name or contact details, see your businesses, and manage your sign-in, devices and privacy, all on one page.

**Steps**
1. Open **Your profile**:
   - 📱 **More**, then tap your name card at the top
   - 🖥 Account menu (your avatar, top-right) › **Your profile**
2. Edit **Name**, **Email** or **Phone**, then tap **Save changes** (*Profile updated*).
3. Under **Your businesses**, the one you're in is marked **Active**. Tap another to switch to it.
4. Further down the same page:
   - **Sign-in security** (1.8)
   - **Share usage data** (1.9)
   - Your devices (1.10)
   - **Delete account** (1.13)

**Rules & gotchas:** Old links to **Devices & sessions** or **Sign-in security** now open **Your profile**.

---

### 1.8 Turn on an authenticator app

**Goal:** Add a second step to signing in on a new device.
**Who / plan:** Any user.

**Steps**
1. **Your profile › Sign-in security › Authenticator app › Turn on**.
2. *Scan this with your authenticator app, then type the 6-digit code it shows.* (*Can't scan? Enter this key instead: …*)
3. Type the **Code from the app** and tap **Turn on**.
4. **Save your recovery codes.** *They are shown only now; keep them somewhere safe.* Use **Copy codes**, then **I have saved them**.

**What happens:** *Each time you sign in on a new device, you also give a code from your authenticator app.* The page shows how many recovery codes are left.

**Rules & gotchas:** To turn it off, tap **Turn off** and give a **Code or recovery code** (*Authenticator turned off*).

---

### 1.9 Share usage data (privacy)

**Goal:** Choose whether the app sends anonymous usage data.

**Steps:** **Your profile › Share usage data**: switch it on or off. *What is shared* explains it: which screens and features you use, the app version and crash reports, tied to an ID (not your name or email) and kept in the EU. Never amounts, customers or tax numbers.

---

### 1.10 See and sign out other devices

**Goal:** Check where you are signed in, and sign out a lost phone or a shared computer.
**Who / plan:** Any user.

**Steps**
1. Go to **Your profile** and scroll to the devices list.
2. Each device shows *Active now* or *Last active …*. Yours is marked **This device**.
3. Tap a device › **Sign out**, then confirm in **Sign out {device}?** (*That device will need to sign in again to reach your books.*)

**What happens:** The device is signed out at once (*Device signed out*). Sign-in tokens are kept in the phone's secure keychain, never in plain storage.

---

### 1.11 Keep the app up to date

**Goal:** Know what to do when the app asks for an update.

When the server stops supporting an old version of the phone app, every screen is replaced by **Update required** (*This version of the app is no longer supported. Update to version … or later to keep working.*). Tap **Update the app** to open the App Store or Play Store. The web app is always the latest version; in the rare case it asks, tap **Reload**.

Builds from before 1.0.5 (the old offline builds) always get this screen.

---

### 1.12 Sign out

**Steps**
1. Sign out from either place:
   - 📱 **More › Sign out**
   - 🖥 Account menu › **Sign out**
   - During onboarding, **Sign out** at the top of the wizard.
2. Confirm in **Sign out?** (*You can sign back in at any time. Your books stay safe on the server.*)

**Rules & gotchas:** Nothing is waiting on the device: every change was saved to the server when you made it.

---

### 1.13 Delete your account

**Goal:** Close your own login.
**Who / plan:** Any user. Not available in the demo.

**Steps**
1. **Your profile › Delete account**.
2. Read **Delete your account?** Use **Download a backup first** if you'll need your records.
3. Confirm with **Your password** (or **Use a code sent to my phone instead**), type `DELETE` in **Type DELETE to confirm**, then tap **Delete my account**.

**What happens:** *Your name, email, phone and logins are erased, and you're signed out on every device.* If you are the only person on the account, the account closes too: the subscription is cancelled, and the invoices and records are kept locked for 8 years, as GST law requires, then erased.

**Rules & gotchas**
- If other people use the account, you see *Other people use … Make one of them an owner under Users first*, with **Open Users**.
- It needs a connection (*You're offline. Connect to the internet to delete your account.*).
- This can't be undone.

---

### Not available yet

- **Sign in with Google:** not built.
- **An installable desktop app** (Mac or Windows): a build exists, but it isn't published. Use the web app in a browser.
