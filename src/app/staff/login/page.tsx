"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, LockKeyhole, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function StaffLoginPage() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter(); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); if (!client) { setError("لم تُضبط خدمة Supabase بعد. أضف المتغيرات في البيئة."); return; } setLoading(true); const result = await client.auth.signInWithPassword({ email, password }); setLoading(false); if (result.error) { setError("تعذر تسجيل الدخول. تأكد من بياناتك أو اطلب تفعيل الحساب من المدير."); return; } router.push("/staff"); }
  return <main className="form-page"><div className="page-shell narrow"><Link className="back-link" href="/"><ArrowRight size={17} /> العودة للرئيسية</Link><div className="page-heading"><span className="page-icon"><LockKeyhole size={22} /></span><div><span className="section-kicker">مساحة الفريق</span><h1>دخول الموظفين</h1><p>الدخول مخصص للحسابات التي فعّلها مدير النظام.</p></div></div><div className="info-banner"><ShieldCheck size={20} /><span>لا يوجد تسجيل موظفين ذاتي أو حساب مدير افتراضي.</span></div><form className="staff-login-form" onSubmit={submit}><label>البريد الإلكتروني<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label>كلمة المرور<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>{error && <div className="error-banner">{error}</div>}<button className="button button-primary" disabled={loading}>{loading ? <><Loader2 className="spin" /> جارٍ التحقق...</> : "تسجيل الدخول"}</button></form></div></main>;
}
