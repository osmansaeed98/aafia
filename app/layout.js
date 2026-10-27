import { Readex_Pro } from "next/font/google";
import Link from "next/link";
import Header from "@/components/Header";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import { getDictionary, getDir, getLang } from "@/lib/i18n";
import "./globals.css";

// Downloaded at build time and served from our own site, so phones
// never wait on Google. Tahoma shows while it loads.
const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-readex",
});

export async function generateMetadata() {
  const t = getDictionary(await getLang());
  return {
    title: t.appName,
    description: t.home.subtitle,
  };
}

export const viewport = {
  themeColor: "#0E5A4C",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }) {
  const lang = await getLang();
  const t = getDictionary(lang);

  return (
    <html lang={lang} dir={getDir(lang)} className={readex.variable}>
      <body>
        <div className="page">
          <Header t={t} lang={lang} />
          <main>{children}</main>
          <footer className="footer">
            <Link href="/privacy">{t.footer.privacy}</Link>
            <Link href="/terms">{t.footer.terms}</Link>
          </footer>
        </div>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
