import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Phone, Clock, MapPin, ShieldCheck, Mail, Globe, ExternalLink, Share2 } from 'lucide-react';
import type { WebsiteSettings, SocialLinkItem } from '@/types/cms';

function formatExternalUrl(url?: string): string {
  if (!url || !url.trim()) return '#';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getSocialIcon(platform: string) {
  const p = platform.toLowerCase();
  if (p === 'facebook') {
    return (
      <svg className="w-3.5 h-3.5 fill-current text-[#1877F2]" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    );
  }
  if (p === 'whatsapp') {
    return (
      <svg className="w-3.5 h-3.5 fill-current text-[#25D366]" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.301-.15-1.782-.879-2.058-.98-.276-.1-.477-.15-.678.15-.2.3-.778.98-.954 1.18-.175.2-.351.226-.652.075-.301-.15-1.272-.469-2.423-1.496-.896-.799-1.5-1.786-1.677-2.088-.175-.3-.019-.462.132-.612.136-.135.301-.35.452-.526.15-.175.2-.3.301-.5.101-.2.05-.376-.025-.526-.075-.15-.678-1.636-.929-2.241-.244-.59-.493-.51-.678-.52l-.578-.01c-.2 0-.526.075-.802.376-.276.301-1.054 1.03-1.054 2.511 0 1.482 1.079 2.912 1.23 3.113.15.2 2.124 3.243 5.145 4.549.719.31 1.28.497 1.718.636.722.23 1.378.197 1.9.12.58-.086 1.782-.728 2.033-1.431.251-.703.251-1.306.176-1.431-.076-.125-.276-.2-.577-.35z"/>
      </svg>
    );
  }
  if (p === 'youtube') {
    return (
      <svg className="w-3.5 h-3.5 fill-current text-[#FF0000]" viewBox="0 0 24 24">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    );
  }
  if (p === 'twitter' || p === 'x') {
    return (
      <svg className="w-3.5 h-3.5 fill-current text-[#0f1419]" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    );
  }
  if (p === 'instagram') {
    return (
      <svg className="w-3.5 h-3.5 fill-current text-[#E4405F]" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    );
  }
  return <Globe className="w-3.5 h-3.5 text-[#087F78]" />;
}

interface SiteFooterProps {
  settings?: WebsiteSettings;
}

export function SiteFooter({ settings }: SiteFooterProps) {
  const footerLogo = settings?.footer_logo_url || '/logo-main.png';
  const summary =
    settings?.footer_summary ||
    'خدمة حكومية متخصصة لتقديم الرعاية الطبية الفائقة لأطفال محافظة البحيرة، من خلال نخبة من أطباء واستشاريي الأطفال في شتى التخصصات الدقيقة.';
  const address =
    settings?.hospital_address ||
    'أبو حمص – دمسنا – محافظة البحيرة';
  const workingHours = settings?.working_hours?.trim() || '';
  const rawPhone = settings?.contact_phone?.trim() || '';
  const contactPhone = rawPhone && !rawPhone.includes('XXXX') && !rawPhone.includes('3123456') ? rawPhone : '';
  const rawEmail = settings?.contact_email?.trim() || '';
  const contactEmail = rawEmail && !rawEmail.includes('example') && rawEmail !== 'info@bsch.gov.eg' && rawEmail !== 'info@bsch-clinics.gov.eg' ? rawEmail : '';
  const copyright =
    settings?.footer_copyright ||
    'مستشفى الأطفال التخصصي بالبحيرة. جميع الحقوق محفوظة.';
  const statusBadge =
    settings?.footer_status_badge ||
    'نظام إدارة العيادات الخارجية الموحد — متاح ويعمل بكفاءة 🟢';

  const activeSocialLinks: SocialLinkItem[] = (settings?.social_links || []).filter(
    (item) => item.is_active !== false && item.url && item.url.trim() !== ''
  );

  return (
    <footer className="bg-white border-t border-[#E2E8EE] mt-16 text-[#163C3A] text-sm">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10">
        <div className={`grid grid-cols-1 ${activeSocialLinks.length > 0 ? 'md:grid-cols-3 lg:grid-cols-4' : 'md:grid-cols-3'} gap-8`}>
          {/* Identity & Hospital Summary */}
          <div className={`${activeSocialLinks.length > 0 ? 'md:col-span-1 lg:col-span-2' : 'md:col-span-2'} space-y-3`}>
            <Link
              href="/"
              className="inline-block group focus:outline-hidden focus:ring-2 focus:ring-[#087F78] rounded-xl p-1 transition-opacity hover:opacity-95"
              aria-label="الرئيسية - مستشفى الأطفال التخصصي بالبحيرة"
            >
              <Image
                src={footerLogo}
                alt="شعار مستشفى الأطفال التخصصي بالبحيرة - صحة .. أمل .. مستقبل أفضل لأطفالنا"
                width={192}
                height={192}
                className="w-36 sm:w-44 h-auto object-contain transition-transform group-hover:scale-105 drop-shadow-xs"
              />
            </Link>
            <p className="text-xs text-[#5A6B82] leading-relaxed max-w-lg">
              {summary}
            </p>

            {/* Quick Icon Row if social links exist */}
            {activeSocialLinks.length > 0 && (
              <div className="pt-2 flex items-center gap-2 flex-wrap">
                {activeSocialLinks.map((link, idx) => (
                  <a
                    key={`icon-${idx}`}
                    href={formatExternalUrl(link.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200/80 hover:bg-[#F0F7F6] hover:border-[#79C7C1] flex items-center justify-center transition-all hover:scale-110 shadow-2xs"
                    title={link.label}
                    aria-label={link.label}
                  >
                    {getSocialIcon(link.platform)}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Contact & Location */}
          <div className="space-y-3">
            <h4 className="font-semibold text-xs text-[#124E4A] uppercase tracking-wider">
              المقر ومواعيد العيادات
            </h4>
            <ul className="space-y-2.5 text-xs text-[#5A6B82]">
              <li className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-teal-50 border border-teal-100/80 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-[#087F78]" />
                </div>
                <span className="leading-relaxed font-semibold text-[#163C3A]">{address}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-teal-50 border border-teal-100/80 flex items-center justify-center shrink-0">
                  <Clock className="w-3.5 h-3.5 text-[#087F78]" />
                </div>
                <span>
                  {workingHours ? `العيادات الخارجية: ${workingHours}` : 'تنظيم الكشف: بأسبقية الحضور وتذاكر الانتظار اليومية'}
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-teal-50 border border-teal-100/80 flex items-center justify-center shrink-0">
                  <Phone className="w-3.5 h-3.5 text-[#087F78]" />
                </div>
                {contactPhone ? (
                  <span>هاتف الاستعلام: <strong className="font-mono text-[#124E4A]">{contactPhone}</strong></span>
                ) : (
                  <span>هاتف الاستعلام: <span className="text-slate-400 italic font-sans">قيد الاعتماد من إدارة المستشفى</span></span>
                )}
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-teal-50 border border-teal-100/80 flex items-center justify-center shrink-0">
                  <Mail className="w-3.5 h-3.5 text-[#087F78]" />
                </div>
                {contactEmail ? (
                  <span className="font-mono">{contactEmail}</span>
                ) : (
                  <span>البريد الإلكتروني: <span className="text-slate-400 italic font-sans">قيد الاعتماد من إدارة المستشفى</span></span>
                )}
              </li>
            </ul>
          </div>

          {/* Social Links and Affiliated Entities Column */}
          {activeSocialLinks.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold text-xs text-[#124E4A] uppercase tracking-wider flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-[#087F78]" />
                <span>المنصات والجهات التابعة</span>
              </h4>
              <ul className="space-y-2 text-xs text-[#5A6B82]">
                {activeSocialLinks.map((link, idx) => (
                  <li key={`social-${idx}`}>
                    <a
                      href={formatExternalUrl(link.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded-xl border border-slate-200/80 bg-slate-50/70 hover:bg-[#F0F7F6] hover:border-[#79C7C1] text-[#163C3A] hover:text-[#087F78] transition-all group shadow-2xs"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-white flex items-center justify-center shadow-2xs">
                          {getSocialIcon(link.platform)}
                        </div>
                        <span className="font-semibold text-[11px] truncate max-w-[130px]">{link.label}</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#087F78] transition-colors shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Bottom Bar: Copyright, Status, and Staff Portal link */}
        <div className="mt-8 pt-6 border-t border-[#E2E8EE] flex flex-col sm:flex-row items-center justify-between text-xs text-[#5A6B82] gap-3">
          <p>© {new Date().getFullYear()} {copyright}</p>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-2xs sm:text-xs">{statusBadge}</span>
            <span className="text-slate-300">|</span>
            <Link
              href="/staff/login"
              className="inline-flex items-center gap-1.5 text-2xs text-[#8493A6] hover:text-[#087F78] transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#087F78]" />
              <span>دخول الطاقم الطبي</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
