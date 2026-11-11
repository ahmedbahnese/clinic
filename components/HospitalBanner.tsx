import React from 'react';
import { Clock, ExternalLink } from 'lucide-react';
import type { HomepageSection, HospitalBannerSectionContent } from '@/types/cms';

function formatExternalUrl(url?: string): string {
  if (!url || !url.trim()) return '#';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

interface HospitalBannerProps {
  section?: HomepageSection;
}

export function HospitalBanner({ section }: HospitalBannerProps) {
  if (section && section.is_visible === false) {
    return null;
  }

  const content = (section?.content || {}) as Partial<HospitalBannerSectionContent>;

  const title = section?.title || 'مستشفى الأطفال التخصصي بالبحيرة';
  const subtitle =
    section?.subtitle ||
    'زر موقع المستشفى الرسمي لمعرفة المزيد عن الخدمات والأقسام الطبية';
  const btnLabel = content.btn_label || 'زيارة الموقع';
  const rawUrl = content.btn_url?.trim() || 'https://albahira.elyoser.cloud';
  const btnUrl = formatExternalUrl(rawUrl);

  return (
    <section
      className="bg-[#124E4A] bg-gradient-to-r from-[#124E4A] to-[#0A3D39] text-white rounded-[22px] p-6 sm:p-7 shadow-[0_4px_12px_rgba(10,61,57,0.15)] my-6 sm:my-8 border border-[#163C3A]"
      style={{ backgroundColor: '#124E4A' }}
    >
      <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
        {/* Right side: Title & Description */}
        <div className="flex items-center gap-4 text-right w-full sm:w-auto">
          <div className="w-12 h-12 rounded-full bg-[#79C7C1]/20 border border-[#79C7C1]/40 flex items-center justify-center text-[#79C7C1] shrink-0 shadow-2xs">
            <Clock className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white">
              {title}
            </h3>
            <p className="text-xs sm:text-sm text-emerald-100/90 mt-0.5 leading-relaxed">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Left side: Button */}
        <div className="w-full sm:w-auto flex justify-end">
          <a
            href={btnUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-white text-[#124E4A] hover:bg-emerald-50 text-sm font-bold shadow-xs hover:shadow-md transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#124E4A]"
          >
            <ExternalLink className="w-4 h-4 text-[#124E4A]" />
            <span>{btnLabel}</span>
          </a>
        </div>
      </div>
    </section>
  );
}
