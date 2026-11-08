'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Search,
  Globe,
  Share2,
  Save,
  Check,
  AlertCircle,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';
import type { WebsiteSettings } from '@/types/cms';
import MediaManager from './MediaManager';

interface SeoEditorProps {
  initialSettings: WebsiteSettings;
  token?: string;
  onSaved?: (settings: WebsiteSettings) => void;
}

export default function SeoEditor({ initialSettings, token, onSaved }: SeoEditorProps) {
  const [metaTitle, setMetaTitle] = useState(initialSettings.meta_title || '');
  const [metaDescription, setMetaDescription] = useState(initialSettings.meta_description || '');
  const [canonicalUrl, setCanonicalUrl] = useState(initialSettings.canonical_url || 'https://bsch-clinics.gov.eg');
  const [ogImageUrl, setOgImageUrl] = useState(initialSettings.og_image_url || '/logo-main.png');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

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
        body: JSON.stringify({
          meta_title: metaTitle,
          meta_description: metaDescription,
          canonical_url: canonicalUrl,
          og_image_url: ogImageUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر حفظ إعدادات محركات البحث');
      }

      setSuccessMsg('تم حفظ وتحديث بيانات محركات البحث (SEO) والمشاركة الاجتماعية بنجاح');
      if (onSaved && data.settings) {
        onSaved(data.settings);
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
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

      {/* Inputs Card */}
      <div className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-[#F1F5F9]">
          <Search className="w-5 h-5 text-[#087F78]" />
          <h3 className="text-base font-bold text-[#163C3A]">إعدادات محركات البحث والوسوم الوصفية (SEO Meta Tags)</h3>
        </div>

        <div className="space-y-4">
          {/* Meta Title */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#5A6E85]">
                عنوان الصفحة لمحركات البحث (Meta Title) *
              </label>
              <span className={`text-[10px] font-mono ${metaTitle.length > 65 ? 'text-amber-600' : 'text-[#8493A6]'}`}>
                {metaTitle.length} / 60-70 حرف موصى به
              </span>
            </div>
            <input
              type="text"
              required
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="BSCH Clinics — العيادات الخارجية لمستشفى الأطفال التخصصي بالبحيرة"
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
            />
          </div>

          {/* Meta Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#5A6E85]">
                الوصف التعريفي لمحركات البحث (Meta Description) *
              </label>
              <span className={`text-[10px] font-mono ${metaDescription.length > 165 ? 'text-amber-600' : 'text-[#8493A6]'}`}>
                {metaDescription.length} / 150-160 حرف موصى به
              </span>
            </div>
            <textarea
              rows={3}
              required
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="منظومة حجز رقمية متكاملة لتقديم رعاية طبية فائقة لأطفال محافظة البحيرة..."
              className="w-full text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-3 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Canonical URL */}
            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
                الرابط المعتمد الرئيسي (Canonical URL)
              </label>
              <input
                type="text"
                value={canonicalUrl}
                onChange={(e) => setCanonicalUrl(e.target.value)}
                placeholder="https://bsch-clinics.gov.eg"
                className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] font-mono focus:outline-none focus:border-[#087F78]"
              />
            </div>

            {/* OG Image */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#5A6E85]">صورة المشاركة الاجتماعية (OG Image)</label>
                <button
                  type="button"
                  onClick={() => setShowMediaPicker(true)}
                  className="text-[11px] text-[#087F78] hover:text-[#066560] font-bold flex items-center gap-1"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>اختيار من الوسائط</span>
                </button>
              </div>
              <input
                type="text"
                value={ogImageUrl}
                onChange={(e) => setOgImageUrl(e.target.value)}
                placeholder="/logo-main.png"
                className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] font-mono focus:outline-none focus:border-[#087F78]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live Preview Snippet (Google & Social) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Google Snippet */}
        <div className="bg-white border border-[#E2E8EE] rounded-3xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#F1F5F9]">
            <Search className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-bold text-[#163C3A]">معاينة النتيجة في بحث Google:</h4>
          </div>
          <div className="p-4 bg-[#F8FAFC] rounded-2xl border border-[#E2E8EE] space-y-1 font-sans">
            <div className="text-[11px] text-[#202124] flex items-center gap-1.5 font-mono">
              <Globe className="w-3 h-3 text-[#5f6368]" />
              <span>{canonicalUrl || 'https://bsch-clinics.gov.eg'}</span>
            </div>
            <h5 className="text-sm font-bold text-[#1a0dab] hover:underline cursor-pointer truncate">
              {metaTitle || 'BSCH Clinics'}
            </h5>
            <p className="text-xs text-[#4d5156] line-clamp-2">
              {metaDescription || 'وصف الموقع في محركات البحث يظهر هنا...'}
            </p>
          </div>
        </div>

        {/* Social Share Card Preview */}
        <div className="bg-white border border-[#E2E8EE] rounded-3xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#F1F5F9]">
            <Share2 className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold text-[#163C3A]">معاينة بطاقة المشاركة (Facebook / WhatsApp):</h4>
          </div>
          <div className="rounded-2xl border border-[#CBD5E1] overflow-hidden bg-white shadow-xs">
            <div className="h-32 bg-slate-100 flex items-center justify-center p-2 border-b border-[#E2E8EE]">
              <Image
                src={ogImageUrl || '/logo-main.png'}
                alt="OG Preview"
                width={160}
                height={120}
                unoptimized
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="p-3 space-y-1">
              <span className="text-[10px] uppercase font-mono text-[#8493A6]">
                {canonicalUrl.replace(/^https?:\/\//, '')}
              </span>
              <h5 className="text-xs font-bold text-[#163C3A] truncate">{metaTitle}</h5>
              <p className="text-[11px] text-[#5A6E85] line-clamp-2">{metaDescription}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-[#087F78] hover:bg-[#066560] text-white px-8 py-3 rounded-2xl text-sm font-bold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>جاري الحفظ والنشر...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>حفظ إعدادات محركات البحث ونشرها</span>
            </>
          )}
        </button>
      </div>

      {/* Media Picker Modal */}
      {showMediaPicker && (
        <MediaManager
          isOpen={true}
          isModal={true}
          token={token}
          onClose={() => setShowMediaPicker(false)}
          onSelectAsset={(url) => {
            setOgImageUrl(url);
            setShowMediaPicker(false);
          }}
        />
      )}
    </form>
  );
}

