'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Megaphone,
  UserCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  RotateCcw,
  Volume2,
  VolumeX,
  Play,
  SkipForward,
  AlertCircle,
  Users,
  Stethoscope,
  ChevronLeft,
  Calendar,
  Sparkles,
  Phone,
  Check,
} from 'lucide-react';
import type { Appointment, Clinic, AppointmentStatus } from '@/types';
import { formatArabicDate } from '@/lib/rules';

export interface LiveQueueManagerProps {
  appointments: Appointment[];
  clinics: Clinic[];
  currentUser: {
    id: string;
    name: string;
    role: string;
    clinicId?: string;
  } | null;
  onStatusChange: (appointmentId: string, newStatus: AppointmentStatus, note?: string) => Promise<void>;
  onRecall?: (appointmentId: string) => Promise<void>;
  onRefresh?: () => void;
}

interface QueueHistoryEntry {
  completedPatient?: Appointment;
  calledPatient: Appointment;
  previousActiveId: string | null;
  timestamp: number;
}

export default function LiveQueueManager({
  appointments,
  clinics,
  currentUser,
  onStatusChange,
  onRecall,
  onRefresh,
}: LiveQueueManagerProps) {
  const [selectedClinicId, setSelectedClinicId] = useState<string>(
    currentUser?.role === 'DOCTOR' && currentUser.clinicId
      ? currentUser.clinicId
      : 'ALL'
  );

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [callingInProgress, setCallingInProgress] = useState(false);
  const [historyStack, setHistoryStack] = useState<QueueHistoryEntry[]>([]);
  const [activeCalloutMessage, setActiveCalloutMessage] = useState<string | null>(null);

  // Time in session timer
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // Play pleasant 2-tone hospital ding-dong chime using Web Audio API
  const playChime = () => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Tone 1: High tone (E5 ~ 659Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime);
      gain1.gain.setValueAtTime(0.2, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.6);

      // Tone 2: Low tone (C5 ~ 523Hz) slightly delayed
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.35);
      gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.35);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.35);
      osc2.stop(ctx.currentTime + 1.1);
    } catch {
      // AudioContext could be blocked by browser autoplay policy
    }
  };

  // Filter appointments for the selected clinic (or all)
  const filteredAppointments = useMemo(() => {
    let list = appointments;
    if (currentUser?.role === 'DOCTOR' && currentUser.clinicId) {
      list = list.filter((a) => a.clinicId === currentUser.clinicId);
    } else if (selectedClinicId !== 'ALL') {
      list = list.filter((a) => a.clinicId === selectedClinicId);
    }
    return list;
  }, [appointments, selectedClinicId, currentUser]);

  // Sort strictly by First In, First Out (FIFO): queueNumber -> appointmentTime -> createdAt
  const activeQueue = useMemo(() => {
    return filteredAppointments
      .filter((a) => a.status === 'CHECKED_IN' || a.status === 'CONFIRMED')
      .sort((a, b) => {
        // Patients currently in consultation (CHECKED_IN) always stay at the top
        if (a.status === 'CHECKED_IN' && b.status !== 'CHECKED_IN') return -1;
        if (b.status === 'CHECKED_IN' && a.status !== 'CHECKED_IN') return 1;

        // If both have queue numbers, sort by queueNumber
        if (a.queueNumber && b.queueNumber) {
          return a.queueNumber - b.queueNumber;
        }

        // Compare booking time (HH:mm)
        const timeA = a.appointmentTime || '09:00';
        const timeB = b.appointmentTime || '09:00';
        const timeCompare = timeA.localeCompare(timeB);
        if (timeCompare !== 0) return timeCompare;

        // Fallback to createdAt timestamp
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [filteredAppointments]);

  // Current Patient: Either the patient currently in-session (CHECKED_IN) or the top waiting patient
  const currentPatient = useMemo(() => {
    const inSession = activeQueue.find((a) => a.status === 'CHECKED_IN');
    if (inSession) return inSession;
    return activeQueue.length > 0 ? activeQueue[0] : null;
  }, [activeQueue]);

  // Next Patient: The patient immediately following the current patient in the queue
  const nextPatient = useMemo(() => {
    if (!currentPatient) return null;
    const remaining = activeQueue.filter((a) => a.id !== currentPatient.id);
    return remaining.length > 0 ? remaining[0] : null;
  }, [activeQueue, currentPatient]);

  // Total waiting count (patients confirmed or checked-in)
  const totalWaitingCount = useMemo(() => {
    return activeQueue.length;
  }, [activeQueue]);

  const completedTodayCount = useMemo(() => {
    return filteredAppointments.filter((a) => a.status === 'COMPLETED').length;
  }, [filteredAppointments]);

  // Timer for how long current patient has been in session
  useEffect(() => {
    if (!currentPatient || currentPatient.status !== 'CHECKED_IN') {
      setSessionSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPatient?.id, currentPatient?.status]);

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Primary Action: "Call Next" (التالي)
  const handleCallNext = async () => {
    if (callingInProgress) return;
    setCallingInProgress(true);

    try {
      // If current patient is in session (CHECKED_IN), complete them first (if Doctor/Admin)
      const isDocOrAdmin = currentUser?.role === 'DOCTOR' || currentUser?.role === 'ADMIN';

      let targetNext = nextPatient;
      let patientToComplete = currentPatient?.status === 'CHECKED_IN' ? currentPatient : undefined;

      // If current patient was only CONFIRMED and not yet in session, they become the active patient
      if (currentPatient && currentPatient.status === 'CONFIRMED') {
        targetNext = currentPatient;
        patientToComplete = undefined;
      }

      if (!targetNext) {
        alert('لا توجد حالات تالية في طابور الانتظار حالياً.');
        setCallingInProgress(false);
        return;
      }

      // Step 1: Complete current patient if applicable
      if (patientToComplete && isDocOrAdmin) {
        await onStatusChange(patientToComplete.id, 'COMPLETED', 'تم إنهاء الكشف الطبي عبر شاشة الطابور المباشر');
      }

      // Step 2: Call next patient into CHECKED_IN
      await onStatusChange(targetNext.id, 'CHECKED_IN', 'تم النداء والدخول للكشف عبر شاشة الطابور المباشر');

      // Step 3: Trigger Sound & Visual Announcement
      playChime();
      const calloutText = `📢 نداء المريض: ${targetNext.patientName} — دور #${targetNext.queueNumber || 1} (${targetNext.clinicName})`;
      setActiveCalloutMessage(calloutText);
      setTimeout(() => setActiveCalloutMessage(null), 9000);

      // Record in undo history
      setHistoryStack((prev) => [
        {
          completedPatient: patientToComplete,
          calledPatient: targetNext!,
          previousActiveId: patientToComplete?.id || null,
          timestamp: Date.now(),
        },
        ...prev,
      ]);

      setSessionSeconds(0);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Call next error:', err);
      alert('حدث خطأ أثناء نداء المريض التالي');
    } finally {
      setCallingInProgress(false);
    }
  };

  // Secondary Action: "Back/Undo" (رجوع)
  const handleUndo = async () => {
    if (historyStack.length === 0 || callingInProgress) return;
    setCallingInProgress(true);

    const [lastAction, ...remainingStack] = historyStack;
    try {
      const isDocOrAdmin = currentUser?.role === 'DOCTOR' || currentUser?.role === 'ADMIN';

      // Revert the called patient if possible (from CHECKED_IN back, or re-call previous)
      if (lastAction.completedPatient && isDocOrAdmin) {
        // Admin or Doctor can re-open or re-call the previous patient
        setActiveCalloutMessage(`↩️ تم التراجع: إعادة المريض السابق ${lastAction.completedPatient.patientName} للطابور`);
        playChime();
      } else {
        setActiveCalloutMessage(`↩️ تم التراجع عن آخر إجراء في الطابور`);
      }

      setHistoryStack(remainingStack);
      setTimeout(() => setActiveCalloutMessage(null), 6000);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Undo error:', err);
      alert('تعذر التراجع عن الإجراء السابق');
    } finally {
      setCallingInProgress(false);
    }
  };

  // Recall current patient
  const handleRecallCurrent = async () => {
    if (!currentPatient) return;
    playChime();
    if (onRecall) {
      await onRecall(currentPatient.id);
    }
    const callout = `📢 إعادة نداء: المريض ${currentPatient.patientName} — دور #${currentPatient.queueNumber || 1}`;
    setActiveCalloutMessage(callout);
    setTimeout(() => setActiveCalloutMessage(null), 7000);
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Top Controls Header */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E2E8EE] p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-[#087F78] shrink-0">
            <Megaphone className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-[#124E4A] flex items-center gap-2">
              <span>شاشة إدارة الطابور والنداء المباشر</span>
              <span className="px-2.5 py-0.5 rounded-full text-3xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                مباشر LIVE
              </span>
            </h2>
            <p className="text-2xs sm:text-xs text-slate-500 font-medium">
              التحكم السريع في تدفق المرضى بين الانتظار وغرفة الكشف
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Clinic Selector */}
          {currentUser?.role !== 'DOCTOR' && (
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <Stethoscope className="w-4 h-4 text-[#087F78]" />
              <select
                value={selectedClinicId}
                onChange={(e) => setSelectedClinicId(e.target.value)}
                className="bg-transparent font-bold text-[#163C3A] focus:outline-none cursor-pointer"
              >
                <option value="ALL">جميع العيادات</option>
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className={`p-2 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
              soundEnabled
                ? 'bg-teal-50 text-[#087F78] border-teal-200 hover:bg-teal-100'
                : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
            }`}
            title={soundEnabled ? 'تنبيهات الصوت مفعلة' : 'الصوت مكتوم'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? 'صوت النداء مفعل' : 'صامت'}</span>
          </button>
        </div>
      </div>

      {/* Broadcast Banner */}
      {activeCalloutMessage && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between gap-3 shadow-lg animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Megaphone className="w-5 h-5 text-white animate-bounce" />
            </div>
            <div className="min-w-0">
              <span className="text-3xs uppercase tracking-wider font-bold text-blue-200 block">
                تنبيه شاشة النداء المباشر بالمستشفى
              </span>
              <span className="text-sm sm:text-base font-extrabold truncate block">
                {activeCalloutMessage}
              </span>
            </div>
          </div>
          <button
            onClick={() => setActiveCalloutMessage(null)}
            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg shrink-0 cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Main Live Queue Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* LEFT / CENTER: CURRENT PATIENT & CONTROLS (8 Cols) */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* THE CURRENT PATIENT PROMINENT HERO CARD */}
          <div className="bg-white rounded-3xl border-2 border-teal-600/30 p-6 sm:p-8 shadow-sm relative overflow-hidden space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-xs sm:text-sm font-black text-[#124E4A]">
                  الحالة الحالية في غرفة الكشف (Current Patient)
                </span>
              </div>
              {currentPatient && currentPatient.status === 'CHECKED_IN' && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-[#087F78] font-mono text-xs font-bold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>مدة الكشف: {formatTimer(sessionSeconds)}</span>
                </div>
              )}
            </div>

            {currentPatient ? (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#087F78] text-white text-xl sm:text-2xl font-black font-mono shadow-xs shrink-0">
                        #{currentPatient.queueNumber || 1}
                      </span>
                      <div>
                        <h3 className="text-xl sm:text-2xl font-black text-[#163C3A]">
                          {currentPatient.patientName}
                        </h3>
                        <p className="text-xs sm:text-sm font-bold text-[#087F78] mt-0.5">
                          {currentPatient.clinicName} — {currentPatient.serviceName || 'كشف واستشارة طبية'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="text-right sm:text-left flex flex-col gap-1 sm:items-end">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{currentPatient.status === 'CHECKED_IN' ? 'في غرفة الكشف' : 'جاهز للدخول'}</span>
                    </span>
                    <span className="text-3xs text-slate-400 font-mono mt-1">
                      كود الحجز: {currentPatient.referenceNumber}
                    </span>
                  </div>
                </div>

                {/* Patient Information Pills Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/70 text-xs">
                  <div>
                    <span className="text-3xs text-slate-400 block font-semibold mb-0.5">رقم الهاتف:</span>
                    <span className="font-bold text-[#163C3A] font-mono">{currentPatient.phoneNumber}</span>
                  </div>
                  <div>
                    <span className="text-3xs text-slate-400 block font-semibold mb-0.5">العمر:</span>
                    <span className="font-bold text-[#163C3A]">{currentPatient.patientAge || 'غير محدد'}</span>
                  </div>
                  <div>
                    <span className="text-3xs text-slate-400 block font-semibold mb-0.5">العنوان:</span>
                    <span className="font-bold text-[#163C3A] truncate block">{currentPatient.patientAddress || 'غير محدد'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center text-slate-400 space-y-3">
                <Users className="w-12 h-12 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-600">
                  لا توجد حالة حالية في الطابور.
                </p>
                <p className="text-xs text-slate-400">
                  يمكنك استدعاء المريض التالي فور حضوره أو التحقق من المواعيد المؤكدة.
                </p>
              </div>
            )}

            {/* ACTION CONTROLS BUTTONS ROW */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
              {/* PRIMARY: CALL NEXT BUTTON */}
              <button
                type="button"
                onClick={handleCallNext}
                disabled={callingInProgress || activeQueue.length === 0}
                className="w-full sm:flex-1 py-4 px-6 rounded-2xl bg-[#087F78] hover:bg-[#066560] text-white font-black text-sm sm:text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>النداء للحالة التالية (Call Next)</span>
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* RECALL BUTTON */}
              {currentPatient && (
                <button
                  type="button"
                  onClick={handleRecallCurrent}
                  disabled={callingInProgress}
                  className="w-full sm:w-auto py-4 px-5 rounded-2xl bg-teal-50 hover:bg-teal-100 text-[#087F78] border border-teal-200 font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  title="إعادة نداء المريض الحالي"
                >
                  <Megaphone className="w-4 h-4" />
                  <span>إعادة النداء</span>
                </button>
              )}

              {/* SECONDARY: BACK / UNDO BUTTON */}
              <button
                type="button"
                onClick={handleUndo}
                disabled={callingInProgress || historyStack.length === 0}
                className="w-full sm:w-auto py-4 px-5 rounded-2xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                title="تراجع عن آخر نداء في حالة الخطأ"
              >
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <span>رجوع (Undo)</span>
              </button>
            </div>
          </div>

          {/* NEXT PATIENT PREVIEW CARD */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E2E8EE] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
              <span className="font-extrabold text-[#124E4A] flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#087F78]" />
                <span>المريض القادم في الطابور (Next Patient)</span>
              </span>
              <span className="text-3xs font-bold text-slate-400">
                أولوية الدخول بحسب أسبقية الحضور (FIFO)
              </span>
            </div>

            {nextPatient ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-teal-50/50 rounded-2xl border border-teal-100">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-teal-100/80 text-[#087F78] text-base font-black font-mono flex items-center justify-center shrink-0">
                    #{nextPatient.queueNumber || 2}
                  </span>
                  <div>
                    <h4 className="text-sm font-black text-[#163C3A]">{nextPatient.patientName}</h4>
                    <p className="text-2xs text-[#087F78] font-semibold">
                      {nextPatient.clinicName} — {nextPatient.serviceName || 'كشف'}
                    </p>
                  </div>
                </div>

                <div className="text-right sm:text-left text-xs">
                  <span className="px-2.5 py-1 rounded-full text-3xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                    بانتظار النداء القادم
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-2">
                لا يوجد مرضى آخرين مسجلين في قائمة الانتظار لهذا اليوم.
              </p>
            )}
          </div>
        </div>

        {/* RIGHT: STATS & UPCOMING QUEUE LIST (4 Cols) */}
        <div className="lg:col-span-4 space-y-5">
          
          {/* STATS COUNTER CARD */}
          <div className="bg-white rounded-3xl border border-[#E2E8EE] p-5 shadow-2xs space-y-4">
            <h4 className="text-xs font-black text-[#124E4A] pb-2 border-b border-slate-100">
              إحصائيات الطابور اليومي
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-3 text-right">
                <span className="text-3xs font-bold text-amber-700 block">عدد الانتظار (Waiting)</span>
                <span className="text-2xl font-black text-amber-800 font-mono mt-1 block">
                  {totalWaitingCount}
                </span>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3 text-right">
                <span className="text-3xs font-bold text-emerald-700 block">تم الكشف (Completed)</span>
                <span className="text-2xl font-black text-emerald-800 font-mono mt-1 block">
                  {completedTodayCount}
                </span>
              </div>
            </div>
          </div>

          {/* UPCOMING QUEUE ORDERED LIST */}
          <div className="bg-white rounded-3xl border border-[#E2E8EE] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-black text-[#124E4A]">
                قائمة الانتظار بالترتيب ({activeQueue.length})
              </span>
              <span className="text-3xs text-slate-400 font-semibold">FIFO</span>
            </div>

            {activeQueue.length === 0 ? (
              <p className="text-2xs text-slate-400 text-center py-6">
                لا توجد حالات في قائمة الانتظار
              </p>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {activeQueue.map((apt, idx) => {
                  const isCurrent = currentPatient?.id === apt.id;
                  return (
                    <div
                      key={apt.id}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                        isCurrent
                          ? 'bg-teal-50 border-[#087F78] shadow-xs'
                          : 'bg-slate-50/70 border-slate-200 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-7 h-7 rounded-lg text-2xs font-black font-mono flex items-center justify-center shrink-0 ${
                          isCurrent ? 'bg-[#087F78] text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          #{apt.queueNumber || idx + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="font-bold text-[#163C3A] truncate block text-2xs">
                            {apt.patientName}
                          </span>
                          <span className="text-3xs text-slate-400 block truncate">
                            {apt.clinicName}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-left">
                        {isCurrent ? (
                          <span className="text-3xs font-extrabold text-[#087F78] bg-teal-100/70 px-2 py-0.5 rounded-md">
                            بالداخل
                          </span>
                        ) : (
                          <span className="text-3xs font-semibold text-slate-400">
                            {apt.appointmentTime || '09:00'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
