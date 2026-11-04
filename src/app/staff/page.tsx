"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, CalendarDays, Check, CheckCircle2, ClipboardList,
  FileBarChart2, LogOut, MapPin, Phone, Printer, RefreshCw, ShieldCheck,
  Stethoscope, UserRound, Users, X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type StaffRole = "booking" | "doctor" | "nurse" | "admin";
type StaffProfile = {
  id: string;
  display_name: string;
  role: StaffRole;
  is_active: boolean;
};
type Clinic = { id: string; name: string; location: string; is_active: boolean };
type Service = { id: string; clinic_id: string; name: string; direct_only: boolean };
type Booking = {
  id: string;
  clinic_id: string;
  service_id: string;
  patient_name?: string;
  patient_age: string;
  appointment_date: string;
  status: BookingStatus;
  booking_source: "public" | "staff";
  created_at: string;
};
type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
type QueueState = "waiting" | "called" | "in_progress" | "skipped" | "completed" | "no_show" | "cancelled" | "transferred" | "rescheduled";
type QueueEntry = {
  id: string;
  clinic_id: string;
  booking_id: string;
  queue_date: string;
  queue_number: number;
  state: QueueState;
  is_current: boolean;
};
type QueueCounter = { clinic_id: string; queue_date: string; last_number: number };
type ContactInfo = { patient_name: string; phone: string; address: string };

const roleLabels: Record<StaffRole, string> = {
  admin: "مدير النظام",
  booking: "موظف الحجز والاستقبال",
  doctor: "طبيب/ة",
  nurse: "تمريض",
};
const bookingStatusLabels: Record<BookingStatus, string> = {
  pending: "بانتظار التأكيد",
  confirmed: "مؤكد",
  cancelled: "ملغي",
  completed: "مكتمل",
  no_show: "لم يحضر",
};
const queueStatusLabels: Record<QueueState, string> = {
  waiting: "بانتظار النداء",
  called: "تم النداء",
  in_progress: "قيد الكشف",
  skipped: "تم التخطي",
  completed: "مكتمل",
  no_show: "لم يحضر",
  cancelled: "ملغي",
  transferred: "محول",
  rescheduled: "أعيدت جدولتُه",
};
const queueActions: Record<QueueState, { action: string; label: string }[]> = {
  waiting: [{ action: "call", label: "نداء" }, { action: "skip", label: "تخطي" }, { action: "no_show", label: "لم يحضر" }],
  called: [{ action: "start", label: "بدء الكشف" }, { action: "skip", label: "تخطي" }, { action: "no_show", label: "لم يحضر" }],
  in_progress: [{ action: "complete", label: "إنهاء" }],
  skipped: [{ action: "resume", label: "إعادة للطابور" }],
  completed: [], no_show: [], cancelled: [], transferred: [], rescheduled: [],
};
const statusTone: Record<string, string> = {
  pending: "amber", confirmed: "teal", cancelled: "muted", completed: "green", no_show: "rose",
  waiting: "amber", called: "teal", in_progress: "blue", skipped: "muted",
  transferred: "muted", rescheduled: "muted",
};

function cairoToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (key: string) => parts.find((item) => item.type === key)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(new Date(`${value}T12:00:00`));
}
function readableError(message?: string) {
  const translations: Record<string, string> = {
    "not authorized for clinic": "ليس لديك صلاحية لهذا الإجراء في هذه العيادة.",
    "booking not found": "لم يعد الحجز موجودًا أو لا يمكن الوصول إليه.",
    "booking is not pending": "لا يمكن تأكيد هذا الحجز بحالته الحالية.",
    "booking cannot be cancelled": "لا يمكن إلغاء هذا الحجز بحالته الحالية.",
    "cannot cancel a booking already in progress": "لا يمكن إلغاء حجز بدأ الكشف فيه.",
    "booking cannot be rescheduled": "لا يمكن إعادة جدولة هذا الحجز بحالته الحالية.",
    "cannot reschedule a booking already in progress": "لا يمكن إعادة جدولة حجز بدأ الكشف فيه.",
    "cannot transfer a booking already in progress": "لا يمكن تحويل حجز بدأ الكشف فيه.",
    "invalid transfer": "تحقق من حالة الحجز واختيار عيادة مختلفة.",
    "no waiting entry": "لا يوجد مراجعون بانتظار النداء.",
    "queue not found for date": "لا يوجد طابور مسجل لهذه العيادة في هذا التاريخ.",
    "queue entry not found": "تعذر العثور على هذا الدور.",
    "entry is not waiting": "هذا الدور لم يعد بانتظار النداء.",
    "entry has not been called": "يجب نداء الدور قبل بدء الكشف.",
    "entry cannot be skipped": "لا يمكن تخطي هذا الدور في حالته الحالية.",
    "entry is not skipped": "هذا الدور ليس ضمن الأدوار المتخطاة.",
    "entry is not in progress": "هذا الدور ليس قيد الكشف حاليًا.",
    "entry cannot be marked no-show": "لا يمكن تسجيل عدم الحضور لهذه الحالة.",
    "duplicate active booking": "يوجد حجز نشط بالبيانات نفسها لهذه العيادة وهذا اليوم.",
    "clinic daily capacity reached": "اكتملت الطاقة اليومية للعيادة.",
    "service daily capacity reached": "اكتملت الطاقة اليومية لهذه الخدمة.",
    "clinic is closed on this date": "العيادة مغلقة في هذا اليوم.",
    "clinic does not work on this date": "هذا اليوم غير متاح للعيادة.",
    "service unavailable": "الخدمة المختارة غير متاحة.",
    "clinic unavailable": "العيادة المختارة غير متاحة.",
    "invalid booking details": "تحقق من بيانات الحجز، خصوصًا الهاتف والعنوان.",
    "booking date must not be in the past": "لا يمكن إنشاء حجز بتاريخ سابق.",
  };
  if (!message) return "تعذر الاتصال بالخدمة. تحقق من الشبكة ثم أعد المحاولة.";
  if (translations[message]) return translations[message];
  if (/fetch|network|timeout|connection/i.test(message)) return "تعذر الاتصال بالخدمة. تحقق من الشبكة ثم أعد المحاولة.";
  return "تعذر إتمام العملية. راجع البيانات والصلاحية ثم أعد المحاولة.";
}

type ChangeMode = "reschedule" | "transfer" | null;
type BookingChangeClient = NonNullable<ReturnType<typeof createSupabaseBrowserClient>>;
function BookingChangeActions({
  client, booking, clinics, services, minDate, disabled, onErrorAction, onSuccessAction,
}: {
  client: BookingChangeClient;
  booking: Booking;
  clinics: Clinic[];
  services: Service[];
  minDate: string;
  disabled: boolean;
  onErrorAction: (message: string) => void;
  onSuccessAction: (message: string) => void;
}) {
  const [mode, setMode] = useState<ChangeMode>(null);
  const [newDate, setNewDate] = useState(booking.appointment_date);
  const [reason, setReason] = useState("");
  const [targetClinic, setTargetClinic] = useState("");
  const [targetService, setTargetService] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const transferClinics = clinics.filter((clinic) => clinic.id !== booking.clinic_id);
  const transferServices = services.filter((service) => service.clinic_id === targetClinic);

  function open(nextMode: Exclude<ChangeMode, null>) {
    setMode(nextMode); setReason(""); setLocalError("");
    if (nextMode === "reschedule") setNewDate(booking.appointment_date);
    if (nextMode === "transfer") { setTargetClinic(transferClinics[0]?.id ?? ""); setTargetService(""); }
  }
  function close() { setMode(null); setReason(""); setLocalError(""); }

  async function reschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newDate < minDate) { setLocalError("لا يمكن اختيار تاريخ سابق لليوم."); return; }
    if (newDate === booking.appointment_date) { setLocalError("اختر تاريخًا مختلفًا لإعادة الجدولة."); return; }
    if (reason.trim().length < 3) { setLocalError("اكتب سبب إعادة الجدولة (3 أحرف على الأقل)."); return; }
    setBusy(true); setLocalError("");
    try {
      const result = await client.rpc("reschedule_booking", { p_booking_id: booking.id, p_new_date: newDate, p_reason: reason.trim() });
      if (result.error) throw result.error;
      close(); onSuccessAction("تمت إعادة جدولة الحجز، مع الاحتفاظ برقم الطابور السابق كسجل وعدم إعادة استخدامه.");
    } catch (error) {
      onErrorAction(error instanceof Error ? error.message : "");
    } finally { setBusy(false); }
  }

  async function transfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetClinic || !targetService) { setLocalError("اختر العيادة والخدمة الجديدة."); return; }
    if (reason.trim().length < 3) { setLocalError("اكتب سبب التحويل (3 أحرف على الأقل)."); return; }
    setBusy(true); setLocalError("");
    try {
      const result = await client.rpc("transfer_booking", {
        p_booking_id: booking.id, p_target_clinic_id: targetClinic,
        p_target_service_id: targetService, p_reason: reason.trim(),
      });
      if (result.error) throw result.error;
      close(); onSuccessAction("تم تحويل الحجز وتحديث تعليمات الخدمة والأوراق ورقم الطابور في العيادة الجديدة.");
    } catch (error) {
      onErrorAction(error instanceof Error ? error.message : "");
    } finally { setBusy(false); }
  }

  return <div>
    <div className="sd-row-actions">
      <button type="button" className="sd-action" disabled={disabled} onClick={() => open("reschedule")}>إعادة الجدولة</button>
      {transferClinics.length > 0 && <button type="button" className="sd-action" disabled={disabled} onClick={() => open("transfer")}>تحويل</button>}
    </div>
    {mode === "reschedule" && <form className="sd-cancel" onSubmit={(event) => void reschedule(event)}>
      <input type="date" value={newDate} min={minDate} onChange={(event) => setNewDate(event.target.value)} required aria-label="تاريخ الموعد الجديد" />
      <input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required placeholder="سبب إعادة الجدولة" aria-label="سبب إعادة الجدولة" />
      <button type="submit" className="sd-action sd-action-primary" disabled={busy || disabled}>{busy ? "جارٍ الحفظ..." : "حفظ التاريخ"}</button>
      <button type="button" className="sd-icon-button" onClick={close} aria-label="إغلاق" disabled={busy}><X size={15} /></button>
    </form>}
    {mode === "transfer" && <form className="sd-cancel" onSubmit={(event) => void transfer(event)}>
      <select value={targetClinic} onChange={(event) => { setTargetClinic(event.target.value); setTargetService(""); }} required aria-label="العيادة المستقبلة" style={{ minHeight: 31, maxWidth: 190, border: "1px solid #dce8e9", borderRadius: 7, padding: "4px 7px", fontSize: 10 }}>
        <option value="">اختر العيادة</option>{transferClinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
      </select>
      <select value={targetService} onChange={(event) => setTargetService(event.target.value)} required disabled={!targetClinic} aria-label="الخدمة المستقبلة" style={{ minHeight: 31, maxWidth: 190, border: "1px solid #dce8e9", borderRadius: 7, padding: "4px 7px", fontSize: 10 }}>
        <option value="">اختر الخدمة</option>{transferServices.map((service) => <option key={service.id} value={service.id}>{service.name}{service.direct_only ? " — حضور مباشر" : ""}</option>)}
      </select>
      <input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required placeholder="سبب التحويل" aria-label="سبب التحويل" />
      <button type="submit" className="sd-action sd-action-primary" disabled={busy || disabled || !transferServices.length}>{busy ? "جارٍ التحويل..." : "تأكيد التحويل"}</button>
      <button type="button" className="sd-icon-button" onClick={close} aria-label="إغلاق" disabled={busy}><X size={15} /></button>
    </form>}
    {localError && <p role="alert">{localError}</p>}
  </div>;
}

export default function StaffPage() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [sessionError, setSessionError] = useState("");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [queueCounters, setQueueCounters] = useState<QueueCounter[]>([]);
  const [date, setDate] = useState("");
  const dateInputRef = useCallback((element: HTMLInputElement | null) => {
    if (element) element.min = cairoToday();
  }, []);
  const [clinicFilter, setClinicFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyAction, setBusyAction] = useState("");
  const [contactFor, setContactFor] = useState("");
  const [contacts, setContacts] = useState<Record<string, ContactInfo>>({});
  const [cancelFor, setCancelFor] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [newBookingClinic, setNewBookingClinic] = useState("");

  const isStaffAllowed = !!staff?.is_active;
  const canManageBookings = staff?.role === "admin" || staff?.role === "booking";
  const canSeeContacts = canManageBookings;
  const activeClinicIds = useMemo(() => clinics.map((clinic) => clinic.id), [clinics]);
  const selectedServices = services.filter((service) => service.clinic_id === newBookingClinic);
  const visibleClinicIds = useMemo(() => clinicFilter === "all" ? activeClinicIds : activeClinicIds.filter((id) => id === clinicFilter), [activeClinicIds, clinicFilter]);
  const clinicNames = useMemo(() => new Map(clinics.map((clinic) => [clinic.id, clinic.name])), [clinics]);
  const serviceNames = useMemo(() => new Map(services.map((service) => [service.id, service.name])), [services]);

  const loadStaffWorkspace = useCallback(async (userId: string) => {
    if (!client) return;
    setLoadingProfile(true);
    setSessionError("");
    setStaff(null);
    setClinics([]);
    setServices([]);
    try {
      const profileResult = await client.from("staff_profiles")
        .select("id,display_name,role,is_active").eq("id", userId).maybeSingle();
      if (profileResult.error) throw profileResult.error;
      const profile = profileResult.data as StaffProfile | null;
      if (!profile) {
        setSessionError("لم يُعثر على ملف موظف لهذا الحساب. تواصل مع مدير النظام لتفعيل الحساب.");
        return;
      }
      setStaff(profile);
      if (!profile.is_active) {
        setSessionError("حساب الموظف غير مفعّل حاليًا. يرجى مراجعة مدير النظام.");
        return;
      }
      if (profile.role === "admin") {
        const clinicResult = await client.from("clinics")
          .select("id,name,location,is_active").eq("is_active", true).order("name");
        if (clinicResult.error) throw clinicResult.error;
        const clinicRows = (clinicResult.data ?? []) as Clinic[];
        setClinics(clinicRows);
        const clinicIds = clinicRows.map((clinic) => clinic.id);
        if (clinicIds.length) {
          const serviceResult = await client.from("clinic_services")
            .select("id,clinic_id,name,direct_only").eq("is_active", true).in("clinic_id", clinicIds).order("name");
          if (serviceResult.error) throw serviceResult.error;
          setServices((serviceResult.data ?? []) as Service[]);
        }
      } else {
        const assignmentResult = await client.from("clinic_staff_assignments")
          .select("clinic_id").eq("staff_id", userId);
        if (assignmentResult.error) throw assignmentResult.error;
        const assignedIds = (assignmentResult.data ?? []).map((row: { clinic_id: string }) => row.clinic_id);
        if (!assignedIds.length) {
          setClinics([]);
          return;
        }
        const clinicResult = await client.from("clinics")
          .select("id,name,location,is_active").eq("is_active", true).in("id", assignedIds).order("name");
        if (clinicResult.error) throw clinicResult.error;
        const clinicRows = (clinicResult.data ?? []) as Clinic[];
        setClinics(clinicRows);
        const clinicIds = clinicRows.map((clinic) => clinic.id);
        if (clinicIds.length) {
          const serviceResult = await client.from("clinic_services")
            .select("id,clinic_id,name,direct_only").eq("is_active", true).in("clinic_id", clinicIds).order("name");
          // Non-booking roles cannot read direct-only services by RLS; their
          // staff workflow does not need the internal booking catalog.
          if (serviceResult.error) throw serviceResult.error;
          setServices((serviceResult.data ?? []) as Service[]);
        }
      }
    } catch {
      setSessionError("تعذر التحقق من ملف الموظف أو العيادات. افحص الشبكة وصلاحيات Supabase ثم أعد المحاولة.");
      setStaff(null);
    } finally {
      setLoadingProfile(false);
    }
  }, [client]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDate(cairoToday()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!client) return;
    let mounted = true;
    const checkSession = async () => {
      try {
        const result = await client.auth.getSession();
        if (!mounted) return;
        if (result.error) throw result.error;
        setAuthUser(result.data.session?.user ?? null);
        if (result.data.session?.user) await loadStaffWorkspace(result.data.session.user.id);
      } catch {
        if (mounted) setSessionError("تعذر التحقق من جلسة الدخول. تحقق من الاتصال وأعد تحميل الصفحة.");
      } finally {
        if (mounted) setAuthChecked(true);
      }
    };
    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setAuthUser(session?.user ?? null);
      if (event === "SIGNED_OUT") {
        setStaff(null);
        setClinics([]);
        setServices([]);
        setBookings([]);
        setQueueEntries([]);
        setQueueCounters([]);
        setContacts({});
        setSessionError("");
        setAuthChecked(true);
      } else if (session?.user) {
        // Supabase auth callbacks must remain synchronous; workspace reads start
        // in a later microtask to avoid blocking the auth client's lock.
        window.setTimeout(() => { if (mounted) void loadStaffWorkspace(session.user.id); }, 0);
      }
    });
    void checkSession();
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [client, loadStaffWorkspace]);

  useEffect(() => {
    if (!client || !isStaffAllowed || !staff || !date) return;
    if (!activeClinicIds.length) return;
    let cancelled = false;
    const fetchData = async () => {
      setLoadingData(true);
      setPageError("");
      setContacts({});
      try {
        let bookingQuery = client.from("bookings")
          .select(canSeeContacts
            ? "id,clinic_id,service_id,patient_name,patient_age,appointment_date,status,booking_source,created_at"
            : "id,clinic_id,service_id,patient_age,appointment_date,status,booking_source,created_at")
          .eq("appointment_date", date).in("clinic_id", visibleClinicIds).order("created_at", { ascending: false });
        if (statusFilter !== "all") bookingQuery = bookingQuery.eq("status", statusFilter);
        const [bookingResult, queueResult, counterResult] = await Promise.all([
          bookingQuery,
          client.from("queue_entries")
            .select("id,clinic_id,booking_id,queue_date,queue_number,state,is_current")
            .eq("queue_date", date).in("clinic_id", visibleClinicIds).order("queue_number"),
          client.from("queue_counters")
            .select("clinic_id,queue_date,last_number")
            .eq("queue_date", date).in("clinic_id", visibleClinicIds),
        ]);
        if (cancelled) return;
        if (bookingResult.error || queueResult.error || counterResult.error) {
          setPageError("تعذر تحميل الحجوزات أو بيانات الطابور. قد تكون الشبكة غير مستقرة أو تحتاج صلاحية قاعدة البيانات إلى مراجعة.");
          return;
        }
        setBookings((bookingResult.data ?? []) as unknown as Booking[]);
        setQueueEntries((queueResult.data ?? []) as QueueEntry[]);
        setQueueCounters((counterResult.data ?? []) as QueueCounter[]);
      } catch {
        if (!cancelled) setPageError("حدث خطأ في الاتصال أثناء تحميل بيانات العمل. أعد المحاولة.");
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };
    void fetchData();
    return () => { cancelled = true; };
  }, [client, staff, isStaffAllowed, activeClinicIds, visibleClinicIds, date, statusFilter, canSeeContacts, refreshKey]);

  async function signOut() {
    if (!client) return;
    setSigningOut(true);
    try {
      const result = await client.auth.signOut();
      if (result.error) throw result.error;
      setAuthUser(null);
      setStaff(null);
      setClinics([]);
      setServices([]);
      setBookings([]);
      setQueueEntries([]);
      setQueueCounters([]);
    } catch {
      setPageError("تعذر تسجيل الخروج بسبب مشكلة اتصال. أعد المحاولة.");
    } finally {
      setSigningOut(false);
    }
  }

  async function confirmBooking(bookingId: string) {
    if (!client) return;
    setPageError(""); setNotice(""); setBusyAction(bookingId);
    try {
      const result = await client.rpc("confirm_booking", { p_booking_id: bookingId });
      if (result.error) throw result.error;
      setNotice("تم تأكيد الحجز وتحديث سجل الطابور.");
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setPageError(readableError(error instanceof Error ? error.message : undefined));
    } finally { setBusyAction(""); }
  }

  async function cancelBooking(bookingId: string) {
    if (!client) return;
    if (cancelReason.trim().length < 3) {
      setPageError("اكتب سبب الإلغاء (ثلاثة أحرف على الأقل) قبل المتابعة.");
      return;
    }
    setPageError(""); setNotice(""); setBusyAction(bookingId);
    try {
      const result = await client.rpc("cancel_booking", { p_booking_id: bookingId, p_reason: cancelReason.trim() });
      if (result.error) throw result.error;
      setCancelFor(""); setCancelReason("");
      setNotice("تم إلغاء الحجز وحُفظ السبب في سجل الحالة.");
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setPageError(readableError(error instanceof Error ? error.message : undefined));
    } finally { setBusyAction(""); }
  }

  async function toggleContact(bookingId: string) {
    if (!client || !canSeeContacts) return;
    if (contactFor === bookingId) { setContactFor(""); return; }
    setContactFor(bookingId);
    if (contacts[bookingId]) return;
    setBusyAction(`contact:${bookingId}`); setPageError("");
    try {
      const result = await client.rpc("get_booking_contact", { p_booking_id: bookingId });
      if (result.error) throw result.error;
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row) throw new Error("contact unavailable");
      setContacts((current) => ({ ...current, [bookingId]: row as ContactInfo }));
    } catch (error) {
      setContactFor("");
      setPageError(readableError(error instanceof Error ? error.message : undefined));
    } finally { setBusyAction(""); }
  }

  async function createInternalBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !canManageBookings) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusyAction("internal-booking"); setPageError(""); setNotice("");
    try {
      const result = await client.rpc("create_internal_booking", {
        p_clinic_id: form.get("clinicId"),
        p_service_id: form.get("serviceId"),
        p_patient_name: form.get("patientName"),
        p_patient_age: form.get("age"),
        p_address: form.get("address"),
        p_phone: form.get("phone"),
        p_appointment_date: form.get("appointmentDate"),
      });
      if (result.error) throw result.error;
      formElement.reset();
      setNewBookingClinic("");
      setNewBookingOpen(false);
      setNotice("تم إنشاء الحجز الداخلي وتأكيده وإضافته للطابور من خلال قاعدة البيانات.");
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setPageError(readableError(error instanceof Error ? error.message : undefined));
    } finally { setBusyAction(""); }
  }

  async function performQueueAction(clinicId: string, entryId: string | null, action: string) {
    if (!client) return;
    setBusyAction(`queue:${clinicId}:${entryId ?? action}`); setPageError(""); setNotice("");
    try {
      const result = await client.rpc("manage_queue", {
        p_clinic_id: clinicId,
        p_queue_date: date,
        p_action: action,
        p_queue_entry_id: entryId,
        p_details: {},
      });
      if (result.error) throw result.error;
      setNotice(action === "next" ? "تم نداء الدور التالي." : "تم تحديث حالة الدور وتسجيل الإجراء.");
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setPageError(readableError(error instanceof Error ? error.message : undefined));
    } finally { setBusyAction(""); }
  }

  if (!client) return <main className="staff-dash" dir="rtl"><style>{styles}</style><div className="sd-shell"><div className="sd-alert sd-error" role="alert">لم تُضبط خدمة Supabase بعد. أضف NEXT_PUBLIC_SUPABASE_URL وNEXT_PUBLIC_SUPABASE_ANON_KEY إلى متغيرات البيئة ثم أعد المحاولة.</div><Link className="sd-link" href="/staff/login">العودة إلى دخول الموظفين</Link></div></main>;

  if (!authChecked || loadingProfile) return <main className="staff-dash" dir="rtl"><style>{styles}</style><div className="sd-shell"><div className="sd-loading"><span className="sd-spinner" /> جارٍ التحقق من جلسة Supabase Auth وملف الموظف...</div></div></main>;

  if (!authUser) return <main className="staff-dash" dir="rtl"><style>{styles}</style><div className="sd-shell"><section className="sd-gate"><span className="sd-icon"><ShieldCheck size={24} /></span><div><span className="sd-kicker">مساحة الفريق</span><h1>يلزم تسجيل الدخول</h1><p>{sessionError || "تحقق الصفحة من جلسة Supabase Auth قبل تحميل أي بيانات للموظفين."}</p><Link className="sd-button sd-primary" href="/staff/login">الانتقال إلى دخول الموظفين <ArrowLeft size={16} /></Link></div></section></div></main>;

  if (!staff?.is_active) return <main className="staff-dash" dir="rtl"><style>{styles}</style><div className="sd-shell"><header className="sd-top"><Link href="/" className="sd-brand">BSCH <span>مساحة الموظفين</span></Link><button className="sd-button sd-ghost" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} /> تسجيل الخروج</button></header><section className="sd-gate"><span className="sd-icon sd-icon-warn"><ShieldCheck size={24} /></span><div><span className="sd-kicker">تعذر التحقق من الصلاحية</span><h1>لا يمكن فتح مساحة الموظفين</h1><p>{sessionError || "لم يتم تفعيل هذا الحساب أو لا يتوفر ملف موظف صالح."}</p><p className="sd-subtle">الدور ونطاق العيادات مصدرهما staff_profiles وclinic_staff_assignments، وتظل سياسات RLS وRPCs هي جهة التفويض الفعلية.</p></div></section></div></main>;

  return <main className="staff-dash" dir="rtl">
    <style>{styles}</style>
    <div className="sd-shell">
      <header className="sd-top">
        <Link href="/" className="sd-brand">BSCH <span>مساحة الموظفين</span></Link>
        <div className="sd-top-actions">
          <span className="sd-avatar"><UserRound size={17} /></span>
          <span className="sd-user"><strong>{staff.display_name || authUser.email || "موظف"}</strong><small>{roleLabels[staff.role] ?? staff.role}</small></span>
          <button className="sd-button sd-ghost" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} />{signingOut ? "جارٍ الخروج..." : "تسجيل الخروج"}</button>
        </div>
      </header>

      <section className="sd-welcome">
        <div><span className="sd-kicker"><Activity size={14} /> لوحة التشغيل اليومية</span><h1>مرحبًا، {staff.display_name || "بك"}</h1><p>إدارة الحجوزات والطابور للعيادات المسموح بها في ملفك.</p></div>
        <div className="sd-today"><CalendarDays size={18} /><span><small>تاريخ العرض</small><strong>{formatDate(date)}</strong></span></div>
      </section>

      <section className="sd-security-note"><ShieldCheck size={18} /><span>جلسة موثقة عبر Supabase Auth · الدور والعيادات مأخوذان من قاعدة البيانات · كل استعلام محكوم بسياسات RLS وRPCs على الخادم.</span></section>

      <nav className="sd-links" aria-label="روابط مساحة الموظفين">
        <Link href="/staff/clinics"><MapPin size={16} /> العيادات</Link>
        <Link href="/staff/users"><Users size={16} /> المستخدمون</Link>
        <Link href="/staff/reports"><FileBarChart2 size={16} /> التقارير</Link>
        <Link href="/staff/audit"><ClipboardList size={16} /> سجل التدقيق</Link><Link href="/staff/account"><UserRound size={16} /> إعدادات الحساب</Link>
      </nav>

      {sessionError && <div className="sd-alert sd-error" role="alert">{sessionError}</div>}
      {pageError && <div className="sd-alert sd-error" role="alert"><span>{pageError}</span><button aria-label="إغلاق الرسالة" onClick={() => setPageError("")}><X size={17} /></button></div>}
      {notice && <div className="sd-alert sd-success" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button aria-label="إغلاق الرسالة" onClick={() => setNotice("")}><X size={17} /></button></div>}

      {!clinics.length ? <section className="sd-empty"><MapPin size={24} /><h2>لا توجد عيادات مخصصة</h2><p>{staff.role === "admin" ? "لا توجد عيادات نشطة ظاهرة حاليًا." : "لا توجد عيادة نشطة مرتبطة بحسابك. اطلب من الإدارة تحديث تعيينات العيادات."}</p></section> : <>
        <section className="sd-toolbar">
          <label>تاريخ العمل<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>العيادة<select value={clinicFilter} onChange={(event) => setClinicFilter(event.target.value)}><option value="all">كل العيادات المسموحة</option>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select></label>
          <label>حالة الحجز<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">كل الحالات</option>{Object.entries(bookingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="sd-button sd-ghost" onClick={() => setRefreshKey((key) => key + 1)} disabled={loadingData}><RefreshCw size={16} className={loadingData ? "sd-spin" : ""} /> تحديث</button>
          <button className="sd-button sd-ghost" onClick={() => window.print()}><Printer size={16} /> طباعة</button>
          {canManageBookings && <button className="sd-button sd-primary" onClick={() => setNewBookingOpen((open) => !open)}><Check size={16} /> حجز داخلي</button>}
        </section>

        {newBookingOpen && canManageBookings && <section className="sd-panel sd-new-booking">
          <div className="sd-panel-heading"><div><span className="sd-kicker">للاستقبال والإدارة</span><h2>إنشاء حجز داخلي</h2><p>يستخدم كتالوج الخدمات المفعّلة، بما فيها الخدمات المخصصة للحضور المباشر. لا تُكتب الحجوزات مباشرة إلى الجدول.</p></div><button className="sd-icon-button" onClick={() => setNewBookingOpen(false)} aria-label="إغلاق نموذج الحجز"><X size={18} /></button></div>
          <form className="sd-form-grid" onSubmit={(event) => void createInternalBooking(event)}>
            <label>العيادة<select name="clinicId" required value={newBookingClinic} onChange={(event) => setNewBookingClinic(event.target.value)}><option value="">اختر العيادة</option>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select></label>
            <label>الخدمة<select name="serviceId" required disabled={!newBookingClinic}><option value="">اختر الخدمة</option>{selectedServices.map((service) => <option key={service.id} value={service.id}>{service.name}{service.direct_only ? " — حضور مباشر" : ""}</option>)}</select></label>
            <label>اسم المريض/ة<input name="patientName" required minLength={2} maxLength={160} /></label>
            <label>العمر<input name="age" required maxLength={40} placeholder="مثال: 5 سنوات" /></label>
            <label>رقم الهاتف<input name="phone" required inputMode="tel" maxLength={40} /></label>
            <label>العنوان<input name="address" required maxLength={500} /></label>
            <label>تاريخ الموعد<input ref={dateInputRef} key={date} name="appointmentDate" type="date" required defaultValue={date} /></label>
            <div className="sd-form-actions"><button className="sd-button sd-primary" disabled={busyAction === "internal-booking"}>{busyAction === "internal-booking" ? "جارٍ الحفظ..." : "إنشاء وتأكيد الحجز"}</button><span>تنشئ قاعدة البيانات رقم الطابور وتتحقق من السعة والازدواجية.</span></div>
          </form>
        </section>}

        <div className="sd-stats">
          <article><span className="sd-stat-icon teal"><ClipboardList size={19} /></span><span><small>حجوزات اليوم</small><strong>{bookings.length}</strong></span></article>
          <article><span className="sd-stat-icon amber"><Activity size={19} /></span><span><small>بانتظار النداء</small><strong>{queueEntries.filter((entry) => entry.state === "waiting").length}</strong></span></article>
          <article><span className="sd-stat-icon blue"><Stethoscope size={19} /></span><span><small>قيد الكشف</small><strong>{queueEntries.filter((entry) => entry.state === "in_progress").length}</strong></span></article>
          <article><span className="sd-stat-icon green"><CheckCircle2 size={19} /></span><span><small>العيادات المسموحة</small><strong>{visibleClinicIds.length}</strong></span></article>
        </div>

        <section className="sd-panel" id="bookings">
          <div className="sd-panel-heading"><div><span className="sd-kicker">حسب التاريخ والحالة المحددين</span><h2>قائمة الحجوزات</h2><p>{canSeeContacts ? "بيانات الهاتف والعنوان لا تُحمّل ضمن القائمة؛ يمكن طلبها لكل حجز عبر RPC المخصص." : "لا يتم طلب اسم المريض أو الهاتف أو العنوان من هذا العرض للأطباء والتمريض."}</p></div><span className="sd-count">{bookings.length} حجز</span></div>
          {loadingData ? <div className="sd-loading compact"><span className="sd-spinner" /> جارٍ تحميل الحجوزات والطابور...</div> : !bookings.length ? <div className="sd-empty-inline">لا توجد حجوزات مطابقة للتاريخ والمرشحات المحددة.</div> : <div className="sd-table-wrap"><table><thead><tr><th>المراجع/البيانات</th><th>العيادة والخدمة</th><th>تاريخ الموعد</th><th>الحالة</th><th>المصدر</th><th className="no-print">الإجراءات</th></tr></thead><tbody>{bookings.map((booking) => {
            const canConfirm = canManageBookings && booking.status === "pending";
            const canCancel = canManageBookings && (booking.status === "pending" || booking.status === "confirmed");
            const canChange = canCancel && !queueEntries.some((entry) => entry.booking_id === booking.id && entry.state === "in_progress");
            return <tr key={booking.id}>
              <td><strong>{canSeeContacts ? booking.patient_name || "اسم غير متاح" : "بيانات المراجع محمية"}</strong><small>{canSeeContacts ? `العمر: ${booking.patient_age || "—"}` : `رقم الحجز: ${booking.id.slice(0, 8)}`}</small>{canSeeContacts && contactFor === booking.id && contacts[booking.id] && <div className="sd-contact"><span><Phone size={14} /> {contacts[booking.id].phone}</span><span><MapPin size={14} /> {contacts[booking.id].address}</span></div>}</td>
              <td><strong>{clinicNames.get(booking.clinic_id) || "عيادة"}</strong><small>{serviceNames.get(booking.service_id) || "خدمة"}</small></td>
              <td>{formatDate(booking.appointment_date)}</td>
              <td><span className={`sd-badge ${statusTone[booking.status]}`}>{bookingStatusLabels[booking.status]}</span></td>
              <td>{booking.booking_source === "staff" ? "داخلي" : "عام"}</td>
              <td className="no-print"><div className="sd-row-actions">
                {canSeeContacts && <button className="sd-action" onClick={() => void toggleContact(booking.id)} disabled={busyAction === `contact:${booking.id}`}>{contactFor === booking.id ? "إخفاء الاتصال" : busyAction === `contact:${booking.id}` ? "جارٍ التحميل" : "بيانات الاتصال"}</button>}
                {canConfirm && <button className="sd-action sd-action-primary" onClick={() => void confirmBooking(booking.id)} disabled={busyAction === booking.id}>{busyAction === booking.id ? "جارٍ التنفيذ" : "تأكيد"}</button>}
                {canCancel && cancelFor !== booking.id && <button className="sd-action sd-action-danger" onClick={() => { setCancelFor(booking.id); setCancelReason(""); }}>إلغاء</button>}
                {canCancel && cancelFor === booking.id && <div className="sd-cancel"><input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} placeholder="سبب الإلغاء" aria-label="سبب الإلغاء" /><button className="sd-action sd-action-danger" onClick={() => void cancelBooking(booking.id)} disabled={busyAction === booking.id}>تأكيد الإلغاء</button><button className="sd-icon-button" onClick={() => setCancelFor("")} aria-label="إغلاق"><X size={15} /></button></div>}
                {canChange && client && <BookingChangeActions client={client} booking={booking} clinics={clinics} services={services} minDate={cairoToday()} disabled={!!busyAction} onErrorAction={(message) => setPageError(readableError(message))} onSuccessAction={(message) => { setPageError(""); setNotice(message); setRefreshKey((key) => key + 1); }} />}
              </div></td>
            </tr>;
          })}</tbody></table></div>}
          <div className="sd-footnote"><ShieldCheck size={15} /> نطاق القراءة يحدده RLS في قاعدة البيانات؛ إجراءات التأكيد والإلغاء RPC-only مع سبب الإلغاء.</div>
        </section>

        <section className="sd-panel" id="queue">
          <div className="sd-panel-heading"><div><span className="sd-kicker">تحديث ذري عبر manage_queue</span><h2>طابور العيادات</h2><p>إجراءات النداء وتغيير الحالة متاحة للأدوار المخولة، وتُسجل في أحداث الطابور وسجل التدقيق.</p></div></div>
          {!visibleClinicIds.length ? <div className="sd-empty-inline">اختر عيادة لعرض طابورها.</div> : <div className="sd-queue-grid">{clinics.filter((clinic) => visibleClinicIds.includes(clinic.id)).map((clinic) => {
            const entries = queueEntries.filter((entry) => entry.clinic_id === clinic.id && !["cancelled", "transferred", "rescheduled"].includes(entry.state));
            const counter = queueCounters.find((row) => row.clinic_id === clinic.id);
            return <article className="sd-queue-card" key={clinic.id}>
              <div className="sd-queue-title"><div><h3>{clinic.name}</h3><small>{counter ? `آخر رقم: ${counter.last_number}` : "لا يوجد عداد مسجل لهذا اليوم"}</small></div><button className="sd-button sd-mini sd-primary" onClick={() => void performQueueAction(clinic.id, null, "next")} disabled={!!busyAction}>{busyAction === `queue:${clinic.id}:next` ? "جارٍ النداء..." : "نداء التالي"}</button></div>
              {!entries.length ? <div className="sd-empty-inline small">لا توجد أدوار ظاهرة لهذا اليوم.</div> : <div className="sd-queue-list">{entries.map((entry) => <div className={`sd-queue-row ${entry.is_current ? "current" : ""}`} key={entry.id}>
                <div className="sd-queue-number"><strong>{entry.queue_number}</strong><span>{serviceNames.get(bookings.find((booking) => booking.id === entry.booking_id)?.service_id || "") || "مراجع"}</span></div>
                <span className={`sd-badge ${statusTone[entry.state]}`}>{queueStatusLabels[entry.state]}</span>
                <div className="sd-queue-actions">{queueActions[entry.state].map((item) => <button key={item.action} className={`sd-action ${item.action === "complete" ? "sd-action-primary" : item.action === "no_show" ? "sd-action-danger" : ""}`} onClick={() => void performQueueAction(clinic.id, entry.id, item.action)} disabled={!!busyAction}>{item.label}</button>)}</div>
              </div>)}</div>}
            </article>;
          })}</div>}
          <div className="sd-footnote"><ShieldCheck size={15} /> لا تُجرى كتابة مباشرة إلى queue_entries أو queue_counters؛ يخضع كل انتقال للتحقق الذري في RPC.</div>
        </section>

        <section className="sd-bottom-links"><div><h2>التقارير والمراجعة</h2><p>افتح صفحات التقارير وسجل التدقيق للطباعة أو المراجعة التفصيلية وفق صلاحيات حسابك.</p></div><div className="sd-bottom-actions"><Link href="/staff/reports"><FileBarChart2 size={16} /> التقارير</Link><Link href="/staff/audit"><ClipboardList size={16} /> سجل التدقيق</Link><Link href="/staff/account"><UserRound size={16} /> إعدادات الحساب</Link><button onClick={() => window.print()}><Printer size={16} /> طباعة هذه الصفحة</button></div></section>
      </>}
      <footer className="sd-footer"><span>مستشفى بنها التخصصي للأطفال · مساحة الموظفين</span><span>لا تحفظ هذه الصفحة بيانات مرضى في التخزين المحلي.</span></footer>
    </div>
  </main>;
}

const styles = `
.staff-dash{min-height:100vh;background:#f5f9fa;color:#173c45;font-family:var(--font-arabic,Tahoma,Arial,sans-serif);padding:0 0 44px}.sd-shell{width:min(1200px,calc(100% - 48px));margin-inline:auto}.sd-top{display:flex;align-items:center;justify-content:space-between;gap:18px;min-height:78px;border-bottom:1px solid #dfebed}.sd-brand{font-family:Arial,sans-serif;color:#087b74;font-size:19px;font-weight:900;letter-spacing:1.3px;display:flex;align-items:center;gap:12px}.sd-brand span{font-family:var(--font-arabic,Tahoma,sans-serif);font-size:13px;font-weight:700;letter-spacing:0;color:#173c45;border-right:1px solid #dbe8e9;padding-right:12px}.sd-top-actions{display:flex;align-items:center;gap:10px}.sd-avatar{display:grid;place-items:center;width:37px;height:37px;border-radius:12px;background:#e7f5f2;color:#087b74}.sd-user{display:grid;gap:2px;margin-left:8px}.sd-user strong{font-size:13px}.sd-user small{font-size:11px;color:#70868b}.sd-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 14px;border:1px solid transparent;border-radius:10px;font-size:12px;font-weight:750;cursor:pointer;transition:.15s}.sd-button:disabled,.sd-action:disabled{opacity:.55;cursor:not-allowed}.sd-ghost{background:white;border-color:#d9e7e9;color:#33535a}.sd-ghost:hover{background:#f0f8f7;border-color:#a7d5d1}.sd-primary{background:#0f948b;color:white;box-shadow:0 5px 13px #0f948b22}.sd-primary:hover{background:#087b74}.sd-welcome{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:29px 0 20px}.sd-welcome h1{font-size:25px;margin:8px 0 5px;letter-spacing:-.4px}.sd-welcome p,.sd-panel-heading p,.sd-bottom-links p{margin:0;color:#6b8186;font-size:12px;line-height:1.8}.sd-kicker{display:inline-flex;align-items:center;gap:6px;color:#0f8981;font-size:11px;font-weight:800}.sd-today{display:flex;align-items:center;gap:11px;border:1px solid #dbe9e9;background:#fff;padding:10px 14px;border-radius:12px;color:#0f948b}.sd-today span{display:grid;gap:3px}.sd-today small{font-size:10px;color:#7b8f93}.sd-today strong{font-size:12px;color:#173c45}.sd-security-note{display:flex;align-items:center;gap:9px;padding:11px 14px;border-radius:11px;background:#eaf7f5;border:1px solid #d4eeea;color:#3c686d;font-size:11px;line-height:1.8}.sd-security-note svg,.sd-footnote svg{color:#0f948b;flex:0 0 auto}.sd-links{display:flex;flex-wrap:wrap;gap:9px;margin:16px 0 20px}.sd-links a,.sd-bottom-actions a,.sd-bottom-actions button{display:inline-flex;align-items:center;gap:7px;background:white;border:1px solid #e1ebec;border-radius:9px;padding:9px 12px;font-size:11px;font-weight:700;color:#3e6065}.sd-links a:hover,.sd-bottom-actions a:hover,.sd-bottom-actions button:hover{border-color:#afd9d5;color:#087b74}.sd-alert{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:11px 13px;border-radius:10px;margin:10px 0;font-size:12px;line-height:1.7}.sd-alert button{display:grid;place-items:center;border:0;background:transparent;color:inherit;cursor:pointer}.sd-error{background:#fff3f1;border:1px solid #f2d5d0;color:#8a3d35}.sd-success{background:#effaf3;border:1px solid #d2ecd9;color:#286844;justify-content:flex-start}.sd-toolbar{display:flex;align-items:end;flex-wrap:wrap;gap:10px;padding:14px;margin:15px 0;background:white;border:1px solid #e1ebec;border-radius:13px}.sd-toolbar label,.sd-form-grid label{display:grid;gap:6px;color:#48636a;font-size:11px;font-weight:750}.sd-toolbar input,.sd-toolbar select,.sd-form-grid input,.sd-form-grid select,.sd-cancel input{min-height:39px;min-width:145px;border:1px solid #dce8e9;border-radius:8px;background:#fff;color:#173c45;padding:0 10px;font:inherit;font-size:12px}.sd-toolbar input:focus,.sd-toolbar select:focus,.sd-form-grid input:focus,.sd-form-grid select:focus,.sd-cancel input:focus{outline:2px solid #9bd6d0;outline-offset:1px}.sd-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}.sd-stats article{display:flex;align-items:center;gap:11px;padding:15px;background:white;border:1px solid #e2ebed;border-radius:13px}.sd-stats article>span:last-child{display:grid;gap:4px}.sd-stats small{font-size:10px;color:#72878b}.sd-stats strong{font-size:21px;color:#173c45}.sd-stat-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:12px}.sd-stat-icon.teal{color:#0d8981;background:#e5f6f3}.sd-stat-icon.amber{color:#b17819;background:#fff5df}.sd-stat-icon.blue{color:#3a75a0;background:#eaf4fb}.sd-stat-icon.green{color:#30834c;background:#ebf8ef}.sd-panel{margin:15px 0;padding:19px;background:white;border:1px solid #e1ebec;border-radius:15px;box-shadow:0 5px 20px #173c4507}.sd-panel-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:16px}.sd-panel-heading h2,.sd-bottom-links h2{margin:4px 0 5px;font-size:17px}.sd-count{flex:0 0 auto;border-radius:20px;background:#edf7f6;color:#087b74;padding:6px 10px;font-size:10px;font-weight:800}.sd-table-wrap{overflow-x:auto;border:1px solid #e6edef;border-radius:10px}table{width:100%;border-collapse:collapse;min-width:750px;text-align:right}th{background:#f7fafb;color:#6a8084;font-size:10px;font-weight:800}td,th{padding:11px 12px;border-bottom:1px solid #edf1f2;vertical-align:middle}tbody tr:last-child td{border-bottom:0}td{font-size:11px;color:#456168}td>strong,td>small{display:block}td>strong{font-size:12px;color:#173c45}td>small{font-size:10px;color:#819397;margin-top:4px}.sd-badge{display:inline-flex;align-items:center;white-space:nowrap;border-radius:20px;padding:5px 9px;font-size:10px;font-weight:800}.sd-badge.amber{background:#fff5df;color:#9b691c}.sd-badge.teal{background:#e6f6f3;color:#087b74}.sd-badge.muted{background:#f0f3f4;color:#6e7f83}.sd-badge.green{background:#eaf7ef;color:#34794b}.sd-badge.rose{background:#fff0ef;color:#a64b48}.sd-badge.blue{background:#e9f3fb;color:#3c6e92}.sd-row-actions{display:flex;flex-wrap:wrap;align-items:center;gap:5px}.sd-action{border:1px solid #dce8e9;background:#fff;color:#426168;border-radius:7px;padding:6px 8px;font-size:10px;font-weight:750;cursor:pointer;white-space:nowrap}.sd-action:hover{border-color:#a8d5d1;color:#087b74}.sd-action-primary{border-color:#bde4df;background:#f0faf8;color:#087b74}.sd-action-danger{border-color:#f0d4d1;background:#fff8f7;color:#a64b48}.sd-contact{display:grid;gap:4px;margin-top:7px;color:#41656a;font-size:10px}.sd-contact span{display:flex;align-items:flex-start;gap:4px;max-width:210px;overflow-wrap:anywhere}.sd-contact svg{flex:0 0 auto}.sd-cancel{display:flex;flex-wrap:wrap;gap:5px;align-items:center}.sd-cancel input{min-width:120px;min-height:31px;font-size:10px}.sd-icon-button{display:grid;place-items:center;width:31px;height:31px;border:1px solid #dce8e9;border-radius:8px;background:white;color:#637d81;cursor:pointer}.sd-footnote{display:flex;align-items:center;gap:6px;margin-top:12px;color:#788d91;font-size:10px;line-height:1.7}.sd-empty-inline{padding:22px 10px;text-align:center;color:#84979b;font-size:12px}.sd-empty-inline.small{padding:17px 6px;font-size:11px}.sd-queue-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sd-queue-card{border:1px solid #e5edef;border-radius:11px;padding:13px}.sd-queue-title{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:10px;border-bottom:1px solid #edf2f3}.sd-queue-title h3{margin:0 0 4px;font-size:13px}.sd-queue-title small{font-size:10px;color:#84979b}.sd-mini{min-height:33px;padding:0 10px;font-size:10px}.sd-queue-list{display:grid}.sd-queue-row{display:grid;grid-template-columns:minmax(80px,1fr) auto;gap:7px 10px;align-items:center;padding:10px 2px;border-bottom:1px solid #f0f3f4}.sd-queue-row:last-child{border-bottom:0}.sd-queue-row.current{background:#f0faf8;border-radius:8px;padding-inline:8px}.sd-queue-number{display:flex;align-items:center;gap:8px}.sd-queue-number strong{display:grid;place-items:center;min-width:31px;height:31px;border-radius:9px;background:#f0f4f4;color:#173c45;font-size:14px}.sd-queue-number span{font-size:10px;color:#62797d}.sd-queue-actions{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:5px}.sd-new-booking{border-color:#bde4df;background:linear-gradient(135deg,#fff,#f7fcfb)}.sd-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.sd-form-grid input,.sd-form-grid select{width:100%}.sd-form-actions{grid-column:1/-1;display:flex;align-items:center;gap:10px;margin-top:4px}.sd-form-actions span{font-size:10px;color:#789094}.sd-bottom-links{display:flex;align-items:center;justify-content:space-between;gap:15px;margin:17px 0;padding:16px 18px;background:#eff7f6;border:1px solid #dcebea;border-radius:13px}.sd-bottom-links p{max-width:520px}.sd-bottom-actions{display:flex;flex-wrap:wrap;gap:7px}.sd-bottom-actions button{font-family:inherit;cursor:pointer}.sd-footer{display:flex;justify-content:space-between;gap:12px;padding:17px 0;color:#89999c;font-size:10px;border-top:1px solid #e1ebec}.sd-gate{display:flex;gap:17px;align-items:flex-start;max-width:680px;margin:12vh auto 0;padding:26px;background:white;border:1px solid #e1ebec;border-radius:18px;box-shadow:0 15px 45px #173c450c}.sd-gate h1{margin:7px 0;font-size:22px}.sd-gate p{margin:6px 0 14px;color:#6f8589;font-size:12px;line-height:1.8}.sd-icon{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border-radius:14px;color:#087b74;background:#e6f6f3}.sd-icon-warn{color:#ad7520;background:#fff5df}.sd-subtle{font-size:11px!important}.sd-link{color:#087b74;font-weight:750;font-size:12px}.sd-loading{display:flex;align-items:center;justify-content:center;gap:10px;min-height:70vh;color:#60777c;font-size:13px}.sd-loading.compact{min-height:90px;font-size:11px}.sd-spinner{width:19px;height:19px;border:2px solid #cfe3e2;border-top-color:#0f948b;border-radius:50%;animation:sd-spin .8s linear infinite}.sd-spin{animation:sd-spin .8s linear infinite}@keyframes sd-spin{to{transform:rotate(360deg)}}
@media(max-width:900px){.sd-toolbar{align-items:stretch}.sd-toolbar label{flex:1 1 150px}.sd-toolbar>.sd-button{flex:1}.sd-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.sd-queue-grid{grid-template-columns:1fr}.sd-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sd-bottom-links{align-items:flex-start;flex-direction:column}}
@media(max-width:600px){.sd-shell{width:calc(100% - 28px)}.sd-top{min-height:68px}.sd-brand{font-size:16px;gap:8px}.sd-brand span{font-size:11px;padding-right:8px}.sd-user{display:none}.sd-top-actions{gap:7px}.sd-top-actions .sd-button{padding-inline:9px;font-size:10px}.sd-welcome{align-items:flex-start;flex-direction:column;padding-top:23px}.sd-welcome h1{font-size:22px}.sd-today{align-self:stretch}.sd-links{gap:6px}.sd-links a{flex:1 1 42%;justify-content:center;font-size:10px}.sd-toolbar{padding:10px;gap:8px}.sd-toolbar label{flex:1 1 calc(50% - 8px)}.sd-toolbar input,.sd-toolbar select{min-width:0;width:100%}.sd-stats{gap:8px}.sd-stats article{padding:11px;gap:8px}.sd-stat-icon{width:35px;height:35px}.sd-stats strong{font-size:18px}.sd-panel{padding:13px;margin:11px 0}.sd-panel-heading h2{font-size:15px}.sd-panel-heading p{font-size:10px}.sd-form-grid{grid-template-columns:1fr}.sd-form-actions{grid-column:auto;align-items:flex-start;flex-direction:column}.sd-queue-row{grid-template-columns:1fr auto}.sd-bottom-actions{width:100%}.sd-bottom-actions a,.sd-bottom-actions button{flex:1 1 42%;justify-content:center}.sd-footer{flex-direction:column}.sd-gate{margin-top:7vh;padding:19px}.sd-gate h1{font-size:19px}}
@media print{.staff-dash{background:#fff;padding:0}.sd-shell{width:100%}.sd-top,.sd-links,.sd-toolbar,.sd-row-actions,.sd-queue-actions,.sd-bottom-actions,.no-print,.sd-footer span:last-child{display:none!important}.sd-welcome{padding:8px 0}.sd-panel,.sd-stats article,.sd-queue-card{box-shadow:none;break-inside:avoid}.sd-panel{padding:10px;margin:8px 0}th,td{padding:7px;font-size:9px}.sd-security-note{print-color-adjust:exact}.sd-contact{font-size:9px}}
`;
