# Aafia (عافية)

Doctor and hospital booking web app for families in Khartoum. See
`CLAUDE.md` for the full brief. Built with [Next.js](https://nextjs.org),
hosted on [Vercel](https://vercel.com), data in [Supabase](https://supabase.com).

- `app/` – pages: home, offline emergency page (`emergency/`), language
  switch (`lang/`), patient login (`login/`) and account (`account/`),
  admin area (`admin/`), WhatsApp code hook (`api/auth/send-code/`),
  booking (`book/`, `bookings/`) and the reception dashboard (`clinic/`)
- `components/` – shared page parts; `components/admin/` – admin forms
- `lib/i18n/` – all wording, Sudanese Arabic (`ar.js`) and English (`en.js`)
- `lib/format.js` – numbers, times, money (always Western digits)
- `lib/phone.js` – Sudanese mobile numbers; `lib/whatsapp.js` and
  `lib/send-code-hook.js` – login codes by WhatsApp
- `lib/booking.js` – queue position and wait estimate;
  `lib/booking-messages.js` – WhatsApp booking messages (off by default)
- `lib/supabase/` – database connection; `lib/admin/` – admin checks and form reading
- `proxy.js` – keeps the team's sign-in fresh on admin pages
- `public/sw.js` – keeps the emergency page working offline
- `supabase/migrations/` – the database design and access rules, in order
- `scripts/db-migrate.js` – applies new migrations (`npm run db:migrate`)
- `tests/` – `npm test`: helpers, database access rules, and the app in a
  phone-sized browser (uses temporary test accounts, removed afterwards)

Settings the app needs are listed in `.env.example`. Switching on
WhatsApp login: `docs/whatsapp-login-setup.md`.
