"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, ClipboardCheck, Loader2, ShieldCheck } from "lucide-react";
import { BookingReceipt } from "@/components/BookingReceipt";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Tracking = {
  patient_name: string;
  appointment_date: string;
  clinic_name: string;
  service_name: string;
  status: string;
  instructions: string;
  required_documents: string[];
};

const labels: Record<string, string> = {
  pending: "في انتظار التأكيد",
  confirmed: "تم التأكيد",
  cancelled: "ملغى",
  completed: "تمت الخدمة",
  no_show: "لم يحضر",
};

export default function TrackPage() {
  const [token, setToken] = useState("");
  const [record, setRecord] = useState<Tracking | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setRecord(null);
    const client = createSupabaseBrowserClient();
    if (!client) {
      setMessage("لم تُضبط خدمة Supabase بعد. أضف المتغيرات في البيئة وفق README.");
      return;
    }
    if (!token.trim()) {
      setMessage("أدخل رمز المتابعة.");
      return;
    }

    setLoading(true);
    try {
      const response = await client.rpc("track_booking", { p_tracking_token: token.trim() });
      if (response.error) {
        setMessage("تعذر تنفيذ المتابعة الآن. حاول لاحقًا.");
        return;
      }
      const row = Array.isArray(response.data) ? response.data[0] : response.data;
      if (!row) {
        setMessage("لم نجد طلبًا نشطًا بهذا الرمز.");
        return;
      }
      setRecord(row as Tracking);
    } catch {
      setMessage("تعذر الاتصال بخدمة المتابعة. حاول لاحقًا.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="form-page">
      <div className="page-shell">
        <Link className="back-link no-print" href="/"><ArrowRight size={17} /> العودة للرئيسية</Link>
        <div className="page-heading no-print">
          <span className="page-icon"><ClipboardCheck size={22} /></span>
          <div><span className="section-kicker">متابعة آمنة</span><h1>متابعة الحجز</h1><p>استخدم رمز المتابعة الذي ظهر لك بعد إرسال الطلب.</p></div>
        </div>
        <div className="info-banner no-print"><ShieldCheck size={20} /><span>لا نستخدم رقم الهاتف وحده للوصول إلى بيانات الحجز، ولا نضع الرمز في عنوان الصفحة.</span></div>
        <form className="tracking-form no-print" onSubmit={(event) => void lookup(event)}>
          <label>رمز المتابعة<input value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" required dir="ltr" /></label>
          <button className="button button-primary" disabled={loading}>{loading ? <><Loader2 className="spin" /> جارٍ التحقق...</> : "عرض حالة الطلب"}</button>
        </form>
        {message && <div className="error-banner no-print" role="alert">{message}</div>}
        {record && (
          <>
            <article className="tracking-card no-print">
              <span className={`status-pill status-${record.status}`}>{labels[record.status] ?? record.status}</span>
              <h2>{record.patient_name}</h2>
              <dl><dt>العيادة</dt><dd>{record.clinic_name}</dd><dt>الخدمة</dt><dd>{record.service_name}</dd><dt>يوم الحجز</dt><dd>{record.appointment_date}</dd></dl>
              {record.required_documents?.length > 0 && <div><strong>الأوراق المطلوبة</strong><ul>{record.required_documents.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>}
              {record.instructions && <div><strong>تعليمات الحضور</strong><p className="preserve-lines">{record.instructions}</p></div>}
            </article>
            {record.status === "confirmed" && <BookingReceipt booking={record} />}
          </>
        )}
      </div>
    </main>
  );
}
