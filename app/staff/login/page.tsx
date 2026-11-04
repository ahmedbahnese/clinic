'use client';

import React, { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Home,
} from 'lucide-react';

const emptySubscribe = () => () => {};

export default function StaffLoginPage() {
  const router = useRouter();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLogin() {
    if (!username || !password) {
      setErrorMessage('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'فشل تسجيل الدخول، تأكد من بيانات الحساب');
      } else {
        localStorage.setItem('bsch_staff_token', data.token);
        localStorage.setItem('bsch_staff_user', JSON.stringify(data.user));
        router.push('/staff/dashboard');
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrorMessage('حدث خطأ أثناء الاتصال بالنظام');
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#F6F9FB] flex items-center justify-center p-4">
        <div className="w-8 h-8 border-3 border-[#087F78] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F9FB] flex flex-col justify-between p-4 sm:p-6 text-right" suppressHydrationWarning>
      
      {/* Top Bar with Return Link */}
      <div className="w-full max-w-[1100px] mx-auto flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#79C7C1]/50 bg-white text-xs font-semibold text-[#087F78] hover:bg-emerald-50 transition-colors shadow-2xs"
        >
          <Home className="w-3.5 h-3.5 text-[#087F78]" />
          <span>العودة للرئيسية</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>

        <div className="flex items-center gap-2 text-xs font-bold text-[#124E4A]">
          <ShieldCheck className="w-4 h-4 text-[#087F78]" />
          <span>بوابة الدخول الموحدة لموظفي المستشفى</span>
        </div>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-lg mx-auto my-auto">
        <div className="bg-white rounded-[26px] border border-[#E2E8EE] p-7 sm:p-9 shadow-sm">
          
          <div className="text-center mb-7 space-y-2">
            <Link href="/" className="inline-block transition-transform hover:scale-105">
              <Image
                src="/logo-main.png"
                alt="شعار مستشفى الأطفال التخصصي بالبحيرة"
                width={96}
                height={96}
                className="w-20 sm:w-24 h-auto mx-auto mb-2 object-contain drop-shadow-xs"
                priority
              />
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#124E4A]">
              دخول الموظفين
            </h1>
            <p className="text-xs text-[#8493A6]">
              مستشفى الأطفال التخصصي بالبحيرة
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 text-right">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="usernameInput" className="block text-xs font-bold text-[#163C3A] mb-1.5">
                اسم المستخدم
              </label>
              <input
                id="usernameInput"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="اسم المستخدم"
                className="w-full px-4 py-3 rounded-xl border border-[#E2E8EE] focus:border-[#087F78] focus:ring-1 focus:ring-[#087F78]/20 bg-[#F6F9FB]/40 text-sm text-[#163C3A] text-right placeholder:text-[#8493A6] transition-all"
              />
            </div>

            <div>
              <label htmlFor="passwordInput" className="block text-xs font-bold text-[#163C3A] mb-1.5">
                كلمة المرور
              </label>
              <input
                id="passwordInput"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="كلمة المرور"
                className="w-full px-4 py-3 rounded-xl border border-[#E2E8EE] focus:border-[#087F78] focus:ring-1 focus:ring-[#087F78]/20 bg-[#F6F9FB]/40 text-sm text-[#163C3A] text-right placeholder:text-[#8493A6] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-[#087F78] hover:bg-[#124E4A] text-white text-sm font-bold shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-60 mt-2"
            >
              {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            </button>
          </form>

        </div>
      </div>

      {/* Footer info */}
      <div className="text-center text-2xs text-[#8493A6] py-3 flex items-center justify-center gap-4">
        <span>نظام تأمين الوصول الموحد — مستشفى الأطفال التخصصي بالبحيرة</span>
        <Link href="/" className="text-[#087F78] hover:underline">
          بوابة المرضى الخارجية
        </Link>
      </div>
    </div>
  );
}
