# Aafia team sign-in: bilingual email with a typed code

Today the Aafia team signs in with a link from Supabase's built-in email.
That email is English-only, can't be changed, and only reaches members
of the Supabase account. This guide switches to our own free email
sender and a bilingual email that shows a **6-digit code** as well as
the link. Typing the code works on any phone or browser, so it fixes the
"opened the link in another browser" problem.

The app is already ready: after "Send sign-in link" the page shows a
code box. It starts working as soon as step C is done.

Everything happens in the browser and takes about 20 minutes. Never
paste a password or key into a chat; put it only where a step says.

**Cost: $0.** Brevo's free plan sends up to 300 emails a day, far more
than the team needs.

## A. Brevo (the email sender)

1. Go to brevo.com and create a free account (choose the Free plan;
   skip any trial of paid plans).
2. **Senders, domains & dedicated IPs** → **Senders** → **Add a sender**:
   name `Aafia عافية`, and an email address you can open (for example
   the team's Gmail). Confirm the email Brevo sends to it.
3. **SMTP & API** → **SMTP** tab. Note the **SMTP server**
   (`smtp-relay.brevo.com`), **Port** (`587`) and **Login**. Then click
   **Generate a new SMTP key**, name it "Supabase", and keep the page
   open: the key is shown only once.

## B. Supabase: use Brevo

1. supabase.com → the Aafia project → **Authentication** → **Emails**
   → **SMTP Settings** → turn on **Enable custom SMTP**.
2. Fill in:
   - Sender email: the address from A2
   - Sender name: `Aafia عافية`
   - Host: `smtp-relay.brevo.com`, Port: `587`
   - Username: the **Login** from A3
   - Password: the SMTP key from A3
3. **Save**. Then, under **Authentication** → **Rate Limits**, set
   "emails sent per hour" to **30**.

## C. Supabase: the bilingual email

In **Authentication** → **Emails** → **Templates**, change two
templates the same way: **Magic Link** (people who signed in before) and
**Confirm signup** (someone's first time).

- Subject: `كود الدخول لعافية · Your Aafia sign-in code`
- Message body (switch to the source/HTML view and replace everything):

```html
<div style="font-family:Tahoma,Arial,sans-serif;max-width:480px;margin:auto;color:#1C2B27">
  <h2 style="color:#0E5A4C">عافية · Aafia</h2>
  <div dir="rtl" style="text-align:right">
    <p>ده كود الدخول لإدارة عافية:</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#0E5A4C" dir="ltr">{{ .Token }}</p>
    <p>أكتبو في صفحة الدخول، أو اضغط الرابط ده من نفس التلفون:</p>
    <p><a href="{{ .ConfirmationURL }}" style="color:#0E5A4C">ادخل لعافية</a></p>
    <p style="color:#5E6B66">الكود بيشتغل مرة واحدة ولمدة ساعة. لو ما طلبتو إنت، تجاهل الإيميل ده.</p>
  </div>
  <hr style="border:none;border-top:1px solid #E6DACA">
  <div dir="ltr">
    <p>Your Aafia admin sign-in code is <strong>{{ .Token }}</strong>.</p>
    <p>Type it on the sign-in page, or <a href="{{ .ConfirmationURL }}" style="color:#0E5A4C">tap here to sign in</a> on the same phone.</p>
    <p style="color:#5E6B66">It works once, for one hour. If you didn't ask for it, ignore this email.</p>
  </div>
</div>
```

Save both templates.

## D. Check it

1. Open the live site → `/admin/login`, enter your email, tap
   **رسل رابط الدخول**.
2. The email arrives in Arabic and English with a 6-digit code.
3. Type the code in the box on the page → you're in the admin area.

If the email doesn't arrive within 5 minutes, look in Spam, then in
Brevo → **Transactional** → **Logs**, and send me a screenshot.
