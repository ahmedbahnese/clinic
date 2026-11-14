'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toPng } from 'html-to-image';
import {
  CalendarPlus,
  Calendar,
  Clock,
  User,
  Phone,
  MapPin,
  CreditCard,
  Stethoscope,
  Activity,
  AlertTriangle,
  Lock,
  CheckCircle2,
  Printer,
  Search,
  ArrowRight,
  FileText,
  Info,
  Sparkles,
  Share2,
  Download,
  FileDown,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import ReceiptCard from '@/components/ReceiptCard';
import { submitBooking } from './actions';
import {
  normalizeAndValidateEgyptianPhone,
  validatePatientName,
  validateDateOfBirth,
  calculateAgeFromDob,
  validateGuardianNationalId,
  formatArabicDate,
  getTodayCairoDateString,
} from '@/lib/rules';
import type { Clinic, ClinicService, ClinicScheduleException, Appointment } from '@/types';

// ============================================================================
// 1. ZOD SCHEMA & TYPES
// ============================================================================

const bookingSchema = z
  .object({
    // Section 1: Patient & Parent Data
    patientName: z
      .string()
      .min(1, 'الاسم الرباعي للطفل مطلوب')
      .refine(
        (val) => validatePatientName(val).isValid,
        'يرجى كتابة الاسم ثلاثياً أو رباعياً على الأقل كما هو مسجل في شهادة الميلاد'
      ),
    dateOfBirth: z.string().min(1, 'يرجى اختيار تاريخ ميلاد الطفل من التقويم'),
    phoneNumber: z
      .string()
      .min(1, 'رقم الهاتف مطلوب لمتابعة الحجز')
      .refine(
        (val) => normalizeAndValidateEgyptianPhone(val).isValid,
        'رقم الهاتف غير صحيح، يجب أن يتكون من 11 رقماً ويبدأ بـ 01 (010 / 011 / 012 / 015)'
      ),
    patientAddress: z
      .string()
      .min(3, 'العنوان بالتفصيل مطلوب (المركز / المدينة / القرية / الشارع)'),
    nationalId: z
      .string()
      .optional()
      .refine((val) => {
        if (!val || val.trim() === '') return true;
        return validateGuardianNationalId(val).isValid;
      }, 'الرقم القومي لولي الأمر يجب أن يتكون من 14 رقماً ويبدأ بـ 2 أو 3'),

    // Section 2: Clinic & Appointment
    clinicId: z.string().min(1, 'يرجى اختيار العيادة التخصصية المطلوبة'),
    serviceId: z.string().min(1, 'يرجى اختيار الخدمة أو الفحص المطلوب'),
    appointmentDate: z.string().min(1, 'يرجى اختيار تاريخ الحضور المتاح بالعيادة'),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const dobCheck = validateDateOfBirth(data.dateOfBirth, data.appointmentDate || undefined);
    if (!dobCheck.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateOfBirth'],
        message: dobCheck.error || 'تاريخ ميلاد الطفل غير صحيح',
      });
    }
  });

type BookingFormValues = z.infer<typeof bookingSchema>;

// ============================================================================
// 2. MAIN PAGE WRAPPER (WITH SUSPENSE)
// ============================================================================

export default function NewAppointmentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#087F78] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <NewAppointmentForm />
    </Suspense>
  );
}

// ============================================================================
// 3. BOOKING FORM COMPONENT
// ============================================================================

function NewAppointmentForm() {
  const searchParams = useSearchParams();
  const preselectedClinic = searchParams.get('clinic') || '';

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [clinicServices, setClinicServices] = useState<ClinicService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);

  const ticketRef = useRef<HTMLDivElement>(null);

  // Initialize React Hook Form with Zod Resolver
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      patientName: '',
      dateOfBirth: '',
      phoneNumber: '',
      patientAddress: '',
      nationalId: '',
      clinicId: '',
      serviceId: '',
      appointmentDate: '',
      notes: '',
    },
    mode: 'onTouched',
  });

  // Watch critical reactive fields
  const selectedClinicId = watch('clinicId');
  const selectedServiceId = watch('serviceId');
  const selectedDate = watch('appointmentDate');
  const selectedDob = watch('dateOfBirth');

  // Live, calendar-accurate age derived from the date of birth at the visit date.
  const liveAge = useMemo(() => {
    if (!selectedDob) return null;
    return calculateAgeFromDob(selectedDob, selectedDate || getTodayCairoDateString());
  }, [selectedDob, selectedDate]);

  // Fetch real clinics from database
  useEffect(() => {
    let active = true;
    async function loadClinics() {
      try {
        const res = await fetch('/api/clinics');
        const data = await res.json();
        if (active && data.clinics && data.clinics.length > 0) {
          setClinics(data.clinics);
          const matched = preselectedClinic
            ? data.clinics.find((c: Clinic) => c.id === preselectedClinic)
            : null;
          const initialClinic = matched || data.clinics[0];
          setValue('clinicId', initialClinic.id);
        }
      } catch (err) {
        console.error('Error fetching clinics:', err);
      } finally {
        if (active) setLoadingClinics(false);
      }
    }
    loadClinics();
    return () => {
      active = false;
    };
  }, [preselectedClinic, setValue]);

  // Selected clinic details
  const activeClinic = useMemo(() => {
    return clinics.find((c) => c.id === selectedClinicId) || null;
  }, [clinics, selectedClinicId]);

  // Fetch / sync services for the active clinic
  useEffect(() => {
    let active = true;
    if (!selectedClinicId) return;

    // Check if services are already pre-loaded on activeClinic
    if (activeClinic && activeClinic.services && activeClinic.services.length > 0) {
      setClinicServices(activeClinic.services);
      setValue('serviceId', activeClinic.services[0].id);
      return;
    }

    setLoadingServices(true);
    // Clear any previous clinic's services so a failed fetch never shows stale
    // services belonging to a different clinic.
    setClinicServices([]);
    setValue('serviceId', '');
    async function fetchServices() {
      try {
        const res = await fetch(`/api/clinics/${selectedClinicId}/services`);
        const data = await res.json();
        if (active && data.services) {
          setClinicServices(data.services);
          if (data.services.length > 0) {
            setValue('serviceId', data.services[0].id);
          } else {
            setValue('serviceId', '');
          }
        }
      } catch (err) {
        console.error('Error fetching clinic services:', err);
      } finally {
        if (active) setLoadingServices(false);
      }
    }

    fetchServices();
    return () => {
      active = false;
    };
  }, [selectedClinicId, activeClinic, setValue]);

  // Active selected service
  const activeService = useMemo(() => {
    return clinicServices.find((s) => s.id === selectedServiceId) || null;
  }, [clinicServices, selectedServiceId]);

  // Fetch clinic schedules (closures & capacity overrides)
  const [clinicSchedules, setClinicSchedules] = useState<ClinicScheduleException[]>([]);
  useEffect(() => {
    let active = true;
    setClinicSchedules([]);
    if (!selectedClinicId) return;
    async function loadSchedules() {
      try {
        const res = await fetch(`/api/clinics/${selectedClinicId}/schedules`);
        const data = await res.json();
        if (active && data.schedules) {
          setClinicSchedules(data.schedules);
        }
      } catch (err) {
        console.warn('Could not fetch clinic schedules:', err);
      }
    }
    loadSchedules();
    return () => {
      active = false;
    };
  }, [selectedClinicId]);

  // Calculate upcoming valid dates constrained by clinic operating days & exceptions
  const availableDates = useMemo(() => {
    if (!activeClinic) return [];

    const dates: {
      dateStr: string;
      label: string;
      dayOfWeekName: string;
      isException: boolean;
      maxCapacity: number;
    }[] = [];
    const baseDate = new Date();
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    const allowedDays =
      activeClinic.daysOfWeek && activeClinic.daysOfWeek.length > 0
        ? activeClinic.daysOfWeek
        : [0, 1, 2, 3, 4, 6];

    // Unified 30-day booking horizon
    for (let i = 1; i <= 30 && dates.length < 14; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      const dayOfWeek = d.getDay();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      // Schedule exception precedence:
      const exception = clinicSchedules.find((s) => s.scheduleDate === dateStr);
      let isOpen = false;
      if (exception) {
        isOpen = !exception.isClosed;
      } else {
        isOpen = allowedDays.includes(dayOfWeek);
      }

      if (isOpen) {
        const maxCapacity = exception?.maxCapacity ?? activeClinic.maxDailySlots;
        dates.push({
          dateStr,
          label: `${dayNames[dayOfWeek]} (${dd}/${mm})${exception ? ' — تشغيل استثنائي' : ''} — السعة: ${maxCapacity} مريض`,
          dayOfWeekName: dayNames[dayOfWeek],
          isException: Boolean(exception),
          maxCapacity,
        });
      }
    }

    return dates;
  }, [activeClinic, clinicSchedules]);

  // Default to first available date
  useEffect(() => {
    if (availableDates.length > 0 && !selectedDate) {
      setValue('appointmentDate', availableDates[0].dateStr);
    }
  }, [availableDates, selectedDate, setValue]);

  // Form Submit Handler
  const onSubmit = async (values: BookingFormValues) => {
    setServerError(null);
    setSubmitting(true);

    try {
      if (activeService?.isWalkInOnly) {
        setServerError('هذه الخدمة بالحضور المباشر فقط ولا يتم الحجز الإلكتروني بها. يرجى التوجه للاستقبال في نفس اليوم.');
        return;
      }
      const dobAge = calculateAgeFromDob(values.dateOfBirth, values.appointmentDate || getTodayCairoDateString());
      const resolvedServiceName = activeService?.name || '';

      const result = await submitBooking({
        clinicId: values.clinicId,
        serviceId: values.serviceId,
        serviceName: resolvedServiceName,
        patientName: values.patientName,
        phoneNumber: values.phoneNumber,
        patientAge: dobAge?.formatted,
        dateOfBirth: values.dateOfBirth,
        patientAddress: values.patientAddress,
        nationalId: values.nationalId,
        appointmentDate: values.appointmentDate,
        appointmentTime: '09:00',
        notes: values.notes,
      });

      if (!result.success || !result.appointment) {
        setServerError(result.error || 'تعذر تسجيل طلب الحجز، يرجى المحاولة لاحقاً');
      } else {
        setConfirmedAppointment(result.appointment);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: any) {
      console.error('Submission error:', err);
      setServerError('حدث خطأ في الاتصال بالخادم، يرجى إعادة المحاولة بعد قليل.');
    } finally {
      setSubmitting(false);
    }
  };

  // Receipt Action 1: Print / Save as PDF
  const handlePrint = () => {
    window.print();
  };

  // Receipt Action 2: Share via Web Share API
  const handleShare = async () => {
    if (!confirmedAppointment) return;
    const shareText = `تذكرة حجز بمستشفى الأطفال التخصصي بالبحيرة\n• اسم الطفل: ${confirmedAppointment.patientName}\n• العمر: ${confirmedAppointment.patientAge || ''}\n• العيادة: ${confirmedAppointment.clinicName}\n• الخدمة: ${confirmedAppointment.serviceName || ''}\n• تاريخ الحضور: ${formatArabicDate(confirmedAppointment.appointmentDate)}\n• الرقم المرجعي: ${confirmedAppointment.referenceNumber}\n${confirmedAppointment.bookingCode ? `• رمز الحجز: ${confirmedAppointment.bookingCode}\n` : ''}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `تذكرة حجز - ${confirmedAppointment.patientName}`,
          text: shareText,
          url: `${window.location.origin}/appointments/track?phone=${confirmedAppointment.phoneNumber}`,
        });
      } catch {
        // Ignored if user cancels share dialog
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareText);
      alert('تم نسخ تفاصيل الحجز إلى الحافظة بنجاح.');
    }
  };

  // Receipt Action 3: Save / Share as PNG image using html-to-image
  const handleSaveAsImage = async () => {
    if (!ticketRef.current || !confirmedAppointment) return;
    setGeneratingImage(true);

    try {
      const dataUrl = await toPng(ticketRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });

      // Attempt Web Share with image file if supported
      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File(
            [blob],
            `bsch-ticket-${confirmedAppointment.referenceNumber}.png`,
            { type: 'image/png' }
          );
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `تذكرة حجز - ${confirmedAppointment.patientName}`,
              text: `تذكرة حجز ${confirmedAppointment.clinicName} بمستشفى الأطفال التخصصي بالبحيرة`,
            });
            return;
          }
        } catch (shareErr) {
          console.log('Native image share fallback to download:', shareErr);
        }
      }

      // Fallback: download PNG file
      const link = document.createElement('a');
      link.download = `bsch-ticket-${confirmedAppointment.referenceNumber}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error generating receipt image:', err);
      alert('تعذر حفظ التذكرة كصورة حالياً، يرجى استخدام زر الطباعة أو حفظ PDF.');
    } finally {
      setGeneratingImage(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="flex flex-col min-h-screen bg-slate-50 selection:bg-[#087F78] selection:text-white font-sans antialiased"
    >
      <SiteHeader />

      <main className="flex-1 w-full max-w-[880px] mx-auto px-4 sm:px-6 py-8 sm:py-12 print:p-0 print:m-0 print:max-w-none">
        {/* Breadcrumb Navigation */}
        <div className="mb-6 flex items-center justify-between text-xs text-slate-500 no-print">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 hover:text-[#087F78] transition-colors font-medium"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>العودة إلى الصفحة الرئيسية</span>
          </Link>
          <span className="inline-flex items-center gap-1 bg-teal-50 border border-teal-100/80 text-[#087F78] px-3 py-1 rounded-full font-bold">
            <Sparkles className="w-3 h-3" />
            <span>منظومة الحجز الرقمية المباشرة</span>
          </span>
        </div>

        {confirmedAppointment ? (
          /* ================================================================ */
          /* SUCCESS STATE: CONFIRMATION TICKET / RECEIPT                     */
          /* ================================================================ */
          <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200/80 p-6 sm:p-10 shadow-sm animate-in fade-in zoom-in-95 duration-200 text-right print:border-none print:p-0 print:shadow-none print:m-0">
            <div className="text-center max-w-lg mx-auto space-y-3 pb-6 border-b border-slate-100 no-print">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-9 h-9 stroke-[2.2]" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#124E4A] tracking-tight">
                تم تسجيل طلب الحجز بنجاح!
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                تم استلام طلبكم في منظومة العيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة.
                يرجى حفظ التذكرة أو طباعتها لإبرازها لموظف الاستقبال عند الحضور.
              </p>
            </div>

            {/* Unified Printable Receipt Card */}
            <div className="mt-8 max-w-xl mx-auto">
              <ReceiptCard
                appointment={confirmedAppointment}
                extraActions={
                  <>
                    <Link
                      href={`/appointments/track?phone=${confirmedAppointment.phoneNumber}`}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#087F78] hover:bg-[#066560] text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition-all"
                    >
                      <Search className="w-4 h-4" />
                      <span>متابعة حالة الحجز</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setConfirmedAppointment(null);
                        reset();
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold text-slate-500 hover:text-[#087F78] transition-colors cursor-pointer"
                    >
                      <span>حجز موعد لطفل آخر</span>
                    </button>
                  </>
                }
              />
            </div>
          </div>
        ) : (
          /* ================================================================ */
          /* MAIN BOOKING FORM                                                */
          /* ================================================================ */
          <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200/80 p-6 sm:p-10 shadow-sm text-right">
            {/* Header of Form */}
            <div className="text-center mb-8 sm:mb-10 space-y-2">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 flex items-center justify-center">
                <Image
                  src="/logo-main.png"
                  alt="شعار مستشفى الأطفال التخصصي بالبحيرة"
                  width={80}
                  height={80}
                  priority
                  className="w-full h-full object-contain drop-shadow-xs"
                />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#124E4A] tracking-tight">
                حجز موعد جديد بالعيادات الخارجية
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                خدمة رقمية فورية لأولياء الأمور — أدخل بيانات الطفل وولي الأمر لاختيار العيادة وتحديد
                الموعد المناسب.
              </p>
            </div>

            {/* Server Error Alert Banner */}
            {serverError && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
                <span className="leading-relaxed">{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-10" noValidate>
              {/* ============================================================ */}
              {/* SECTION 1: PATIENT & GUARDIAN DATA                           */}
              {/* ============================================================ */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-teal-50 text-[#087F78] font-black text-sm flex items-center justify-center border border-teal-200/80 shadow-2xs shrink-0">
                    1
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#163C3A]">
                      بيانات المريض وولي الأمر
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-400">
                      يرجى كتابة البيانات بدقة لمطابقتها مع الأوراق الثبوتية للطفل
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Field 1: Full Name */}
                  <div className="md:col-span-2">
                    <label
                      htmlFor="patientName"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      الاسم الرباعي للطفل <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="patientName"
                        type="text"
                        {...register('patientName')}
                        placeholder="اكتب الاسم كما يظهر في شهادة الميلاد"
                        className={`w-full px-4 py-3 rounded-xl border bg-white text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 transition-all shadow-2xs focus:outline-hidden ${
                          errors.patientName
                            ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                            : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                        }`}
                      />
                      <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    {errors.patientName && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.patientName.message}
                      </p>
                    )}
                  </div>

                  {/* Field 2: Date of Birth (calendar) with auto-calculated age */}
                  <div>
                    <label
                      htmlFor="dateOfBirth"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      تاريخ ميلاد الطفل <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="dateOfBirth"
                        type="date"
                        dir="ltr"
                        max={getTodayCairoDateString()}
                        min="1900-01-01"
                        {...register('dateOfBirth')}
                        className={`w-full px-4 py-3 rounded-xl border bg-white text-slate-900 text-xs sm:text-sm font-mono text-right transition-all shadow-2xs focus:outline-hidden ${
                          errors.dateOfBirth
                            ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                            : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                        }`}
                      />
                      <Calendar className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    {errors.dateOfBirth ? (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.dateOfBirth.message}
                      </p>
                    ) : liveAge ? (
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#087F78]/10 border border-[#087F78]/20 px-3 py-2">
                        <Sparkles className="w-3.5 h-3.5 text-[#087F78] shrink-0" />
                        <span className="text-[11px] sm:text-xs font-bold text-[#163C3A]">
                          عمر الطفل عند الكشف: <span className="text-[#087F78]">{liveAge.formatted}</span>
                        </span>
                      </div>
                    ) : (
                      <span className="block text-[10.5px] text-slate-400 mt-1">
                        اختر تاريخ الميلاد من التقويم وسيُحسب العمر تلقائياً (سنوات / شهور / أيام) عند تاريخ الكشف
                      </span>
                    )}
                  </div>

                  {/* Field 3: Guardian Phone Number */}
                  <div>
                    <label
                      htmlFor="phoneNumber"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      رقم هاتف ولي الأمر <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="phoneNumber"
                        type="tel"
                        dir="ltr"
                        {...register('phoneNumber')}
                        placeholder="01xxxxxxxxx"
                        className={`w-full px-4 py-3 rounded-xl border bg-white text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 font-mono text-right transition-all shadow-2xs focus:outline-hidden ${
                          errors.phoneNumber
                            ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                            : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                        }`}
                      />
                      <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    {errors.phoneNumber ? (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.phoneNumber.message}
                      </p>
                    ) : (
                      <span className="block text-[10.5px] text-slate-400 mt-1">
                        مكون من 11 رقماً (010 / 011 / 012 / 015) لمتابعة وتأكيد الحجز
                      </span>
                    )}
                  </div>

                  {/* Field 4: Address */}
                  <div>
                    <label
                      htmlFor="patientAddress"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      العنوان بالتفصيل <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="patientAddress"
                        type="text"
                        {...register('patientAddress')}
                        placeholder="مثال: أبو حمص - دمسنا"
                        className={`w-full px-4 py-3 rounded-xl border bg-white text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 transition-all shadow-2xs focus:outline-hidden ${
                          errors.patientAddress
                            ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                            : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                        }`}
                      />
                      <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    {errors.patientAddress && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.patientAddress.message}
                      </p>
                    )}
                  </div>

                  {/* Field 5: Guardian National ID (Optional 14 digits) */}
                  <div>
                    <label
                      htmlFor="nationalId"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      الرقم القومي لولي الأمر{' '}
                      <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
                    </label>
                    <div className="relative">
                      <input
                        id="nationalId"
                        type="text"
                        dir="ltr"
                        maxLength={14}
                        {...register('nationalId')}
                        placeholder="14 رقماً (من بطاقة الرقم القومي)"
                        className={`w-full px-4 py-3 rounded-xl border bg-white text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 font-mono text-right transition-all shadow-2xs focus:outline-hidden ${
                          errors.nationalId
                            ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                            : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                        }`}
                      />
                      <CreditCard className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    {errors.nationalId ? (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.nationalId.message}
                      </p>
                    ) : (
                      <span className="block text-[10.5px] text-slate-400 mt-1">
                        اختياري — لا يظهر نهائياً في التذكرة أو في صفحات المتابعة لحماية الخصوصية
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* SECTION 2: CLINIC & APPOINTMENT                              */}
              {/* ============================================================ */}
              <div className="space-y-6 pt-6 border-t border-slate-100">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-teal-50 text-[#087F78] font-black text-sm flex items-center justify-center border border-teal-200/80 shadow-2xs shrink-0">
                    2
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#163C3A]">
                      العيادة وتفاصيل الموعد
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-400">
                      حدد العيادة التخصصية المطلوبة، والخدمة الطبية، وتاريخ الحضور المتاح
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Field 6: Clinic Select Dropdown (Loaded from DB) */}
                  <div>
                    <label
                      htmlFor="clinicId"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      العيادة التخصصية <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      {loadingClinics ? (
                        <div className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs text-slate-400 bg-slate-50 flex items-center gap-2">
                          <div className="w-3.5 h-3.5 border-2 border-[#087F78] border-t-transparent rounded-full animate-spin" />
                          <span>جاري تحميل العيادات التخصصية...</span>
                        </div>
                      ) : (
                        <select
                          id="clinicId"
                          {...register('clinicId')}
                          className={`w-full px-4 py-3 rounded-xl border bg-white text-[#163C3A] text-xs sm:text-sm font-semibold transition-all shadow-2xs focus:outline-hidden cursor-pointer ${
                            errors.clinicId
                              ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                              : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                          }`}
                        >
                          <option value="">-- اختر العيادة --</option>
                          {clinics.map((clinic) => (
                            <option key={clinic.id} value={clinic.id}>
                              {clinic.name} {clinic.location ? `(${clinic.location})` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {errors.clinicId && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.clinicId.message}
                      </p>
                    )}
                    {activeClinic && (
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1 text-[#087F78] font-bold">
                          <Clock className="w-3 h-3" />
                          <span>{activeClinic.workingHours || '08:30-14:00'}</span>
                        </span>
                        <span>•</span>
                        <span>{activeClinic.location || 'مبنى العيادات الخارجية'}</span>
                      </div>
                    )}
                  </div>

                  {/* Field 7: Service Select Dropdown (Loaded PER CLINIC) */}
                  <div>
                    <label
                      htmlFor="serviceId"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      الخدمة أو الفحص المطلوب <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      {loadingServices ? (
                        <div className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs text-slate-400 bg-slate-50 flex items-center gap-2">
                          <div className="w-3.5 h-3.5 border-2 border-[#087F78] border-t-transparent rounded-full animate-spin" />
                          <span>جاري تحميل خدمات العيادة...</span>
                        </div>
                      ) : (
                        <select
                          id="serviceId"
                          {...register('serviceId')}
                          className={`w-full px-4 py-3 rounded-xl border bg-white text-[#163C3A] text-xs sm:text-sm font-semibold transition-all shadow-2xs focus:outline-hidden cursor-pointer ${
                            errors.serviceId
                              ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                              : 'border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15'
                          }`}
                        >
                          {clinicServices.length === 0 ? (
                            <option value="">لا توجد خدمات محددة حالياً لهذه العيادة</option>
                          ) : (
                            clinicServices.map((srv) => (
                              <option key={srv.id} value={srv.id}>
                                {srv.name}
                              </option>
                            ))
                          )}
                        </select>
                      )}
                    </div>
                    {errors.serviceId && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.serviceId.message}
                      </p>
                    )}
                    <span className="block text-[10.5px] text-slate-400 mt-1">
                      الخدمات تتغير تلقائياً وفقاً للعيادة التخصصية المختارة
                    </span>
                  </div>

                  {/* ======================================================== */}
                  {/* TWO-LEVEL CLINIC & SERVICE DOCUMENTS & INSTRUCTIONS       */}
                  {/* ======================================================== */}
                  {(activeClinic || activeService) && (
                    <div className="md:col-span-2 space-y-3">
                      {/* 1. Clinic-Level Instructions & Documents */}
                      {(activeClinic?.instructions || (activeClinic?.requiredDocuments && activeClinic.requiredDocuments.length > 0)) && (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 text-xs sm:text-sm shadow-2xs">
                          <h4 className="font-bold text-[#124E4A] text-xs sm:text-sm flex items-center gap-1.5 mb-2">
                            <FileText className="w-4 h-4 text-[#087F78]" />
                            <span>تعليمات وأوراق العيادة العامة ({activeClinic.name})</span>
                          </h4>
                          {activeClinic.requiredDocuments && activeClinic.requiredDocuments.length > 0 && (
                            <div className="mb-2">
                              <span className="font-bold text-slate-700 block mb-0.5 text-2xs sm:text-xs">المستندات المطلوبة للعيادة:</span>
                              <ul className="list-disc list-inside space-y-0.5 pr-1 text-slate-600 text-xs font-medium">
                                {activeClinic.requiredDocuments.map((doc, idx) => (
                                  <li key={idx}>{doc}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {activeClinic.instructions && (
                            <div>
                              <span className="font-bold text-slate-700 block mb-0.5 text-2xs sm:text-xs">إرشادات الحضور للعيادة:</span>
                              <p className="text-slate-600 leading-relaxed font-medium text-xs">
                                {activeClinic.instructions}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 2. Service-Level Instructions & Documents */}
                      {activeService && (
                        <div className="p-4 rounded-2xl bg-teal-50/90 border border-teal-200 text-teal-950 text-xs sm:text-sm shadow-2xs">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h4 className="font-bold text-[#124E4A] text-xs sm:text-sm flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-[#087F78]" />
                              <span>متطلبات الخدمة التخصصية ({activeService.name})</span>
                            </h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-200/60 text-[#087F78]">
                              خاص بالخدمة
                            </span>
                          </div>

                          {activeService.requiredDocuments && activeService.requiredDocuments.length > 0 && (
                            <div className="mb-2">
                              <span className="font-bold text-[#124E4A] block mb-0.5 text-2xs sm:text-xs">المستندات الخاصة بهذه الخدمة:</span>
                              <ul className="list-disc list-inside space-y-0.5 pr-1 text-teal-950 font-medium text-xs">
                                {activeService.requiredDocuments.map((doc, idx) => (
                                  <li key={idx}>{doc}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {activeService.instructions && (
                            <div>
                              <span className="font-bold text-[#124E4A] block mb-0.5 text-2xs sm:text-xs">تعليمات وإرشادات الخدمة:</span>
                              <p className="text-teal-950/90 leading-relaxed font-medium text-xs">
                                {activeService.instructions}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Field 8: Date Selection Dropdown (Only available operating days, NO time slots) */}
                  <div className="md:col-span-2">
                    <label
                      htmlFor="appointmentDate"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      تاريخ الحضور المتاح بالعيادة <span className="text-red-500">*</span>
                    </label>

                    <div className="relative">
                      <select
                        id="appointmentDate"
                        {...register('appointmentDate')}
                        className={`w-full px-4 py-3 rounded-xl border text-xs sm:text-sm font-semibold transition-all shadow-2xs focus:outline-hidden ${
                          errors.appointmentDate
                            ? 'border-red-300 bg-white text-[#163C3A] focus:border-red-500 focus:ring-2 focus:ring-red-100 cursor-pointer'
                            : 'border-slate-200 bg-white text-[#163C3A] focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15 cursor-pointer'
                        }`}
                      >
                        <option value="">-- اختر يوماً متاحاً بالعيادة --</option>
                        {availableDates.map((d) => (
                          <option key={d.dateStr} value={d.dateStr}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <Calendar className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    {errors.appointmentDate && (
                      <p className="text-[11px] text-red-600 mt-1 font-medium">
                        {errors.appointmentDate.message}
                      </p>
                    )}

                    <p className="text-[10.5px] text-slate-400 mt-1">
                      تظهر فقط الأيام المعتمدة لعمل العيادة وتستثنى أيام العطلات. الكشف بأسبقية الحضور صباحاً.
                    </p>
                  </div>

                  {/* Field 9: Notes (Optional Textarea) */}
                  <div className="md:col-span-2">
                    <label
                      htmlFor="notes"
                      className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5"
                    >
                      ملاحظات أو تفاصيل إضافية{' '}
                      <span className="text-slate-400 text-xs font-normal">(اختياري)</span>
                    </label>
                    <textarea
                      id="notes"
                      rows={3}
                      {...register('notes')}
                      placeholder="اذكر أي شكوى طبية سابقة، أدوية منتظمة يتناولها الطفل، أو ملاحظات هامة للموظف المختص..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15 bg-white text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 transition-all shadow-2xs resize-y focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* FOOTER & SUBMISSION SECTION                                  */}
              {/* ============================================================ */}
              <div className="space-y-5 pt-4">
                <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-100 flex items-start gap-3 text-xs text-[#124E4A] leading-relaxed">
                  <Lock className="w-4 h-4 text-[#087F78] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">ضمان الخصوصية وسرية البيانات:</span>
                    <p className="mt-0.5 text-teal-900/85">
                      يتم حفظ البيانات وتأكيد الحجز فورياً في منظومة المستشفى. الرقم القومي اختياري ولا
                      يتم تداوله أو إظهاره في تذكرة المريض أو روابط الاستعلام العامة.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-4 rounded-2xl text-white text-sm sm:text-base font-bold shadow-md transition-all flex items-center justify-center gap-2.5 ${
                    submitting
                      ? 'bg-[#066560] cursor-wait opacity-90'
                      : 'bg-[#087F78] hover:bg-[#066560] active:scale-[0.99] cursor-pointer shadow-teal-900/10 hover:shadow-lg'
                  }`}
                >
                  {submitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جاري إرسال طلب الحجز والتحقق...</span>
                    </>
                  ) : (
                    <>
                      <CalendarPlus className="w-5 h-5" />
                      <span>تأكيد وإصدار تذكرة الحجز الآن</span>
                    </>
                  )}
                </button>

                <div className="text-center text-[11px] text-slate-400 space-y-1">
                  <p>
                    بالضغط على تأكيد الحجز، أنت تقر بصحة البيانات وموافقتك على تعليمات الحضور المعتمدة.
                  </p>
                  <p>
                    هل لديك حجز سابق؟{' '}
                    <Link
                      href="/appointments/track"
                      className="text-[#087F78] hover:underline font-bold"
                    >
                      اضغط هنا لمتابعة حالة حجزك أو استعراض تذكرتك
                    </Link>
                  </p>
                </div>
              </div>
            </form>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
