'use client';

import React, { useState, useEffect } from 'react';
import {
  Stethoscope,
  Heart,
  Baby,
  Activity,
  Sparkles,
  Shield,
  Smile,
  Eye,
  FileText,
  Save,
  Check,
  AlertCircle,
  RefreshCw,
  Sliders,
  CheckCircle2,
  Lock,
  ListPlus,
  Plus,
  Trash2,
  Edit2,
} from 'lucide-react';
import type { ClinicPresentation } from '@/types/cms';
import type { ClinicService } from '@/types';

interface ClinicsPresentationEditorProps {
  initialClinics: ClinicPresentation[];
  token?: string;
  onSaved?: (clinics: ClinicPresentation[]) => void;
}

const AVAILABLE_ICONS = [
  { name: 'Stethoscope', label: 'سماعة طبيب', icon: Stethoscope },
  { name: 'Heart', label: 'قلب', icon: Heart },
  { name: 'Baby', label: 'طفل ورعاية', icon: Baby },
  { name: 'Smile', label: 'ابتسامة وأسنان', icon: Smile },
  { name: 'Activity', label: 'نشاط وحيوية', icon: Activity },
  { name: 'Shield', label: 'حماية ووقاية', icon: Shield },
  { name: 'Sparkles', label: 'تخصص دقيق', icon: Sparkles },
  { name: 'FileText', label: 'سجل وفحص', icon: FileText },
];

const PRESET_COLORS = [
  { hex: '#087F78', label: 'تركواز داكن (Deep Teal)' },
  { hex: '#059669', label: 'زمردي (Emerald)' },
  { hex: '#0284C7', label: 'سماوي (Sky)' },
  { hex: '#4F46E5', label: 'نيلي (Indigo)' },
  { hex: '#D97706', label: 'عنبري (Amber)' },
  { hex: '#E11D48', label: 'وردي (Rose)' },
  { hex: '#7C3AED', label: 'بنفسجي (Purple)' },
  { hex: '#475569', label: 'رمادي طبقي (Slate)' },
];

export default function ClinicsPresentationEditor({
  initialClinics,
  token,
  onSaved,
}: ClinicsPresentationEditorProps) {
  const [clinics, setClinics] = useState<ClinicPresentation[]>(
    [...initialClinics].sort((a, b) => a.display_order - b.display_order)
  );
  const [selectedClinicId, setSelectedClinicId] = useState<string>(clinics[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Clinic Services state
  const [services, setServices] = useState<ClinicService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceSuccessMsg, setServiceSuccessMsg] = useState<string | null>(null);

  // New Service Inline State
  const [showAddServiceForm, setShowAddServiceForm] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceCapacity, setNewServiceCapacity] = useState(20);
  const [newServiceDocs, setNewServiceDocs] = useState('');
  const [newServiceInstructions, setNewServiceInstructions] = useState('');
  const [addingService, setAddingService] = useState(false);

  // Load services whenever selectedClinicId changes
  useEffect(() => {
    let active = true;
    if (!selectedClinicId) return;

    async function loadServices() {
      setLoadingServices(true);
      try {
        const res = await fetch(`/api/clinics/${selectedClinicId}/services`);
        const data = await res.json();
        if (active && data.services) {
          setServices(data.services);
        }
      } catch (err) {
        console.error('Failed to load clinic services:', err);
      } finally {
        if (active) setLoadingServices(false);
      }
    }

    loadServices();
    return () => {
      active = false;
    };
  }, [selectedClinicId]);

  const handleUpdateServiceField = (serviceId: string, field: keyof ClinicService, val: any) => {
    setServices((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, [field]: val } : s))
    );
  };

  const handleSaveService = async (service: ClinicService) => {
    setServiceSaving(true);
    setServiceSuccessMsg(null);
    setError(null);
    try {
      const authToken = token || localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch(`/api/staff/cms/clinics/${selectedClinicId}/services`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          serviceId: service.id,
          name: service.name,
          requiredDocuments: service.requiredDocuments,
          instructions: service.instructions,
          maxDailyCapacity: service.maxDailyCapacity ?? null,
          isActive: service.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل في حفظ تفاصيل الخدمة');
      }
      setServiceSuccessMsg(`تم تحديث خدمة (${service.name}) بنجاح`);
      setEditingServiceId(null);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ الخدمة');
    } finally {
      setServiceSaving(false);
    }
  };

  const handleCreateService = async () => {
    if (!newServiceName.trim()) {
      alert('يرجى إدخال اسم الخدمة');
      return;
    }
    setAddingService(true);
    try {
      const authToken = token || localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch(`/api/staff/cms/clinics/${selectedClinicId}/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: newServiceName.trim(),
          maxDailyCapacity: Number(newServiceCapacity) || 20,
          requiredDocuments: newServiceDocs.split('\n').map((s) => s.trim()).filter(Boolean),
          instructions: newServiceInstructions.trim(),
          isActive: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر إضافة الخدمة');
      }
      setServices((prev) => [...prev, data.service]);
      setNewServiceName('');
      setNewServiceCapacity(20);
      setNewServiceDocs('');
      setNewServiceInstructions('');
      setShowAddServiceForm(false);
      setServiceSuccessMsg(`تمت إضافة خدمة (${data.service.name}) بنجاح`);
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء إضافة الخدمة');
    } finally {
      setAddingService(false);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الخدمة من العيادة؟')) return;
    try {
      const authToken = token || localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch(`/api/staff/cms/clinics/${selectedClinicId}/services?serviceId=${serviceId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر حذف الخدمة');
      }
      setServices((prev) => prev.filter((s) => s.id !== serviceId));
      setServiceSuccessMsg('تم حذف الخدمة بنجاح');
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حذف الخدمة');
    }
  };

  const selectedClinic = clinics.find((c) => c.id === selectedClinicId);

  const handleUpdateField = (field: keyof ClinicPresentation, val: any) => {
    if (!selectedClinic) return;
    setClinics((prev) =>
      prev.map((c) => (c.id === selectedClinicId ? { ...c, [field]: val } : c))
    );
  };

  const handleSaveClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClinic) return;

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const authToken = token || localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch(`/api/staff/cms/clinics/${selectedClinic.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          display_order: selectedClinic.display_order,
          is_featured_on_homepage: selectedClinic.is_featured_on_homepage,
          english_title: selectedClinic.english_title,
          accent_color: selectedClinic.accent_color,
          icon_name: selectedClinic.icon_name,
          description: selectedClinic.description,
          instructions: selectedClinic.instructions,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل في تحديث بيانات عرض العيادة');
      }

      setSuccessMsg(`تم تحديث مظهر وبطاقة (${selectedClinic.name}) ونشرها بنجاح`);
      if (onSaved) onSaved(clinics);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8" dir="rtl">
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

      {/* Safety Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900 flex items-start gap-3">
        <Lock className="w-4 h-4 shrink-0 text-blue-700 mt-0.5" />
        <div>
          <span className="font-bold">حماية السجلات الطبية والاعتماد التشغيلي:</span>
          <p className="text-blue-800/90 mt-0.5">
            تقتصر هذه الواجهة على تخصيص المظهر، الألوان، الأيقونات، والترتيب في واجهة الموقع العامة. البيانات التشغيلية
            (اعتماد المستشفى، السعة القصوى اليومية، وجدول المواعيد) محمية بالكامل ولا تتأثر بتعديلات المحتوى.
          </p>
        </div>
      </div>

      {/* Clinics Grid / List */}
      <div className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[#087F78]" />
            <h3 className="text-base font-bold text-[#163C3A]">
              قائمة العيادات التخصصية ({clinics.length} عيادات)
            </h3>
          </div>
          <span className="text-xs text-[#8493A6]">اختر عيادة لتخصيص بطاقتها في واجهة الموقع</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {clinics.map((clinic) => {
            const isSelected = clinic.id === selectedClinicId;
            return (
              <button
                key={clinic.id}
                type="button"
                onClick={() => setSelectedClinicId(clinic.id)}
                className={`text-right p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#087F78] bg-teal-50/40 shadow-xs ring-2 ring-[#087F78]/20'
                    : 'border-[#E2E8EE] bg-white hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-bold text-[#163C3A] truncate">{clinic.name}</span>
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: clinic.accent_color || '#087F78' }}
                      title="لون التمييز"
                    />
                  </div>
                  <p className="text-[11px] text-[#8493A6] truncate">{clinic.english_title || clinic.code}</p>
                </div>

                <div className="flex items-center justify-between pt-2 mt-2 border-t border-[#F1F5F9] text-[10px]">
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    معتمدة
                  </span>
                  <span className="font-mono text-[#5A6E85]">ترتيب: {clinic.display_order}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Clinic Editor */}
      {selectedClinic && (
        <form
          onSubmit={handleSaveClinic}
          className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-6"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
            <div>
              <h3 className="text-base font-bold text-[#163C3A] flex items-center gap-2">
                <span>تخصيص بطاقة عرض:</span>
                <span className="text-[#087F78]">{selectedClinic.name}</span>
              </h3>
              <p className="text-xs text-[#8493A6] mt-0.5">معرف النظام: {selectedClinic.id}</p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs font-bold text-[#163C3A]">
                {selectedClinic.is_featured_on_homepage ? 'ظاهرة في الواجهة' : 'مخفية من الصفحة الرئيسية'}
              </span>
              <input
                type="checkbox"
                checked={selectedClinic.is_featured_on_homepage !== false}
                onChange={(e) => handleUpdateField('is_featured_on_homepage', e.target.checked)}
                className="w-4 h-4 text-[#087F78] rounded-md focus:ring-[#087F78]"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* English Title */}
            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
                الاسم بالإنجليزية (Sub-title)
              </label>
              <input
                type="text"
                value={selectedClinic.english_title || ''}
                onChange={(e) => handleUpdateField('english_title', e.target.value)}
                placeholder="Pediatric Clinic"
                className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
              />
            </div>

            {/* Display Order */}
            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
                ترتيب العرض (الرقم الأصغر يظهر أولاً)
              </label>
              <input
                type="number"
                min="1"
                max="99"
                value={selectedClinic.display_order}
                onChange={(e) => handleUpdateField('display_order', parseInt(e.target.value) || 1)}
                className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#163C3A] font-mono focus:outline-none focus:border-[#087F78]"
              />
            </div>

            {/* Accent Color */}
            <div>
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
                لون التمييز (Accent Color)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={selectedClinic.accent_color || '#087F78'}
                  onChange={(e) => handleUpdateField('accent_color', e.target.value)}
                  className="w-9 h-9 p-0.5 rounded-lg border border-[#CBD5E1] cursor-pointer"
                />
                <div className="flex items-center gap-1 overflow-x-auto py-1">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => handleUpdateField('accent_color', c.hex)}
                      className="w-6 h-6 rounded-md shrink-0 border border-black/10 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
                الوصف الطبي المبسط للعيادة (Description)
              </label>
              <textarea
                rows={2}
                value={selectedClinic.description || ''}
                onChange={(e) => handleUpdateField('description', e.target.value)}
                placeholder="وصف الخدمات التشخيصية والعلاجية المقدمة بالعيادة"
                className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-3 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
              />
            </div>

            {/* Clinic Instructions & Required Documents */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
                تعليمات العيادة والأوراق المطلوبة (Instructions & Required Documents)
              </label>
              <textarea
                rows={3}
                value={selectedClinic.instructions || ''}
                onChange={(e) => handleUpdateField('instructions', e.target.value)}
                placeholder="تعليمات الصيام، الفحوصات والتحاليل أو الأشعات السابقة المطلوبة من ولي الأمر عند الحضور..."
                className="w-full text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-3 text-[#163C3A] focus:outline-none focus:border-[#087F78]"
              />
              <p className="text-[11px] text-[#8493A6] mt-1">
                تظهر هذه التعليمات بشكل ديناميكي وجذاب للمرضى فور اختيار العيادة في صفحة الحجز.
              </p>
            </div>

            {/* Icon Picker */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-[#5A6E85] mb-1.5">
                رمز الأيقونة الطبية
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
                {AVAILABLE_ICONS.map((item) => {
                  const IconComp = item.icon;
                  const isSelected = selectedClinic.icon_name === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handleUpdateField('icon_name', item.name)}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                        isSelected
                          ? 'border-[#087F78] bg-teal-50 text-[#087F78] font-bold shadow-xs'
                          : 'border-[#E2E8EE] bg-white text-[#5A6E85] hover:bg-slate-50'
                      }`}
                    >
                      <IconComp className="w-5 h-5" />
                      <span className="text-[10px] truncate max-w-full">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Card Preview */}
          <div className="bg-[#F8FAFC] border border-[#E2E8EE] rounded-2xl p-4">
            <span className="block text-xs font-bold text-[#5A6E85] mb-3">معاينة بطاقة العيادة الحية:</span>
            <div className="max-w-xs bg-white rounded-2xl p-4 border border-[#E2E8EE] shadow-xs relative overflow-hidden">
              <div
                className="absolute top-0 right-0 left-0 h-1"
                style={{ backgroundColor: selectedClinic.accent_color || '#087F78' }}
              />
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                  style={{ backgroundColor: selectedClinic.accent_color || '#087F78' }}
                >
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#163C3A]">{selectedClinic.name}</h4>
                  <p className="text-[10px] text-[#8493A6]">{selectedClinic.english_title || 'Pediatric Clinic'}</p>
                </div>
              </div>
              <p className="text-[11px] text-[#5A6E85] line-clamp-2 mb-2">
                {selectedClinic.description || 'فحوصات طبية واستشارات متخصصة للأطفال.'}
              </p>
              <div className="flex items-center justify-between text-[10px] text-[#8493A6] pt-2 border-t border-[#F1F5F9]">
                <span>الأيام: {selectedClinic.working_days?.length || 0} أيام</span>
                <span className="text-[#087F78] font-bold">احجز موعدك ←</span>
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
                  <span>حفظ بيانات عرض العيادة ونشرها</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Clinic Services Management Section */}
      {selectedClinic && (
        <div className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
            <div className="flex items-center gap-2">
              <ListPlus className="w-5 h-5 text-[#087F78]" />
              <div>
                <h3 className="text-base font-bold text-[#163C3A]">
                  خدمات عيادة ({selectedClinic.name}) والأوراق والتعليمات
                </h3>
                <p className="text-xs text-[#8493A6]">
                  تظهر هذه الخدمات ديناميكياً للمرضى عند اختيار هذه العيادة في نموذج الحجز
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddServiceForm(!showAddServiceForm)}
                className="px-3 py-1.5 rounded-xl bg-[#087F78] hover:bg-[#066560] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة خدمة جديدة</span>
              </button>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-teal-50 text-[#087F78] border border-teal-200">
                {services.length} خدمات مسجلة
              </span>
            </div>
          </div>

          {/* Add Service Inline Form */}
          {showAddServiceForm && (
            <div className="p-4 rounded-2xl border-2 border-teal-200 bg-teal-50/40 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-teal-100">
                <span className="font-bold text-xs text-[#124E4A] flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-[#087F78]" />
                  <span>إضافة خدمة طبية جديدة لعيادة {selectedClinic.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddServiceForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  إلغاء
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-3xs font-bold text-slate-600 mb-1">اسم الخدمة *</label>
                  <input
                    type="text"
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                    placeholder="مثال: فحص دوري، رسم قلب، إيكو"
                    className="w-full px-3 py-2 rounded-xl border border-teal-200 text-xs bg-white focus:border-[#087F78]"
                  />
                </div>
                <div>
                  <label className="block text-3xs font-bold text-slate-600 mb-1">الطاقة الاستيعابية اليومية</label>
                  <input
                    type="number"
                    min="1"
                    value={newServiceCapacity}
                    onChange={(e) => setNewServiceCapacity(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-teal-200 text-xs font-mono bg-white focus:border-[#087F78]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-3xs font-bold text-slate-600 mb-1">المستندات المطلوبة (مستند في كل سطر)</label>
                  <textarea
                    rows={2}
                    value={newServiceDocs}
                    onChange={(e) => setNewServiceDocs(e.target.value)}
                    placeholder="شهادة الميلاد، بطاقة التأمين الصحي..."
                    className="w-full px-3 py-2 rounded-xl border border-teal-200 text-xs bg-white resize-y"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-3xs font-bold text-slate-600 mb-1">تعليمات التحضير الخاصة بالخدمة</label>
                  <input
                    type="text"
                    value={newServiceInstructions}
                    onChange={(e) => setNewServiceInstructions(e.target.value)}
                    placeholder="مثال: صيام 6 ساعات قبل موعد الفحص..."
                    className="w-full px-3 py-2 rounded-xl border border-teal-200 text-xs bg-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddServiceForm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  disabled={addingService || !newServiceName.trim()}
                  onClick={handleCreateService}
                  className="px-5 py-2 rounded-xl bg-[#087F78] hover:bg-[#066560] text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {addingService ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري الإضافة...</span>
                    </>
                  ) : (
                    <span>تأكيد إضافة الخدمة</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {serviceSuccessMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{serviceSuccessMsg}</span>
            </div>
          )}

          {loadingServices ? (
            <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#087F78]" />
              <span>جاري تحميل الخدمات الطبية...</span>
            </div>
          ) : services.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              لا توجد خدمات مخصصة حالياً لهذه العيادة. سيتم تطبيق التعليمات العامة للعيادة كإعداد افتراضي.
            </div>
          ) : (
            <div className="space-y-4">
              {services.map((srv) => {
                const isEditing = editingServiceId === srv.id;
                return (
                  <div
                    key={srv.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#163C3A]">{srv.name}</span>
                        <span className="text-[10.5px] font-mono text-slate-400">({srv.id})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingServiceId(isEditing ? null : srv.id)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-[#087F78] bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          {isEditing ? 'إغلاق التعديل' : 'تعديل الأوراق والتعليمات'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteService(srv.id)}
                          className="px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 bg-white hover:bg-red-50 transition-colors flex items-center gap-1 cursor-pointer"
                          title="حذف الخدمة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-3 pt-3 border-t border-slate-200 bg-white p-4 rounded-xl">
                        <div>
                          <label className="block text-xs font-bold text-[#163C3A] mb-1">
                            اسم الخدمة الطبية
                          </label>
                          <input
                            type="text"
                            value={srv.name}
                            onChange={(e) => handleUpdateServiceField(srv.id, 'name', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#163C3A] mb-1">
                            السعة اليومية القصوى للخدمة (اختياري - اتركه فارغاً للاعتماد على سعة العيادة)
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={srv.maxDailyCapacity ?? ''}
                            onChange={(e) =>
                              handleUpdateServiceField(
                                srv.id,
                                'maxDailyCapacity',
                                e.target.value ? Number(e.target.value) : undefined
                              )
                            }
                            placeholder="سعة العيادة الإجمالية"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#163C3A] mb-1">
                            الأوراق والمستندات المطلوبة (كل سطر مستند)
                          </label>
                          <textarea
                            rows={3}
                            value={srv.requiredDocuments.join('\n')}
                            onChange={(e) =>
                              handleUpdateServiceField(
                                srv.id,
                                'requiredDocuments',
                                e.target.value.split('\n').filter((l) => l.trim().length > 0)
                              )
                            }
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#163C3A] mb-1">
                            تعليمات الخدمة والتحضير الطبي
                          </label>
                          <textarea
                            rows={3}
                            value={srv.instructions}
                            onChange={(e) =>
                              handleUpdateServiceField(srv.id, 'instructions', e.target.value)
                            }
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={srv.isActive}
                              onChange={(e) =>
                                handleUpdateServiceField(srv.id, 'isActive', e.target.checked)
                              }
                              className="rounded border-slate-300 text-[#087F78]"
                            />
                            <span>الخدمة مفعلة ومتاحة للحجز</span>
                          </label>

                          <button
                            type="button"
                            disabled={serviceSaving}
                            onClick={() => handleSaveService(srv)}
                            className="px-5 py-2 rounded-xl bg-[#087F78] hover:bg-[#066560] text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                          >
                            {serviceSaving ? 'جاري الحفظ...' : 'حفظ تعديلات الخدمة'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-600 space-y-1">
                        <div className="flex items-start gap-1">
                          <span className="font-bold text-slate-700">المستندات:</span>
                          <span className="text-slate-600">
                            {srv.requiredDocuments.length > 0
                              ? srv.requiredDocuments.join(' • ')
                              : 'أصل شهادة ميلاد الطفل أو بطاقة التأمين'}
                          </span>
                        </div>
                        <div className="flex items-start gap-1">
                          <span className="font-bold text-slate-700">التعليمات:</span>
                          <span className="text-slate-600 line-clamp-2">
                            {srv.instructions || 'الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى.'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

