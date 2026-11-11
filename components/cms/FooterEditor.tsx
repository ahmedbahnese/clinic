'use client';

import React, { useState } from 'react';
import {
  FileText,
  Share2,
  Plus,
  Trash2,
  Save,
  Check,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { WebsiteSettings, SocialLinkItem } from '@/types/cms';

interface FooterEditorProps {
  initialSettings: WebsiteSettings;
  token?: string;
  onSaved?: (settings: WebsiteSettings) => void;
}

export default function FooterEditor({ initialSettings, token, onSaved }: FooterEditorProps) {
  const [summary, setSummary] = useState(initialSettings.footer_summary || '');
  const [copyright, setCopyright] = useState(initialSettings.footer_copyright || '');
  const [statusBadge, setStatusBadge] = useState(initialSettings.footer_status_badge || '');
  const [socialLinks, setSocialLinks] = useState<SocialLinkItem[]>(initialSettings.social_links || []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleUpdateSocial = (index: number, field: keyof SocialLinkItem, val: any) => {
    const updated = [...socialLinks];
    updated[index] = { ...updated[index], [field]: val };
    setSocialLinks(updated);
  };

  const handleAddSocial = () => {
    const newSocial: SocialLinkItem = {
      platform: 'facebook',
      label: 'رابط منصة جديدة',
      url: 'https://',
      is_active: true,
    };
    setSocialLinks([...socialLinks, newSocial]);
  };

  const handleDeleteSocial = (index: number) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
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
        body: JSON.stringify({
          footer_summary: summary,
          footer_copyright: copyright,
          footer_status_badge: statusBadge,
          social_links: socialLinks,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر حفظ بيانات التذييل');
      }

      setSuccessMsg('تم حفظ ونشر إعدادات وروابط التذييل (Footer) بنجاح');
      if (onSaved && data.settings) {
        onSaved(data.settings);
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ التذييل');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" dir="rtl">
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

      {/* Texts Section */}
      <div className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-[#F1F5F9]">
          <FileText className="w-5 h-5 text-[#087F78]" />
          <h3 className="text-base font-bold text-[#163C3A]">نصوص التذييل والرسائل المعتمدة</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
              الوصف المختصر للمستشفى والرسالة الطبية
            </label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-3 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
                شارة حالة النظام (System Status Badge)
              </label>
              <input
                type="text"
                value={statusBadge}
                onChange={(e) => setStatusBadge(e.target.value)}
                placeholder="نظام إدارة العيادات الخارجية الموحد — متاح ويعمل بكفاءة 🟢"
                className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
                نص حقوق الملكية والنشر
              </label>
              <input
                type="text"
                value={copyright}
                onChange={(e) => setCopyright(e.target.value)}
                placeholder="مستشفى الأطفال التخصصي بالبحيرة. جميع الحقوق محفوظة."
                className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Social and External Links */}
      <div className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-[#087F78]" />
            <h3 className="text-base font-bold text-[#163C3A]">روابط التواصل الاجتماعي والجهات التابعة</h3>
          </div>
          <button
            type="button"
            onClick={handleAddSocial}
            className="flex items-center gap-1.5 text-xs bg-[#087F78] hover:bg-[#066560] text-white px-3.5 py-2 rounded-xl font-bold transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة منصة جديدة</span>
          </button>
        </div>

        <div className="space-y-3">
          {socialLinks.map((link, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                link.is_active ? 'bg-[#F8FAFC] border-[#E2E8EE]' : 'bg-slate-50 border-slate-300 opacity-60'
              }`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                <div>
                  <label className="block text-[10px] text-[#5A6E85] mb-1 font-semibold">المنصة / النوع</label>
                  <select
                    value={link.platform}
                    onChange={(e) => handleUpdateSocial(idx, 'platform', e.target.value)}
                    className="w-full text-xs bg-white border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A]"
                  >
                    <option value="facebook">فيسبوك (Facebook)</option>
                    <option value="website">موقع المستشفى التعريفي / بوابة إلكترونية</option>
                    <option value="mohp">وزارة الصحة (MOHP Portal)</option>
                    <option value="youtube">يوتيوب (YouTube)</option>
                    <option value="whatsapp">واتساب (WhatsApp)</option>
                    <option value="twitter">تويتر / إكس (X)</option>
                    <option value="instagram">انستجرام (Instagram)</option>
                    <option value="other">رابط آخر</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-[#5A6E85] mb-1 font-semibold">عنوان الرابط الظاهر</label>
                  <input
                    type="text"
                    value={link.label}
                    placeholder="مثال: صفحة المستشفى الرسمية"
                    onChange={(e) => handleUpdateSocial(idx, 'label', e.target.value)}
                    className="w-full text-xs bg-white border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[#5A6E85] mb-1 font-semibold">الرابط الإلكتروني (URL)</label>
                  <input
                    type="text"
                    value={link.url}
                    placeholder="https://albahira.elyoser.cloud أو https://facebook.com/..."
                    onChange={(e) => handleUpdateSocial(idx, 'url', e.target.value)}
                    className="w-full text-xs bg-white border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => handleUpdateSocial(idx, 'is_active', !link.is_active)}
                  className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    link.is_active
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {link.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{link.is_active ? 'معروض' : 'مخفي'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteSocial(idx)}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all"
                  title="حذف هذا الرابط"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
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
              <span>حفظ إعدادات التذييل ونشرها فورياً</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

