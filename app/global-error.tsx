'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Critical Global Error:', error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-[#F6F9FB] flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 text-center shadow-lg space-y-5">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-200 shadow-xs">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#163C3A]">
              حدث خطأ غير متوقع
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              نعتذر، واجه النظام خطأً تقنياً مؤقتاً أثناء معالجة الطلب. تم تسجيل الخطأ تلقائياً للتحقق منه.
            </p>
          </div>

          {error.digest && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-3xs font-mono text-slate-500">
              رمز مرجعي للخطأ: {error.digest}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              onClick={() => reset()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#087F78] hover:bg-[#124E4A] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              إعادة المحاولة
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#163C3A] rounded-xl text-xs sm:text-sm font-bold transition"
            >
              <Home className="w-4 h-4" />
              الرئيسية
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
