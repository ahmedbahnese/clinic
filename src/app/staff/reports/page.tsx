"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, CalendarDays, Download, Filter, LoaderCircle, Printer, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./page.module.css";

type StaffRole = "booking" | "admin" | "doctor" | "nurse";
type StaffProfile = { id: string; display_name: string; role: StaffRole; is_active: boolean };
type Clinic = { id: string; name: string };
type Booking = {
  id: string;
  clinic_id: string;
  service_id: string;
  patient_name: string;
  patient_age: string;
  appointment_date: string;
  status: string;
  booking_source: string;
  created_at: string;
};
type Filters = { from: string; to: string; clinicId: string; status: string };
type Gate = "checking" | "ready" | "signedOut" | "denied" | "configError";

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  confirmed: "مؤكد",
  cancelled: "ملغي",
  completed: "مكتمل",
  no_show: "لم يحضر",
};
const INITIAL_FILTERS: Filters = { from: "", to: "", clinicId: "", status: "" };

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export default function StaffReportsPage() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [gate, setGate] = useState<Gate>("checking");
  const [gateMessage, setGateMessage] = useState("");
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [draft, setDraft] = useState<Filters>(INITIAL_FILTERS);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadBookings = useCallback(async (selected: Filters) => {
    if (!client) return;
    setLoading(true);
    setError("");
    try {
      let query = client
        .from("bookings")
        .select("id,clinic_id,service_id,patient_name,patient_age,appointment_date,status,booking_source,created_at")
        .order("appointment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (selected.from) query = query.gte("appointment_date", selected.from);
      if (selected.to) query = query.lte("appointment_date", selected.to);
      if (selected.clinicId) query = query.eq("clinic_id", selected.clinicId);
      if (selected.status) query = query.eq("status", selected.status);
      const { data, error: queryError } = await query;
      if (queryError) {
        setBookings([]);
        setError("تعذر تحميل التقرير. تحقق من صلاحية الموظف واتصاله، وستظل سياسات RLS هي التي تحدد السجلات المتاحة.");
      } else {
        setBookings((data ?? []) as Booking[]);
      }
    } catch {
      setBookings([]);
      setError("تعذر الاتصال بخدمة التقارير. حاول مرة أخرى بعد التحقق من اتصال الشبكة.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    async function verifyStaff() {
      if (!client) {
        setGateMessage("خدمة قاعدة البيانات غير مُهيّأة. يلزم ضبط إعدادات Supabase العامة قبل استخدام هذه الصفحة.");
        setGate("configError");
        return;
      }
      try {
        const { data: authData, error: authError } = await client.auth.getUser();
        if (!active) return;
        if (authError || !authData.user) {
          setGateMessage("سجّل الدخول بحساب موظف للوصول إلى التقارير.");
          setGate("signedOut");
          return;
        }
        const { data: profile, error: profileError } = await client
          .from("staff_profiles")
          .select("id,display_name,role,is_active")
          .eq("id", authData.user.id)
          .maybeSingle();
        if (!active) return;
        if (profileError || !profile || !profile.is_active) {
          setGateMessage("تعذر التحقق من ملف الموظف أو أن الحساب غير مفعّل. تواصل مع مدير النظام.");
          setGate("denied");
          return;
        }
        const verified = profile as StaffProfile;
        if (verified.role !== "booking" && verified.role !== "admin") {
          setGateMessage("هذه التقارير متاحة لموظفي الحجز والمديرين فقط، وفق صلاحيات النظام الحالية.");
          setGate("denied");
          return;
        }
        setStaff(verified);

        let clinicIds: string[] | null = null;
        if (verified.role === "booking") {
          const { data: assignments, error: assignmentError } = await client
            .from("clinic_staff_assignments")
            .select("clinic_id")
            .eq("staff_id", verified.id);
          if (!active) return;
          if (assignmentError) {
            setError("تعذر تحميل نطاق العيادات المعيّنة؛ ستظل نتائج الحجوزات خاضعة لسياسات RLS.");
            clinicIds = [];
          } else {
            clinicIds = (assignments ?? []).map((item) => item.clinic_id as string);
          }
        }
        let clinicQuery = client.from("clinics").select("id,name").order("name");
        if (clinicIds !== null) {
          if (clinicIds.length === 0) {
            if (active) setClinics([]);
          } else {
            clinicQuery = clinicQuery.in("id", clinicIds);
          }
        }
        if (clinicIds === null || clinicIds.length > 0) {
          const { data: clinicData } = await clinicQuery;
          if (active) setClinics((clinicData ?? []) as Clinic[]);
        }
        if (active) {
          setGate("ready");
          void loadBookings(INITIAL_FILTERS);
        }
      } catch {
        if (active) {
          setGateMessage("حدث خطأ أثناء التحقق من الجلسة. حدّث الصفحة أو سجّل الدخول مجددًا.");
          setGate("denied");
        }
      }
    }
    void verifyStaff();
    return () => { active = false; };
  }, [client, loadBookings]);

  const clinicNames = useMemo(() => {
    const names = new Map(clinics.map((clinic) => [clinic.id, clinic.name]));
    for (const row of bookings) {
      if (!names.has(row.clinic_id)) names.set(row.clinic_id, `عيادة (${row.clinic_id.slice(0, 8)})`);
    }
    return names;
  }, [clinics, bookings]);
  const statusCounts = useMemo(() => bookings.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {}), [bookings]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setError("تاريخ البداية يجب ألا يأتي بعد تاريخ النهاية.");
      return;
    }
    void loadBookings({ ...draft });
  }

  if (gate !== "ready") {
    return (
      <main className={styles.page} dir="rtl" lang="ar">
        <div className={styles.shell}>
          <Link className={styles.backLink} href="/staff"><ArrowRight size={17} /> مساحة الفريق</Link>
          <section className={styles.gateCard} aria-live="polite">
            {gate === "checking" ? <LoaderCircle className={styles.spinner} size={25} /> : <ShieldCheck size={26} />}
            <h1>{gate === "checking" ? "جارٍ التحقق من صلاحية الوصول" : "تقارير الحجوزات"}</h1>
            <p>{gate === "checking" ? "نتحقق من الحساب والدور قبل قراءة أي بيانات." : gateMessage}</p>
            {gate === "signedOut" && <Link className={styles.primaryButton} href="/staff/login">تسجيل الدخول</Link>}
            {(gate === "denied" || gate === "configError") && <Link className={styles.secondaryButton} href="/staff/login">العودة إلى دخول الموظفين</Link>}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page} dir="rtl" lang="ar">
      <div className={styles.shell}>
        <div className={`${styles.topbar} ${styles.noPrint}`}>
          <Link className={styles.backLink} href="/staff"><ArrowRight size={17} /> مساحة الفريق</Link>
          <span className={styles.accessBadge}><ShieldCheck size={15} /> {staff?.role === "admin" ? "مدير النظام" : "موظف حجز"}</span>
        </div>

        <header className={styles.hero}>
          <div className={styles.heroIcon}><Activity size={23} /></div>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>لوحة متابعة آمنة</span>
            <h1>تقارير الحجوزات</h1>
            <p>عرض تشغيلي للحجوزات ضمن نطاق الصلاحيات الممنوحة لحسابك.</p>
          </div>
          <div className={`${styles.heroActions} ${styles.noPrint}`}>
            <button type="button" className={styles.primaryButton} onClick={() => window.print()} disabled={loading}>
              <Printer size={17} /> طباعة / حفظ PDF
            </button>
          </div>
        </header>

        <section className={`${styles.privacyNote} ${styles.noPrint}`}>
          <ShieldCheck size={18} />
          <span>لا تُقرأ أرقام الهواتف أو العناوين. يعرض التقرير الأعمدة المسموح بها فقط، وتُطبّق سياسات RLS على كل استعلام.</span>
        </section>

        <section className={`${styles.filterCard} ${styles.noPrint}`} aria-label="تصفية التقرير">
          <div className={styles.sectionHeading}><span className={styles.headingIcon}><Filter size={18} /></span><div><h2>تصفية النتائج</h2><p>حدد الفترة والعيادة وحالة الحجز.</p></div></div>
          <form className={styles.filterGrid} onSubmit={applyFilters}>
            <label className={styles.field}>من تاريخ<input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
            <label className={styles.field}>إلى تاريخ<input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
            <label className={styles.field}>العيادة<select value={draft.clinicId} onChange={(event) => setDraft({ ...draft, clinicId: event.target.value })}><option value="">جميع العيادات ضمن الصلاحية</option>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select></label>
            <label className={styles.field}>حالة الحجز<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">كل الحالات</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className={styles.filterActions}><button type="submit" className={styles.primaryButton} disabled={loading}>{loading ? <LoaderCircle className={styles.spinner} size={17} /> : <Filter size={17} />} عرض النتائج</button><button type="button" className={styles.textButton} onClick={() => { setDraft(INITIAL_FILTERS); void loadBookings(INITIAL_FILTERS); }}>مسح التصفية</button></div>
          </form>
        </section>

        {error && <div className={`${styles.alert} ${styles.noPrint}`} role="alert">{error}</div>}

        <section className={styles.summaryRow} aria-label="ملخص النتائج">
          <article className={styles.statCard}><span className={styles.statLabel}>عدد النتائج المعروضة</span><strong>{new Intl.NumberFormat("ar").format(bookings.length)}</strong><span className={styles.statHint}>بحد أقصى ٥٠٠ سجل لكل استعلام</span></article>
          <article className={styles.statCard}><span className={styles.statLabel}>قيد المراجعة</span><strong>{new Intl.NumberFormat("ar").format(statusCounts.pending ?? 0)}</strong><span className={styles.statHint}>ضمن النتائج الحالية</span></article>
          <article className={styles.statCard}><span className={styles.statLabel}>الحجوزات المؤكدة</span><strong>{new Intl.NumberFormat("ar").format(statusCounts.confirmed ?? 0)}</strong><span className={styles.statHint}>ضمن النتائج الحالية</span></article>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeading}>
            <div><span className={styles.eyebrow}>تقرير عربي</span><h2>تفاصيل الحجوزات</h2><p>تُحدّث البيانات وفق الفلاتر التي اخترتها.</p></div>
            <span className={`${styles.tableCount} ${styles.noPrint}`}><CalendarDays size={15} /> {new Intl.NumberFormat("ar").format(bookings.length)} سجل</span>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead><tr><th scope="col">المراجع</th><th scope="col">العمر</th><th scope="col">العيادة</th><th scope="col">تاريخ الموعد</th><th scope="col">الحالة</th><th scope="col">مصدر الحجز</th></tr></thead>
              <tbody>
                {loading ? <tr><td className={styles.emptyCell} colSpan={6}><LoaderCircle className={styles.spinner} size={20} /> جارٍ تحميل البيانات...</td></tr> : bookings.length === 0 ? <tr><td className={styles.emptyCell} colSpan={6}>لا توجد حجوزات مطابقة للفلاتر ضمن السجلات المسموح بها.</td></tr> : bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td><strong>{booking.patient_name}</strong><span className={styles.subCell}>رقم داخلي: {booking.id.slice(0, 8)}</span></td>
                    <td>{booking.patient_age}</td>
                    <td>{clinicNames.get(booking.clinic_id) ?? "عيادة ضمن النطاق"}</td>
                    <td>{formatDate(booking.appointment_date)}</td>
                    <td><span className={`${styles.statusPill} ${styles[`status_${booking.status}` as keyof typeof styles] ?? ""}`}>{STATUS_LABELS[booking.status] ?? booking.status}</span></td>
                    <td>{booking.booking_source === "staff" ? "عن طريق الموظف" : "الحجز الإلكتروني"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`${styles.tableFootnote} ${styles.noPrint}`}><Download size={15} /> استخدم نافذة الطباعة في المتصفح واختر «حفظ بتنسيق PDF» لتنزيل نسخة عربية.</div>
        </section>

        <footer className={`${styles.footer} ${styles.noPrint}`}>جلسة موظف موثقة · لا تُتجاوز سياسات صلاحيات قاعدة البيانات</footer>
      </div>
    </main>
  );
}
