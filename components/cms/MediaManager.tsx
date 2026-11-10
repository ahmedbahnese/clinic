'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  Upload,
  Image as ImageIcon,
  Check,
  Copy,
  Plus,
  RefreshCw,
  ExternalLink,
  X,
  AlertCircle,
  FileImage,
  FileText,
} from 'lucide-react';
import type { MediaAsset } from '@/types/cms';

interface MediaManagerProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSelectAsset?: (url: string) => void;
  token?: string;
  isModal?: boolean;
}

export default function MediaManager({
  isOpen = true,
  onClose,
  onSelectAsset,
  token,
  isModal = false,
}: MediaManagerProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Upload Form State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState('');
  const [customAlt, setCustomAlt] = useState('');

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authToken = token || localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch('/api/staff/cms/media', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.assets) {
        setAssets(data.assets);
      } else {
        setError(data.error || 'تعذر تحميل مكتبة الوسائط');
      }
    } catch {
      setError('فشل الاتصال بالخادم لجلب الوسائط');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('يرجى اختيار صورة أو ملف PDF عام أولاً');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const authToken = token || localStorage.getItem('bsch_staff_token') || '';
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (customName) formData.append('name', customName);
      if (customAlt) formData.append('alt_text', customAlt);

      const res = await fetch('/api/staff/cms/media', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل رفع الملف');
      }

      setSuccessMsg('تم رفع الملف بنجاح إلى مكتبة الوسائط العامة');
      setSelectedFile(null);
      setCustomName('');
      setCustomAlt('');
      await fetchAssets();

      if (onSelectAsset && data.asset?.url) {
        onSelectAsset(data.asset.url);
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return 'حجم أصلي';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} ك.ب`;
    return `${(kb / 1024).toFixed(2)} م.ب`;
  };

  const content = (
    <div className="space-y-6" dir="rtl">
      {/* Upload Zone */}
      <div className="bg-[#F8FAFC] border-2 border-dashed border-[#CBD5E1] rounded-2xl p-6 transition-all hover:border-[#087F78]">
        <h4 className="text-sm font-bold text-[#163C3A] mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4 text-[#087F78]" />
          <span>رفع صورة أو ملف PDF عام إلى الموقع</span>
        </h4>

        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1">
                صورة أو PDF عام (حد أقصى 5 ميجابايت) *
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,application/pdf,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setSelectedFile(file);
                  if (file && !customName) {
                    setCustomName(file.name.replace(/\.[^/.]+$/, ''));
                  }
                }}
                className="w-full text-xs text-[#163C3A] file:mr-2 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#087F78] file:text-white hover:file:bg-[#066560] cursor-pointer bg-white border border-[#E2E8EE] rounded-xl p-1"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1">
                اسم تعريفي للصورة
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="مثال: شعار قسم الجراحة"
                className="w-full text-xs bg-white border border-[#E2E8EE] rounded-xl px-3 py-2 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1">
                النص البديل (Alt Text)
              </label>
              <input
                type="text"
                value={customAlt}
                onChange={(e) => setCustomAlt(e.target.value)}
                placeholder="وصف مختصر للصورة لمحركات البحث"
                className="w-full text-xs bg-white border border-[#E2E8EE] rounded-xl px-3 py-2 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-[#8493A6]">
              {selectedFile ? `الملف المحدد: ${selectedFile.name} (${formatFileSize(selectedFile.size)})` : 'لم يتم تحديد ملف بعد'}
            </div>
            <button
              type="submit"
              disabled={!selectedFile || uploading}
              className="flex items-center gap-2 bg-[#087F78] hover:bg-[#066560] text-white px-5 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري الرفع والحفظ...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>رفع وحفظ الصورة</span>
                </>
              )}
            </button>
          </div>
        </form>
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
          ملفات PDF في مكتبة الوسائط متاحة للعامة عبر رابطها. ارفع نشرات المستشفى العامة فقط؛ لا ترفع ملفات مرضى أو تقارير أو بيانات شخصية.
        </p>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Assets Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-[#163C3A] flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-[#087F78]" />
            <span>مكتبة الأصول والوسائط المتاحة ({assets.length})</span>
          </h4>
          <button
            onClick={fetchAssets}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-[#087F78] hover:text-[#066560] font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث القائمة</span>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-[#8493A6] text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#087F78]" />
            جاري تحميل ملفات الوسائط...
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-12 bg-[#F8FAFC] rounded-2xl border border-[#E2E8EE] text-[#8493A6] text-xs">
            لا توجد وسائط مسجلة حالياً
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="group relative bg-white border border-[#E2E8EE] hover:border-[#087F78] rounded-2xl p-3 flex flex-col justify-between transition-all shadow-xs hover:shadow-md"
              >
                {/* Thumbnail */}
                <div className="relative w-full h-28 bg-[#F1F5F9] rounded-xl overflow-hidden flex items-center justify-center p-2 mb-2">
                  {asset.mime_type === 'application/pdf' || asset.url.split('?')[0].toLowerCase().endsWith('.pdf') ? (
                    <FileText className="w-10 h-10 text-[#087F78]" aria-label="ملف PDF" />
                  ) : asset.url.endsWith('.ico') ? (
                    <FileImage className="w-10 h-10 text-[#087F78]" />
                  ) : (
                    <Image
                      src={asset.url}
                      alt={asset.alt_text || asset.name}
                      width={120}
                      height={120}
                      unoptimized
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>

                {/* Details */}
                <div className="space-y-1 mb-3">
                  <p className="text-xs font-bold text-[#163C3A] truncate" title={asset.name}>
                    {asset.name}
                  </p>
                  <p className="text-[11px] text-[#8493A6] truncate font-mono" title={asset.url}>
                    {asset.url}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-[#5A6E85]">
                    <span>{formatFileSize(asset.size_bytes)}</span>
                    <span className="uppercase">{asset.mime_type.split('/')[1] || 'IMAGE'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 pt-2 border-t border-[#F1F5F9]">
                  {onSelectAsset && asset.mime_type !== 'application/pdf' ? (
                    <button
                      type="button"
                      onClick={() => onSelectAsset(asset.url)}
                      className="flex-1 flex items-center justify-center gap-1 bg-[#087F78] hover:bg-[#066560] text-white py-1.5 px-2 rounded-lg text-xs font-bold transition-all"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>اختيار</span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => handleCopyUrl(asset.url, asset.id)}
                    className="flex-1 flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-[#163C3A] py-1.5 px-2 rounded-lg text-xs font-semibold transition-all"
                    title="نسخ الرابط"
                  >
                    {copiedId === asset.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ</span>
                      </>
                    )}
                  </button>

                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-[#5A6E85] rounded-lg transition-all"
                    title={asset.mime_type === 'application/pdf' ? 'فتح ملف PDF أو تنزيله من عارض المتصفح' : 'فتح الرابط الأصلي'}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (isModal) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-[#E2E8EE]">
          <div className="flex items-center justify-between p-5 border-b border-[#E2E8EE] bg-[#F8FAFC]">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-[#087F78]" />
              <h3 className="text-base font-bold text-[#163C3A]">مكتبة الوسائط واختيار الصور</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-[#8493A6] hover:text-[#163C3A] rounded-xl hover:bg-slate-200 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto">{content}</div>
        </div>
      </div>
    );
  }

  return content;
}
