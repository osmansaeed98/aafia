import Link from "next/link";
import LanguageSwitch from "./LanguageSwitch";

export default function Header({ t, lang }) {
  return (
    <header className="header">
      <Link href="/" className="brand">
        {t.appName}
      </Link>
      <LanguageSwitch label={t.switchLanguage} to={lang === "ar" ? "en" : "ar"} />
    </header>
  );
}
