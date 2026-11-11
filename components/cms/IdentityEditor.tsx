'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Clock,
  AlertTriangle,
  Save,
  Check,
  AlertCircle,
  RefreshCw,
  Image as ImageIcon,
  ExternalLink,
  Globe,
  Plus,
  Trash2,
} from 'lucide-react';
import type { NoticeAnnouncement, WebsiteSettings } from '@/types/cms';
import MediaManager from './MediaManager';

type MediaPickerTarget = 'header' | 'footer' | 'favicon' | { announcementId: string } | null;

function toLocalDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

interface IdentityEditorProps {
  initialSettings: WebsiteSettings;
  token?: string;
  onSaved?: (newSettings: WebsiteSettings) => void;
}

export default function IdentityEditor({ initialSettings, token, onSaved }: IdentityEditorProps) {
  const [settings, setSettings] = useState<WebsiteSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Media Picker Modal State
  const [mediaPickerTarget, setMediaPickerTarget] = useState<MediaPickerTarget>(null);

  const handleChange = (field: keyof WebsiteSettings, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNoticeBarChange = (field: keyof WebsiteSettings['notice_bar'], value: any) => {
    setSettings((prev) => ({
      ...prev,
      notice_bar: {
        ...prev.notice_bar,
        [field]: value,
      },
    }));
  };

  const updateAnnouncement = (id: string, changes: Partial<NoticeAnnouncement>) => {
    const announcements = settings.notice_bar.announcements ?? [];
    handleNoticeBarChange('announcements', announcements.map((announcement) =>
      announcement.id === id ? { ...announcement, ...changes } : announcement,
    ));
  };

  const addAnnouncement = () => {
    const announcement: NoticeAnnouncement = {
      id: `announcement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: '',
      summary: '',
    };
    handleNoticeBarChange('announcements', [...(settings.notice_bar.announcements ?? []), announcement]);
  };

  const removeAnnouncement = (id: string) => {
    handleNoticeBarChange(
      'announcements',
      (settings.notice_bar.announcements ?? []).filter((announcement) => announcement.id !== id),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const authToken = token || localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch('/api/staff/cms/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل في حفظ إعدادات الموقع والهوية');
      }

      setSuccessMsg('تم حفظ بيانات الهوية والتواصل وشريط التنبيهات ونشرها بنجاح.');
      if (data.settings) {
        setSettings(data.settings);
        if (onSaved) onSaved(data.settings);
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleAssetSelected = (url: string) => {
    if (mediaPickerTarget === 'header') {
      handleChange('header_logo_url', url);
    } else if (mediaPickerTarget === 'footer') {
      handleChange('footer_logo_url', url);
    } else if (mediaPickerTarget === 'favicon') {
      handleChange('favicon_url', url);
    } else if (mediaPickerTarget && typeof mediaPickerTarget === 'object') {
      updateAnnouncement(mediaPickerTarget.announcementId, { image_url: url });
    }
    setMediaPickerTarget(null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8" dir="rtl">
      {/* Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-xs flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs flex items-center gap-2">
          <Check className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 1. Brand Identity */}
      <div className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-[#F1F5F9]">
          <Building2 className="w-5 h-5 text-[#087F78]" />
          <h3 className="text-base font-bold text-[#163C3A]">الهوية الأساسية والشعارات</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
              اسم المنشأة الطبية (Site Name) *
            </label>
            <input
              type="text"
              required
              value={settings.site_name}
              onChange={(e) => handleChange('site_name', e.target.value)}
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-[#163C3A] focus:outline-none focus:border-[#087F78] focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
              الشعار اللفظي أو الوصف الفرعي (Site Tagline)
            </label>
            <input
              type="text"
              value={settings.site_tagline}
              onChange={(e) => handleChange('site_tagline', e.target.value)}
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-[#163C3A] focus:outline-none focus:border-[#087F78] focus:bg-white"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-[#087F78]" />
                <span>رابط موقع تعريف المستشفى الرسمي (يفتح عند الضغط على زر &quot;موقع المستشفى&quot; بالشريط العلوي)</span>
              </span>
              <span className="text-[11px] text-[#087F78] font-mono">albahira.elyoser.cloud</span>
            </label>
            <input
              type="text"
              value={settings.hospital_website_url || settings.canonical_url || ''}
              onChange={(e) => {
                const val = e.target.value;
                handleChange('hospital_website_url', val);
                handleChange('canonical_url', val);
              }}
              placeholder="https://albahira.elyoser.cloud"
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-[#163C3A] font-mono focus:outline-none focus:border-[#087F78] focus:bg-white"
            />
            <p className="text-[11px] text-[#8493A6] mt-1">
              الرابط الذي يتم فتحه للزائر عند الضغط على زر &quot;موقع المستشفى&quot; في الشريط العلوي وقوائم التنقل وبنرات الموقع.
            </p>
          </div>
        </div>

        {/* Logos Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          {/* Header Logo */}
          <div className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#163C3A]">شعار القائمة العلوية (Header)</span>
                <button
                  type="button"
                  onClick={() => setMediaPickerTarget('header')}
                  className="text-[11px] text-[#087F78] hover:text-[#066560] font-bold flex items-center gap-1"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>تغيير من المكتبة</span>
                </button>
              </div>
              <div className="h-20 bg-white border border-[#E2E8EE] rounded-xl flex items-center justify-center p-2 mb-3">
                <Image
                  src={settings.header_logo_url || '/logo-main.png'}
                  alt="Header Logo"
                  width={80}
                  height={80}
                  unoptimized
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>
            <input
              type="text"
              value={settings.header_logo_url}
              onChange={(e) => handleChange('header_logo_url', e.target.value)}
              placeholder="/logo-main.png"
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-[#163C3A] font-mono"
            />
          </div>

          {/* Footer Logo */}
          <div className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#163C3A]">شعار التذييل (Footer)</span>
                <button
                  type="button"
                  onClick={() => setMediaPickerTarget('footer')}
                  className="text-[11px] text-[#087F78] hover:text-[#066560] font-bold flex items-center gap-1"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>تغيير من المكتبة</span>
                </button>
              </div>
              <div className="h-20 bg-white border border-[#E2E8EE] rounded-xl flex items-center justify-center p-2 mb-3">
                <Image
                  src={settings.footer_logo_url || '/logo-main.png'}
                  alt="Footer Logo"
                  width={80}
                  height={80}
                  unoptimized
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>
            <input
              type="text"
              value={settings.footer_logo_url}
              onChange={(e) => handleChange('footer_logo_url', e.target.value)}
              placeholder="/logo-main.png"
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-[#163C3A] font-mono"
            />
          </div>

          {/* Favicon */}
          <div className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#163C3A]">أيقونة التبويب (Favicon)</span>
                <button
                  type="button"
                  onClick={() => setMediaPickerTarget('favicon')}
                  className="text-[11px] text-[#087F78] hover:text-[#066560] font-bold flex items-center gap-1"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>تغيير من المكتبة</span>
                </button>
              </div>
              <div className="h-20 bg-white border border-[#E2E8EE] rounded-xl flex items-center justify-center p-2 mb-3">
                <Image
                  src={settings.favicon_url || '/icon.png'}
                  alt="Favicon"
                  width={32}
                  height={32}
                  unoptimized
                  className="w-8 h-8 object-contain"
                />
              </div>
            </div>
            <input
              type="text"
              value={settings.favicon_url}
              onChange={(e) => handleChange('favicon_url', e.target.value)}
              placeholder="/logo-main.png"
              className="w-full text-xs bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-[#163C3A] font-mono"
            />
          </div>
        </div>
      </div>

      {/* 2. Contact Information & Hotline */}
      <div className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-[#F1F5F9]">
          <Phone className="w-5 h-5 text-[#087F78]" />
          <h3 className="text-base font-bold text-[#163C3A]">بيانات الاتصال والخط الساخن المركزي</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
              رقم التواصل / الخط الساخن بالمستشفى
            </label>
            <div className="relative">
              <input
                type="text"
                value={settings.emergency_hotline}
                onChange={(e) => handleChange('emergency_hotline', e.target.value)}
                placeholder="أدخل وسيلة التواصل المعتمدة"
                className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-[#163C3A] font-bold focus:outline-none focus:border-[#087F78]"
              />
            </div>
            <p className="text-[11px] text-[#8493A6] mt-1">الرقم المعتمد للتواصل المباشر مع المستشفى</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
              هاتف الاستعلامات العادي
            </label>
            <input
              type="text"
              value={settings.contact_phone}
              onChange={(e) => handleChange('contact_phone', e.target.value)}
              placeholder="أدخل هاتف الاستعلامات الرسمي"
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-[#163C3A] focus:outline-none focus:border-[#087F78] focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
              البريد الإلكتروني الرسمي
            </label>
            <input
              type="email"
              value={settings.contact_email}
              onChange={(e) => handleChange('contact_email', e.target.value)}
              placeholder="أدخل البريد الإلكتروني الرسمي"
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-[#163C3A] focus:outline-none focus:border-[#087F78] focus:bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          <div>
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#087F78]" />
              <span>عنوان المستشفى الرسمي</span>
            </label>
            <input
              type="text"
              value={settings.hospital_address}
              onChange={(e) => handleChange('hospital_address', e.target.value)}
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-[#163C3A] focus:outline-none focus:border-[#087F78] focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#087F78]" />
              <span>مواعيد العمل الرسمية للعيادات</span>
            </label>
            <input
              type="text"
              value={settings.working_hours}
              onChange={(e) => handleChange('working_hours', e.target.value)}
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-[#163C3A] focus:outline-none focus:border-[#087F78] focus:bg-white"
            />
          </div>
        </div>
      </div>

      {/* 3. Notice Bar (Top Urgent Announcement Banner) */}
      <div className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-bold text-[#163C3A]">شريط التنبيهات العاجل (NoticeBar)</h3>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs font-bold text-[#163C3A]">
              {settings.notice_bar.is_enabled ? 'مفعّل ويظهر أعلى الصفحة' : 'معطّل ومخفي'}
            </span>
            <input
              type="checkbox"
              checked={settings.notice_bar.is_enabled}
              onChange={(e) => handleNoticeBarChange('is_enabled', e.target.checked)}
              className="w-4 h-4 text-[#087F78] rounded-md focus:ring-[#087F78]"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
              عنوان التنبيه البارز
            </label>
            <input
              type="text"
              value={settings.notice_bar.title}
              onChange={(e) => handleNoticeBarChange('title', e.target.value)}
              placeholder="مثال: تنبيه مواعيد العمل:"
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-[#163C3A] focus:outline-none focus:border-[#087F78] focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
              نص الخط الساخن المرافق
            </label>
            <input
              type="text"
              value={settings.notice_bar.hotline_label}
              onChange={(e) => handleNoticeBarChange('hotline_label', e.target.value)}
              placeholder="مستشفى الأطفال التخصصي — دمسنا"
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-[#163C3A] focus:outline-none focus:border-[#087F78] focus:bg-white"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
              نص رسالة التنبيه التفصيلية
            </label>
            <textarea
              rows={2}
              value={settings.notice_bar.message}
              onChange={(e) => handleNoticeBarChange('message', e.target.value)}
              placeholder="الحجز الإلكتروني متاح بنظام تذاكر الدور وأسبقية الحضور اليومي بالعيادات التخصصية."
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-3 text-[#163C3A] focus:outline-none focus:border-[#087F78] focus:bg-white resize-y"
            />
          </div>
        </div>

        <div className="space-y-4 border-t border-[#F1F5F9] pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-[#163C3A]">إعلانات وتنبيهات المستشفى</h4>
              <p className="mt-1 text-[11px] leading-5 text-[#8493A6]">
                تظهر الإعلانات التي تقع ضمن موعدها فقط؛ وعند عدم وجود إعلان نشط يظهر التنبيه القديم أعلاه.
              </p>
            </div>
            <button
              type="button"
              onClick={addAnnouncement}
              className="inline-flex items-center gap-2 rounded-xl border border-[#087F78]/30 px-3 py-2 text-xs font-bold text-[#087F78] hover:bg-[#087F78]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
            >
              <Plus className="h-4 w-4" />
              إضافة إعلان
            </button>
          </div>

          {(settings.notice_bar.announcements ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 text-xs text-[#8493A6]">
              لا توجد إعلانات إضافية. سيستمر عرض التنبيه القديم وفق الحقول أعلاه.
            </p>
          ) : (
            <div className="space-y-4">
              {(settings.notice_bar.announcements ?? []).map((announcement, index) => (
                <article key={announcement.id} className="space-y-4 rounded-2xl border border-[#E2E8EE] bg-[#F8FAFC] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="text-xs font-bold text-[#163C3A]">الإعلان {index + 1}</h5>
                    <button
                      type="button"
                      onClick={() => removeAnnouncement(announcement.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      aria-label={`حذف الإعلان ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف الإعلان
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor={`notice-title-${announcement.id}`} className="mb-1.5 block text-xs font-semibold text-[#5A6E85]">عنوان الإعلان</label>
                      <input
                        id={`notice-title-${announcement.id}`}
                        type="text"
                        value={announcement.title}
                        onChange={(event) => updateAnnouncement(announcement.id, { title: event.target.value })}
                        placeholder="مثال: تعديل مواعيد العيادات"
                        className="w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm text-[#163C3A] focus:border-[#087F78] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor={`notice-image-${announcement.id}`} className="mb-1.5 block text-xs font-semibold text-[#5A6E85]">رابط الصورة (اختياري)</label>
                      <div className="flex gap-2">
                        <input
                          id={`notice-image-${announcement.id}`}
                          type="text"
                          value={announcement.image_url ?? ''}
                          onChange={(event) => updateAnnouncement(announcement.id, { image_url: event.target.value })}
                          placeholder="اختر صورة من مكتبة الوسائط"
                          className="min-w-0 flex-1 rounded-xl border border-[#CBD5E1] bg-white px-3 py-2.5 text-xs text-[#163C3A] focus:border-[#087F78] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setMediaPickerTarget({ announcementId: announcement.id })}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#087F78]/30 bg-white px-3 text-[11px] font-bold text-[#087F78] hover:bg-[#087F78]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
                          aria-label={`اختيار صورة للإعلان ${index + 1} من مكتبة الوسائط`}
                        >
                          <ImageIcon className="h-4 w-4" />
                          المكتبة
                        </button>
                      </div>
                      {announcement.image_url && (
                        <Image src={announcement.image_url} alt="معاينة صورة الإعلان" width={96} height={64} unoptimized className="mt-2 h-16 w-24 rounded-lg border border-[#E2E8EE] bg-white object-cover" />
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor={`notice-summary-${announcement.id}`} className="mb-1.5 block text-xs font-semibold text-[#5A6E85]">النص المختصر / الرسالة</label>
                      <textarea
                        id={`notice-summary-${announcement.id}`}
                        rows={2}
                        value={announcement.summary ?? announcement.message ?? ''}
                        onChange={(event) => updateAnnouncement(announcement.id, { summary: event.target.value })}
                        placeholder="اكتب ملخصًا واضحًا يظهر في الشريط"
                        className="w-full resize-y rounded-xl border border-[#CBD5E1] bg-white p-3 text-sm text-[#163C3A] focus:border-[#087F78] focus:outline-none"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor={`notice-details-${announcement.id}`} className="mb-1.5 block text-xs font-semibold text-[#5A6E85]">التفاصيل الإضافية (اختياري)</label>
                      <textarea
                        id={`notice-details-${announcement.id}`}
                        rows={3}
                        value={announcement.details ?? ''}
                        onChange={(event) => updateAnnouncement(announcement.id, { details: event.target.value })}
                        placeholder="تظهر عند فتح الإعلان إذا لم يُضف رابط"
                        className="w-full resize-y rounded-xl border border-[#CBD5E1] bg-white p-3 text-sm text-[#163C3A] focus:border-[#087F78] focus:outline-none"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor={`notice-link-${announcement.id}`} className="mb-1.5 block text-xs font-semibold text-[#5A6E85]">رابط آمن (اختياري)</label>
                      <input
                        id={`notice-link-${announcement.id}`}
                        type="text"
                        value={announcement.link_url ?? ''}
                        onChange={(event) => updateAnnouncement(announcement.id, { link_url: event.target.value })}
                        placeholder="/صفحة-داخلية أو https://example.gov.eg"
                        className="w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm text-[#163C3A] focus:border-[#087F78] focus:outline-none"
                      />
                      <p className="mt-1 text-[10px] text-[#8493A6]">تُقبل المسارات الداخلية أو روابط http/https؛ دون رابط تُفتح تفاصيل الإعلان.</p>
                    </div>

                    <div>
                      <label htmlFor={`notice-start-${announcement.id}`} className="mb-1.5 block text-xs font-semibold text-[#5A6E85]">بداية العرض (اختياري)</label>
                      <input
                        id={`notice-start-${announcement.id}`}
                        type="datetime-local"
                        value={toLocalDateTime(announcement.starts_at)}
                        onChange={(event) => updateAnnouncement(announcement.id, { starts_at: toIsoDateTime(event.target.value) })}
                        className="w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2.5 text-xs text-[#163C3A] focus:border-[#087F78] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor={`notice-end-${announcement.id}`} className="mb-1.5 block text-xs font-semibold text-[#5A6E85]">نهاية العرض (اختياري)</label>
                      <input
                        id={`notice-end-${announcement.id}`}
                        type="datetime-local"
                        value={toLocalDateTime(announcement.ends_at)}
                        onChange={(event) => updateAnnouncement(announcement.id, { ends_at: toIsoDateTime(event.target.value) })}
                        className="w-full rounded-xl border border-[#CBD5E1] bg-white px-3 py-2.5 text-xs text-[#163C3A] focus:border-[#087F78] focus:outline-none"
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* Live Preview of NoticeBar */}
        {settings.notice_bar.is_enabled && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 flex items-center justify-between text-xs text-amber-900 font-medium">
            <div className="flex items-center gap-2">
              <span className="font-bold">{settings.notice_bar.title}</span>
              <span>{settings.notice_bar.message}</span>
            </div>
            <span className="text-[11px] font-bold text-amber-800 bg-amber-100/80 px-2.5 py-1 rounded-full">
              {settings.notice_bar.hotline_label}
            </span>
          </div>
        )}
      </div>

      {/* Save Button Bar */}
      <div className="flex items-center justify-end gap-3 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-[#087F78] hover:bg-[#066560] text-white px-8 py-3 rounded-2xl text-sm font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>جاري الحفظ والنشر الفوري...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>حفظ التعديلات ونشرها فورياً</span>
            </>
          )}
        </button>
      </div>

      {/* Media Picker Modal */}
      {mediaPickerTarget && (
        <MediaManager
          isOpen={true}
          isModal={true}
          token={token}
          onClose={() => setMediaPickerTarget(null)}
          onSelectAsset={handleAssetSelected}
        />
      )}
    </form>
  );
}
