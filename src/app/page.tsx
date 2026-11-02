import Image from "next/image";
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

const hospitalWebsite = "https://albahira.elyoser.cloud/";

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
  return (
    <>
      <a className="skip-link" href="#main-content">
        انتقل إلى المحتوى
      </a>

      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="BSCH Clinics — الرئيسية">
            <span className="brand-logo-wrap">
              <Image
                src="/images/hospital-logo.png"
                alt="شعار مستشفى الأطفال التخصصي بالبحيرة"
                width={64}
                height={64}
                priority
              />
            </span>
            <span className="brand-copy">
              <span className="brand-name">BSCH CLINICS</span>
              <span className="brand-hospital">مستشفى الأطفال التخصصي بالبحيرة</span>
            </span>
          </Link>

          <nav className="main-nav" aria-label="التنقل الرئيسي">
            <Link className="nav-link nav-current" href="/">
              الرئيسية
            </Link>
            <Link className="nav-link" href="/booking">
              حجز موعد
            </Link>
            <Link className="nav-link" href="/track">
              متابعة الحجز
            </Link>
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
                مستشفى الأطفال التخصصي بالبحيرة
              </div>
              <p className="system-label">BSCH CLINICS <span>·</span> العيادات الخارجية</p>
              <h1 id="welcome-title">رعاية تبدأ بخطوة <span>واضحة.</span></h1>
              <p className="welcome-description">
                بوابتك الإلكترونية لخدمات العيادات الخارجية. قدّم طلب الحجز، وتابع حالته،
                واطّلع على الخطوة التالية بكل سهولة.
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
              <h2 id="services-title">كيف يمكننا مساعدتك؟</h2>
            </div>
            <p>اختر الخدمة المناسبة للانتقال مباشرة إلى وجهتك.</p>
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
            <strong>مستشفى الأطفال التخصصي بالبحيرة</strong>
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
          <span>مستشفى الأطفال التخصصي بالبحيرة</span>
          <a href={hospitalWebsite} target="_blank" rel="noopener noreferrer">الموقع الرسمي</a>
        </div>
      </footer>
    </>
  );
}
