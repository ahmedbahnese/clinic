"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Copy, Loader2, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Clinic = { id: string; name: string; location: string; daily_capacity: number };
type Service = { id: string; clinic_id: string; name: string; instructions: string; direct_only: boolean };
type Workday = { clinic_id: string; iso_weekday: number };

const arabicDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const errorText: Record<string, string> = {
  "clinic is closed on this date": "العيادة مغلقة في هذا اليوم.",
  "clinic does not work on this date": "هذا اليوم غير متاح للعيادة.",
  "clinic daily capacity reached": "اكتملت الطاقة اليومية للعيادة.",
  "service daily capacity reached": "اكتملت الطاقة اليومية لهذه الخدمة.",
  "duplicate active booking": "يوجد طلب نشط بالبيانات نفسها لهذه العيادة وهذا اليوم.",
  "service requires direct attendance": "هذه الخدمة متاحة بالحضور المباشر فقط.",
};

function todayInCairo() {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => values.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default function BookingPage() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [workdays, setWorkdays] = useState<Workday[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const dateInputRef = useCallback((element: HTMLInputElement | null) => {
    if (element) element.min = todayInCairo();
  }, []);
  const [loadingCatalog, setLoadingCatalog] = useState(() => !!client);
  const [submitting, setSubmitting] = useState(false);
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!client) return;
    void (async () => {
      try {
        const [clinicResult, serviceResult, workdayResult] = await Promise.all([
          client.from("clinics").select("id,name,location,daily_capacity").eq("is_active", true).order("name"),
          client.from("clinic_services").select("id,clinic_id,name,instructions,direct_only").eq("is_active", true).eq("direct_only", false).order("name"),
          client.from("clinic_workdays").select("clinic_id,iso_weekday").eq("is_active", true),
        ]);
        if (clinicResult.error || serviceResult.error || workdayResult.error) {
          setError("تعذر تحميل قائمة العيادات. تحقق من إعداد Supabase ثم أعد المحاولة.");
        }
        setClinics((clinicResult.data ?? []) as Clinic[]);
        setServices((serviceResult.data ?? []) as Service[]);
        setWorkdays((workdayResult.data ?? []) as Workday[]);
      } catch {
        setError("تعذر الاتصال بخدمة العيادات. أعد المحاولة لاحقًا.");
      } finally {
        setLoadingCatalog(false);
      }
    })();
  }, [client]);

  const clinicServices = services.filter((service) => service.clinic_id === clinicId);
  const selectedService = clinicServices.find((service) => service.id === serviceId);
  const clinicDays = new Set(workdays.filter((day) => day.clinic_id === clinicId).map((day) => day.iso_weekday));
  async function submit(formData: FormData) {
    setError(""); setToken(""); setCopied(false);
    if (!client) { setError("لم تُضبط خدمة Supabase بعد. أضف المتغيرات في ملف البيئة وفق README."); return; }
    setSubmitting(true);
    try {
      const response = await client.rpc("create_public_booking", {
        p_clinic_id: formData.get("clinicId"), p_service_id: formData.get("serviceId"),
        p_patient_name: formData.get("patientName"), p_patient_age: formData.get("age"),
        p_address: formData.get("address"), p_phone: formData.get("phone"),
        p_appointment_date: formData.get("date"),
      });
      if (response.error) { setError(errorText[response.error.message] ?? "تعذر حفظ الطلب. راجع البيانات وحاول مرة أخرى."); return; }
      const row = Array.isArray(response.data) ? response.data[0] : response.data;
      if (row?.tracking_token) {
        setToken(row.tracking_token);
        (document.getElementById("booking-form") as HTMLFormElement | null)?.reset();
        setClinicId("");
        setServiceId("");
      } else setError("لم يصل تأكيد الحفظ. لا تعِد إرسال الطلب قبل تحديث الصفحة والتحقق.");
    } catch {
      setError("تعذر الاتصال بالخادم. تحقق من الشبكة قبل إعادة المحاولة.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyToken() {
    try { await navigator.clipboard.writeText(token); setCopied(true); }
    catch { setError("تعذر النسخ تلقائيًا؛ حدّد الرمز وانسخه يدويًا."); }
  }

  return <main className="form-page">
    <div className="page-shell">
      <Link className="back-link" href="/"><ArrowRight size={17} /> العودة للرئيسية</Link>
      <div className="page-heading"><span className="page-icon"><CalendarDays size={22} /></span><div><span className="section-kicker">العيادات الخارجية</span><h1>طلب حجز موعد</h1><p>أدخل البيانات المطلوبة. سيبقى الطلب في انتظار مراجعة موظف الحجز.</p></div></div>
      {!client && <div className="info-banner"><ShieldCheck size={20} /><span>هذه الواجهة لا ترسل بيانات حتى تُضبط مفاتيح Supabase في البيئة.</span></div>}
      {loadingCatalog ? <div className="loading-box"><Loader2 className="spin" /> جارٍ تحميل العيادات...</div> : <form id="booking-form" className="booking-form" onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }}>
        <div className="form-grid">
          <label>اسم المريض/ة<input name="patientName" required minLength={2} maxLength={160} autoComplete="name" /></label>
          <label>العمر<input name="age" required placeholder="مثال: 5 سنوات أو 8 شهور" maxLength={40} /></label>
          <label>رقم الهاتف<input name="phone" required inputMode="tel" placeholder="01xxxxxxxxx" autoComplete="tel" /></label>
          <label>العنوان<input name="address" required maxLength={500} /></label>
          <label>العيادة<select name="clinicId" required value={clinicId} onChange={(event) => { setClinicId(event.target.value); setServiceId(""); }}><option value="">اختر العيادة</option>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}{clinic.location ? ` — ${clinic.location}` : ""}</option>)}</select></label>
          <label>الخدمة<select name="serviceId" required value={serviceId} disabled={!clinicId} onChange={(event) => setServiceId(event.target.value)}><option value="">اختر الخدمة</option>{clinicServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          <label>يوم الحجز<input ref={dateInputRef} name="date" type="date" required /></label>
        </div>
        {clinicId && <p className="field-help">أيام العمل المسجلة: {Array.from(clinicDays).sort().map((day) => arabicDays[day % 7]).join("، ") || "لا توجد أيام مسجلة"}. يتحقق الخادم من الإجازات والسعة قبل الحفظ.</p>}
        {selectedService?.instructions && <div className="info-banner" role="note"><ShieldCheck size={20} /><span><strong>تعليمات الخدمة ومتطلبات الفئة العمرية</strong><br /><span style={{ whiteSpace: "pre-line" }}>{selectedService.instructions}</span></span></div>}
        <button className="button button-primary submit-button" disabled={submitting || !client}>{submitting ? <><Loader2 className="spin" size={18} /> جارٍ الإرسال...</> : "إرسال طلب الحجز"}</button>
      </form>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {token && <div className="success-card"><CheckCircle2 size={28} /><h2>تم استلام طلب الحجز</h2><p>احتفظ برمز المتابعة التالي؛ لن يظهر مرة أخرى بعد مغادرة الصفحة.</p><code dir="ltr">{token}</code><button type="button" className="button button-outline" onClick={copyToken}><Copy size={17} />{copied ? "تم نسخ الرمز" : "نسخ رمز المتابعة"}</button><Link className="inline-link" href="/track">افتح صفحة المتابعة وأدخل الرمز يدويًا</Link></div>}
      <p className="privacy-note"><ShieldCheck size={16} /> لا نعرض رقم الطابور أو بيانات مرضى آخرين في صفحة المتابعة. لا تضع رمز المتابعة في رابط عام.</p>
    </div>
  </main>;
}
