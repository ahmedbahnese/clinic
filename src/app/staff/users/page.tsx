"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRoundCog,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type StaffRole = "booking" | "doctor" | "nurse" | "admin";
type AccessState = "checking" | "ready" | "configuration" | "signed-out" | "forbidden" | "error";
type StaffProfile = {
  id: string;
  display_name: string;
  role: StaffRole;
  is_active: boolean;
};
type Clinic = { id: string; name: string; slug: string };
type StaffDraft = { role: StaffRole; is_active: boolean; clinicIds: string[] };

const roleLabels: Record<StaffRole, string> = {
  booking: "موظف حجوزات",
  doctor: "طبيب",
  nurse: "تمريض",
  admin: "مدير النظام",
};

function explainError(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();
  if (code === "42501") {
    return "رفضت قاعدة البيانات هذا الإجراء. تحقق من صلاحية المدير النشط وسياسات RLS؛ كما لا يمكن تعديل دور حسابك الحالي.";
  }
  if (code === "P0002") {
    return "لا يوجد ملف موظف لهذا الحساب بعد. يجب على المستخدم تسجيل الدخول إلى Auth أولًا كي يظهر ملفه هنا.";
  }
  if (code === "22023") {
    return "تعذر حفظ البيانات: دور غير صالح أو عيادة غير معروفة. حدّث القائمة ثم أعد المحاولة.";
  }
  if (message.includes("fetch") || message.includes("network") || message.includes("load failed")) {
    return "تعذر الاتصال بخدمة Supabase. تحقق من الشبكة وإعدادات الخدمة ثم أعد المحاولة.";
  }
  return "تعذر إكمال الطلب. قد تكون الجلسة انتهت أو منعت سياسات RLS القراءة؛ أعد تسجيل الدخول أو حدّث الصفحة.";
}

export default function StaffUsersPage() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>("checking");
  const [userId, setUserId] = useState("");
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [drafts, setDrafts] = useState<Record<string, StaffDraft>>({});
  const [pageError, setPageError] = useState("");
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Record<string, { kind: "success" | "error"; text: string }>>({});

  const loadDirectory = useCallback(async () => {
    if (!client) return false;
    setLoadingDirectory(true);
    setPageError("");
    try {
      const [staffResult, assignmentsResult, clinicsResult] = await Promise.all([
        client.from("staff_profiles").select("id, display_name, role, is_active").order("display_name"),
        client.from("clinic_staff_assignments").select("staff_id, clinic_id"),
        client.from("clinics").select("id, name, slug").eq("is_active", true).order("name"),
      ]);
      const queryError = staffResult.error ?? assignmentsResult.error ?? clinicsResult.error;
      if (queryError) {
        setPageError(explainError(queryError));
        return false;
      }

      const nextStaff = (staffResult.data ?? []) as StaffProfile[];
      const assignmentMap = new Map<string, string[]>();
      for (const assignment of assignmentsResult.data ?? []) {
        const ids = assignmentMap.get(assignment.staff_id) ?? [];
        ids.push(assignment.clinic_id);
        assignmentMap.set(assignment.staff_id, ids);
      }
      const nextClinics = (clinicsResult.data ?? []) as Clinic[];
      setStaff(nextStaff);
      setClinics(nextClinics);
      setDrafts(Object.fromEntries(nextStaff.map((profile) => [profile.id, {
        role: profile.role,
        is_active: profile.is_active,
        clinicIds: assignmentMap.get(profile.id) ?? [],
      }])));
      return true;
    } catch {
      setPageError("تعذر الاتصال بخدمة Supabase أثناء تحميل البيانات. تحقق من الشبكة وحاول مجددًا.");
      return false;
    } finally {
      setLoadingDirectory(false);
    }
  }, [client]);

  const verifyAccess = useCallback(async () => {
    setPageError("");
    if (!client) {
      setAccess("configuration");
      return;
    }
    setAccess("checking");
    try {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError) {
        setAccess("error");
        setPageError(explainError(authError));
        return;
      }
      if (!authData.user) {
        setUserId("");
        setAccess("signed-out");
        return;
      }

      const { data: profile, error: profileError } = await client
        .from("staff_profiles")
        .select("id, role, is_active")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (profileError) {
        setAccess("error");
        setPageError(explainError(profileError));
        return;
      }
      if (!profile || profile.role !== "admin" || !profile.is_active) {
        setAccess("forbidden");
        return;
      }

      setUserId(authData.user.id);
      setAccess("ready");
      await loadDirectory();
    } catch {
      setAccess("error");
      setPageError("تعذر التحقق من الجلسة بسبب خطأ في الشبكة. تحقق من اتصال Supabase وأعد المحاولة.");
    }
  }, [client, loadDirectory]);

  useEffect(() => {
    const timer = window.setTimeout(() => void verifyAccess(), 0);
    return () => window.clearTimeout(timer);
  }, [verifyAccess]);

  function updateDraft(staffId: string, patch: Partial<StaffDraft>) {
    setDrafts((current) => ({
      ...current,
      [staffId]: { ...current[staffId], ...patch },
    }));
    setFeedback((current) => {
      const next = { ...current };
      delete next[staffId];
      return next;
    });
  }

  function toggleClinic(staffId: string, clinicId: string, checked: boolean) {
    const current = drafts[staffId];
    if (!current) return;
    const clinicIds = checked
      ? Array.from(new Set([...current.clinicIds, clinicId]))
      : current.clinicIds.filter((id) => id !== clinicId);
    updateDraft(staffId, { clinicIds });
  }

  async function saveStaff(profile: StaffProfile) {
    if (!client || profile.id === userId) return;
    const draft = drafts[profile.id];
    if (!draft) return;

    setSavingIds((current) => [...current, profile.id]);
    setFeedback((current) => {
      const next = { ...current };
      delete next[profile.id];
      return next;
    });
    try {
      const { error } = await client.rpc("admin_set_staff", {
        p_staff_id: profile.id,
        p_role: draft.role,
        p_is_active: draft.is_active,
        p_clinic_ids: draft.clinicIds,
      });
      if (error) {
        setFeedback((current) => ({ ...current, [profile.id]: { kind: "error", text: explainError(error) } }));
        return;
      }
      setFeedback((current) => ({ ...current, [profile.id]: { kind: "success", text: "تم حفظ الدور والتفعيل والعيادات." } }));
      await loadDirectory();
    } catch {
      setFeedback((current) => ({
        ...current,
        [profile.id]: { kind: "error", text: "فشل الاتصال أثناء الحفظ. تحقق من الشبكة؛ أعد تحميل القائمة للتأكد من حالة التغيير." },
      }));
    } finally {
      setSavingIds((current) => current.filter((id) => id !== profile.id));
    }
  }

  async function signOut() {
    if (!client) return;
    try {
      await client.auth.signOut();
    } finally {
      router.replace("/staff/login");
    }
  }

  const activeClinicIds = useMemo(() => new Set(clinics.map((clinic) => clinic.id)), [clinics]);

  return (
    <main className="form-page" dir="rtl" lang="ar" style={{ minHeight: "100vh", paddingTop: 28 }}>
      <div className="page-shell" style={{ width: "min(1120px, 100%)" }}>
        <Link className="back-link" href="/">
          <ArrowRight size={17} aria-hidden="true" /> العودة للرئيسية
        </Link>

        <div className="page-heading" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <span className="page-icon"><UserRoundCog size={23} aria-hidden="true" /></span>
            <div>
              <span className="section-kicker">إدارة الوصول</span>
              <h1>إدارة حسابات الفريق</h1>
              <p>تعيين الدور، تفعيل الحساب، وتحديد العيادات المصرّح بها.</p>
            </div>
          </div>
          {access === "ready" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button className="button button-outline" type="button" onClick={() => void loadDirectory()} disabled={loadingDirectory}>
                {loadingDirectory ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
                تحديث القائمة
              </button>
              <button className="button button-outline" type="button" onClick={() => void signOut()}>
                <LogOut size={17} /> تسجيل الخروج
              </button>
            </div>
          )}
        </div>

        <div className="info-banner" role="note">
          <ShieldCheck size={20} aria-hidden="true" />
          <span>
            أنشئ حساب Auth أو أرسل الدعوة من لوحة Supabase الرسمية أولًا؛ هذه الصفحة لا تنشئ حسابات Auth ولا ترسل بريدًا.
            بعد أول تسجيل دخول للمستخدم، سيظهر سجله هنا غير مفعّل لتتمكن من تعيين دوره وتفعيله. لا توجد كلمة مرور افتراضية، ولا يمكن للمستخدم ترقية نفسه.
          </span>
        </div>

        {access === "checking" && (
          <div className="loading-box" role="status"><Loader2 className="spin" /> جارٍ التحقق من الجلسة وصلاحية المدير...</div>
        )}

        {access === "configuration" && (
          <div className="error-banner" role="alert"><CircleAlert size={20} /> لم تُضبط متغيرات البيئة NEXT_PUBLIC_SUPABASE_URL وNEXT_PUBLIC_SUPABASE_ANON_KEY لهذه الواجهة.</div>
        )}

        {access === "signed-out" && (
          <section style={panelStyle}>
            <CircleAlert size={23} color="#b2751a" />
            <h2 style={panelHeadingStyle}>يلزم تسجيل الدخول</h2>
            <p style={mutedStyle}>هذه الصفحة متاحة للمدير النشط فقط. سجّل الدخول بحساب مخوّل للمتابعة.</p>
            <Link className="button button-primary" href="/staff/login">الانتقال إلى دخول الموظفين</Link>
          </section>
        )}

        {access === "forbidden" && (
          <section style={panelStyle}>
            <ShieldCheck size={24} color="#a24449" />
            <h2 style={panelHeadingStyle}>لا تملك صلاحية الإدارة</h2>
            <p style={mutedStyle}>يجب أن يكون ملفك في قاعدة البيانات بدور مدير وأن يكون الحساب مفعّلًا. لا تمنح الصفحة صلاحيات ذاتية.</p>
            <Link className="button button-outline" href="/staff/login">العودة إلى تسجيل الدخول</Link>
          </section>
        )}

        {access === "error" && (
          <section style={panelStyle}>
            <div className="error-banner" role="alert" style={{ marginBottom: 0 }}><CircleAlert size={20} /> {pageError || "تعذر التحقق من الصلاحية."}</div>
            <button className="button button-primary" type="button" onClick={() => void verifyAccess()} style={{ justifySelf: "start" }}>
              <RefreshCw size={17} /> إعادة المحاولة
            </button>
          </section>
        )}

        {access === "ready" && (
          <>
            {pageError && <div className="error-banner" role="alert"><CircleAlert size={20} /> {pageError}</div>}
            <div style={summaryStyle}>
              <div><Users size={19} /><span><strong>{staff.length}</strong> ملفات موظفين</span></div>
              <div><Building2 size={19} /><span><strong>{clinics.length}</strong> عيادات مفعّلة</span></div>
            </div>

            {loadingDirectory && staff.length === 0 ? (
              <div className="loading-box" role="status"><Loader2 className="spin" /> جارٍ تحميل الموظفين والعيادات...</div>
            ) : staff.length === 0 && !pageError ? (
              <section style={panelStyle}>
                <Users size={24} color="#0f948b" />
                <h2 style={panelHeadingStyle}>لا توجد ملفات موظفين بعد</h2>
                <p style={mutedStyle}>أضف حساب الموظف أو أرسل دعوته عبر لوحة Supabase Auth الرسمية. سيظهر ملفه هنا بعد تسجيل دخوله للمرة الأولى.</p>
              </section>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {staff.map((profile) => {
                  const draft = drafts[profile.id];
                  if (!draft) return null;
                  const isSelf = profile.id === userId;
                  const saving = savingIds.includes(profile.id);
                  const hiddenAssignments = draft.clinicIds.filter((id) => !activeClinicIds.has(id)).length;
                  const status = feedback[profile.id];
                  return (
                    <article key={profile.id} style={{ ...cardStyle, opacity: isSelf ? 0.88 : 1 }}>
                      <div style={cardHeaderStyle}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 9 }}>
                            <h2 style={staffNameStyle}>{profile.display_name.trim() || "موظف بدون اسم"}</h2>
                            {isSelf && <span style={selfBadgeStyle}>حسابك الحالي — للعرض فقط</span>}
                            <span style={draft.is_active ? activeBadgeStyle : inactiveBadgeStyle}>
                              {draft.is_active ? "مفعّل" : "غير مفعّل"}
                            </span>
                          </div>
                          <code dir="ltr" style={idStyle}>{profile.id}</code>
                        </div>
                        <span style={roleBadgeStyle}>{roleLabels[draft.role]}</span>
                      </div>

                      <fieldset disabled={isSelf || saving} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                        <div style={fieldGridStyle}>
                          <label style={fieldLabelStyle}>
                            الدور الوظيفي
                            <select value={draft.role} onChange={(event) => updateDraft(profile.id, { role: event.target.value as StaffRole })} style={inputStyle}>
                              {(Object.keys(roleLabels) as StaffRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                            </select>
                          </label>
                          <label style={{ ...fieldLabelStyle, ...activationStyle }}>
                            <input
                              type="checkbox"
                              checked={draft.is_active}
                              onChange={(event) => updateDraft(profile.id, { is_active: event.target.checked })}
                              style={{ width: 18, height: 18, accentColor: "#0f948b" }}
                            />
                            تفعيل حساب الموظف
                          </label>
                        </div>

                        <div style={{ marginTop: 20 }}>
                          <div style={sectionTitleStyle}><Building2 size={17} /> العيادات المسموح بها</div>
                          {clinics.length === 0 ? (
                            <p style={mutedStyle}>لا توجد عيادات مفعّلة متاحة للربط.</p>
                          ) : (
                            <div style={clinicGridStyle}>
                              {clinics.map((clinic) => (
                                <label key={clinic.id} style={clinicOptionStyle}>
                                  <input
                                    type="checkbox"
                                    checked={draft.clinicIds.includes(clinic.id)}
                                    onChange={(event) => toggleClinic(profile.id, clinic.id, event.target.checked)}
                                    style={{ width: 17, height: 17, accentColor: "#0f948b", flex: "0 0 auto" }}
                                  />
                                  <span>{clinic.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {hiddenAssignments > 0 && (
                            <p style={{ ...mutedStyle, marginTop: 10 }}>
                              توجد {hiddenAssignments} تعيينات لعيادات غير مفعّلة أو غير معروضة؛ ستبقى محفوظة عند تحديث الربط من هذه الصفحة.
                            </p>
                          )}
                        </div>
                      </fieldset>

                      <div style={cardFooterStyle}>
                        {status && (
                          <div role={status.kind === "error" ? "alert" : "status"} style={status.kind === "error" ? inlineErrorStyle : inlineSuccessStyle}>
                            {status.kind === "error" ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}
                            <span>{status.text}</span>
                          </div>
                        )}
                        {isSelf ? (
                          <p style={{ ...mutedStyle, margin: 0 }}>واجهة التعديل معطّلة لحسابك، وتمنع الدالة في قاعدة البيانات تعديل دور المدير الحالي أو تفعيله.</p>
                        ) : (
                          <button className="button button-primary" type="button" onClick={() => void saveStaff(profile)} disabled={saving || loadingDirectory}>
                            {saving ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
                            {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

const panelStyle = {
  display: "grid",
  justifyItems: "start",
  gap: 12,
  padding: "clamp(22px, 4vw, 34px)",
  border: "1px solid #e2ecee",
  borderRadius: 20,
  background: "#fff",
  boxShadow: "0 12px 38px rgb(23 60 69 / 6%)",
} as const;
const panelHeadingStyle = { margin: 0, fontSize: 21, color: "#173c45" } as const;
const mutedStyle = { margin: 0, color: "#668086", fontSize: 14, lineHeight: 1.8 } as const;
const summaryStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  margin: "0 0 18px",
} as const;
const cardStyle = {
  padding: "clamp(18px, 3vw, 26px)",
  border: "1px solid #e2ecee",
  borderRadius: 18,
  background: "#fff",
  boxShadow: "0 9px 28px rgb(23 60 69 / 5%)",
} as const;
const cardHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 12,
  paddingBottom: 18,
  marginBottom: 18,
  borderBottom: "1px solid #edf2f3",
} as const;
const staffNameStyle = { margin: 0, color: "#173c45", fontSize: 18, lineHeight: 1.5 } as const;
const idStyle = { display: "inline-block", marginTop: 5, color: "#819398", fontSize: 11, overflowWrap: "anywhere" as const };
const selfBadgeStyle = { borderRadius: 99, padding: "4px 9px", background: "#eef3f5", color: "#526a70", fontSize: 11, fontWeight: 700 } as const;
const activeBadgeStyle = { borderRadius: 99, padding: "4px 10px", background: "#e8f7f1", color: "#18805d", fontSize: 12, fontWeight: 700 } as const;
const inactiveBadgeStyle = { borderRadius: 99, padding: "4px 10px", background: "#fff4e7", color: "#9b641f", fontSize: 12, fontWeight: 700 } as const;
const roleBadgeStyle = { borderRadius: 10, padding: "7px 11px", background: "#edf7f6", color: "#087b74", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const };
const fieldGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", alignItems: "end", gap: 16 } as const;
const fieldLabelStyle = { display: "grid", gap: 8, color: "#416068", fontSize: 13, fontWeight: 700 } as const;
const inputStyle = { width: "100%", minHeight: 46, padding: "9px 12px", border: "1px solid #d7e5e7", borderRadius: 11, background: "#fff", color: "#173c45", font: "inherit", fontSize: 14 } as const;
const activationStyle = { display: "flex", minHeight: 46, alignItems: "center", gap: 10, padding: "0 12px", border: "1px solid #e4edef", borderRadius: 11, background: "#fbfdfd" } as const;
const sectionTitleStyle = { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "#416068", fontSize: 13, fontWeight: 700 } as const;
const clinicGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 9 } as const;
const clinicOptionStyle = { display: "flex", minWidth: 0, alignItems: "center", gap: 9, padding: "10px 12px", border: "1px solid #e4edef", borderRadius: 10, background: "#fbfdfd", color: "#416068", fontSize: 13, cursor: "pointer" } as const;
const cardFooterStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px solid #edf2f3" } as const;
const inlineErrorStyle = { display: "flex", alignItems: "flex-start", gap: 7, maxWidth: 680, color: "#9b4146", fontSize: 12, lineHeight: 1.7 } as const;
const inlineSuccessStyle = { display: "flex", alignItems: "center", gap: 7, color: "#18805d", fontSize: 12, fontWeight: 700 } as const;
