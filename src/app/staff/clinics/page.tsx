"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarDays, Check, ChevronDown, CirclePlus, Clock3,
  FileText, Loader2, MapPin, Plus, RefreshCw, Save, ShieldCheck,
  Stethoscope, Trash2, X,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Role = "booking" | "admin";
type Clinic = {
  id: string; slug: string; name: string; location: string; opening_time: string | null;
  closing_time: string | null; visit_minutes: number; daily_capacity: number;
  documents_text: string; instructions: string; is_active: boolean;
};
type ClinicWorkday = {
  id?: string; clinic_id: string; iso_weekday: number; is_active: boolean;
  opening_time: string | null; closing_time: string | null;
};
type Holiday = { id: string; clinic_id: string; holiday_date: string; reason: string };
type SpecialDay = {
  id: string; clinic_id: string; special_date: string; is_open: boolean;
  daily_capacity_override: number | null; reason: string;
};
type Service = {
  id: string; clinic_id: string; slug: string; name: string; daily_capacity: number | null;
  direct_only: boolean; is_active: boolean; instructions: string;
};
type ServiceWorkday = { id?: string; clinic_id: string; service_id: string; iso_weekday: number; is_active: boolean };
type ServiceDocument = {
  id: string; clinic_id: string; service_id: string; document_text: string;
  sort_order: number; is_active: boolean;
};
type ClinicForm = Omit<Clinic, "id">;
type ServiceForm = Omit<Service, "id" | "clinic_id">;
type DocumentDraft = { id?: string; document_text: string; sort_order: number; is_active: boolean };

const DAYS = [
  { iso: 1, name: "الإثنين" }, { iso: 2, name: "الثلاثاء" }, { iso: 3, name: "الأربعاء" },
  { iso: 4, name: "الخميس" }, { iso: 5, name: "الجمعة" }, { iso: 6, name: "السبت" },
  { iso: 7, name: "الأحد" },
];
const blankClinic: ClinicForm = {
  slug: "", name: "", location: "", opening_time: "09:00", closing_time: "14:00",
  visit_minutes: 15, daily_capacity: 0, documents_text: "", instructions: "", is_active: true,
};
const blankService: ServiceForm = {
  slug: "", name: "", daily_capacity: null, direct_only: false, is_active: true, instructions: "",
};
const blankWorkdays = (): ClinicWorkday[] => DAYS.map(({ iso: iso_weekday }) => ({
  clinic_id: "", iso_weekday, is_active: false, opening_time: null, closing_time: null,
}));

function timeInput(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
}

function arabicError(error: { message?: string; code?: string } | null | undefined) {
  const message = (error?.message ?? "").toLowerCase();
  if (message.includes("permission denied") || message.includes("not authorized") || error?.code === "42501") {
    return "لا تملك صلاحية تعديل هذا السجل أو هذه العيادة. تحقّق من دورك وإسناد العيادة، وتظل سياسات قاعدة البيانات هي الحماية الأساسية.";
  }
  if (message.includes("duplicate key") || error?.code === "23505") {
    return "يوجد سجل بالقيمة نفسها بالفعل؛ راجع المعرّف المختصر أو التاريخ.";
  }
  if (message.includes("violates check") || error?.code === "23514") {
    return "بعض القيم لا تطابق شروط النظام؛ راجع السعة والأوقات والحقول المطلوبة.";
  }
  if (message.includes("foreign key") || error?.code === "23503") {
    return "تعذّر حفظ السجل لارتباطه ببيانات أخرى؛ حدّث الصفحة وتحقّق من اختيار العيادة أو الخدمة.";
  }
  if (message.includes("jwt") || message.includes("token") || error?.code === "PGRST301") {
    return "انتهت جلسة الدخول أو تعذّر التحقق منها. سجّل الدخول مجددًا ثم أعد المحاولة.";
  }
  return "تعذّر تنفيذ العملية. تحقّق من الاتصال وصلاحية الحقول، ثم أعد المحاولة.";
}

function raiseIfError(error: { message?: string; code?: string } | null) {
  if (error) throw error;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
    <span>{label}</span>{children}{hint && <small className="font-normal leading-6 text-slate-500">{hint}</small>}
  </label>;
}

const inputClass = "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

export default function StaffClinicsPage() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [authState, setAuthState] = useState<"checking" | "ready" | "denied">("checking");
  const [authMessage, setAuthMessage] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [clinicDataLoading, setClinicDataLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [clinicForm, setClinicForm] = useState<ClinicForm>(blankClinic);
  const [clinicDays, setClinicDays] = useState<ClinicWorkday[]>(blankWorkdays);
  const [isCreatingClinic, setIsCreatingClinic] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceDays, setServiceDays] = useState<ServiceWorkday[]>([]);
  const [serviceDocuments, setServiceDocuments] = useState<ServiceDocument[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  const [serviceForm, setServiceForm] = useState<ServiceForm | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [serviceWeekdays, setServiceWeekdays] = useState<number[]>([]);
  const [documentDrafts, setDocumentDrafts] = useState<DocumentDraft[]>([]);
  const [originalDocuments, setOriginalDocuments] = useState<ServiceDocument[]>([]);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayReason, setHolidayReason] = useState("");
  const [specialDate, setSpecialDate] = useState("");
  const [specialOpen, setSpecialOpen] = useState(true);
  const [specialCapacity, setSpecialCapacity] = useState("");
  const [specialReason, setSpecialReason] = useState("");
  const [editingDay, setEditingDay] = useState<SpecialDay | null>(null);

  async function loadClinicsForUser(userRole: Role, userId: string) {
    if (!client) return;
    let assignmentIds: string[] | null = null;
    if (userRole === "booking") {
      const { data, error: assignmentError } = await client.from("clinic_staff_assignments")
        .select("clinic_id").eq("staff_id", userId);
      if (assignmentError) throw assignmentError;
      assignmentIds = (data ?? []).map((item) => item.clinic_id as string);
    }
    const { data, error: clinicsError } = await client.from("clinics")
      .select("id,slug,name,location,opening_time,closing_time,visit_minutes,daily_capacity,documents_text,instructions,is_active")
      .order("name");
    if (clinicsError) throw clinicsError;
    const visible = ((data ?? []) as Clinic[]).filter((row) => userRole === "admin" || assignmentIds?.includes(row.id));
    setClinics(visible);
    setClinicId((current) => visible.some((item) => item.id === current) ? current : visible[0]?.id ?? "");
  }

  useEffect(() => {
    let alive = true;
    async function verifySession() {
      if (!client) {
        if (alive) {
          setAuthState("denied");
          setAuthMessage("إعداد Supabase غير مكتمل. لن تُنشأ بيانات محلية أو وهمية تلقائيًا؛ أضف الإعدادات العامة وسجّل الدخول بحساب موظف مفعّل.");
        }
        return;
      }
      try {
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData.session?.user?.id;
        if (!userId) {
          if (alive) { setAuthState("denied"); setAuthMessage("يلزم تسجيل الدخول بحساب موظف للوصول إلى إدارة الكتالوج."); }
          return;
        }
        const { data: profile, error: profileError } = await client.from("staff_profiles")
          .select("id,role,is_active").eq("id", userId).maybeSingle();
        if (profileError) throw profileError;
        if (!profile || !profile.is_active || !["booking", "admin"].includes(profile.role)) {
          if (alive) { setAuthState("denied"); setAuthMessage("الحساب غير مفعّل أو لا يملك دور موظف الحجز/الإدارة."); }
          return;
        }
        const userRole = profile.role as Role;
        await loadClinicsForUser(userRole, userId);
        if (alive) { setRole(userRole); setAuthState("ready"); }
      } catch (loadError) {
        if (alive) {
          setAuthState("denied");
          setAuthMessage(arabicError(loadError as { message?: string; code?: string }));
        }
      }
    }
    void verifySession();
    return () => { alive = false; };
    // Authentication is intentionally checked on entry; all operations are also checked by RLS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  async function loadClinicData(id: string) {
    if (!client || !id) return;
    setClinicDataLoading(true);
    setError("");
    try {
      const [clinicResult, workdayResult, holidayResult, specialResult, serviceResult] = await Promise.all([
        client.from("clinics").select("id,slug,name,location,opening_time,closing_time,visit_minutes,daily_capacity,documents_text,instructions,is_active").eq("id", id).maybeSingle(),
        client.from("clinic_workdays").select("id,clinic_id,iso_weekday,is_active,opening_time,closing_time").eq("clinic_id", id).order("iso_weekday"),
        client.from("clinic_holidays").select("id,clinic_id,holiday_date,reason").eq("clinic_id", id).order("holiday_date"),
        client.from("clinic_special_days").select("id,clinic_id,special_date,is_open,daily_capacity_override,reason").eq("clinic_id", id).order("special_date"),
        client.from("clinic_services").select("id,clinic_id,slug,name,daily_capacity,direct_only,is_active,instructions").eq("clinic_id", id).order("name"),
      ]);
      for (const result of [clinicResult, workdayResult, holidayResult, specialResult, serviceResult]) raiseIfError(result.error);
      const currentClinic = clinicResult.data as Clinic | null;
      if (!currentClinic) throw new Error("missing clinic");
      const serviceRows = (serviceResult.data ?? []) as Service[];
      const serviceIds = serviceRows.map((item) => item.id);
      let weekdayRows: ServiceWorkday[] = [];
      let documentRows: ServiceDocument[] = [];
      if (serviceIds.length) {
        const [weekdayResult, documentResult] = await Promise.all([
          client.from("service_workdays").select("id,clinic_id,service_id,iso_weekday,is_active").eq("clinic_id", id).in("service_id", serviceIds).order("iso_weekday"),
          client.from("service_documents").select("id,clinic_id,service_id,document_text,sort_order,is_active").eq("clinic_id", id).in("service_id", serviceIds).order("sort_order"),
        ]);
        raiseIfError(weekdayResult.error); raiseIfError(documentResult.error);
        weekdayRows = (weekdayResult.data ?? []) as ServiceWorkday[];
        documentRows = (documentResult.data ?? []) as ServiceDocument[];
      }
      setClinic(currentClinic);
      setClinicForm({ ...currentClinic, opening_time: timeInput(currentClinic.opening_time), closing_time: timeInput(currentClinic.closing_time) });
      const savedDays = (workdayResult.data ?? []) as ClinicWorkday[];
      setClinicDays(DAYS.map(({ iso: iso_weekday }) => {
        const row = savedDays.find((item) => item.iso_weekday === iso_weekday);
        return row ? { ...row, opening_time: timeInput(row.opening_time), closing_time: timeInput(row.closing_time) }
          : { clinic_id: id, iso_weekday, is_active: false, opening_time: null, closing_time: null };
      }));
      setHolidays((holidayResult.data ?? []) as Holiday[]);
      setSpecialDays((specialResult.data ?? []) as SpecialDay[]);
      setServices(serviceRows);
      setServiceDays(weekdayRows);
      setServiceDocuments(documentRows);
    } catch (loadError) {
      setError(arabicError(loadError as { message?: string; code?: string }));
    } finally {
      setClinicDataLoading(false);
    }
  }

  useEffect(() => {
    if (authState !== "ready" || !clinicId || isCreatingClinic) return;
    const timer = window.setTimeout(() => { void loadClinicData(clinicId); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, clinicId, isCreatingClinic]);

  function setMessage(message: string) { setError(""); setNotice(message); }
  function setFailure(reason: unknown) {
    setNotice("");
    setError(arabicError(reason as { message?: string; code?: string }));
  }
  function chooseClinic(id: string) {
    setIsCreatingClinic(false); setServiceForm(null); setEditingServiceId(null); setClinicId(id);
  }

  async function saveClinic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    if (!clinicForm.slug.trim() || !clinicForm.name.trim()) { setError("أدخل الاسم والمعرّف المختصر للعيادة."); return; }
    if (clinicForm.opening_time && clinicForm.closing_time && clinicForm.opening_time >= clinicForm.closing_time) {
      setError("يجب أن يكون وقت الفتح قبل وقت الإغلاق."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const clinicPayload = {
        slug: clinicForm.slug.trim(), name: clinicForm.name.trim(), location: clinicForm.location.trim(),
        opening_time: clinicForm.opening_time || null, closing_time: clinicForm.closing_time || null,
        visit_minutes: Number(clinicForm.visit_minutes), daily_capacity: Number(clinicForm.daily_capacity),
        documents_text: clinicForm.documents_text, instructions: clinicForm.instructions, is_active: clinicForm.is_active,
      };
      let savedId = clinic?.id ?? "";
      if (clinic && !isCreatingClinic) {
        const { error: updateError } = await client.from("clinics").update(clinicPayload).eq("id", clinic.id);
        raiseIfError(updateError);
      } else {
        const { data, error: insertError } = await client.from("clinics").insert(clinicPayload).select("id").single();
        raiseIfError(insertError);
        if (!data) throw new Error("missing clinic id");
        savedId = data.id as string;
      }
      const workdayPayload = clinicDays.map((day) => ({
        clinic_id: savedId, iso_weekday: day.iso_weekday, is_active: day.is_active,
        opening_time: day.opening_time || null, closing_time: day.closing_time || null,
      }));
      const { error: scheduleError } = await client.from("clinic_workdays").upsert(workdayPayload, { onConflict: "clinic_id,iso_weekday" });
      raiseIfError(scheduleError);
      const { data: sessionData } = await client.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error("session expired");
      const roleForLoad = role ?? "booking";
      await loadClinicsForUser(roleForLoad, userId);
      setIsCreatingClinic(false); setClinicId(savedId);
      setMessage("تم حفظ بيانات العيادة وأيام الدوام.");
    } catch (saveError) { setFailure(saveError); }
    finally { setBusy(false); }
  }

  function startNewClinic() {
    setClinic(null); setClinicForm(blankClinic); setClinicDays(blankWorkdays());
    setIsCreatingClinic(true); setClinicId(""); setServiceForm(null); setEditingServiceId(null);
    setHolidays([]); setSpecialDays([]); setServices([]); setServiceDays([]); setServiceDocuments([]);
    setError(""); setNotice("");
  }

  function editService(service: Service) {
    setEditingServiceId(service.id);
    setServiceForm({ slug: service.slug, name: service.name, daily_capacity: service.daily_capacity,
      direct_only: service.direct_only, is_active: service.is_active, instructions: service.instructions });
    setServiceWeekdays(serviceDays.filter((day) => day.service_id === service.id && day.is_active).map((day) => day.iso_weekday));
    const docs = serviceDocuments.filter((doc) => doc.service_id === service.id);
    setOriginalDocuments(docs);
    setDocumentDrafts(docs.map(({ id, document_text, sort_order, is_active }) => ({ id, document_text, sort_order, is_active })));
  }

  function startNewService() {
    setEditingServiceId(null); setServiceForm(blankService); setServiceWeekdays([]);
    setOriginalDocuments([]); setDocumentDrafts([]); setError(""); setNotice("");
  }

  async function saveService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !clinicId || !serviceForm) return;
    if (!serviceForm.slug.trim() || !serviceForm.name.trim()) { setError("أدخل اسم الخدمة ومعرّفها المختصر."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = { clinic_id: clinicId, slug: serviceForm.slug.trim(), name: serviceForm.name.trim(),
        daily_capacity: serviceForm.daily_capacity === null || Number.isNaN(Number(serviceForm.daily_capacity)) ? null : Number(serviceForm.daily_capacity),
        direct_only: serviceForm.direct_only, is_active: serviceForm.is_active, instructions: serviceForm.instructions };
      let savedId = editingServiceId ?? "";
      if (editingServiceId) {
        const { error: updateError } = await client.from("clinic_services").update(payload).eq("id", editingServiceId).eq("clinic_id", clinicId);
        raiseIfError(updateError);
      } else {
        const { data, error: insertError } = await client.from("clinic_services").insert(payload).select("id").single();
        raiseIfError(insertError);
        if (!data) throw new Error("missing service id");
        savedId = data.id as string;
      }
      const { error: clearScheduleError } = await client.from("service_workdays").delete().eq("clinic_id", clinicId).eq("service_id", savedId);
      raiseIfError(clearScheduleError);
      if (serviceWeekdays.length) {
        const { error: addScheduleError } = await client.from("service_workdays").insert(
          serviceWeekdays.map((iso_weekday) => ({ clinic_id: clinicId, service_id: savedId, iso_weekday, is_active: true })),
        );
        raiseIfError(addScheduleError);
      }
      const keepIds = documentDrafts.flatMap((doc) => doc.id ? [doc.id] : []);
      const toDelete = originalDocuments.filter((doc) => !keepIds.includes(doc.id)).map((doc) => doc.id);
      if (toDelete.length) {
        const { error: deleteDocsError } = await client.from("service_documents").delete().eq("clinic_id", clinicId).in("id", toDelete);
        raiseIfError(deleteDocsError);
      }
      for (const doc of documentDrafts) {
        const documentPayload = { clinic_id: clinicId, service_id: savedId, document_text: doc.document_text.trim(),
          sort_order: Number(doc.sort_order) || 0, is_active: doc.is_active };
        if (!documentPayload.document_text) continue;
        if (doc.id) {
          const { error: docUpdateError } = await client.from("service_documents").update(documentPayload).eq("id", doc.id).eq("service_id", savedId);
          raiseIfError(docUpdateError);
        } else {
          const { error: docInsertError } = await client.from("service_documents").insert(documentPayload);
          raiseIfError(docInsertError);
        }
      }
      await loadClinicData(clinicId);
      setEditingServiceId(savedId); setMessage("تم حفظ الخدمة وجدولها وقائمة المستندات.");
    } catch (saveError) { setFailure(saveError); }
    finally { setBusy(false); }
  }

  async function addHoliday(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || !clinicId || !holidayDate) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = { clinic_id: clinicId, holiday_date: holidayDate, reason: holidayReason.trim() };
      const result = editingHoliday
        ? await client.from("clinic_holidays").update(payload).eq("id", editingHoliday.id).eq("clinic_id", clinicId)
        : await client.from("clinic_holidays").insert(payload);
      raiseIfError(result.error); setEditingHoliday(null); setHolidayDate(""); setHolidayReason("");
      await loadClinicData(clinicId); setMessage(editingHoliday ? "تم تحديث الإجازة." : "تمت إضافة الإجازة.");
    } catch (saveError) { setFailure(saveError); } finally { setBusy(false); }
  }

  async function deleteHoliday(item: Holiday) {
    if (!client || !window.confirm("هل تريد حذف يوم الإجازة هذا؟")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: deleteError } = await client.from("clinic_holidays").delete().eq("id", item.id).eq("clinic_id", item.clinic_id);
      raiseIfError(deleteError); await loadClinicData(clinicId); setMessage("تم حذف الإجازة.");
    } catch (saveError) { setFailure(saveError); } finally { setBusy(false); }
  }

  async function saveSpecialDay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || !clinicId || !specialDate) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = { clinic_id: clinicId, special_date: specialDate, is_open: specialOpen,
        daily_capacity_override: specialCapacity === "" ? null : Number(specialCapacity), reason: specialReason.trim() };
      const query = editingDay
        ? client.from("clinic_special_days").update(payload).eq("id", editingDay.id).eq("clinic_id", clinicId)
        : client.from("clinic_special_days").insert(payload);
      const { error: saveError } = await query;
      raiseIfError(saveError); resetSpecialDay(); await loadClinicData(clinicId); setMessage(editingDay ? "تم تحديث اليوم الخاص." : "تمت إضافة اليوم الخاص.");
    } catch (saveError) { setFailure(saveError); } finally { setBusy(false); }
  }

  function resetSpecialDay() {
    setEditingDay(null); setSpecialDate(""); setSpecialOpen(true); setSpecialCapacity(""); setSpecialReason("");
  }

  function beginEditSpecialDay(item: SpecialDay) {
    setEditingDay(item); setSpecialDate(item.special_date); setSpecialOpen(item.is_open);
    setSpecialCapacity(item.daily_capacity_override === null ? "" : String(item.daily_capacity_override)); setSpecialReason(item.reason);
  }

  async function deleteSpecialDay(item: SpecialDay) {
    if (!client || !window.confirm("هل تريد حذف اليوم الخاص هذا؟")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: deleteError } = await client.from("clinic_special_days").delete().eq("id", item.id).eq("clinic_id", clinicId);
      raiseIfError(deleteError); await loadClinicData(clinicId); setMessage("تم حذف اليوم الخاص.");
    } catch (saveError) { setFailure(saveError); } finally { setBusy(false); }
  }

  function dayToggle(days: number[], iso: number, setDays: (next: number[]) => void) {
    setDays(days.includes(iso) ? days.filter((day) => day !== iso) : [...days, iso].sort((a, b) => a - b));
  }

  if (authState !== "ready") {
    return <main dir="rtl" className="min-h-screen bg-[#f4f8f7] px-4 py-12 text-slate-800">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-800"><ShieldCheck size={25} /></div>
        {authState === "checking" ? <div className="flex items-center gap-3 text-slate-600"><Loader2 className="animate-spin" /> جارٍ التحقق من جلسة الموظف...</div> : <>
          <h1 className="text-2xl font-extrabold">إدارة كتالوج العيادات</h1>
          <p className="mt-3 leading-8 text-slate-600">{authMessage}</p>
          <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-7 text-amber-900">استخدم سجلات كتالوج تجريبية فقط عند اختبار الإعداد. لا تعرض هذه الصفحة بيانات حجوزات أو مرضى.</p>
        </>}
      </div>
    </main>;
  }

  const selectedServices = services;
  const selectedServiceName = selectedServices.find((item) => item.id === editingServiceId)?.name ?? "خدمة جديدة";

  return <main dir="rtl" className="min-h-screen bg-[#f4f8f7] px-3 py-7 text-slate-800 sm:px-6 sm:py-10">
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 rounded-3xl border border-teal-100 bg-[radial-gradient(ellipse_at_top_left,_#e8f7f4,_white_58%)] p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-teal-800"><ShieldCheck size={15} /> مساحة الموظفين · {role === "admin" ? "إدارة" : "حجز"}</div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">إدارة كتالوج العيادات</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">إدارة بيانات العيادات والخدمات والجداول والإجازات والمستندات. تعديلات الوصول الفعلي يحكمها RLS في قاعدة البيانات.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => clinicId && void loadClinicData(clinicId)} disabled={!clinicId || clinicDataLoading} className={`${buttonClass} border border-slate-200 bg-white text-slate-700`}><RefreshCw size={16} className={clinicDataLoading ? "animate-spin" : ""} /> تحديث</button>
            {role === "admin" && <button type="button" onClick={startNewClinic} className={`${buttonClass} bg-teal-700 text-white hover:bg-teal-800`}><CirclePlus size={17} /> عيادة جديدة</button>}
          </div>
        </div>
      </header>

      {error && <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-7 text-rose-900"><AlertTriangle size={19} className="mt-1 shrink-0" />{error}</div>}
      {notice && <div role="status" className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900"><Check size={18} />{notice}</div>}

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(250px,0.75fr)_minmax(0,2fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-extrabold"><Stethoscope size={18} className="text-teal-700" /> العيادة المحددة</div>
          <div className="relative">
            <select className={`${inputClass} appearance-none pl-9`} value={isCreatingClinic ? "__new__" : clinicId} onChange={(event) => event.target.value === "__new__" ? startNewClinic() : chooseClinic(event.target.value)}>
              <option value="" disabled>{clinics.length ? "اختر عيادة" : "لا توجد عيادات مسندة"}</option>
              {clinics.map((item) => <option value={item.id} key={item.id}>{item.name}{!item.is_active ? " — غير نشطة" : ""}</option>)}
              {isCreatingClinic && <option value="__new__">عيادة جديدة</option>}
            </select><ChevronDown className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
          </div>
          {role === "booking" && <p className="mt-3 text-xs leading-6 text-slate-500">تظهر عياداتك المسندة فقط. صلاحية كل عملية تُعاد مراجعتها بواسطة RLS.</p>}
          {!clinics.length && !isCreatingClinic && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">لا توجد عيادة مسندة لحسابك، أو لا تسمح سياسة قاعدة البيانات بعرضها.</p>}
        </section>
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-xs font-bold text-slate-500">العيادات المتاحة</span><strong className="mt-2 block text-3xl font-black text-teal-800">{clinics.length}</strong><small className="mt-1 block text-xs text-slate-500">ضمن نطاق حسابك</small></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-xs font-bold text-slate-500">الخدمات في العيادة</span><strong className="mt-2 block text-3xl font-black text-teal-800">{services.length}</strong><small className="mt-1 block text-xs text-slate-500">بما فيها الخدمات الداخلية فقط</small></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-xs font-bold text-slate-500">حد اليوم للعيادة</span><strong className="mt-2 block text-3xl font-black text-teal-800">{clinic?.daily_capacity ?? (isCreatingClinic ? clinicForm.daily_capacity : "—")}</strong><small className="mt-1 block text-xs text-slate-500">حد مشترك؛ سعة الخدمة حد فرعي</small></div>
        </section>
      </div>

      {(clinic || isCreatingClinic) && <>
        <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-extrabold">{isCreatingClinic ? "إنشاء عيادة" : "بيانات العيادة والدوام"}</h2><p className="mt-1 text-sm text-slate-500">حقول النموذج مطابقة لأعمدة clinics وclinic_workdays في المخطط.</p></div>
            {!isCreatingClinic && <span className={`rounded-full px-3 py-1 text-xs font-bold ${clinic?.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{clinic?.is_active ? "نشطة" : "غير نشطة"}</span>}
          </div>
          <form onSubmit={(event) => void saveClinic(event)} className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="اسم العيادة"><input className={inputClass} required maxLength={160} value={clinicForm.name} onChange={(event) => setClinicForm({ ...clinicForm, name: event.target.value })} /></Field>
              <Field label="المعرّف المختصر (slug)" hint="أحرف لاتينية صغيرة وأرقام وشرطات؛ فريد على مستوى النظام."><input className={inputClass} required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" dir="ltr" placeholder="clinic-name" value={clinicForm.slug} onChange={(event) => setClinicForm({ ...clinicForm, slug: event.target.value })} /></Field>
              <Field label="الموقع"><input className={inputClass} maxLength={300} value={clinicForm.location} onChange={(event) => setClinicForm({ ...clinicForm, location: event.target.value })} /></Field>
              <Field label="السعة اليومية المشتركة"><input className={inputClass} type="number" required min="0" step="1" value={clinicForm.daily_capacity} onChange={(event) => setClinicForm({ ...clinicForm, daily_capacity: Number(event.target.value) })} /></Field>
              <Field label="مدة الزيارة بالدقائق"><input className={inputClass} type="number" required min="1" step="1" value={clinicForm.visit_minutes} onChange={(event) => setClinicForm({ ...clinicForm, visit_minutes: Number(event.target.value) })} /></Field>
              <Field label="وقت الفتح الافتراضي"><input className={inputClass} type="time" value={clinicForm.opening_time ?? ""} onChange={(event) => setClinicForm({ ...clinicForm, opening_time: event.target.value })} /></Field>
              <Field label="وقت الإغلاق الافتراضي"><input className={inputClass} type="time" value={clinicForm.closing_time ?? ""} onChange={(event) => setClinicForm({ ...clinicForm, closing_time: event.target.value })} /></Field>
              <Field label="حالة العيادة"><span className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3"><input type="checkbox" checked={clinicForm.is_active} onChange={(event) => setClinicForm({ ...clinicForm, is_active: event.target.checked })} /><span className="text-sm">متاحة في الكتالوج</span></span></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="مستندات العيادة العامة"><textarea className={`${inputClass} min-h-24 resize-y`} value={clinicForm.documents_text} onChange={(event) => setClinicForm({ ...clinicForm, documents_text: event.target.value })} /></Field>
              <Field label="تعليمات العيادة"><textarea className={`${inputClass} min-h-24 resize-y`} value={clinicForm.instructions} onChange={(event) => setClinicForm({ ...clinicForm, instructions: event.target.value })} /></Field>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-extrabold"><Clock3 size={17} className="text-teal-700" /> أيام الدوام · ترقيم ISO</div>
              <p className="mb-4 text-xs leading-6 text-slate-500">الإثنين = 1 … الأحد = 7. وقت اليوم اختياري؛ عند تركه فارغًا تُستخدم أوقات العيادة الافتراضية.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {DAYS.map((day) => {
                  const row = clinicDays.find((item) => item.iso_weekday === day.iso)!;
                  return <div key={day.iso} className="rounded-xl border border-slate-200 bg-white p-3">
                    <label className="mb-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={row.is_active} onChange={(event) => setClinicDays((current) => current.map((item) => item.iso_weekday === day.iso ? { ...item, is_active: event.target.checked } : item))} />{day.name}<span className="text-xs font-normal text-slate-400">ISO {day.iso}</span></label>
                    <div className="grid grid-cols-2 gap-2"><input aria-label={`بداية الدوام ${day.name}`} disabled={!row.is_active} className={inputClass} type="time" value={row.opening_time ?? ""} onChange={(event) => setClinicDays((current) => current.map((item) => item.iso_weekday === day.iso ? { ...item, opening_time: event.target.value || null } : item))} /><input aria-label={`نهاية الدوام ${day.name}`} disabled={!row.is_active} className={inputClass} type="time" value={row.closing_time ?? ""} onChange={(event) => setClinicDays((current) => current.map((item) => item.iso_weekday === day.iso ? { ...item, closing_time: event.target.value || null } : item))} /></div>
                  </div>;
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3"><button disabled={busy} className={`${buttonClass} bg-teal-700 text-white hover:bg-teal-800`}><Save size={17} />{busy ? "جارٍ الحفظ..." : isCreatingClinic ? "إنشاء العيادة وحفظ الدوام" : "حفظ بيانات العيادة والدوام"}</button><span className="text-xs leading-6 text-slate-500">لن يُحذف سجل العيادة؛ عطّلها لإخفائها من الكتالوج العام.</span></div>
          </form>
        </section>

        {!isCreatingClinic && <>
          <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-extrabold">الخدمات</h2><p className="mt-1 text-sm text-slate-500">إدارة السعة الفرعية، direct_only، تعليمات الخدمة، أيامها ومستنداتها.</p></div><button type="button" onClick={startNewService} className={`${buttonClass} bg-teal-700 text-white hover:bg-teal-800`}><Plus size={17} />خدمة جديدة</button></div>
            {clinicDataLoading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} /> جارٍ تحميل بيانات الكتالوج...</div> : <>
              {selectedServices.length === 0 && <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">لا توجد خدمات مسجلة لهذه العيادة.</p>}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {selectedServices.map((item) => {
                  const weekdays = serviceDays.filter((day) => day.service_id === item.id).map((day) => day.iso_weekday);
                  const docs = serviceDocuments.filter((doc) => doc.service_id === item.id);
                  return <article key={item.id} className={`rounded-2xl border p-4 ${editingServiceId === item.id ? "border-teal-300 bg-teal-50/40" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold">{item.name}</h3><p className="mt-1 text-xs text-slate-500" dir="ltr">{item.slug}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${item.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{item.is_active ? "نشطة" : "غير نشطة"}</span></div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-slate-100 px-2 py-1">السعة: {item.daily_capacity ?? "غير محددة"}</span>{item.direct_only && <span className="rounded-lg bg-amber-100 px-2 py-1 font-bold text-amber-900">حضور مباشر</span>}</div>
                    {item.direct_only && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs leading-6 text-amber-900">هذه الخدمة direct_only: لا تظهر للحجز العام ولا تقبل حجزًا عامًا.</p>}
                    <p className="mt-3 text-xs leading-6 text-slate-600">أيام مخصصة: {weekdays.length ? weekdays.map((iso) => DAYS.find((day) => day.iso === iso)?.name).join("، ") : "تتبع أيام العيادة"} · مستندات: {docs.length}</p>
                    {item.instructions && <p className="mt-2 line-clamp-3 text-xs leading-6 text-slate-500">{item.instructions}</p>}
                    <button type="button" onClick={() => editService(item)} className={`${buttonClass} mt-4 min-h-9 border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:border-teal-300`}>تحرير الخدمة</button>
                  </article>;
                })}
              </div>
            </>}

            {serviceForm && <form onSubmit={(event) => void saveService(event)} className="mt-6 rounded-2xl border border-teal-200 bg-teal-50/40 p-4 sm:p-6">
              <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="font-extrabold">{editingServiceId ? `تحرير: ${selectedServiceName}` : "إنشاء خدمة"}</h3><p className="mt-1 text-xs text-slate-500">الخدمة مرتبطة بالعيادة الحالية فقط.</p></div><button type="button" aria-label="إغلاق نموذج الخدمة" onClick={() => { setServiceForm(null); setEditingServiceId(null); }} className="rounded-lg p-2 text-slate-500 hover:bg-white"><X size={18} /></button></div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="اسم الخدمة"><input className={inputClass} required value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} /></Field>
                <Field label="المعرّف المختصر" hint="فريد داخل العيادة."><input className={inputClass} required pattern="[a-z0-9]+(-[a-z0-9]+)*" dir="ltr" value={serviceForm.slug} onChange={(event) => setServiceForm({ ...serviceForm, slug: event.target.value })} /></Field>
                <Field label="السعة اليومية الفرعية" hint="اتركها فارغة إن لم يوجد حد خاص."><input className={inputClass} type="number" min="0" step="1" value={serviceForm.daily_capacity ?? ""} onChange={(event) => setServiceForm({ ...serviceForm, daily_capacity: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
                <Field label="حالة الخدمة"><span className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3"><input type="checkbox" checked={serviceForm.is_active} onChange={(event) => setServiceForm({ ...serviceForm, is_active: event.target.checked })} /><span className="text-sm">متاحة</span></span></Field>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="تعليمات الخدمة"><textarea className={`${inputClass} min-h-24 resize-y`} value={serviceForm.instructions} onChange={(event) => setServiceForm({ ...serviceForm, instructions: event.target.value })} /></Field>
                <div className="grid content-start gap-2">
                  <label className="flex min-h-12 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-bold text-amber-950"><input type="checkbox" checked={serviceForm.direct_only} onChange={(event) => setServiceForm({ ...serviceForm, direct_only: event.target.checked })} />حضور مباشر فقط (direct_only)</label>
                  <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900"><AlertTriangle size={15} className="ml-1 inline" />عند التفعيل، لا تُعرض الخدمة للحجز العام ولا يمكن إنشاء حجز عام لها. استخدمها لخدمة داخلية فقط.</p>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="mb-2 text-sm font-extrabold">أيام الخدمة الاختيارية</h4><p className="mb-3 text-xs leading-6 text-slate-500">اترك كل الأيام غير محددة لتتبع أيام العيادة؛ تحديد أيام يقيّد الخدمة بها. أيام ISO.</p>
                <div className="flex flex-wrap gap-2">{DAYS.map((day) => <label key={day.iso} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${serviceWeekdays.includes(day.iso) ? "border-teal-300 bg-teal-50 text-teal-900" : "border-slate-200"}`}><input type="checkbox" checked={serviceWeekdays.includes(day.iso)} onChange={() => dayToggle(serviceWeekdays, day.iso, setServiceWeekdays)} />{day.name} <span className="text-slate-400">{day.iso}</span></label>)}</div>
              </div>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-extrabold">مستندات الخدمة</h4><p className="mt-1 text-xs text-slate-500">كل سطر سجل من service_documents؛ لا تُنشأ حقول إضافية.</p></div><button type="button" onClick={() => setDocumentDrafts((current) => [...current, { document_text: "", sort_order: current.length + 1, is_active: true }])} className={`${buttonClass} min-h-9 border border-slate-200 bg-white px-3 text-xs`}><Plus size={15} />إضافة مستند</button></div>
                {!documentDrafts.length && <p className="text-xs text-slate-500">لا توجد مستندات خدمة بعد.</p>}
                <div className="grid gap-3">{documentDrafts.map((doc, index) => <div key={doc.id ?? `new-${index}`} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_90px_auto_auto] sm:items-center">
                  <textarea aria-label={`نص المستند ${index + 1}`} className={`${inputClass} min-h-11 resize-y`} placeholder="نص المستند المطلوب" value={doc.document_text} onChange={(event) => setDocumentDrafts((current) => current.map((item, idx) => idx === index ? { ...item, document_text: event.target.value } : item))} />
                  <Field label="ترتيب العرض"><input className={inputClass} type="number" step="1" value={doc.sort_order} onChange={(event) => setDocumentDrafts((current) => current.map((item, idx) => idx === index ? { ...item, sort_order: Number(event.target.value) } : item))} /></Field>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={doc.is_active} onChange={(event) => setDocumentDrafts((current) => current.map((item, idx) => idx === index ? { ...item, is_active: event.target.checked } : item))} />نشط</label>
                  <button type="button" aria-label="حذف هذا المستند" onClick={() => setDocumentDrafts((current) => current.filter((_, idx) => idx !== index))} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50"><Trash2 size={17} /></button>
                </div>)}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} className={`${buttonClass} bg-teal-700 text-white hover:bg-teal-800`}><Save size={16} />{busy ? "جارٍ الحفظ..." : "حفظ الخدمة والأيام والمستندات"}</button><button type="button" onClick={() => { setServiceForm(null); setEditingServiceId(null); }} className={`${buttonClass} border border-slate-200 bg-white text-slate-700`}>إلغاء</button></div>
            </form>}
          </section>

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-2"><CalendarDays className="text-teal-700" size={20} /><div><h2 className="text-lg font-extrabold">الإجازات</h2><p className="text-xs text-slate-500">clinic_holidays؛ تتقدم على اليوم الخاص.</p></div></div>
              <form onSubmit={(event) => void addHoliday(event)} className="mb-4 grid gap-3 sm:grid-cols-[180px_1fr_auto_auto] sm:items-end">
                <Field label="تاريخ الإجازة"><input className={inputClass} type="date" required value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} /></Field>
                <Field label="السبب"><input className={inputClass} value={holidayReason} onChange={(event) => setHolidayReason(event.target.value)} /></Field>
                <button disabled={busy} className={`${buttonClass} bg-teal-700 text-white`}><Plus size={16} />{editingHoliday ? "حفظ التعديل" : "إضافة"}</button>
                {editingHoliday && <button type="button" onClick={() => { setEditingHoliday(null); setHolidayDate(""); setHolidayReason(""); }} className={`${buttonClass} border border-slate-200 bg-white`}><X size={15} />إلغاء</button>}
              </form>
              <div className="divide-y divide-slate-100">{holidays.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><div><strong dir="ltr" className="block text-sm">{item.holiday_date}</strong><span className="text-xs text-slate-500">{item.reason || "دون سبب مسجل"}</span></div><div className="flex items-center gap-1"><button type="button" disabled={busy} onClick={() => { setEditingHoliday(item); setHolidayDate(item.holiday_date); setHolidayReason(item.reason); }} className="rounded-lg px-2 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50">تعديل</button><button type="button" disabled={busy} onClick={() => void deleteHoliday(item)} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50" aria-label="حذف الإجازة"><Trash2 size={17} /></button></div></div>)}{!holidays.length && <p className="py-3 text-sm text-slate-500">لا توجد إجازات مسجلة.</p>}</div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-2"><CalendarDays className="text-teal-700" size={20} /><div><h2 className="text-lg font-extrabold">الأيام الخاصة</h2><p className="text-xs text-slate-500">clinic_special_days؛ يمكنها فتح يوم خارج الجدول أو تعديل السعة.</p></div></div>
              <form onSubmit={(event) => void saveSpecialDay(event)} className="grid gap-3 sm:grid-cols-2">
                <Field label="التاريخ"><input className={inputClass} type="date" required value={specialDate} onChange={(event) => setSpecialDate(event.target.value)} /></Field>
                <Field label="حالة اليوم"><select className={inputClass} value={specialOpen ? "open" : "closed"} onChange={(event) => setSpecialOpen(event.target.value === "open")}><option value="open">مفتوح استثنائيًا</option><option value="closed">مغلق</option></select></Field>
                <Field label="سعة بديلة (اختيارية)"><input className={inputClass} type="number" min="0" step="1" value={specialCapacity} onChange={(event) => setSpecialCapacity(event.target.value)} /></Field>
                <Field label="السبب"><input className={inputClass} value={specialReason} onChange={(event) => setSpecialReason(event.target.value)} /></Field>
                <div className="flex gap-2 sm:col-span-2"><button disabled={busy} className={`${buttonClass} bg-teal-700 text-white`}><Save size={16} />{editingDay ? "حفظ التعديل" : "إضافة اليوم الخاص"}</button>{editingDay && <button type="button" onClick={resetSpecialDay} className={`${buttonClass} border border-slate-200 bg-white`}><X size={15} />إلغاء</button>}</div>
              </form>
              <div className="mt-4 divide-y divide-slate-100">{specialDays.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><div><strong dir="ltr" className="block text-sm">{item.special_date}</strong><span className="text-xs text-slate-500">{item.is_open ? "مفتوح" : "مغلق"}{item.daily_capacity_override !== null ? ` · سعة ${item.daily_capacity_override}` : ""}{item.reason ? ` · ${item.reason}` : ""}</span></div><div className="flex gap-1"><button type="button" disabled={busy} onClick={() => beginEditSpecialDay(item)} className="rounded-lg px-2 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50">تعديل</button><button type="button" disabled={busy} onClick={() => void deleteSpecialDay(item)} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50" aria-label="حذف اليوم الخاص"><Trash2 size={16} /></button></div></div>)}{!specialDays.length && <p className="py-3 text-sm text-slate-500">لا توجد أيام خاصة مسجلة.</p>}</div>
            </section>
          </div>
        </>}
      </>}

      {!clinic && !isCreatingClinic && clinics.length > 0 && <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500"><MapPin className="mx-auto mb-3 text-teal-700" />اختر عيادة لعرض بيانات الكتالوج وإدارتها.</div>}
      <footer className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-7 text-slate-500"><FileText className="ml-1 inline" size={15} /> هذه الواجهة لا تستعلم عن bookings أو أي بيانات مرضى. تُنفّذ عمليات التعديل المباشرة على جداول الكتالوج فقط؛ وقد ينجح جزء من عملية مركبة قبل فشل جزء لاحق، لذا راجع رسالة الحالة وحدّث البيانات بعد أي خطأ.</footer>
    </div>
  </main>;
}
