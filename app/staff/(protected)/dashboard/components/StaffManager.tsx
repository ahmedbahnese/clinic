'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Users,
  UserPlus,
  Pencil,
  Trash2,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  ShieldCheck,
} from 'lucide-react';
import { createOrUpdateStaff, deleteStaff } from '@/app/staff/actions/staffManagement';
import {
  staffFormSchema,
  StaffFormValues,
  StaffMemberRecord,
  STAFF_ROLE_LABELS,
} from '@/lib/staffManagementSchema';

interface ClinicOption {
  id: string;
  name: string;
}

interface ToastState {
  kind: 'success' | 'error';
  text: string;
}

const EMPTY_FORM: StaffFormValues = {
  fullName: '',
  username: '',
  role: 'RECEPTIONIST',
  clinicId: '',
  password: '',
};

export default function StaffManager() {
  const [staff, setStaff] = useState<StaffMemberRecord[]>([]);
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMemberRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffMemberRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: EMPTY_FORM,
  });

  const selectedRole = watch('role');

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = localStorage.getItem('bsch_staff_token');
      const res = await fetch('/api/staff/management', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoadError(data.error || 'تعذر جلب قائمة الموظفين.');
        setStaff([]);
      } else {
        setStaff(data.staff || []);
      }
    } catch {
      setLoadError('حدث خطأ أثناء الاتصال بالنظام.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClinics = useCallback(async () => {
    try {
      const token = localStorage.getItem('bsch_staff_token');
      const res = await fetch('/api/staff/clinics', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.clinics)) {
        setClinics(
          data.clinics.map((c: { id: string; name: string }) => ({
            id: c.id,
            name: c.name,
          }))
        );
      }
    } catch {
      // Clinic list is best-effort; the server re-validates the clinic id
    }
  }, []);

  useEffect(() => {
    loadStaff();
    loadClinics();
  }, [loadStaff, loadClinics]);

  function openAdd() {
    setEditing(null);
    reset(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(member: StaffMemberRecord) {
    setEditing(member);
    reset({
      id: member.id,
      fullName: member.full_name,
      username: member.username,
      role: member.role,
      clinicId: member.clinic_id || '',
      password: '',
    });
    setModalOpen(true);
  }

  async function onSubmit(values: StaffFormValues) {
    setSubmitting(true);
    try {
      const result = await createOrUpdateStaff({
        id: editing?.id,
        fullName: values.fullName,
        username: values.username,
        role: values.role,
        clinicId: values.clinicId || undefined,
        password: values.password || undefined,
      });

      if (!result.success) {
        setToast({ kind: 'error', text: result.error || 'تعذر حفظ بيانات الموظف.' });
        return;
      }

      setToast({ kind: 'success', text: result.message || 'تم الحفظ بنجاح.' });
      setModalOpen(false);
      setEditing(null);
      await loadStaff();
    } catch (err) {
      console.error('Staff management action error:', err);
      setToast({
        kind: 'error',
        text: err instanceof Error ? err.message : 'انتهت الجلسة أو لا تملك الصلاحية، يرجى إعادة تسجيل الدخول.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  function openDeleteModal(member: StaffMemberRecord) {
    if (deletingId) return;
    setDeleteTarget(member);
  }

  function closeDeleteModal() {
    if (deletingId) return;
    setDeleteTarget(null);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deletingId) return;
    const targetUserId = deleteTarget.id;
    setDeletingId(targetUserId);

    try {
      const result = await deleteStaff(targetUserId);
      if (!result.success) {
        setToast({ kind: 'error', text: result.error || 'تعذر حذف الموظف.' });
        return;
      }

      // Instant UI Update: remove deleted staff member directly from React state without refresh
      setStaff((prev) => prev.filter((staff) => staff.id !== targetUserId));
      setToast({ kind: 'success', text: result.message || 'تم حذف الموظف بنجاح.' });
      setDeleteTarget(null);
    } catch (err) {
      console.error('Staff delete action error:', err);
      setToast({
        kind: 'error',
        text: err instanceof Error ? err.message : 'انتهت الجلسة أو لا تملك الصلاحية، يرجى إعادة تسجيل الدخول.',
      });
    } finally {
      setDeletingId(null);
    }
  }

  function clinicName(clinicId: string | null): string {
    if (!clinicId) return '—';
    return clinics.find((c) => c.id === clinicId)?.name || clinicId;
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8EE] p-3 sm:p-6 shadow-2xs space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-[#124E4A] flex items-center gap-2">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#087F78]" />
            <span>إدارة الموظفين</span>
          </h2>
          <p className="text-2xs sm:text-xs text-[#8493A6]">
            إنشاء وتعديل حسابات دخول الموظفين (مدير، استقبال، طبيب) بدون الحاجة إلى SQL.
          </p>
        </div>

        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#087F78] hover:bg-[#066560] text-white text-2xs sm:text-xs font-bold shadow-xs transition-colors shrink-0 cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>إضافة موظف جديد</span>
        </button>
      </div>

      {/* Error / Loading / Empty / Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-[#8493A6] text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#087F78]" />
          <span>جاري تحميل قائمة الموظفين...</span>
        </div>
      ) : loadError ? (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <span className="text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {loadError}
          </span>
          <button
            onClick={loadStaff}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-2xs font-bold transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      ) : staff.length === 0 ? (
        <div className="py-12 text-center text-[#8493A6] text-xs">
          لا يوجد موظفون مسجلون بعد. اضغط "إضافة موظف جديد" للبدء.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E2E8EE]">
          <table className="w-full text-right text-xs sm:text-sm min-w-[560px]">
            <thead>
              <tr className="bg-[#F6F9FB] text-[#163C3A]">
                <th className="px-3 py-2.5 font-bold">الاسم بالكامل</th>
                <th className="px-3 py-2.5 font-bold">اسم الدخول</th>
                <th className="px-3 py-2.5 font-bold">الدور</th>
                <th className="px-3 py-2.5 font-bold">العيادة</th>
                <th className="px-3 py-2.5 font-bold text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                  <td className="px-3 py-2.5 font-bold text-[#163C3A]">
                    {member.full_name}
                    {member.is_active !== true && (
                      <span className="mr-2 text-3xs bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded-full">
                        موقوف
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[#087F78] text-xs" dir="ltr">
                    {member.username}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 font-semibold text-[#163C3A]">
                      {member.role === 'ADMIN' && <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />}
                      {STAFF_ROLE_LABELS[member.role] || member.role}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#8493A6]">{clinicName(member.clinic_id)}</td>
                  <td className="px-3 py-2.5 text-left">
                    <div className="flex items-center justify-start gap-1.5">
                      <button
                        onClick={() => openEdit(member)}
                        disabled={deletingId === member.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#087F78]/40 text-[#087F78] hover:bg-emerald-50 text-2xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>تعديل</span>
                      </button>
                      <button
                        onClick={() => openDeleteModal(member)}
                        disabled={deletingId === member.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-2xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        title="حذف الموظف"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 text-right shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm sm:text-base font-bold text-[#124E4A] flex items-center gap-2">
                {editing ? (
                  <>
                    <Pencil className="w-4 h-4 sm:w-5 sm:h-5 text-[#087F78]" />
                    <span>تعديل بيانات الموظف</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-[#087F78]" />
                    <span>إضافة موظف جديد</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-3.5"
              noValidate
            >
              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  الاسم بالكامل <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: د/ شريف عبد الغني"
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm text-[#163C3A] focus:border-[#087F78] ${
                    errors.fullName ? 'border-red-300' : 'border-[#E2E8EE]'
                  }`}
                  {...register('fullName')}
                />
                {errors.fullName && (
                  <span className="block text-2xs text-red-600 mt-1">{errors.fullName.message}</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  اسم الدخول (Username) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  disabled={Boolean(editing)}
                  placeholder="مثال: doctor.echo"
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm font-mono text-right focus:border-[#087F78] disabled:bg-slate-100 disabled:text-slate-400 ${
                    errors.username ? 'border-red-300' : 'border-[#E2E8EE]'
                  }`}
                  {...register('username')}
                />
                {editing && (
                  <span className="block text-2xs text-[#8493A6] mt-1">
                    اسم الدخول لا يمكن تغييره بعد إنشاء الحساب.
                  </span>
                )}
                {errors.username && (
                  <span className="block text-2xs text-red-600 mt-1">{errors.username.message}</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  الدور <span className="text-red-500">*</span>
                </label>
                <select
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm font-semibold text-[#124E4A] bg-white focus:border-[#087F78] ${
                    errors.role ? 'border-red-300' : 'border-[#E2E8EE]'
                  }`}
                  {...register('role')}
                >
                  <option value="ADMIN">مدير النظام</option>
                  <option value="RECEPTIONIST">الاستقبال</option>
                  <option value="DOCTOR">طبيب</option>
                </select>
                {errors.role && (
                  <span className="block text-2xs text-red-600 mt-1">{errors.role.message}</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  العيادة المخصصة {selectedRole === 'DOCTOR' && <span className="text-red-500">*</span>}
                </label>
                <select
                  disabled={selectedRole !== 'DOCTOR'}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm font-semibold text-[#124E4A] bg-white focus:border-[#087F78] disabled:bg-slate-100 disabled:text-slate-400 ${
                    errors.clinicId ? 'border-red-300' : 'border-[#E2E8EE]'
                  }`}
                  {...register('clinicId')}
                >
                  <option value="">{selectedRole === 'DOCTOR' ? 'اختر العيادة...' : 'غير مطلوب لهذا الدور'}</option>
                  {clinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {selectedRole !== 'DOCTOR' && (
                  <span className="block text-2xs text-[#8493A6] mt-1">
                    العيادة مطلوبة فقط لحسابات الأطباء.
                  </span>
                )}
                {errors.clinicId && (
                  <span className="block text-2xs text-red-600 mt-1">{errors.clinicId.message}</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  كلمة المرور {!editing && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  placeholder={
                    editing
                      ? 'اتركها فارغة للإبقاء على كلمة المرور الحالية'
                      : '8 أحرف على الأقل'
                  }
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm font-mono text-right focus:border-[#087F78] ${
                    errors.password ? 'border-red-300' : 'border-[#E2E8EE]'
                  }`}
                  {...register('password')}
                />
                {errors.password && (
                  <span className="block text-2xs text-red-600 mt-1">{errors.password.message}</span>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#087F78] hover:bg-[#066560] text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : editing ? (
                    <span>حفظ التعديلات</span>
                  ) : (
                    <span>إنشاء الحساب</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full p-4 sm:p-6 text-right shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm sm:text-base font-bold text-red-700 flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <span>تأكيد حذف الموظف</span>
              </h3>
              <button
                onClick={closeDeleteModal}
                disabled={Boolean(deletingId)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer disabled:opacity-50 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                هل أنت متأكد من حذف الموظف <strong className="text-red-700 font-extrabold">{deleteTarget.full_name}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
              </p>

              {/* Staff Details Summary Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">اسم الدخول:</span>
                  <span className="font-mono text-[#087F78] font-bold" dir="ltr">{deleteTarget.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">الدور الوظيفي:</span>
                  <span className="font-semibold text-[#163C3A]">{STAFF_ROLE_LABELS[deleteTarget.role] || deleteTarget.role}</span>
                </div>
                {deleteTarget.clinic_id && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">العيادة:</span>
                    <span className="font-semibold text-[#163C3A]">{clinicName(deleteTarget.clinic_id)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={Boolean(deletingId)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={Boolean(deletingId)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {deletingId ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري الحذف...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>تأكيد الحذف</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification (Teal/Emerald theme) */}
      {toast && (
        <div className="fixed bottom-4 left-4 z-[60] max-w-xs w-full sm:w-auto">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold text-white ${
              toast.kind === 'success'
                ? 'bg-[#087F78] border-[#066560]'
                : 'bg-red-600 border-red-700'
            }`}
          >
            {toast.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
