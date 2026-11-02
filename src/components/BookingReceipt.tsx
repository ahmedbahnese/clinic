"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircle2, Printer, Share2 } from "lucide-react";

type ReceiptDetails = {
  patient_name: string;
  appointment_date: string;
  clinic_name: string;
  service_name: string;
  status: string;
  instructions: string;
  required_documents: string[];
};

const hospitalName = "مستشفى الأطفال التخصصي بالبحيرة";
const statusLabels: Record<string, string> = {
  pending: "في انتظار التأكيد",
  confirmed: "تم التأكيد",
};

function formatDate(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Africa/Cairo",
  }).format(value);
}

export function BookingReceipt({ booking }: { booking: ReceiptDetails }) {
  const [message, setMessage] = useState("");
  const status = statusLabels[booking.status] ?? booking.status;

  async function shareReceipt() {
    const details = [
      hospitalName,
      "إيصال حجز — العيادات الخارجية | BSCH Clinics",
      `الحالة: ${status}`,
      `اسم المريض: ${booking.patient_name}`,
      `العيادة: ${booking.clinic_name}`,
      `الخدمة: ${booking.service_name}`,
      `يوم الحجز: ${formatDate(booking.appointment_date)}`,
      ...(booking.required_documents.length
        ? [`الأوراق المطلوبة: ${booking.required_documents.join("، ")}`]
        : []),
      ...(booking.instructions ? [`تعليمات الحضور: ${booking.instructions}`] : []),
    ].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: "إيصال حجز العيادات الخارجية", text: details });
        setMessage("تم فتح قائمة المشاركة على جهازك.");
      } else {
        await navigator.clipboard.writeText(details);
        setMessage("نسخنا تفاصيل الإيصال. يمكنك لصقها في تطبيق المشاركة.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("تعذرت المشاركة من هذا المتصفح. استخدم الطباعة أو احفظ الإيصال PDF.");
    }
  }

  return (
    <section className="receipt-wrap" aria-labelledby="receipt-title">
      <div className="receipt-actions no-print">
        <button type="button" className="button button-primary" onClick={() => window.print()}>
          <Printer size={17} /> طباعة / حفظ PDF
        </button>
        <button type="button" className="button button-outline" onClick={() => void shareReceipt()}>
          <Share2 size={17} /> مشاركة الإيصال
        </button>
      </div>
      {message && <p className="receipt-share-message no-print" role="status">{message}</p>}
      <article className="receipt-print-area" dir="rtl">
        <header className="receipt-header">
          <Image src="/images/hospital-logo.png" alt="شعار المستشفى" width={76} height={76} />
          <div>
            <strong>{hospitalName}</strong>
            <span>العيادات الخارجية | BSCH CLINICS</span>
          </div>
          <span className="receipt-confirmed"><CheckCircle2 size={16} />{status}</span>
        </header>
        <div className="receipt-title-row">
          <div>
            <span className="section-kicker">إيصال الحجز</span>
            <h2 id="receipt-title">تأكيد موعد العيادات الخارجية</h2>
          </div>
          <span className="receipt-date">{formatDate(booking.appointment_date)}</span>
        </div>
        <dl className="receipt-details">
          <dt>اسم المريض/ة</dt><dd>{booking.patient_name}</dd>
          <dt>العيادة</dt><dd>{booking.clinic_name}</dd>
          <dt>الخدمة</dt><dd>{booking.service_name}</dd>
          <dt>يوم الحجز</dt><dd>{formatDate(booking.appointment_date)}</dd>
          <dt>حالة الطلب</dt><dd>{status}</dd>
        </dl>
        {booking.required_documents.length > 0 && (
          <section className="receipt-note"><h3>الأوراق المطلوبة</h3><ul>{booking.required_documents.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>
        )}
        {booking.instructions && <section className="receipt-note"><h3>تعليمات الحضور</h3><p>{booking.instructions}</p></section>}
        <footer className="receipt-footer">احتفظ بهذا الإيصال وراجع تعليمات العيادة قبل الحضور.</footer>
      </article>
      <p className="receipt-privacy no-print">لا يتضمن الإيصال رقم الهاتف أو العنوان أو رقم الانتظار. شارك التفاصيل فقط مع من تختار.</p>
    </section>
  );
}
