import Link from "next/link";
import Alerts from "@/components/admin/Alerts";
import PlaceForm from "@/components/admin/PlaceForm";
import { getDictionary, getLang } from "@/lib/i18n";

export default async function NewPlace({ searchParams }) {
  const t = getDictionary(await getLang()).admin;
  const { error } = await searchParams;
  return (
    <>
      <Link href="/admin/places" className="back-link">
        {t.back}
      </Link>
      <h1>{t.places.add}</h1>
      <p className="muted">{t.places.newHint}</p>
      <Alerts t={t} error={error} />
      <PlaceForm t={t} />
    </>
  );
}
