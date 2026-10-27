# Launch checklist

What's left before real patients use Aafia, in order. The app itself is
built (Milestones 1–7). Steps marked **(owner)** are done by you in the
browser; I can guide you screen by screen.

## 1. Put the latest version live (owner, 2 minutes, free)
GitHub → the aafia repository → **Pull requests** → open the request
from `setup-web-app` → **Merge pull request** → **Confirm merge**.
Vercel updates the site by itself a few minutes later.

## 2. Phone sign-in by WhatsApp (owner, ~45 minutes)
Follow `docs/whatsapp-login-setup.md`. Until this is done, patients and
reception can't sign in. Cost: about $0.005 per code (≈ $5 for 1,000
sign-ins a month).

## 3. Team sign-in email with a code (owner, ~20 minutes, free)
Follow `docs/admin-email-setup.md`.

## 4. Contact email and legal pages (owner)
- Choose an email for patients' questions (for example a new Gmail
  just for Aafia). Add it in Vercel → the project → **Settings** →
  **Environment Variables** as `NEXT_PUBLIC_CONTACT_EMAIL`, then
  **Redeploy**. It then shows on the privacy and terms pages.
- Read `/privacy` and `/terms` on the site. They're plain-language
  drafts: have someone who knows Sudanese law review them before launch.

## 5. Real places (owner)
In the admin area add only confirmed details: clinics and hospitals,
doctors, weekly hours, fees, labs and their prices, pharmacies, places
doing home visits, and emergency departments with their phone numbers.
Remove any example entries. On **Team**, add each place's reception
phone number.

## 6. A one-week trial (owner + one clinic)
Start with one friendly clinic and 10–20 families you know:
- reception signs in on their phone and runs one evening's queue;
- families book, follow the queue, try a pharmacy request;
- note anything confusing and send it to me.

## 7. Decisions with a cost (owner)
- WhatsApp booking confirmations and "your turn is coming" alerts:
  built and switched off, about $0.01 per booking (≈ $10 a month for
  1,000 bookings).
- SMS backup for people without WhatsApp: off; SMS to Sudan costs much
  more per message. If wanted, we set a monthly cap first.

## Good to know (free plans)
- **Supabase pauses a free project after 7 days with no visits.** Once
  patients use it daily this doesn't happen; during quiet weeks, open
  the site once a week. You get an email before it pauses, and it can be
  restarted from the dashboard.
- **Backups:** the free plan has no downloadable backups. Before the
  data grows, ask me to set up a free weekly copy, or consider Supabase
  Pro ($25 a month) later, when Aafia has income.
- Storage: 1 GB free for photos and medical files. Prescription photos
  are shrunk on the phone, and each account is capped (30 photos, 50
  medical files), so this lasts a long time.
