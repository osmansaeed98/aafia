# Aafia (عافية)

A doctor and hospital booking web app for families in Khartoum, Sudan.

The owner is not a developer: explain choices in plain language and
ask before anything that costs money or can't be undone. They work
only in the browser (claude.ai/code): never ask them to run commands
on their own computer.

## What we're building (web app only for now, no store apps)

- Patient side: mobile-first web app that opens in any phone browser
  and can be added to the home screen. Book doctors, hospitals, labs,
  pharmacies and home visits for yourself or family members; get a
  queue number; follow the live queue; medical records and
  prescriptions; ratings; emergency page that works offline.
- Clinic dashboard: web pages for reception staff. Tonight's queue,
  call next number, add walk-ins, mark cash payments, post delays.
- Chatbot "مساعد عافية" (Aafia assistant), powered by the Claude API.
  NOT in the first version: build it only after launch, when the owner
  asks for it.
- Admin area: web pages for the Aafia team to add and update clinics,
  doctors, hours, fees and locations. This is the only source of the
  clinic facts the chatbot uses.

## Scope rules

- Payment is CASH AT RECEPTION ONLY. No online payment, no Bankak.
- In-person visits only. No video consultations.
- Launch city: Khartoum.

## Chatbot rules

- Helps patients pick the right specialty from symptoms described in
  plain words, answers questions about Aafia clinics (hours, fees,
  location, how booking and the queue work) and starts a booking.
- Never diagnoses, never recommends or doses medicines, and says
  clearly that it is not a doctor.
- Danger signs (chest pain, trouble breathing, heavy bleeding, loss of
  consciousness, seizures, a very sick baby): stop and show 999 and
  the nearest open emergency departments straight away.
- Clinic facts come only from Aafia's own database, never invented.
- Replies in Sudanese Arabic (English if the user writes English),
  short, text only.
- The API key lives on the server only, never in the browser.
- Chats are private and used only to answer the patient.
- Model: Claude Sonnet 5.5 (`claude-sonnet-5-5`). Before launch, run
  the Arabic/English test conversations on Sonnet 5.5 and Haiku 5.5
  and move to the cheaper one only if it passes every safety test.

## Users and constraints

- Low-end Android phones, weak and expensive data: small pages, text
  first, images only on Wi-Fi.
- Messages: WhatsApp first for login codes, booking confirmations and
  alerts; SMS only as backup when WhatsApp can't reach the person
  (SMS to Sudan costs far more per message).
- Login: phone number + one-time code (WhatsApp, SMS as backup).
  No passwords.
- Aafia team (admin area): emailed sign-in link for now, because
  Supabase's built-in email can't be customised. Before launch: add
  custom SMTP and switch to a bilingual email with a typed code.
- Arabic-first, right-to-left by default; English as a setting.
- UI copy in Sudanese Arabic dialect; specialty names in standard
  Arabic with the English beneath.
- Digits: Western (0123456789) everywhere, including inside Arabic
  text: prices, times, dates, phone numbers and queue numbers.

## Brand

- Font: Readex Pro (Arabic + Latin), fallback Tahoma.
- Colours: nile #0E5A4C (primary), saffron #E58A2E (accent fill only,
  never as text on light backgrounds), sand #FBF6EE (background),
  ink #1C2B27 (text), ink-muted #5E6B66, nile-soft #DCEDE7,
  saffron-soft #FCEBD7, saffron-ink #9A4F0B, line #E6DACA,
  danger #B42318 (emergency/cancel only).
- Corners: 8 / 14 / 20 px, pills for chips and time slots.
- Tap targets at least 48 px tall.

## Spending

- No extra spending. Stay on free plans; never turn on a paid plan,
  paid add-on or anything billed per use without the owner's explicit
  OK first, with the expected monthly cost in plain numbers.

## How we work

- Build one milestone at a time; plan first, then build.
- Never put API keys or passwords in code or chat; use .env files
  that are not committed.
- After each milestone: run it, write short tests, commit with a
  clear message.

## Where we are (update at the end of each milestone)

- Live site: https://aafia-a14h.vercel.app (Vercel, deploys from `main`).
  Work happens on branch `setup-web-app`; the owner merges it into
  `main` on GitHub (Compare & pull request → Merge).
- Supabase project ref: `wexdrgrmkhjlwjklkris` (Frankfurt, free plan).
  Database changes live in `supabase/migrations/`; apply with
  `npm run db:migrate`. In Claude's cloud session the Supabase token is
  added automatically for api.supabase.com (database read/write only;
  auth settings must be changed by the owner in the dashboard). Node's
  fetch needs `NODE_USE_ENV_PROXY=1` here (the npm scripts set it).
- `npm test` runs helper tests, database access-rule tests and the app
  in a phone-sized browser against the real database (temporary test
  accounts and "E2E" entries, removed afterwards).
- Done: Milestone 1 (look, home page, offline emergency page) and
  Milestone 2 (database, access rules, admin area with email-link
  login). Owner `osmanmohammed98@gmail.com` is the first admin.
- Never add made-up hospitals or phone numbers to the database; only
  details the owner has confirmed.
- Next: Milestone 3, patient login by WhatsApp code (costs money per
  message: plan and get the owner's OK on costs first).
