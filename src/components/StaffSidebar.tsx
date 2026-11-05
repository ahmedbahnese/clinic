"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Activity, Archive, BarChart3, Building2, ClipboardCheck, FileClock, FileText, LayoutDashboard, LogOut, Menu, PanelRightClose, PanelRightOpen, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type StaffRole = "booking" | "doctor" | "nurse" | "admin";
type Profile = { display_name: string; role: StaffRole; avatar_url?: string };
type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };
const roleLabels: Record<StaffRole, string> = { admin: "مدير النظام", booking: "موظف الحجز والاستقبال", doctor: "طبيب/ة", nurse: "تمريض" };
const commonItems: NavItem[] = [
  { href: "/staff", label: "لوحة المتابعة والحجوزات", icon: LayoutDashboard },
  { href: "/staff/reports", label: "التقارير", icon: BarChart3 },
  { href: "/staff/account", label: "إعدادات حسابي", icon: UserRound },
];
const adminItems: NavItem[] = [
  { href: "/staff/clinics", label: "إدارة العيادات والخدمات", icon: Building2, adminOnly: true },
  { href: "/staff/users", label: "المستخدمون والصلاحيات", icon: Users, adminOnly: true },
  { href: "/staff/cancellation-requests", label: "طلبات الإلغاء والاعتذار", icon: ClipboardCheck, adminOnly: true },
  { href: "/staff/audit", label: "سجل العمليات", icon: FileClock, adminOnly: true },
  { href: "/staff/backups", label: "النسخ الاحتياطي", icon: Archive, adminOnly: true },
  { href: "/staff/cms", label: "إدارة محتوى الموقع", icon: FileText, adminOnly: true },
];
export default function StaffSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null); const [open, setOpen] = useState(false); const [collapsed, setCollapsed] = useState(false); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!client || pathname === "/staff/login") { setLoading(false); return; } let mounted = true; void (async () => { const session = await client.auth.getUser(); if (!session.data.user) { if (mounted) { setLoading(false); if (pathname !== "/staff") router.replace("/staff/login"); } return; } const result = await client.from("staff_profiles").select("display_name,role,avatar_url").eq("id", session.data.user.id).maybeSingle(); if (mounted) { setProfile(result.data as Profile | null); setLoading(false); } })(); return () => { mounted = false; }; }, [client, pathname, router]);
  useEffect(() => { setOpen(false); }, [pathname]);
  async function signOut() { if (client) await client.auth.signOut(); router.push("/staff/login"); }
  const items = profile?.role === "admin" ? [...commonItems, ...adminItems] : commonItems;
  const isLogin = pathname === "/staff/login";
  if (isLogin || loading || !profile) return <>{children}</>;
  return <div className={`staff-shell ${collapsed ? "staff-shell-collapsed" : ""}`} dir="rtl"><button className="staff-sidebar-mobile-toggle no-print" type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}>{open ? <X size={21} /> : <Menu size={21} />}</button>{open && <button className="staff-sidebar-backdrop no-print" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />}
    <aside className={`staff-sidebar ${open ? "is-open" : ""}`} aria-label="قائمة مساحة الموظفين"><div className="staff-sidebar-brand"><span className="staff-sidebar-logo"><Activity size={19} /></span><span className="staff-sidebar-brand-copy"><strong>مساحة الموظفين</strong><small>BSCH CLINICS</small></span><button className="staff-sidebar-collapse no-print" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "توسيع القائمة" : "تصغير القائمة"}>{collapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}</button></div><div className="staff-sidebar-profile"><span className="staff-sidebar-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <UserRound size={18} />}</span><span className="staff-sidebar-profile-copy"><strong>{profile.display_name || "حساب الموظف"}</strong><small>{roleLabels[profile.role]}</small></span></div><nav className="staff-sidebar-nav">{items.map((item) => { const active = item.href === "/staff" ? pathname === "/staff" : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} className={active ? "active" : ""} title={collapsed ? item.label : undefined}><item.icon size={18} /><span>{item.label}</span></Link>; })}</nav><div className="staff-sidebar-footer"><Link href="/" title={collapsed ? "الموقع العام" : undefined}><ShieldCheck size={17} /><span>الموقع العام</span></Link><button type="button" onClick={() => void signOut()} title={collapsed ? "تسجيل الخروج" : undefined}><LogOut size={17} /><span>تسجيل الخروج</span></button></div></aside><main className="staff-content">{children}</main></div>;
}
