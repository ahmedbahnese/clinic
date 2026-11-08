'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, LogOut } from 'lucide-react';

export default function DashboardErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Staff Dashboard Client Exception:', error);
  }, [error]);

  function handleLogoutAndReset() {
    try {
      localStorage.removeItem('bsch_staff_token');
      localStorage.removeItem('bsch_staff_user');
    } catch {
      // ignore
    }
    window.location.href = '/staff/login';
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-8 border border-red-200 text-center shadow-lg space-y-5">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-200 shadow-xs">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-black text-[#163C3A]">
            حدث خطأ غير متوقع في لوحة التحكم
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            واجهت الواجهة خطأً تقنياً مؤقتاً أثناء عرض البيانات أو التبديل بين الأقسام. يمكنك إعادة المحاولة فوراً دون الحاجة لإعادة فتح المتصفح.
          </p>
        </div>

        {error.digest && (
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-3xs font-mono text-slate-500">
            رمز تشخيص الخطأ: {error.digest}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#087F78] hover:bg-[#124E4A] text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            إعادة تحميل القسم
          </button>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#163C3A] rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            تحديث الصفحة بالكامل
          </button>
          <button
            onClick={handleLogoutAndReset}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            إعادة الدخول
          </button>
        </div>
      </div>
    </div>
  );
}
