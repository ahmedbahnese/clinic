'use client';
import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { BellRing, CalendarClock, Check, Eye, EyeOff, Image as ImageIcon, Link as LinkIcon, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import type { NoticeAnnouncement, NoticeBarConfig, WebsiteSettings } from '@/types/cms';
import MediaManager from './MediaManager';
import AnnouncementPreview from './AnnouncementPreview';

type AnnouncementManagerProps = {
  initialSettings: WebsiteSettings;
  onSaved?: (settings: WebsiteSettings) => void;
};

const emptyAnnouncement = (): NoticeAnnouncement => ({
  id: `announcement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: '',
  summary: '',
  details: '',
  image_url: '',
  link_url: '',
  starts_at: '',
  ends_at: '',
  is_enabled: true,
  show_on_site: true,
  send_push: false,
});

function localValue(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function statusOf(item: NoticeAnnouncement) {
  if (item.is_enabled === false || item.show_on_site === false) return { label: 'متوقف', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  const now = Date.now();
  const start = item.starts_at ? Date.parse(item.starts_at) : NaN;
  const end = item.ends_at ? Date.parse(item.ends_at) : NaN;
  if (Number.isFinite(start) && start > now) return { label: 'مجدول', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (Number.isFinite(end) && end <= now) return { label: 'منتهي', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { label: 'منشور', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
}

export default function AnnouncementManager({ initialSettings, onSaved }: AnnouncementManagerProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoticeAnnouncement | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<NoticeAnnouncement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const announcements = useMemo(() => settings.notice_bar.announcements ?? [], [settings.notice_bar.announcements]);
  const editing = Boolean(draft);
  const startEdit = (item: NoticeAnnouncement) => { setSelectedId(item.id); setDraft({ ...item }); setMessage(null); setError(null); };
  const startNew = () => { const item = { ...emptyAnnouncement(), display: { ...settings.notice_bar.display } }; setSelectedId(item.id); setDraft(item); setMessage(null); setError(null); };
  const updateDraft = (changes: Partial<NoticeAnnouncement>) => setDraft((prev) => prev ? { ...prev, ...changes } : prev);
  const updateDraftDisplay = (field: 'placement' | 'width' | 'height', value: string) => setDraft((prev) => prev ? { ...prev, display: { ...prev.display, [field]: value } } : prev);
  const saveSettings = async (nextSettings: WebsiteSettings, success: string) => {
    setSaving(true); setError(null); setMessage(null);
    try {
      const token = localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch('/api/staff/cms/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ notice_bar: nextSettings.notice_bar }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'تعذر حفظ الإعلان');
      const saved = data.settings as WebsiteSettings;
      setSettings(saved); onSaved?.(saved); setMessage(success); setDraft(null); setSelectedId(null);
    } catch (e: any) { setError(e.message || 'تعذر حفظ الإعلان'); }
    finally { setSaving(false); }
  };
  const saveDraft = async () => {
    if (!draft || !(draft.title || draft.summary || draft.message || draft.details || draft.image_url || draft.link_url || '').trim()) { setError('أدخل صورة أو تفاصيل أو رابطًا على الأقل للإعلان'); return; }
    const next = announcements.some((item) => item.id === draft.id) ? announcements.map((item) => item.id === draft.id ? draft : item) : [...announcements, draft];
    await saveSettings({ ...settings, notice_bar: { ...settings.notice_bar, announcements: next } }, 'تم حفظ الإعلان وظهوره في قائمة الإعلانات');
  };
  const remove = async (id: string) => {
    if (!window.confirm('سيتم حذف الإعلان من الموقع. هل تريد المتابعة؟')) return;
    const next = announcements.filter((item) => item.id !== id);
    await saveSettings({ ...settings, notice_bar: { ...settings.notice_bar, announcements: next } }, 'تم حذف الإعلان');
  };
  const toggle = async (item: NoticeAnnouncement) => {
    const next = announcements.map((entry) => entry.id === item.id ? { ...entry, is_enabled: entry.is_enabled === false } : entry);
    await saveSettings({ ...settings, notice_bar: { ...settings.notice_bar, announcements: next } }, item.is_enabled === false ? 'تم تفعيل الإعلان' : 'تم إيقاف الإعلان');
  };
  const updateDisplay = async (field: 'placement' | 'width' | 'height' | 'autoplay_seconds', value: string) => {
    const nextSettings = { ...settings, notice_bar: { ...settings.notice_bar, display: { ...settings.notice_bar.display, [field]: value } } };
    await saveSettings(nextSettings, 'تم حفظ شكل ومكان شريط الإعلانات');
  };
  const updateAutoplayEnabled = async (enabled: boolean) => {
    const nextSettings = { ...settings, notice_bar: { ...settings.notice_bar, display: { ...settings.notice_bar.display, autoplay_enabled: enabled } } };
    await saveSettings(nextSettings, enabled ? 'تم تشغيل العرض التلقائي' : 'تم إيقاف العرض التلقائي');
  };
  const updateNoticeEnabled = async (enabled: boolean) => {
    await saveSettings({ ...settings, notice_bar: { ...settings.notice_bar, is_enabled: enabled } }, enabled ? 'تم تفعيل ظهور الإعلانات للزوار' : 'تم إيقاف ظهور الإعلانات للزوار');
  };
  const statusSummary = useMemo(() => ({ published: announcements.filter((x) => statusOf(x).label === 'منشور').length, scheduled: announcements.filter((x) => statusOf(x).label === 'مجدول').length, stopped: announcements.filter((x) => statusOf(x).label === 'متوقف').length, expired: announcements.filter((x) => statusOf(x).label === 'منتهي').length }), [announcements]);

  return <div className="space-y-5" dir="rtl">
    <div className="rounded-3xl border border-[#B7DCD7] bg-gradient-to-l from-[#F0FAF8] to-white p-5 shadow-xs">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-start gap-3"><div className="rounded-2xl bg-[#087F78]/10 p-3 text-[#087F78]"><BellRing className="h-6 w-6" /></div><div><h3 className="text-base font-black text-[#163C3A]">إدارة إعلانات وتنبيهات المستشفى</h3><p className="mt-1 text-xs leading-5 text-[#5A6E85]">النشر داخل الموقع مستقل عن التنبيه العاجل وإرسال Push. الإعلانات النشطة تظهر ككروت متداخلة في المكان المختار.</p></div></div>
        <button type="button" onClick={startNew} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#087F78] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#066560]"><Plus className="h-4 w-4" />إضافة إعلان جديد</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center text-[11px] sm:grid-cols-4"><div className="rounded-xl bg-white p-2"><b className="block text-emerald-700">{statusSummary.published}</b>منشور</div><div className="rounded-xl bg-white p-2"><b className="block text-blue-700">{statusSummary.scheduled}</b>مجدول</div><div className="rounded-xl bg-white p-2"><b className="block text-amber-700">{statusSummary.expired}</b>منتهي</div><div className="rounded-xl bg-white p-2"><b className="block text-slate-700">{statusSummary.stopped}</b>متوقف</div></div>
    </div>
    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{message}</div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"><div className="mb-3 flex items-center gap-2 text-sm font-black text-[#163C3A]"><CalendarClock className="h-4 w-4 text-[#087F78]" />إعدادات مستطيل العرض في الصفحة الرئيسية</div><div className="mb-3 rounded-xl bg-teal-50 px-3 py-2 text-xs font-bold text-[#163C3A]"><label className="flex items-center gap-2"><input type="checkbox" checked={settings.notice_bar.is_enabled !== false} onChange={(e) => void updateNoticeEnabled(e.target.checked)} />تفعيل منطقة الإعلانات Carousel للزوار</label></div><div className="grid gap-3 md:grid-cols-3"><label className="text-xs font-bold text-[#5A6E85]">المكان<select value={settings.notice_bar.display?.placement || 'top'} onChange={(e) => void updateDisplay('placement', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#163C3A]"><option value="top">أعلى الصفحة</option><option value="below_header">أسفل الشريط الرئيسي</option><option value="after_hero">بعد البانر الرئيسي</option><option value="after_primary_actions">بعد بطاقات الخدمات</option><option value="after_clinics">بعد بطاقات العيادات</option><option value="after_how_it_works">بعد طريقة الحجز</option><option value="before_footer">قبل التذييل</option><option value="floating">مستطيل عائم أعلى الشاشة</option></select></label><label className="text-xs font-bold text-[#5A6E85]">العرض<select value={settings.notice_bar.display?.width || 'full'} onChange={(e) => void updateDisplay('width', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#163C3A]"><option value="full">بعرض الشاشة</option><option value="contained">مستطيل ثابت داخل المحتوى</option></select></label><label className="text-xs font-bold text-[#5A6E85]">الارتفاع<select value={settings.notice_bar.display?.height || 'standard'} onChange={(e) => void updateDisplay('height', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#163C3A]"><option value="standard">قياسي</option><option value="compact">مضغوط</option></select></label><label className="text-xs font-bold text-[#5A6E85]">مدة الانتقال<select value={settings.notice_bar.display?.autoplay_seconds || 5} onChange={(e) => void updateDisplay('autoplay_seconds', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#163C3A]"><option value="3">3 ثوانٍ</option><option value="5">5 ثوانٍ</option><option value="8">8 ثوانٍ</option><option value="10">10 ثوانٍ</option></select></label><label className="flex items-center gap-2 self-end rounded-xl bg-teal-50 px-3 py-2 text-xs font-bold text-[#163C3A]"><input type="checkbox" checked={settings.notice_bar.display?.autoplay_enabled !== false} onChange={(e) => void updateAutoplayEnabled(e.target.checked)} />تشغيل العرض التلقائي</label></div></div>
    {editing && draft && <div className="space-y-4 rounded-3xl border border-[#E2E8EE] bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between"><h4 className="text-sm font-black text-[#163C3A]">{announcements.some((x) => x.id === draft.id) ? 'تعديل الإعلان' : 'إضافة إعلان جديد'}</h4><button type="button" onClick={() => setDraft(null)} aria-label="إلغاء" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold text-[#5A6E85]">العنوان (اختياري)<input value={draft.title} onChange={(e) => updateDraft({ title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-[#163C3A]" /></label>
        <label className="text-xs font-bold text-[#5A6E85]">النص المختصر (اختياري)<input value={draft.summary || draft.message || ''} onChange={(e) => updateDraft({ summary: e.target.value, message: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-[#163C3A]" /></label>
        <label className="text-xs font-bold text-[#5A6E85] md:col-span-2">التفاصيل<textarea rows={3} value={draft.details || ''} onChange={(e) => updateDraft({ details: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-[#163C3A]" /></label>
        <div className="text-xs font-bold text-[#5A6E85] md:col-span-2">الصورة من مكتبة الوسائط (GIF / APNG / WebP المتحركة مدعومة)<div className="mt-1 flex gap-2"><input value={draft.image_url || ''} onChange={(e) => updateDraft({ image_url: e.target.value })} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-normal text-[#163C3A]" placeholder="اختر صورة من المكتبة" /><button type="button" onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-[#087F78]"><ImageIcon className="h-4 w-4" />اختيار</button></div></div>
        <label className="text-xs font-bold text-[#5A6E85]">الرابط الاختياري<input value={draft.link_url || (draft as NoticeAnnouncement & { link?: string }).link || ''} onChange={(e) => updateDraft({ link_url: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-[#163C3A]" placeholder="https://... أو /appointments/new" /></label>
        <label className="text-xs font-bold text-[#5A6E85]">بداية العرض<input type="datetime-local" value={localValue(draft.starts_at)} onChange={(e) => updateDraft({ starts_at: e.target.value ? new Date(e.target.value).toISOString() : '' })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-[#163C3A]" /></label>
        <label className="text-xs font-bold text-[#5A6E85]">نهاية العرض<input type="datetime-local" value={localValue(draft.ends_at)} onChange={(e) => updateDraft({ ends_at: e.target.value ? new Date(e.target.value).toISOString() : '' })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-[#163C3A]" /></label>
        <label className="text-xs font-bold text-[#5A6E85]">مكان هذا الإعلان<select value={draft.display?.placement || settings.notice_bar.display?.placement || 'top'} onChange={(e) => updateDraftDisplay('placement', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal text-[#163C3A]"><option value="top">أعلى الصفحة</option><option value="below_header">أسفل الشريط الرئيسي</option><option value="after_hero">بعد البانر الرئيسي</option><option value="after_primary_actions">بعد بطاقات الخدمات</option><option value="after_clinics">بعد بطاقات العيادات</option><option value="after_how_it_works">بعد طريقة الحجز</option><option value="before_footer">قبل التذييل</option><option value="floating">مستطيل عائم أعلى الشاشة</option></select></label>
        <label className="text-xs font-bold text-[#5A6E85]">حجم مستطيل هذا الإعلان<select value={draft.display?.width || settings.notice_bar.display?.width || 'full'} onChange={(e) => updateDraftDisplay('width', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal text-[#163C3A]"><option value="full">بعرض الشاشة</option><option value="contained">مستطيل ثابت داخل المحتوى</option></select></label>
        <label className="text-xs font-bold text-[#5A6E85]">ارتفاع المستطيل<select value={draft.display?.height || settings.notice_bar.display?.height || 'standard'} onChange={(e) => updateDraftDisplay('height', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal text-[#163C3A]"><option value="standard">قياسي</option><option value="compact">مضغوط</option></select></label>
      </div>
      <div className="flex flex-wrap gap-4 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-[#163C3A]"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.is_enabled !== false} onChange={(e) => updateDraft({ is_enabled: e.target.checked })} />تفعيل الإعلان</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.show_on_site !== false} onChange={(e) => updateDraft({ show_on_site: e.target.checked })} />نشر داخل الموقع</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.image_3d === true} onChange={(e) => updateDraft({ image_3d: e.target.checked })} />تأثير صورة 3D</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.image_frameless === true} onChange={(e) => updateDraft({ image_frameless: e.target.checked })} />عرض الصورة بدون إطار</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.send_push === true} onChange={(e) => updateDraft({ send_push: e.target.checked })} />تحديده لإرسال Push لاحقًا</label><span className="basis-full text-[10px] font-normal text-slate-500">حفظ الإعلان لا يرسل Push تلقائيًا؛ الإرسال يتم من تبويب الإشعارات الحالي.</span></div>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPreview(draft)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-[#163C3A]"><Eye className="h-4 w-4" />معاينة قبل النشر</button><button type="button" disabled={saving} onClick={() => void saveDraft()} className="inline-flex items-center gap-2 rounded-xl bg-[#087F78] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'جاري الحفظ...' : 'حفظ الإعلان'}</button></div>
      {pickerOpen && <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50/30 p-3"><MediaManager isModal={false} onSelectAsset={(url) => { updateDraft({ image_url: url }); setPickerOpen(false); }} /></div>}
    </div>}
    <div className="space-y-3">{announcements.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">لا توجد إعلانات مضافة. سيستمر التنبيه القديم بالظهور وفق إعداداته.</div> : announcements.map((item) => { const state = statusOf(item); return <article key={item.id} className="flex flex-col gap-4 rounded-2xl border border-[#E2E8EE] bg-white p-4 shadow-xs md:flex-row md:items-center"><div className="flex min-w-0 flex-1 items-center gap-3">{item.image_url ? <Image src={item.image_url} alt="" width={64} height={48} unoptimized className="h-12 w-16 rounded-lg object-cover" /> : <div className="flex h-12 w-16 items-center justify-center rounded-lg bg-teal-50 text-[#087F78]"><BellRing className="h-5 w-5" /></div>}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h5 className="truncate text-sm font-black text-[#163C3A]">{item.title || 'بدون عنوان'}</h5><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${state.cls}`}>{state.label}</span></div><p className="mt-1 truncate text-xs text-slate-500">{item.summary || item.message}</p><p className="mt-1 text-[10px] text-slate-400">{item.starts_at ? `من ${new Date(item.starts_at).toLocaleString('ar-EG')}` : 'يبدأ فوراً'}{item.ends_at ? ` — حتى ${new Date(item.ends_at).toLocaleString('ar-EG')}` : ''}</p></div></div><div className="flex shrink-0 flex-wrap gap-1.5"><button type="button" onClick={() => setPreview(item)} className="rounded-lg border border-slate-200 p-2 text-[#087F78]" title="معاينة"><Eye className="h-4 w-4" /></button><button type="button" onClick={() => startEdit(item)} className="rounded-lg border border-slate-200 p-2 text-slate-600" title="تعديل"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void toggle(item)} className="rounded-lg border border-slate-200 p-2 text-amber-700" title={item.is_enabled === false ? 'تفعيل' : 'إيقاف'}>{item.is_enabled === false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button><button type="button" onClick={() => void remove(item.id)} className="rounded-lg border border-red-200 p-2 text-red-600" title="حذف"><Trash2 className="h-4 w-4" /></button></div></article>; })}</div>
    {preview && <AnnouncementPreview announcement={preview} onClose={() => setPreview(null)} />}
  </div>;
}
