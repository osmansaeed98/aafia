import Link from "next/link";
import { getAdminSession } from "@/lib/admin/auth";
import { getDictionary, getLang } from "@/lib/i18n";
import { signOut } from "../login/actions";

export const metadata = { robots: { index: false } };

export default async function AdminLayout({ children }) {
  const t = getDictionary(await getLang()).admin;
  const { isAdmin } = await getAdminSession();

  const signOutForm = (
    <form action={signOut}>
      <button className="button button-small">{t.nav.signOut}</button>
    </form>
  );

  if (!isAdmin) {
    return (
      <div className="admin narrow">
        <h1>{t.noAccess.title}</h1>
        <p className="muted">{t.noAccess.body}</p>
        {signOutForm}
      </div>
    );
  }

  return (
    <div className="admin">
      <nav className="admin-nav" aria-label={t.title}>
        <Link href="/admin">{t.nav.home}</Link>
        <Link href="/admin/places">{t.nav.places}</Link>
        <Link href="/admin/specialties">{t.nav.specialties}</Link>
        <Link href="/admin/emergency">{t.nav.emergency}</Link>
        <Link href="/admin/team">{t.nav.team}</Link>
        {signOutForm}
      </nav>
      {children}
    </div>
  );
}
