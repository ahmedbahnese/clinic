'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AlertTriangle, BellRing, ImagePlus, Send, X } from 'lucide-react';
import MediaManager from './MediaManager';

export default function PushNotificationEditor() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    if (!window.confirm('سيُرسل هذا الإعلان العام إلى جميع الأجهزة المشتركة. تأكد من عدم احتوائه على اسم مريض أو رقم هاتف أو أي معلومة شخصية/طبية. هل تريد الإرسال؟')) return;

    setSending(true);
    try {
      const token = localStorage.getItem('bsch_staff_token') || '';
      const response = await fetch('/api/staff/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title, body, imageUrl: imageUrl || undefined }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'تعذر إرسال الإشعار.');
      setFeedback({ ok: true, text: `تم الإرسال إلى ${data.sent} جهاز${data.failed ? `، وتعذر الإرسال إلى ${data.failed} جهاز` : ''}.` });
      setTitle('');
      setBody('');
      setImageUrl('');
    } catch (error) {
      setFeedback({ ok: false, text: error instanceof Error ? error.message : 'حدث خطأ غير متوقع.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-3xl border border-[#E2E8EE] bg-white p-5 shadow-sm sm:p-7" dir="rtl">
      <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#087F78]/10 text-[#087F78]"><BellRing className="h-5 w-5" /></span>
        <div>
          <h3 className="text-base font-extrabold text-[#163C3A]">إرسال إعلان عام للمشتركين</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">يصل الإشعار إلى الأجهزة التي وافق أصحابها على تلقي إعلانات المستشفى.</p>
        </div>
      </div>

      <div className="mb-5 flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950">
        <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />
        <p>استخدم الإشعارات لإعلانات عامة فقط. لا تضع أسماء مرضى أو أرقام حجز أو هواتف أو بيانات شخصية أو معلومات طبية. الإشعار لن يضيف بيانات من نظام المواعيد.</p>
      </div>

      {feedback && (
        <div role="status" className={`mb-4 rounded-xl border p-3 text-sm ${feedback.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {feedback.text}
        </div>
      )}

      <form onSubmit={handleSend} className="space-y-4">
        <div>
          <label htmlFor="push-title" className="mb-1.5 block text-xs font-bold text-[#52666B]">عنوان الإشعار (حتى 80 حرفًا)</label>
          <input id="push-title" required maxLength={80} minLength={2} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#087F78]" placeholder="مثال: تنبيه مهم بشأن مواعيد العيادات" />
        </div>
        <div>
          <label htmlFor="push-body" className="mb-1.5 block text-xs font-bold text-[#52666B]">نص الإشعار (حتى 240 حرفًا)</label>
          <textarea id="push-body" required minLength={2} maxLength={240} rows={4} value={body} onChange={(event) => setBody(event.target.value)} className="w-full resize-y rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none focus:border-[#087F78]" placeholder="اكتب إعلانًا عامًا واضحًا ومختصرًا." />
          <p className="mt-1 text-left text-[10px] text-slate-500">{body.length}/240</p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="block text-xs font-bold text-[#52666B]">صورة اختيارية</label>
            <button type="button" onClick={() => setShowMediaPicker(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#087F78]/30 px-3 py-2 text-xs font-bold text-[#087F78] hover:bg-[#087F78]/5">
              <ImagePlus className="h-4 w-4" /> اختيار صورة عامة
            </button>
          </div>
          {imageUrl ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <Image src={imageUrl} alt="معاينة الصورة التي سترفق بالإشعار" width={72} height={72} unoptimized className="h-16 w-16 rounded-lg object-cover" />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600" title={imageUrl}>{imageUrl}</span>
              <button type="button" onClick={() => setImageUrl('')} aria-label="إزالة الصورة" className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-red-600"><X className="h-4 w-4" /></button>
            </div>
          ) : <p className="text-[11px] leading-5 text-slate-500">تُختار الصورة من المكتبة العامة، وقد لا تعرضها بعض إصدارات iPhone أو المتصفحات؛ سيظل نص الإشعار متاحًا.</p>}
        </div>

        <button type="submit" disabled={sending || title.trim().length < 2 || body.trim().length < 2} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#087F78] px-6 text-sm font-bold text-white transition hover:bg-[#066560] disabled:cursor-not-allowed disabled:opacity-50">
          <Send className="h-4 w-4" />
          {sending ? 'جارٍ الإرسال…' : 'إرسال الإعلان العام'}
        </button>
      </form>

      <MediaManager isModal isOpen={showMediaPicker} onClose={() => setShowMediaPicker(false)} onSelectAsset={(url) => { setImageUrl(url); setShowMediaPicker(false); }} />
    </section>
  );
}
