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
} from 'lucide-react';
import type { WebsiteSettings } from '@/types/cms';
import MediaManager from './MediaManager';

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
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'header' | 'footer' | 'favicon' | null>(null);

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

