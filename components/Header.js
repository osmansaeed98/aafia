import Link from "next/link";
import { cookies } from "next/headers";
import LanguageSwitch from "./LanguageSwitch";

// Checks only whether a sign-in cookie exists (no network call), so
// public pages stay fast. The account page itself checks properly.
async function looksSignedIn() {
  const store = await cookies();
  return store.getAll().some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
}

export default async function Header({ t, lang }) {
  const signedIn = await looksSignedIn();
  return (
    <header className="header">
      <Link href="/" className="brand">
        {t.appName}
      </Link>
      <nav className="header-links">
        <Link href={signedIn ? "/account" : "/login"} className="header-pill">
          {signedIn ? t.patient.nav.account : t.patient.nav.login}
        </Link>
        <LanguageSwitch label={t.switchLanguage} to={lang === "ar" ? "en" : "ar"} />
      </nav>
    </header>
  );
}
