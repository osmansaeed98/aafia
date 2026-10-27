# Switching on WhatsApp login for patients

Everything here happens in the browser. It takes about 30–45 minutes,
plus waiting for Meta to approve the message template. Never paste a
token or secret into a chat; put them only where each step says.

**Cost:** building and testing with Meta's free test number costs $0.
After going live, each login code costs about $0.005 (Meta's fee for
an "authentication" message to Sudan, "Rest of Africa" rate). Supabase
allows at most 30 codes per hour (step C3), so the most it can cost is
about $0.15 an hour, $3.60 a day.

## A. Meta (WhatsApp)

1. **Business account.** Go to business.facebook.com and create a
   business portfolio named Aafia (free).
2. **App.** Go to developers.facebook.com → **My Apps** → **Create app**
   → choose **Business** (or "Other" then "Business") → name it
   "Aafia" → link it to the Aafia business portfolio.
3. **Add WhatsApp.** In the app, find **WhatsApp** → **Set up**. Meta
   gives you a free **test phone number**. On **API Setup** note the
   **Phone number ID** (a long number under the test number).
4. **Your phone as a test recipient.** Still on **API Setup**, under
   **To**, add your own WhatsApp number (and up to 4 others) and confirm
   the code Meta sends. The test number can only message these numbers.
5. **Login-code template.** Open **WhatsApp Manager** → **Message
   templates** → **Create template**:
   - Category: **Authentication**
   - Name: `aafia_login_code`
   - Language: **Arabic**
   - Code delivery: **Copy code**
   - Submit. Approval is usually quick; wait until it says **Active**.
6. **Permanent access token.** business.facebook.com → **Settings** →
   **Users → System users** → **Add** (role: Admin) → **Assign assets**:
   the Aafia app (full control) and the WhatsApp account (full control)
   → **Generate token** for the Aafia app with the permissions
   `whatsapp_business_messaging` and `whatsapp_business_management`,
   expiry **Never**. Copy it straight into step B.

## B. Vercel (the website's settings)

Vercel → aafia project → **Settings → Environment Variables**, add
(tick Production):

| Name | Value |
|---|---|
| `WHATSAPP_TOKEN` | the token from A6 |
| `WHATSAPP_PHONE_NUMBER_ID` | the Phone number ID from A3 |
| `SEND_CODE_HOOK_SECRET` | the secret from C2 (starts with `v1,whsec_`) |

Then **Deployments** → newest → **⋯** → **Redeploy**.

## C. Supabase

1. **Authentication → Sign In / Providers → Phone** → switch on. If it
   asks for SMS provider details, do C2 first: the hook replaces them.
2. **Authentication → Hooks → Send SMS hook** → type **HTTPS** →
   URL `https://aafia-a14h.vercel.app/api/auth/send-code` → **Generate
   secret** → copy it into Vercel (B) → **Enable** / save.
3. **Authentication → Rate limits** → "SMS messages sent per hour":
   keep **30** (the spending ceiling).
4. **Phone settings → OTP expiry**: change from 60 to **300** seconds,
   so slow connections have time to receive the code.

## D. Try it

On your phone, open https://aafia-a14h.vercel.app/login, enter your
number (one you added in A4), and sign in with the WhatsApp code. If
anything fails, the red message ends with a short technical word; send
a screenshot.

## E. Going live for all patients (later)

- Meta **business verification** (business documents).
- A phone number only for Aafia's WhatsApp, not used in the normal
  WhatsApp app; add it in WhatsApp Manager and use its Phone number ID
  in Vercel instead of the test one.
- A payment card on the Meta business account (check early that Meta
  accepts it).
- The `aafia_login_code` template approved for the real number.

SMS backup stays **off** until the owner approves it with a monthly cap
(SMS to Sudan is about $0.47 a message).
