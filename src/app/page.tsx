"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpLeft,
  CalendarDays,
  ClipboardCheck,
  HeartHandshake,
  LockKeyhole,
  Stethoscope,
} from "lucide-react";

const defaultHospitalWebsite = "https://albahira.elyoser.cloud/";
type CmsHome = { site_name: string; tagline: string; header_title: string; logo_url: string; hospital_website: string; notice_title: string; notice_body: string; notice_enabled: boolean };
type CmsSection = { section_key: string; title: string; subtitle: string; body: string; is_visible: boolean };
type CmsNav = { label: string; href: string; open_mode: string };

const services = [
  {
    href: "/booking",
    icon: CalendarDays,
    title: "حجز موعد",
    description: "ابدأ طلب حجز للعيادات الخارجية بخطوات واضحة.",
    action: "ابدأ الحجز",
    tone: "mint",
  },
  {
    href: "/track",
    icon: ClipboardCheck,
    title: "متابعة الحجز",
    description: "تابع حالة طلبك باستخدام بيانات المتابعة الآمنة.",
    action: "متابعة الطلب",
    tone: "blue",
  },
  {
    href: "/staff/login",
    icon: LockKeyhole,
    title: "دخول الموظفين",
    description: "مساحة عمل مخصصة للموظفين المخوّلين.",
    action: "دخول الموظفين",
    tone: "sand",
  },
];

export default function Home() {
  const [cms, setCms] = useState<CmsHome | null>(null);
  const [sections, setSections] = useState<CmsSection[]>([]);
  const [navLinks, setNavLinks] = useState<CmsNav[]>([]);
  useEffect(() => { const client = createSupabaseBrowserClient(); if (!client) return; void Promise.all([client.from("site_settings").select("site_name,tagline,header_title,logo_url,hospital_website,notice_title,notice_body,notice_enabled").eq("id", true).maybeSingle(), client.from("site_sections").select("section_key,title,subtitle,body,is_visible").eq("is_visible", true).order("sort_order"), client.from("site_nav_links").select("label,href,open_mode").eq("is_visible", true).order("sort_order")]).then(([settingsResult, sectionsResult, navResult]) => { if (settingsResult.data) setCms(settingsResult.data as CmsHome); setSections((sectionsResult.data ?? []) as CmsSection[]); setNavLinks((navResult.data ?? []) as CmsNav[]); }); }, []);
  const cmsSection = (key: string) => sections.find((item) => item.section_key === key);
  const hospitalWebsite = cms?.hospital_website || defaultHospitalWebsite;
  const siteName = cms?.site_name || "مستشفى الأطفال التخصصي بالبحيرة";
  return (
    <>
      <a className="skip-link" href="#main-content">
        انتقل إلى المحتوى
      </a>

      <header className="site-header">
        {cms?.notice_enabled && cms.notice_body && <div className="cms-notice"><strong>{cms.notice_title || "تنبيه"}</strong> {cms.notice_body}</div>}
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="BSCH Clinics — الرئيسية">
            <span className="brand-logo-wrap">
              <Image
                src="/images/hospital-logo.png"
                alt={`شعار ${siteName}`}
                width={64}
                height={64}
                priority
              />
            </span>
            <span className="brand-copy">
              <span className="brand-name">{cms?.header_title || "BSCH CLINICS"}</span>
              <span className="brand-hospital">{siteName}</span>
            </span>
          </Link>

          <nav className="main-nav" aria-label="التنقل الرئيسي">
            {(navLinks.length ? navLinks : [{ label: "الرئيسية", href: "/", open_mode: "same_tab" }, { label: "حجز موعد", href: "/booking", open_mode: "same_tab" }, { label: "متابعة الحجز", href: "/track", open_mode: "same_tab" }]).map((item) => <Link className={`nav-link${item.href === "/" ? " nav-current" : ""}`} href={item.href} key={`${item.label}-${item.href}`} target={item.open_mode === "new_tab" ? "_blank" : undefined} rel={item.open_mode === "new_tab" ? "noopener noreferrer" : undefined}>{item.label}</Link>)}
          </nav>

          <Link className="header-staff-link" href="/staff/login">
            <LockKeyhole size={16} aria-hidden="true" />
            <span>دخول الموظفين</span>
          </Link>
        </div>
      </header>

      <main id="main-content">
        <section className="welcome-section" aria-labelledby="welcome-title">
          <div className="welcome-card">
            <div className="welcome-content">
              <div className="eyebrow">
                <span className="eyebrow-dot" aria-hidden="true" />
                {siteName}
              </div>
              <p className="system-label">BSCH CLINICS <span>·</span> العيادات الخارجية</p>
              <h1 id="welcome-title">{cmsSection("hero")?.title || <>رعاية تبدأ بخطوة <span>واضحة.</span></>}</h1>
              <p className="welcome-description">
                {cmsSection("hero")?.body || "بوابتك الإلكترونية لخدمات العيادات الخارجية. قدّم طلب الحجز، وتابع حالته، واطّلع على الخطوة التالية بكل سهولة."}
              </p>
              <div className="welcome-actions">
                <Link className="button button-primary" href="/booking">
                  <span>العيادات الخارجية</span>
                  <ArrowLeft size={18} aria-hidden="true" />
                </Link>
                <a
                  className="button button-outline"
                  href={hospitalWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>موقع المستشفى</span>
                  <ArrowUpLeft size={17} aria-hidden="true" />
                </a>
              </div>
              <div className="welcome-note">
                <HeartHandshake size={17} aria-hidden="true" />
                <span>خطوات واضحة للعائلات، ومساحة عمل مخصصة للفريق الطبي.</span>
              </div>
            </div>

            <div className="welcome-visual" aria-label="رسم توضيحي لمستشفى الأطفال">
              <div className="visual-orbit visual-orbit-one" aria-hidden="true" />
              <div className="visual-orbit visual-orbit-two" aria-hidden="true" />
              <div className="visual-image-frame">
                <Image
                  src="/images/hero.png"
                  alt="رسم توضيحي لمستشفى وطاقم رعاية الأطفال"
                  fill
                  priority
                  sizes="(max-width: 760px) 100vw, 48vw"
                  className="welcome-image"
                />
              </div>
              <div className="visual-caption">
                <span className="caption-mark"><Stethoscope size={18} aria-hidden="true" /></span>
                <span><strong>العيادات الخارجية</strong><small>خدمة أقرب وأسهل للعائلة</small></span>
              </div>
              <div className="visual-sparkle sparkle-one" aria-hidden="true">✳</div>
              <div className="visual-sparkle sparkle-two" aria-hidden="true">✦</div>
            </div>
            <span className="welcome-index" aria-hidden="true">01 <i /> BSCH</span>
          </div>
        </section>

        <section className="services-section" aria-labelledby="services-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">خدمات إلكترونية</span>
              <h2 id="services-title">{cmsSection("services")?.title || "كيف يمكننا مساعدتك؟"}</h2>
            </div>
            <p>{cmsSection("services")?.body || "اختر الخدمة المناسبة للانتقال مباشرة إلى وجهتك."}</p>
          </div>

          <div className="service-grid">
            {services.map(({ href, icon: Icon, title, description, action, tone }) => (
              <Link className="service-card" href={href} key={href}>
                <span className={`service-icon service-icon-${tone}`}>
                  <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="service-card-title">{title}</span>
                <span className="service-card-description">{description}</span>
                <span className="service-card-action">
                  {action}<ArrowLeft size={16} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="journey-section" aria-labelledby="journey-title">
          <div className="journey-intro">
            <span className="journey-symbol" aria-hidden="true"><HeartHandshake size={21} /></span>
            <div>
              <span className="section-kicker">رحلتك معنا</span>
              <h2 id="journey-title">من الطلب إلى المتابعة، ببساطة</h2>
            </div>
          </div>
          <ol className="journey-steps">
            <li>
              <span className="step-number">١</span>
              <span><strong>قدّم طلبك</strong><small>اختر حجز موعد من الخدمات الإلكترونية.</small></span>
            </li>
            <li>
              <span className="step-number">٢</span>
              <span><strong>تابع حالة الطلب</strong><small>ارجع إلى صفحة المتابعة لمعرفة المستجدات.</small></span>
            </li>
            <li>
              <span className="step-number">٣</span>
              <span><strong>اتبع التعليمات</strong><small>راجع تفاصيل الحجز والتعليمات عند توفرها.</small></span>
            </li>
          </ol>
        </section>

        <section className="hospital-link-panel" aria-label="الموقع الرسمي للمستشفى">
          <div className="hospital-panel-brand" aria-hidden="true">
            <Image src="/images/hospital-logo.png" alt="" width={54} height={54} />
          </div>
          <div className="hospital-panel-copy">
            <strong>{siteName}</strong>
            <span>للتعرّف على المستشفى وخدماته، تفضل بزيارة الموقع الرسمي.</span>
          </div>
          <a href={hospitalWebsite} target="_blank" rel="noopener noreferrer" className="hospital-panel-link">
            <span>موقع المستشفى</span><ArrowUpLeft size={17} aria-hidden="true" />
          </a>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <span>BSCH CLINICS <i aria-hidden="true">·</i> العيادات الخارجية</span>
          <span>{siteName}</span>
          <a href={hospitalWebsite} target="_blank" rel="noopener noreferrer">الموقع الرسمي</a>
        </div>
      </footer>
    </>
  );
}
