import LegalPage from "@/components/LegalPage";
import { getLang } from "@/lib/i18n";
import { legal } from "@/lib/legal";

export async function generateMetadata() {
  const lang = await getLang();
  return { title: `${legal[lang].privacy.title} | Aafia` };
}

export default async function Page() {
  return <LegalPage lang={await getLang()} page="privacy" />;
}
