# Aafia (عافية)

Doctor and hospital booking web app for families in Khartoum. See
`CLAUDE.md` for the full brief. Built with [Next.js](https://nextjs.org),
hosted on [Vercel](https://vercel.com) (no extra settings needed).

- `app/` – pages: home (`page.js`), offline emergency page (`emergency/`),
  language switch (`lang/`), home-screen settings (`manifest.js`)
- `components/` – shared page parts (header, language switch)
- `lib/i18n/` – all wording, Sudanese Arabic (`ar.js`) and English (`en.js`)
- `lib/format.js` – numbers, times and dates (always Western digits)
- `lib/emergency-departments.js` – the checked list of emergency departments
- `public/sw.js` – keeps the emergency page working offline
- `tests/` – `npm test` builds the app and checks it in a phone-sized browser
