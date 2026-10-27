import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDoctor } from "@/app/admin/(panel)/actions";
import Alerts from "@/components/admin/Alerts";
import DoctorForm from "@/components/admin/DoctorForm";
import { ConfirmDelete } from "@/components/admin/Field";
import HoursEditor from "@/components/admin/HoursEditor";
import { getAdminSession } from "@/lib/admin/auth";
import { getDictionary, getLang } from "@/lib/i18n";

export default async function EditDoctor({ params, searchParams }) {
  const lang = await getLang();
  const t = getDictionary(lang).admin;
  const { supabase } = await getAdminSession();
  const { id } = await params;
  const { ok, error } = await searchParams;

  const [{ data: doctor }, { data: hoursData }, { data: specialtiesData }] = await Promise.all([
    supabase.from("doctors").select("*, places(name_ar, name_en)").eq("id", id).maybeSingle(),
    supabase.from("opening_hours").select("*").eq("doctor_id", id),
    supabase.from("specialties").select("id, name_ar, name_en").order("name_ar"),
  ]);
  const specialties = specialtiesData ?? [];
  const hours = hoursData ?? [];
  if (!doctor) notFound();
  const back = `/admin/doctors/${doctor.id}`;

  return (
    <>
      <Link href={`/admin/places/${doctor.place_id}`} className="back-link">
        {t.back}: {lang === "en" ? doctor.places?.name_en : doctor.places?.name_ar}
      </Link>
      <h1>{lang === "en" ? doctor.name_en : doctor.name_ar}</h1>
      <Alerts t={t} ok={ok} error={error} />

      <section className="card">
        <DoctorForm t={t} lang={lang} doctor={doctor} specialties={specialties} />
      </section>

      <HoursEditor
        t={t}
        lang={lang}
        title={t.hours.doctorTitle}
        owner="doctor"
        ownerId={doctor.id}
        hours={hours}
        back={back}
      />

      <ConfirmDelete t={t} action={deleteDoctor}>
        <input type="hidden" name="id" value={doctor.id} />
        <input type="hidden" name="place_id" value={doctor.place_id} />
        <input type="hidden" name="back" value={back} />
      </ConfirmDelete>
    </>
  );
}
