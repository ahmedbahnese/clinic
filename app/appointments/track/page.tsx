'use client';

import React, { useState, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toPng } from 'html-to-image';
import {
  Search,
  Clock,
  Calendar,
  User,
  Printer,
  XCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Phone,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Share2,
  Download,
  ChevronLeft,
  CalendarCheck,
  CalendarPlus,
  Sparkles,
  MapPin,
  X,
  Lock,
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import type { Appointment, AppointmentStatus } from '@/types';
import { formatArabicDate } from '@/lib/rules';

function TrackContent() {
  const searchParams = useSearchParams();
  const initialPhone = searchParams.get('phone') || '';
  const initialRef = searchParams.get('ref') || searchParams.get('referenceNumber') || '';

  const [phoneQuery, setPhoneQuery] = useState(initialPhone);
  const [refQuery, setRefQuery] = useState(initialRef);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Unlock state for unverified bookings
  const [unlockRefInput, setUnlockRefInput] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Selected booking for receipt view
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  // Cancellation modal state
  const [cancellingAptId, setCancellingAptId] = useState<string | null>(null);
  const [cancelRefInput, setCancelRefInput] = useState('');
  const [cancelPhoneInput, setCancelPhoneInput] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Perform phone lookup
  async function handleTrackByPhone(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanPhone = phoneQuery.trim();

    if (!cleanPhone) {
      setErrorMessage('يرجى إدخال رقم الهاتف المسجل بالحجز');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setHasSearched(true);

    try {
      const res = await fetch('/api/appointments/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          referenceNumber: refQuery.trim() || undefined,
          turnstileToken,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'حدث خطأ أثناء الاستعلام، يرجى التحقق من رقم الهاتف والمحاولة مجدداً.');
        setAppointments([]);
      } else {
        const fetched: Appointment[] = data.appointments || [];
        setAppointments(fetched);
        if (fetched.length === 1) {
          setSelectedAppointment(fetched[0]);
        } else if (fetched.length === 0) {
          setSelectedAppointment(null);
        }
      }
    } catch {
      setErrorMessage('حدث خطأ أثناء الاتصال بالخادم، يرجى المحاولة مرة أخرى');
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }

  // Handle inline reference unlocking
  async function handleUnlockTicket(e: React.FormEvent) {
    e.preventDefault();
    const cleanPhone = phoneQuery.trim();
    const cleanRef = unlockRefInput.trim();

    if (!cleanRef) {
      setUnlockError('يرجى إدخال الرقم المرجعي للحجز');
      return;
    }

    setUnlockLoading(true);
    setUnlockError(null);

    try {
      const res = await fetch('/api/appointments/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          referenceNumber: cleanRef,
          turnstileToken,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setUnlockError(data.error || 'تعذر التحقق من الرقم المرجعي');
      } else {
        const fetched: Appointment[] = data.appointments || [];
        setAppointments(fetched);
        const unlocked = fetched.find((a) => a.isVerified) || fetched[0];
        if (unlocked) {
          setSelectedAppointment(unlocked);
          setRefQuery(cleanRef);
          setUnlockRefInput('');
        }
      }
    } catch {
      setUnlockError('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setUnlockLoading(false);
    }
  }

  // Handle appointment cancellation request submission
  async function handleConfirmCancel() {
    if (!cancelRefInput.trim() || !cancelPhoneInput.trim()) {
      alert('يرجى التأكد من إدخال الرقم المرجعي ورقم الهاتف المسجل بالحجز');
      return;
    }
    setIsCancelling(true);

    try {
      const res = await fetch('/api/appointments/cancel-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceNumber: cancelRefInput.trim(),
          phoneNumber: cancelPhoneInput.trim(),
          reason: cancelReason.trim() || 'طلب إلغاء من ولي الأمر عبر بوابة المتابعة',
          turnstileToken: turnstileToken || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAppointments((prev) =>
          prev.map((a) =>
            a.referenceNumber.toUpperCase() === cancelRefInput.trim().toUpperCase()
              ? { ...a, hasPendingCancellation: true }
              : a
          )
        );
        if (
          selectedAppointment &&
          selectedAppointment.referenceNumber.toUpperCase() === cancelRefInput.trim().toUpperCase()
        ) {
          setSelectedAppointment({ ...selectedAppointment, hasPendingCancellation: true });
        }
        setCancellingAptId(null);
        setCancelReason('');
        alert(
          data.message ||
            'تم إرسال طلب الإلغاء بنجاح وسيتم مراجعته بواسطة موظف الاستقبال بالمستشفى. يظل الحجز فعالاً حتى اعتماد الطلب.'
        );
      } else {
        alert(data.error || 'تعذر إرسال طلب الإلغاء');
      }
    } catch {
      alert('حدث خطأ أثناء إرسال طلب الإلغاء، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsCancelling(false);
    }
  }

  // Action 1: Print
  const handlePrint = () => {
    window.print();
  };

  // Action 2: Share via Web Share API
  const handleShare = async () => {
    if (!selectedAppointment) return;
    const shareText = `تذكرة حجز بمستشفى الأطفال التخصصي بالبحيرة\n• اسم الطفل: ${selectedAppointment.patientName}\n• العيادة: ${selectedAppointment.clinicName}\n• الخدمة: ${selectedAppointment.serviceName || ''}\n• تاريخ الحضور: ${formatArabicDate(selectedAppointment.appointmentDate)}\n• الرقم المرجعي: ${selectedAppointment.referenceNumber}\n• تعليمات الحضور: الحضور صباحاً بأسبقية التسجيل في شباك الاستقبال بالمستشفى`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `تذكرة حجز - ${selectedAppointment.patientName}`,
          text: shareText,
          url: `${window.location.origin}/appointments/track?phone=${phoneQuery}`,
        });
      } catch {
        // Cancelled by user
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareText);
      alert('تم نسخ تفاصيل الحجز إلى الحافظة بنجاح.');
    }
  };

  // Action 3: Save as Image
  const handleSaveAsImage = async () => {
    if (!receiptRef.current || !selectedAppointment) return;
    setGeneratingImage(true);

    try {
      const dataUrl = await toPng(receiptRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });

      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File(
            [blob],
            `bsch-receipt-${selectedAppointment.referenceNumber}.png`,
            { type: 'image/png' }
          );
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `إيصال حجز - ${selectedAppointment.patientName}`,
              text: `إيصال حجز عيادة ${selectedAppointment.clinicName} بمستشفى الأطفال التخصصي`,
            });
            return;
          }
        } catch {
          // Fallback to download
        }
      }

      const link = document.createElement('a');
      link.download = `bsch-receipt-${selectedAppointment.referenceNumber}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error generating receipt image:', err);
      alert('تعذر حفظ الإيصال كصورة، يرجى استخدام خيار الطباعة.');
    } finally {
      setGeneratingImage(false);
    }
  };

  return (
    <div dir="rtl" className="w-full max-w-[920px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Navigation Breadcrumb */}
      <div className="mb-6 flex items-center justify-between text-xs text-slate-500 no-print">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 hover:text-[#087F78] transition-colors font-medium"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          <span>العودة للرئيسية</span>
        </Link>
        <span className="inline-flex items-center gap-1 bg-teal-50 border border-teal-100 text-[#087F78] px-3 py-1 rounded-full font-bold">
          <Sparkles className="w-3 h-3" />
          <span>متابعة الحجز برقم الهاتف</span>
        </span>
      </div>

      {/* Header */}
      <div className="text-center mb-6 space-y-2 no-print">
        <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 text-[#087F78] flex items-center justify-center mx-auto shadow-2xs">
          <Search className="w-7 h-7 stroke-[2]" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#124E4A] tracking-tight">
          متابعة الحجز واستعراض التذاكر
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          أدخل رقم هاتف ولي الأمر المسجل للاستعلام الفوري عن المواعيد النشطة وتفاصيل الحضور والطباعة.
        </p>
      </div>

      {/* Phone Search Form */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-xs max-w-xl mx-auto mb-8 text-right no-print">
        <form onSubmit={handleTrackByPhone} className="space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5">
              رقم هاتف ولي الأمر المسجل بالحجز <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="tel"
                dir="ltr"
                value={phoneQuery}
                onChange={(e) => setPhoneQuery(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15 text-xs sm:text-sm text-[#163C3A] text-right font-mono font-bold placeholder:text-slate-400 transition-all bg-white"
              />
              <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            <span className="block text-[10.5px] text-slate-400 mt-1">
              أدخل رقم الهاتف المحمول المصري المكون من 11 رقماً والذي تم الحجز به
            </span>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-bold text-[#163C3A] mb-1.5">
              الرقم المرجعي للحجز (اختياري)
            </label>
            <div className="relative">
              <input
                type="text"
                dir="ltr"
                value={refQuery}
                onChange={(e) => setRefQuery(e.target.value)}
                placeholder="BSCH-1001"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#087F78] focus:ring-2 focus:ring-[#087F78]/15 text-xs sm:text-sm text-[#163C3A] text-right font-mono font-bold placeholder:text-slate-400 transition-all bg-white"
              />
            </div>
            <span className="block text-[10.5px] text-slate-400 mt-1">
              أدخل الرقم المرجعي إذا كنت ترغب في فك حجب بيانات التذكرة، رقم الدور، أو إلغاء الحجز مباشرة
            </span>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-[#087F78] hover:bg-[#066560] text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>جاري البحث عن المواعيد...</span>
              </>
            ) : (
              <span>متابعة الحجز واستعراض التذاكر</span>
            )}
          </button>
        </form>
      </div>

      {/* RESULTS SECTION */}
      {hasSearched && (
        <div className="space-y-6">
          {appointments.length === 0 ? (
            /* EMPTY STATE */
            <div className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-12 text-center max-w-lg mx-auto shadow-xs">
              <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
                <CalendarCheck className="w-8 h-8 stroke-[1.5]" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-[#124E4A] mb-2">
                لا توجد حجوزات نشطة أو قادمة
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mb-6 leading-relaxed">
                لا توجد مواعيد نشطة قادمة مسجلة لهذا الرقم لتاريخ اليوم وما بعده.
                يرجى التأكد من كتابة الرقم بشكل صحيح، أو حجز موعد جديد بالعيادات.
              </p>
              <Link
                href="/appointments/new"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#087F78] hover:bg-[#066560] text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition-all"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>حجز موعد جديد الآن</span>
              </Link>
            </div>
          ) : (
            <>
              {/* BOOKINGS LIST */}
              <div className="space-y-3 max-w-2xl mx-auto no-print">
                <div className="flex items-center justify-between text-xs text-slate-500 px-1 mb-1">
                  <span className="font-bold text-[#163C3A]">
                    قائمة الحجوزات السارية ({appointments.length})
                  </span>
                  <span>اضغط على أي حجز لاستعراض تفاصيل التذكرة</span>
                </div>

                {appointments.map((apt) => {
                  const isConfirmed = apt.status === 'CONFIRMED' || apt.status === 'CHECKED_IN';
                  const isSelected =
                    selectedAppointment &&
                    (selectedAppointment.id === apt.id ||
                      selectedAppointment.referenceNumber === apt.referenceNumber);

                  return (
                    <button
                      key={apt.id || apt.referenceNumber}
                      type="button"
                      onClick={() => setSelectedAppointment(apt)}
                      className={`w-full text-right p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs ${
                        isSelected
                          ? 'border-[#087F78] bg-teal-50/50 ring-2 ring-[#087F78]/15'
                          : 'border-slate-200/80 bg-white hover:border-[#087F78]/40 hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${
                              isConfirmed
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            <span>{isConfirmed ? 'مؤكد' : 'قيد المراجعة'}</span>
                          </span>

                          <span className="font-mono text-xs font-bold text-slate-400">
                            {apt.referenceNumber}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-baseline gap-2">
                          <h4 className="text-sm sm:text-base font-black text-[#163C3A]">
                            {apt.clinicName}
                          </h4>
                          <span className="text-xs font-semibold text-[#087F78]">
                            — {apt.serviceName || 'كشف واستشارة طبية'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>الطفل: <strong className="text-slate-700">{apt.patientName}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-right sm:text-left">
                          <span className="text-[11px] text-slate-400 block font-semibold">
                            تاريخ الحضور
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-[#124E4A] flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-[#087F78]" />
                            <span>{formatArabicDate(apt.appointmentDate)}</span>
                          </span>
                        </div>
                        <ChevronLeft
                          className={`w-5 h-5 transition-transform ${
                            isSelected ? 'text-[#087F78] -translate-x-1' : 'text-slate-300'
                          }`}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* RECEIPT VIEW */}
              {selectedAppointment && (
                <div className="mt-8 max-w-2xl mx-auto pt-6 border-t border-slate-200 animate-in fade-in slide-in-from-bottom-3 duration-200">
                  <div className="flex items-center justify-between mb-4 no-print">
                    <div>
                      <h3 className="text-lg font-bold text-[#124E4A]">
                        تذكرة الحجز الإلكتروني
                      </h3>
                      <p className="text-xs text-slate-500">
                        الرقم المرجعي: <span className="font-mono font-bold text-[#087F78]">{selectedAppointment.referenceNumber}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePrint}
                        className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>طباعة التذكرة</span>
                      </button>

                      <button
                        onClick={handleSaveAsImage}
                        disabled={generatingImage}
                        className="px-3.5 py-1.5 rounded-xl bg-[#087F78] hover:bg-[#066560] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        {generatingImage ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>حفظ كصورة</span>
                      </button>
                    </div>
                  </div>

                  {/* Printable Ticket Element */}
                  <div
                    id="printable-ticket"
                    ref={receiptRef}
                    className="bg-white rounded-3xl border-2 border-slate-200 p-6 sm:p-8 space-y-6 shadow-sm"
                  >
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                      <div>
                        <h4 className="text-base sm:text-lg font-black text-[#124E4A]">
                          مستشفى الأطفال التخصصي بالبحيرة
                        </h4>
                        <p className="text-2xs text-slate-400">
                          بوابة العيادات الخارجية التخصصية — تذكرة مراجعة الحجز
                        </p>
                      </div>
                      <div className="text-left font-mono">
                        <span className="text-[10px] text-slate-400 block font-semibold">كود التذكرة</span>
                        <span className="text-sm font-black text-[#087F78]">{selectedAppointment.referenceNumber}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 block text-2xs mb-0.5">اسم الطفل / المريض</span>
                        <strong className="text-sm text-[#163C3A]">{selectedAppointment.patientName}</strong>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-2xs mb-0.5">حالة الموعد</span>
                        <strong className="text-xs text-[#087F78]">
                          {selectedAppointment.status === 'CONFIRMED' || selectedAppointment.status === 'CHECKED_IN'
                            ? 'حجز مؤكد ومعتمد'
                            : 'قيد المراجعة والاعتماد'}
                        </strong>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-2xs mb-0.5">العيادة التخصصية</span>
                        <strong className="text-xs text-[#163C3A]">{selectedAppointment.clinicName}</strong>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-2xs mb-0.5">الخدمة المطلوبة</span>
                        <strong className="text-xs text-[#163C3A]">{selectedAppointment.serviceName || 'كشف واستشارة طبية'}</strong>
                      </div>

                      <div className="sm:col-span-2 p-3.5 rounded-2xl bg-teal-50/70 border border-teal-100">
                        <span className="text-2xs font-bold text-[#087F78] block mb-0.5">تاريخ وموعد الحضور</span>
                        <p className="text-xs sm:text-sm font-bold text-[#124E4A]">
                          {formatArabicDate(selectedAppointment.appointmentDate)} — الحضور صباحاً بأسبقية التسجيل في شباك الاستقبال
                        </p>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-2xs mb-0.5">حالة الإيصال</span>
                        {selectedAppointment.status === 'CONFIRMED' || selectedAppointment.status === 'CHECKED_IN' ? (
                          <strong className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                            مؤكد
                          </strong>
                        ) : selectedAppointment.status === 'CANCELLED' ? (
                          <strong className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-300">
                            ملغي
                          </strong>
                        ) : selectedAppointment.status === 'COMPLETED' ? (
                          <strong className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-300">
                            مكتمل (تم الكشف)
                          </strong>
                        ) : (
                          <strong className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">
                            في انتظار التأكيد
                          </strong>
                        )}
                      </div>
                    </div>

                    {/* Instructions & Required Documents */}
                    {selectedAppointment.requiredDocuments && selectedAppointment.requiredDocuments.length > 0 && (
                      <div className="pt-3 border-t border-slate-100 text-xs">
                        <span className="font-bold text-[#124E4A] block mb-1">الأوراق والمستندات المطلوبة:</span>
                        <ul className="list-disc list-inside space-y-0.5 pr-1 text-slate-600 text-2xs">
                          {selectedAppointment.requiredDocuments.map((doc, idx) => (
                            <li key={idx}>{doc}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedAppointment.serviceInstructions && (
                      <div className="pt-2 text-xs">
                        <span className="font-bold text-[#124E4A] block mb-0.5">تعليمات الحضور:</span>
                        <p className="text-slate-600 leading-relaxed text-2xs">
                          {selectedAppointment.serviceInstructions}
                        </p>
                      </div>
                    )}

                    <div className="pt-4 border-t border-slate-100 text-center text-3xs text-slate-400 leading-relaxed">
                      أبو حمص – دمسنا – محافظة البحيرة • مستشفى الأطفال التخصصي
                    </div>
                  </div>

                  {/* Cancel Appointment Request Section */}
                  {selectedAppointment.isVerified !== false &&
                    selectedAppointment.status !== 'CANCELLED' &&
                    selectedAppointment.status !== 'COMPLETED' && (
                      <div className="mt-4 pt-3 border-t border-slate-100 no-print">
                        {selectedAppointment.hasPendingCancellation ? (
                          <div className="flex items-center justify-between text-xs p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
                              <span className="font-bold">يوجد طلب إلغاء قيد المراجعة لدى موظفي الاستقبال</span>
                            </div>
                            <span className="text-3xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                              الحجز لا يزال فعالاً
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">هل ترغب في الاعتذار عن الحضور؟</span>
                            <button
                              type="button"
                              onClick={() => {
                                setCancellingAptId(selectedAppointment.referenceNumber || selectedAppointment.id);
                                setCancelRefInput(selectedAppointment.referenceNumber || '');
                                setCancelPhoneInput(phoneQuery.trim());
                              }}
                              className="text-amber-700 hover:text-amber-800 font-bold hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <AlertCircle className="w-4 h-4" />
                              <span>طلب إلغاء الحجز</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Cancellation Request Modal */}
      {cancellingAptId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-right shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-amber-700 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <span>طلب إلغاء الحجز للمراجعة</span>
              </h3>
              <button
                onClick={() => setCancellingAptId(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs text-amber-900 leading-relaxed space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <span>تنبيه هام بشأن إلغاء الموعد:</span>
              </p>
              <p className="text-3xs text-amber-800 leading-normal">
                سيتم إرسال هذا الطلب لموظف الاستقبال بالمستشفى لمراجعته واعتماده. **الحجز يظل سارياً وفعالاً** ولا يتم إلغاؤه تلقائياً حتى يقوم موظف الاستقبال باعتماد الطلب.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-2xs font-bold text-[#163C3A] mb-1">
                  الرقم المرجعي للحجز
                </label>
                <input
                  type="text"
                  value={cancelRefInput}
                  onChange={(e) => setCancelRefInput(e.target.value)}
                  placeholder="مثال: BSCH-1001"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:border-[#087F78] font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-[#163C3A] mb-1">
                  رقم الهاتف المسجل بالحجز
                </label>
                <input
                  type="tel"
                  value={cancelPhoneInput}
                  onChange={(e) => setCancelPhoneInput(e.target.value)}
                  placeholder="01012345678"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:border-[#087F78] font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-[#163C3A] mb-1">
                  سبب الاعتذار أو الإلغاء (اختياري)
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="مثال: تعذر الحضور في هذا الموعد، تحسن الحالة..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:border-[#087F78]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancellingAptId(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs disabled:opacity-60 flex items-center gap-1.5"
              >
                {isCancelling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري الإرسال...</span>
                  </>
                ) : (
                  <span>إرسال طلب الإلغاء للمراجعة</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <style jsx global>{`
        @media print {
          /* Hide everything except the printable ticket */
          header, footer, nav, button, form, .no-print {
            display: none !important;
          }
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden;
          }
          #printable-ticket, #printable-ticket * {
            visibility: visible;
          }
          #printable-ticket {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            border: 2px solid #087F78 !important;
            border-radius: 16px !important;
            box-shadow: none !important;
            background: #ffffff !important;
          }
        }
      `}</style>
      <div className="no-print">
        <SiteHeader />
      </div>
      <main className="flex-1">
        <Suspense fallback={<div className="p-12 text-center text-xs text-slate-400 no-print">جاري التحميل...</div>}>
          <TrackContent />
        </Suspense>
      </main>
      <div className="no-print">
        <SiteFooter />
      </div>
    </div>
  );
}
