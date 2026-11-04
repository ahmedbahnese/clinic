'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { toPng } from 'html-to-image';
import {
  Printer,
  Download,
  Share2,
  FileText,
  Info,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Copy,
  Check,
} from 'lucide-react';
import { Appointment } from '@/types';
import { formatArabicDate } from '@/lib/rules';

export interface ReceiptCardProps {
  appointment: Appointment;
  phoneQuery?: string;
  canCancel?: boolean;
  onCancelRequest?: () => void;
  extraActions?: React.ReactNode;
}

export default function ReceiptCard({
  appointment,
  phoneQuery,
  canCancel = false,
  onCancelRequest,
  extraActions,
}: ReceiptCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  // Download Image Handler (html-to-image)
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    setDownloadingImage(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `BSCH-Receipt-${appointment.phoneNumber || phoneQuery || 'booking'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error generating receipt image:', err);
      // Fallback to print
      window.print();
    } finally {
      setDownloadingImage(false);
    }
  };

  // Share Handler
  const handleShare = async () => {
    const sharePhone = appointment.phoneNumber || phoneQuery || '';
    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/appointments/track?phone=${sharePhone}`
      : '';

    const shareText = `إيصال حجز بمستشفى الأطفال التخصصي بالبحيرة\n• اسم الطفل: ${appointment.patientName}\n• العيادة: ${appointment.clinicName}\n• الخدمة: ${appointment.serviceName || 'كشف واستشارة طبية'}\n• تاريخ الحضور: ${formatArabicDate(appointment.appointmentDate)}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `إيصال حجز - ${appointment.patientName}`,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard if share was cancelled or unsupported
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      } catch {
        // Ignore clipboard failure
      }
    }
  };

  const isConfirmed = appointment.status === 'CONFIRMED' || appointment.status === 'CHECKED_IN';
  const isCancelled = appointment.status === 'CANCELLED';
  const isCompleted = appointment.status === 'COMPLETED';

  return (
    <div className="w-full space-y-4">
      {/* The Printable Receipt Card Frame */}
      <div
        ref={cardRef}
        id="printable-receipt"
        className="printable-receipt-card bg-white rounded-3xl border-2 border-teal-600/30 p-6 sm:p-8 space-y-5 shadow-xs relative overflow-hidden"
      >
        {/* Hospital Official Branding Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-main.png"
              alt="شعار مستشفى الأطفال التخصصي بالبحيرة"
              width={52}
              height={52}
              className="w-11 h-11 sm:w-13 sm:h-13 object-contain shrink-0"
              priority
            />
            <div>
              <h3 className="text-sm sm:text-base font-black text-[#124E4A] leading-tight">
                مستشفى الأطفال التخصصي بالبحيرة
              </h3>
              <p className="text-3xs sm:text-2xs text-slate-500 font-semibold mt-0.5">
                بوابة العيادات الخارجية — إيصال وتذكرة مراجعة الحجز
              </p>
            </div>
          </div>
          <div className="text-left font-mono">
            <span className="text-[10px] text-slate-400 block font-semibold">تاريخ الاستخراج</span>
            <span className="text-xs font-bold text-[#163C3A]">{new Date().toLocaleDateString('ar-EG')}</span>
          </div>
        </div>

        {/* Status Badge Strip */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-4 border-b border-slate-100">
          <div>
            <h4 className="text-xs sm:text-sm font-extrabold text-[#124E4A]">
              بيانات إيصال الحجز الإلكتروني
            </h4>
            <p className="text-3xs sm:text-2xs text-slate-500">
              يرجى إبراز هذا الإيصال عند الحضور لشباك الاستقبال بالعيادات
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isConfirmed ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>حجز مؤكد ومعتمد</span>
              </span>
            ) : isCancelled ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-300">
                <XCircle className="w-3.5 h-3.5 text-red-600" />
                <span>تم إلغاء الحجز</span>
              </span>
            ) : isCompleted ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                <span>مكتمل (تم الكشف)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>قيد المراجعة والاعتماد</span>
              </span>
            )}
          </div>
        </div>

        {/* Patient and Clinic Details Grid (Full unmasked details; Guardian NID strictly omitted) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs py-1">
          <div>
            <span className="text-slate-400 block text-3xs font-semibold mb-0.5">اسم الطفل / المريض</span>
            <strong className="text-sm font-extrabold text-[#163C3A] block">
              {appointment.patientName}
            </strong>
          </div>

          <div>
            <span className="text-slate-400 block text-3xs font-semibold mb-0.5">رقم هاتف ولي الأمر المعتمد</span>
            <strong className="text-xs font-mono font-bold text-[#163C3A] block">
              {appointment.phoneNumber || phoneQuery}
            </strong>
          </div>

          {appointment.patientAge && (
            <div>
              <span className="text-slate-400 block text-3xs font-semibold mb-0.5">العمر</span>
              <strong className="text-xs font-bold text-[#163C3A] block">
                {appointment.patientAge}
              </strong>
            </div>
          )}

          {appointment.patientAddress && (
            <div>
              <span className="text-slate-400 block text-3xs font-semibold mb-0.5">العنوان المسجل</span>
              <strong className="text-xs font-bold text-[#163C3A] block">
                {appointment.patientAddress}
              </strong>
            </div>
          )}

          <div>
            <span className="text-slate-400 block text-3xs font-semibold mb-0.5">العيادة التخصصية</span>
            <strong className="text-xs font-bold text-[#087F78] block">
              {appointment.clinicName}
            </strong>
          </div>

          <div>
            <span className="text-slate-400 block text-3xs font-semibold mb-0.5">الخدمة أو الفحص المطلوب</span>
            <strong className="text-xs font-bold text-[#163C3A] block">
              {appointment.serviceName || 'كشف واستشارة طبية'}
            </strong>
          </div>

          <div className="sm:col-span-2 p-3.5 rounded-2xl bg-teal-50/70 border border-teal-100">
            <span className="text-3xs font-bold text-[#087F78] block mb-0.5">تاريخ وموعد الحضور</span>
            <p className="text-xs sm:text-sm font-bold text-[#124E4A]">
              {formatArabicDate(appointment.appointmentDate)} — الحضور صباحاً بأسبقية التسجيل في شباك الاستقبال بالمستشفى
            </p>
          </div>
        </div>

        {/* Required Documents Section */}
        {appointment.requiredDocuments && appointment.requiredDocuments.length > 0 && (
          <div className="pt-3 border-t border-slate-100 text-xs">
            <span className="font-bold text-[#124E4A] flex items-center gap-1.5 mb-1.5">
              <FileText className="w-3.5 h-3.5 text-[#087F78]" />
              <span>الأوراق والمستندات المطلوبة عند الحضور:</span>
            </span>
            <ul className="list-disc list-inside space-y-0.5 pr-1 text-slate-700 text-2xs">
              {appointment.requiredDocuments.map((doc, idx) => (
                <li key={idx} className="font-medium">{doc}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Service Instructions */}
        {appointment.serviceInstructions && (
          <div className="pt-2 text-xs">
            <div className="bg-teal-50/60 p-3 rounded-xl border border-teal-100/80 text-teal-950">
              <p className="font-bold text-[#124E4A] mb-1 flex items-center gap-1 text-2xs">
                <Info className="w-3.5 h-3.5 text-[#087F78]" />
                <span>تعليمات الخدمة والتحضير الطبي:</span>
              </p>
              <p className="text-2xs leading-relaxed whitespace-pre-line font-medium">
                {appointment.serviceInstructions}
              </p>
            </div>
          </div>
        )}

        {/* Hospital Address Footer */}
        <div className="pt-4 border-t border-slate-100 text-center text-3xs text-slate-400 leading-relaxed font-semibold">
          أبو حمص – دمسنا – محافظة البحيرة • مستشفى الأطفال التخصصي
        </div>
      </div>

      {/* Action Toolbar (Strictly hidden during printing) */}
      <div className="no-print pt-2 flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 text-xs sm:text-sm font-bold text-[#163C3A] bg-white hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
        >
          <Printer className="w-4 h-4 text-[#087F78]" />
          <span>طباعة التذكرة</span>
        </button>

        <button
          type="button"
          disabled={downloadingImage}
          onClick={handleDownloadImage}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-teal-200 text-xs sm:text-sm font-bold text-[#087F78] bg-teal-50/60 hover:bg-teal-100 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
        >
          <Download className="w-4 h-4 text-[#087F78]" />
          <span>{downloadingImage ? 'جاري التحميل...' : 'تحميل كصورة (PNG)'}</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 text-xs sm:text-sm font-bold text-[#163C3A] bg-white hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
        >
          {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4 text-[#087F78]" />}
          <span>{copiedLink ? 'تم نسخ الرابط' : 'مشاركة التذكرة'}</span>
        </button>

        {/* Cancellation Button if enabled */}
        {canCancel && onCancelRequest && !isCancelled && !isCompleted && (
          <button
            type="button"
            onClick={onCancelRequest}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 transition-colors cursor-pointer"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>طلب إلغاء الحجز</span>
          </button>
        )}

        {extraActions}
      </div>
    </div>
  );
}
