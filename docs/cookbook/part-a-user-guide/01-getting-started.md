# 01 — Getting started

One Elixir Books Smart account can hold as many businesses as you need. The same account works in the web app, on Android and on iPhone. This chapter covers creating an account, signing in and out, and keeping your sessions safe.

When you open the app you land on one of three screens:
- **Not signed in:** the **Welcome** screen.
- **Signed in, business not set up yet:** [Onboarding](02-onboarding.md).
- **Signed in and set up:** your **Home** dashboard.

---

### 1.1 Create an account

**Goal:** Get your own account.
**Who / plan:** Anyone. Every account starts on the Free plan until you choose another.

**Before you start:** Have an email address you can open, and your mobile number.

**Steps**
1. On **Welcome**, tap **Get started**.
2. On **Create your account**, fill in:
   - **Your name**
   - **Email**
   - **Mobile number**
   - **Password** (*At least 8 characters*)
3. Tick **I accept the terms and privacy policy**.
4. Tap **Create account**.

**What happens:** You are signed in and taken to [Onboarding](02-onboarding.md) to set up your first business.

**Rules & gotchas**
- If the email already has an account, you see *An account with this email already exists. Sign in instead.*
- A phone number can belong to only one account (*This phone number is already registered.*).
- The mobile number is saved to your profile, but phone sign-in works only once that number has been verified by OTP. See 1.3.

**Related:** [02 — Onboarding](02-onboarding.md)

---

### 1.2 Sign in with email and password

**Goal:** Get back into your books.
**Who / plan:** Any user.

**Steps**
1. On **Welcome**, tap **I already have an account**.
2. On **Welcome back**, stay on the **Email** tab.
3. Enter your **Email** and **Password**, then tap **Sign in**.

**Rules & gotchas**
- A wrong email or password shows *Email or password is incorrect.*
- Without a connection you see *Can't reach the server. Check your connection and try again.* The app is online only: signing in, and every save afterwards, needs the internet. See [18 — Troubleshooting & FAQ](18-troubleshooting-faq.md#files-and-connection) for what you see without a connection.

---

### 1.3 Sign in with a phone OTP

**Goal:** Sign in without a password, using a code sent by SMS.
**Who / plan:** Any user whose mobile number is verified.

**Steps**
1. On **Welcome back**, switch to the **Phone OTP** tab.
2. Enter your **Mobile number** and tap **Send code**. *We'll text you a 6-digit code.*
3. On **Enter the code**, type or paste the six digits.
4. Tap **Verify and continue**.

**What happens:** You are signed in.
- If the number has no account yet, the app takes you to **Create your account** with the number already filled in and marked *Verified by OTP.* Finish sign-up within 15 minutes.

**Rules & gotchas**
- The code is valid for **5 minutes**.
- **Resend code** unlocks after 30 seconds (*Resend code in 30s*).
- At most 5 codes per hour, and 5 tries per code. After that you see *Too many attempts. Wait a little and try again.*
- Other messages: *That code isn't right. Check the SMS and try again.* and *That code has expired. Request a new one.*

> **Demo / test:** On a development server with `DEMO_OTP=true`, the code **123456** works for any number.

---

### 1.4 Forgot your password

**Goal:** Choose a new password using an email link.
**Who / plan:** Any user with an email address on their account.

**Steps**
1. On **Welcome back**, tap **Forgot password?**
2. Enter your **Email** and tap **Send reset link**.
3. The screen changes to **Check your inbox** with the badge *Reset link sent*. Open the email **on this device**.
4. On **Choose a new password**, enter the **New password** and **Confirm new password**, then tap **Set password**.
5. You see *Password changed. Sign in with the new one.* Sign in as in 1.2.

**Rules & gotchas**
- The link expires after **1 hour**. An old or used link shows *This link is invalid or has expired. Ask for a new one.*
- Resetting signs you out of **every device**.
- The two passwords must match (*The two passwords don't match*).

---

### 1.5 Accept an invitation to someone else's business

**Goal:** Join a business your employer or client has invited you to.
**Who / plan:** Someone who has received an invitation by email or SMS.

**Steps**
1. Open the invitation link. On a phone, you can tap **Open in the app**.
2. **Join {business}** shows the **Business**, who invited you, and **Your role**: Owner, Admin, Accountant, Sales or Viewer.
3. What you do next depends on whether you already have an account:
   - **New to Elixir Books:** enter a **Password** and **Confirm password**, then tap **Join**.
   - **Already have an account:** tap **Accept invitation**.

**What happens:** The business appears in your business switcher (see [03 — Finding your way around](03-navigation.md)). What you can do there depends on your role (see [14 — Team, roles & plans](14-team-roles-plans.md)).

**Rules & gotchas**
- An expired or withdrawn invitation shows **Invitation unavailable**. Ask the person who invited you to **Resend invite**.

---

### 1.6 Edit your profile

**Goal:** Change your name or contact details, or see which businesses you belong to.

**Steps**
1. Open your profile:
   - 📱 **More**, then tap your name card at the top
   - 🖥 Account menu (top-right) › **Profile**
2. Edit **Name**, **Email** or **Phone**, then tap **Save changes** (*Profile updated*).
3. Under **Your businesses**, tap a business to switch to it (*Switched to …*).

---

### 1.7 See and sign out other devices

**Goal:** Check where you are signed in, and sign out a lost phone or a shared computer.
**Who / plan:** Any user.

**Steps**
1. Go to **More › Devices & sessions**.
2. Each device shows *Active now* or *Last active …*. Yours is marked **This device**.
3. Tap a device › **Sign out**, then confirm in **Sign out {device}?**

**What happens:** The device is signed out at once and must sign in again (*Device signed out*). Sign-in tokens are kept in the phone's secure keychain, never in plain storage.

---

### 1.8 Sign out

**Steps**
1. Sign out from either place:
   - 📱 **More › Sign out**
   - 🖥 Account menu › **Sign out**
2. Confirm in **Sign out?**

**Rules & gotchas**
- Nothing is waiting on the device: every change was saved to the server when you made it. Signing out removes the sign-in from this device; your books stay on the server.

---

### Not available yet

- **Sign in with Google:** not built.
- **Delete my account inside the app:** not built. Contact support to close an account.
