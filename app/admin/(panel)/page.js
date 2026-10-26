import Link from "next/link";
import { getAdminSession } from "@/lib/admin/auth";
import { formatNumber } from "@/lib/format";
import { getDictionary, getLang } from "@/lib/i18n";

export default async function AdminHome() {
  const lang = await getLang();
  const t = getDictionary(lang).admin;
  const { supabase } = await getAdminSession();
  const count = async (table) =>
    (await supabase.from(table).select("id", { count: "exact", head: true })).count ?? 0;
  const [places, doctors, emergency] = await Promise.all([
    count("places"),
    count("doctors"),
    count("emergency_departments"),
  ]);

  const tiles = [
    { href: "/admin/places", n: places, label: t.dashboard.places },
    { href: "/admin/places", n: doctors, label: t.dashboard.doctors },
    { href: "/admin/emergency", n: emergency, label: t.dashboard.emergency },
  ];

  return (
    <>
      <h1>{t.title}</h1>
      <div className="tiles">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="tile">
            <strong>{formatNumber(tile.n, lang)}</strong>
            <span>{tile.label}</span>
          </Link>
        ))}
      </div>
      <Link href="/admin/places/new" className="button button-solid">
        {t.places.add}
      </Link>
    </>
  );
}
