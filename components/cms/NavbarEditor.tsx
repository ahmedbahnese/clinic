'use client';

import React, { useState } from 'react';
import {
  Menu,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Check,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { NavigationItem } from '@/types/cms';

interface NavbarEditorProps {
  initialNavigation: NavigationItem[];
  token?: string;
  onSaved?: (items: NavigationItem[]) => void;
}

export default function NavbarEditor({
  initialNavigation,
  token,
  onSaved,
}: NavbarEditorProps) {
  const [items, setItems] = useState<NavigationItem[]>(
    [...initialNavigation]
      .map((item) => ({
        ...item,
        is_active: item.is_active ?? item.is_visible ?? true,
        is_visible: item.is_visible ?? item.is_active ?? true,
        target: item.target || (item.is_external ? '_blank' : '_self'),
      }))
      .sort((a, b) => a.display_order - b.display_order)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    const updated = newItems.map((item, idx) => ({
      ...item,
      display_order: idx + 1,
    }));
    setItems(updated);
  };

  const handleUpdate = (index: number, field: keyof NavigationItem, val: any) => {
    const updated = [...items];
    if (field === 'is_active' || field === 'is_visible') {
      updated[index] = { ...updated[index], is_active: val, is_visible: val };
    } else if (field === 'target') {
      updated[index] = { ...updated[index], target: val, is_external: val === '_blank' };
    } else {
      updated[index] = { ...updated[index], [field]: val };
    }
    setItems(updated);
  };

  const handleAddItem = () => {
    const newItem: NavigationItem = {
      id: `nav_${Date.now()}`,
      label: 'رابط جديد',
      href: '/',
      target: '_self',
      display_order: items.length + 1,
      is_active: true,
      is_visible: true,
      is_external: false,
      location: 'HEADER',
    };
    setItems([...items, newItem]);
  };

  const handleDeleteItem = (id: string) => {
    const filtered = items.filter((i) => i.id !== id);
    const updated = filtered.map((item, idx) => ({
      ...item,
      display_order: idx + 1,
    }));
    setItems(updated);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const authToken = token || localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch('/api/staff/cms/navigation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ items }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر حفظ عناصر القائمة');
      }

      setSuccessMsg('تم حفظ عناصر القائمة العلوية ونشرها فورياً على الموقع');
      if (onSaved && data.navigation) {
        onSaved(data.navigation);
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ القائمة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6" dir="rtl">
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

      <div className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-2">
            <Menu className="w-5 h-5 text-[#087F78]" />
            <h3 className="text-base font-bold text-[#163C3A]">روابط وقوائم التنقل العلوية (Navbar)</h3>
          </div>
          <button
            type="button"
            onClick={handleAddItem}
            className="flex items-center gap-1.5 text-xs bg-[#087F78] hover:bg-[#066560] text-white px-3.5 py-2 rounded-xl font-bold transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة رابط جديد</span>
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                item.is_active
                  ? 'bg-[#F8FAFC] border-[#E2E8EE]'
                  : 'bg-slate-50 border-dashed border-slate-300 opacity-60'
              }`}
            >
              {/* Order & Reorder Arrows */}
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-white border border-[#CBD5E1] text-[#5A6E85] text-xs font-bold flex items-center justify-center font-mono">
                  {idx + 1}
                </span>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, 'up')}
                    className="p-1 rounded bg-white hover:bg-slate-100 text-[#5A6E85] disabled:opacity-30 border border-[#CBD5E1]"
                    title="تحريك لأعلى"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === items.length - 1}
                    onClick={() => handleMove(idx, 'down')}
                    className="p-1 rounded bg-white hover:bg-slate-100 text-[#5A6E85] disabled:opacity-30 border border-[#CBD5E1]"
                    title="تحريك لأسفل"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Editable Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                <div>
                  <label className="block text-[10px] text-[#5A6E85] mb-1 font-semibold">
                    عنوان الرابط (النص الظاهر)
                  </label>
                  <input
                    type="text"
                    required
                    value={item.label}
                    onChange={(e) => handleUpdate(idx, 'label', e.target.value)}
                    className="w-full text-xs bg-white border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] font-bold focus:outline-none focus:border-[#087F78]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[#5A6E85] mb-1 font-semibold">
                    مسار الرابط (URL أو Route)
                  </label>
                  <input
                    type="text"
                    required
                    value={item.href}
                    onChange={(e) => handleUpdate(idx, 'href', e.target.value)}
                    className="w-full text-xs bg-white border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] font-mono focus:outline-none focus:border-[#087F78]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[#5A6E85] mb-1 font-semibold">
                    طريقة الفتح
                  </label>
                  <select
                    value={item.target || '_self'}
                    onChange={(e) => handleUpdate(idx, 'target', e.target.value)}
                    className="w-full text-xs bg-white border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
                  >
                    <option value="_self">في نفس الصفحة (_self)</option>
                    <option value="_blank">في تبويب جديد (_blank - خارجي)</option>
                  </select>
                </div>
              </div>

              {/* Toggle and Delete */}
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => handleUpdate(idx, 'is_active', !item.is_active)}
                  className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    item.is_active
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                  title={item.is_active ? 'الرابط معروض ويظهر في القائمة' : 'الرابط مخفي ولا يظهر في القائمة'}
                >
                  {item.is_active ? (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>معروض</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>مخفي</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteItem(item.id)}
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
              <span>حفظ عناصر القائمة ونشرها فورياً</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

