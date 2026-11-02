"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardList, Filter, LoaderCircle, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "../reports/page.module.css";

type StaffRole = "booking" | "admin" | "doctor" | "nurse";
type StaffProfile = { id: string; display_name: string; role: StaffRole; is_active: boolean };
type Clinic = { id: string; name: string };
type AuditLog = {
  id: number;
  clinic_id: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};
type Filters = { from: string; to: string; clinicId: string };
type Gate = "checking" | "ready" | "signedOut" | "denied" | "configError";

const INITIAL_FILTERS: Filters = { from: "", to: "", clinicId: "" };
const PRIVATE_KEY = /phone|address|patient|email|token|name|age|document|birth|dob|medical|diagnos|reason|instruction|message|note/i;
const FIELD_LABELS: Record<string, string> = {
  status: "الحالة",
  old_status: "الحالة السابقة",
  new_status: "الحالة الجديدة",
  appointment_date: "تاريخ الموعد",
  queue_date: "تاريخ الدور",
  queue_number: "رقم الدور",
  state: "حالة الدور",
  event_type: "نوع الحدث",
  role: "الدور",
  is_active: "نشط",
  daily_capacity: "السعة اليومية",
  daily_capacity_override: "السعة الاستثنائية",
  opening_time: "وقت الفتح",
  closing_time: "وقت الإغلاق",
  iso_weekday: "يوم الأسبوع",
  action: "الفعل",
  entity_type: "نوع السجل",
  clinic_id: "معرّف العيادة",
  service_id: "معرّف الخدمة",
  is_open: "مفتوح",
};
const ACTION_LABELS: Record<string, string> = { insert: "إضافة", update: "تحديث", delete: "حذف", create_booking: "إنشاء حجز", cancel_booking: "إلغاء حجز", confirm_booking: "تأكيد حجز", set_staff: "تغيير صلاحية موظف", check_in: "تسجيل حضور", complete_visit: "إكمال زيارة" };
const ENTITY_LABELS: Record<string, string> = {
  bookings: "حجز",
  booking: "حجز",
  clinic: "عيادة",
  clinics: "عيادة",
  clinic_services: "خدمة",
  service_workdays: "جدول خدمة",
  clinic_workdays: "جدول عيادة",
  clinic_holidays: "إجازة عيادة",
  clinic_special_days: "يوم استثنائي",
  queue_entry: "دور",
  queue_entries: "دور",
  queue_event: "حدث دور",
  staff_profile: "ملف موظف",
  system_settings: "إعداد نظام",
  message_templates: "قالب رسالة",
};

function localDateBoundary(date: string, end = false) {
  return new Date(`${date}T${end ? "23:59:59.999" : "00:00:00"}`).toISOString();
}

function displayTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function summarize(data: Record<string, unknown> | null) {
  if (!data || typeof data !== "object") return "—";
  const safeEntries = Object.entries(data).filter(([key]) => !PRIVATE_KEY.test(key)).slice(0, 5);
  if (!safeEntries.length) return "لا توجد تفاصيل آمنة للعرض";
  const pieces = safeEntries.map(([key, value]) => {
    const label = FIELD_LABELS[key] ?? key.replaceAll("_", " ");
    let text: string;
    if (value === null || value === undefined) text = "—";
    else if (typeof value === "boolean") text = value ? "نعم" : "لا";
    else if (typeof value === "object") text = "تفاصيل إضافية";
    else text = String(value).slice(0, 90);
    return `${label}: ${text}`;
  });
  const hiddenCount = Object.keys(data).length - safeEntries.length;
  if (hiddenCount > 0) pieces.push(`(${hiddenCount} حقول مستبعدة للخصوصية)`);
  return pieces.join(" · ");
}

function actorFallback(id: string | null) {
  return id ? `معرّف الموظف ${id.slice(0, 8)}` : "فاعل غير محدد";
}

export default function StaffAuditPage() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [gate, setGate] = useState<Gate>("checking");
  const [gateMessage, setGateMessage] = useState("");
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [draft, setDraft] = useState<Filters>(INITIAL_FILTERS);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAudit = useCallback(async (selected: Filters) => {
    if (!client) return;
    setLoading(true);
    setError("");
    try {
      let query = client
        .from("audit_logs")
        .select("id,clinic_id,actor_id,action,entity_type,entity_id,before_data,after_data,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (selected.from) query = query.gte("created_at", localDateBoundary(selected.from));
      if (selected.to) query = query.lte("created_at", localDateBoundary(selected.to, true));
      if (selected.clinicId) query = query.eq("clinic_id", selected.clinicId);
      const { data, error: queryError } = await query;
      if (queryError) {
        setLogs([]);
        setActors({});
        setClinics([]);
        setError("تعذر قراءة سجل التدقيق. تحقق من دور الحساب واتصاله؛ سجلات النتائج محكومة بسياسة RLS.");
        return;
      }
      const rows = (data ?? []) as AuditLog[];
      setLogs(rows);
      const actorIds = Array.from(new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id))));
      const clinicIds = Array.from(new Set(rows.map((row) => row.clinic_id).filter((id): id is string => Boolean(id))));
      const [actorResult, clinicResult] = await Promise.all([
        actorIds.length ? client.from("staff_profiles").select("id,display_name").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
        clinicIds.length ? client.from("clinics").select("id,name").in("id", clinicIds) : Promise.resolve({ data: [], error: null }),
      ]);
      const actorMap: Record<string, string> = {};
      for (const actor of actorResult.data ?? []) {
        if (actor.display_name) actorMap[actor.id] = actor.display_name;
      }
      setActors(actorMap);
      setClinics((clinicResult.data ?? []) as Clinic[]);
    } catch {
      setLogs([]);
      setError("تعذر الاتصال بسجل التدقيق. حاول مرة أخرى بعد التحقق من اتصال الشبكة.");
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
          setGateMessage("سجّل الدخول بحساب موظف لمراجعة سجل التدقيق.");
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
          setGateMessage("سجل التدقيق متاح لموظفي الحجز والمديرين فقط، وفق سياسة RLS الحالية.");
          setGate("denied");
          return;
        }
        setStaff(verified);
        setGate("ready");
        void loadAudit(INITIAL_FILTERS);
      } catch {
        if (active) {
          setGateMessage("حدث خطأ أثناء التحقق من الجلسة. حدّث الصفحة أو سجّل الدخول مجددًا.");
          setGate("denied");
        }
      }
    }
    void verifyStaff();
    return () => { active = false; };
  }, [client, loadAudit]);

  const clinicOptions = useMemo(() => {
    const options = new Map(clinics.map((clinic) => [clinic.id, clinic.name]));
    for (const log of logs) {
      if (log.clinic_id && !options.has(log.clinic_id)) options.set(log.clinic_id, `عيادة (${log.clinic_id.slice(0, 8)})`);
    }
    return Array.from(options.entries()).map(([id, name]) => ({ id, name }));
  }, [clinics, logs]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setError("تاريخ البداية يجب ألا يأتي بعد تاريخ النهاية.");
      return;
    }
    void loadAudit({ ...draft });
  }

  if (gate !== "ready") {
    return (
      <main className={styles.page} dir="rtl" lang="ar">
        <div className={styles.shell}>
          <Link className={styles.backLink} href="/staff"><ArrowRight size={17} /> مساحة الفريق</Link>
          <section className={styles.gateCard} aria-live="polite">
            {gate === "checking" ? <LoaderCircle className={styles.spinner} size={25} /> : <ShieldCheck size={26} />}
            <h1>سجل التدقيق</h1>
            <p>{gate === "checking" ? "نتحقق من الحساب والدور قبل قراءة السجل." : gateMessage}</p>
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
          <div className={styles.heroIcon}><ClipboardList size={23} /></div>
          <div className={styles.heroCopy}><span className={styles.eyebrow}>سجل للقراءة فقط</span><h1>سجل التدقيق</h1><p>أحداث النظام المسموح بها ضمن نطاق سياسات الوصول الحالية.</p></div>
        </header>
        <section className={`${styles.privacyNote} ${styles.noPrint}`}><ShieldCheck size={18} /><span>لا توجد أزرار تعديل أو حذف. تعرض السجلات وفق RLS، وتُخفى الحقول التي قد تتضمن بيانات شخصية في ملخص التغييرات.</span></section>
        <section className={`${styles.filterCard} ${styles.noPrint}`} aria-label="تصفية سجل التدقيق">
          <div className={styles.sectionHeading}><span className={styles.headingIcon}><Filter size={18} /></span><div><h2>تصفية السجل</h2><p>حدد فترة زمنية أو عيادة ضمن السجلات المسموح بها.</p></div></div>
          <form className={styles.filterGrid} onSubmit={applyFilters}>
            <label className={styles.field}>من تاريخ<input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
            <label className={styles.field}>إلى تاريخ<input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
            <label className={styles.field}>العيادة<select value={draft.clinicId} onChange={(event) => setDraft({ ...draft, clinicId: event.target.value })}><option value="">كل العيادات ضمن RLS</option>{clinicOptions.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select></label>
            <div className={styles.filterActions}><button type="submit" className={styles.primaryButton} disabled={loading}>{loading ? <LoaderCircle className={styles.spinner} size={17} /> : <Filter size={17} />} تطبيق التصفية</button><button type="button" className={styles.textButton} onClick={() => { setDraft(INITIAL_FILTERS); void loadAudit(INITIAL_FILTERS); }}>مسح التصفية</button></div>
          </form>
        </section>
        {error && <div className={styles.alert} role="alert">{error}</div>}
        <section className={styles.tableCard}>
          <div className={styles.tableHeading}><div><span className={styles.eyebrow}>أثر قابل للمراجعة</span><h2>الأحداث المسجلة</h2><p>تُعرض أحدث ٥٠٠ نتيجة كحد أقصى.</p></div><span className={styles.tableCount}>{new Intl.NumberFormat("ar").format(logs.length)} سجل</span></div>
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead><tr><th scope="col">الوقت</th><th scope="col">الفاعل</th><th scope="col">الفعل</th><th scope="col">الكيان</th><th scope="col">قبل التغيير</th><th scope="col">بعد التغيير</th></tr></thead>
              <tbody>
                {loading ? <tr><td className={styles.emptyCell} colSpan={6}><LoaderCircle className={styles.spinner} size={20} /> جارٍ تحميل السجل...</td></tr> : logs.length === 0 ? <tr><td className={styles.emptyCell} colSpan={6}>لا توجد سجلات مطابقة ضمن النطاق الذي تسمح به سياسات RLS.</td></tr> : logs.map((log) => {
                  const clinicName = log.clinic_id ? clinics.find((clinic) => clinic.id === log.clinic_id)?.name ?? `عيادة (${log.clinic_id.slice(0, 8)})` : "عام / دون عيادة";
                  const entityLabel = ENTITY_LABELS[log.entity_type] ?? log.entity_type;
                  const entityRef = log.entity_id ? ` · ${log.entity_id.slice(0, 12)}` : "";
                  return <tr key={log.id}>
                    <td><time dateTime={log.created_at}>{displayTime(log.created_at)}</time></td>
                    <td><strong>{log.actor_id ? actors[log.actor_id] ?? actorFallback(log.actor_id) : "فاعل غير محدد"}</strong><span className={styles.subCell}>{clinicName}</span></td>
                    <td><span className={styles.auditAction}>{ACTION_LABELS[log.action] ?? log.action}</span></td>
                    <td><strong>{entityLabel}{entityRef}</strong><span className={styles.subCell}>{clinicName}</span></td>
                    <td className={styles.summaryCell}>{summarize(log.before_data)}</td>
                    <td className={styles.summaryCell}>{summarize(log.after_data)}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.tableFootnote}><ShieldCheck size={15} /> هذه الصفحة للقراءة فقط؛ لا تنفذ تعديلات على السجل.</div>
        </section>
        <footer className={`${styles.footer} ${styles.noPrint}`}>جلسة موظف موثقة · نطاق القراءة يحدده Supabase RLS</footer>
      </div>
    </main>
  );
}
