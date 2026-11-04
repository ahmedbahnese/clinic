"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, LockKeyhole, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function StaffLoginPage() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter(); const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); if (!client) { setError("لم تُضبط خدمة Supabase بعد. أضف المتغيرات في البيئة."); return; } if (!identifier.trim() || !password) { setError("أدخل البريد أو رقم الهاتف أو اسم الحساب وكلمة المرور."); return; } setLoading(true); try { const lookup = await client.rpc("resolve_staff_login_identifier", { p_identifier: identifier.trim() }); const email = lookup.data as string | null; if (lookup.error || !email) { setError("لم نجد حساب موظف نشطًا بهذه البيانات."); return; } const result = await client.auth.signInWithPassword({ email, password }); if (result.error) { setError("بيانات الدخول غير صحيحة أو الحساب غير مفعّل."); return; } router.push("/staff"); } catch { setError("تعذر التحقق من الحساب. حاول مرة أخرى."); } finally { setLoading(false); } }
  return <main className="form-page"><div className="page-shell narrow"><Link className="back-link" href="/"><ArrowRight size={17} /> العودة للرئيسية</Link><div className="page-heading"><span className="page-icon"><LockKeyhole size={22} /></span><div><span className="section-kicker">مساحة الفريق</span><h1>دخول الموظفين</h1><p>استخدم البريد الإلكتروني أو رقم الهاتف أو اسم الحساب.</p></div></div><div className="staff-checking-visual"><Image src="/images/hero.png" alt="مستشفى الأطفال التخصصي بالبحيرة" fill sizes="520px" /><div><Loader2 className="spin" size={24} /><span>يتم التحقق من بيانات الحساب بأمان</span></div></div><form className="staff-login-form" onSubmit={submit}><label>البريد الإلكتروني أو رقم الهاتف أو اسم الحساب<input type="text" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required autoComplete="username" placeholder="البريد أو الهاتف أو الاسم" /></label><label>كلمة المرور<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>{error && <div className="error-banner" role="alert"><ShieldCheck size={18} />{error}</div>}<button className="button button-primary" disabled={loading}>{loading ? <><Loader2 className="spin" /> جارٍ التحقق...</> : "تسجيل الدخول"}</button></form></div></main>;
}
