import React from 'react';
import type { Metadata } from 'next';
import { cmsService } from '@/services/cmsService';
import { NoticeBar } from '@/components/NoticeBar';
import { SiteHeader } from '@/components/SiteHeader';
import { HeroBanner } from '@/components/HeroBanner';
import { TrustStatsBar } from '@/components/TrustStatsBar';
import { PrimaryActionCards } from '@/components/PrimaryActionCards';
import { ClinicsShowcase } from '@/components/ClinicsShowcase';
import { HowItWorks } from '@/components/HowItWorks';
import { HospitalBanner } from '@/components/HospitalBanner';
import { TrustAndInfo } from '@/components/TrustAndInfo';
import { FaqSection } from '@/components/FaqSection';
import { SiteFooter } from '@/components/SiteFooter';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { HospitalMapCard } from '@/components/HospitalMapCard';

export const revalidate = 60; // ISR cache revalidation every 60s or upon admin mutation

export async function generateMetadata(): Promise<Metadata> {
  const content = await cmsService.getPublishedContent();
  const { settings } = content;
  const iconUrl = settings.favicon_url || '/logo-main.png';
  return {
    title: settings.meta_title,
    description: settings.meta_description,
    icons: {
      icon: [
        { url: iconUrl, type: 'image/png' },
        { url: '/favicon.ico' },
      ],
      shortcut: iconUrl,
      apple: iconUrl,
    },
    openGraph: {
      title: settings.meta_title,
      description: settings.meta_description,
      images: [settings.og_image_url || '/logo-main.png'],
    },
    alternates: {
      canonical: settings.canonical_url,
    },
  };
}

export default async function HomePage() {
  const cmsContent = await cmsService.getPublishedContent();
  const { settings, sections, navigation, clinics } = cmsContent;

  const getSection = (id: string) => sections.find((s) => s.id === id);

  return (
    <div
      dir="rtl"
      className="flex flex-col min-h-screen bg-[#F6F9FB] selection:bg-[#087F78] selection:text-white font-sans antialiased"
    >
      {/* 1. Dismissible Urgent Announcement Notice Bar */}
      <NoticeBar config={settings.notice_bar} />

      {/* 2. Main Sticky Hospital Header Navigation */}
      <SiteHeader logoUrl={settings.header_logo_url} navigationItems={navigation} />

      <main className="flex-1 w-full max-w-[1100px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* 3. Deep Teal Radial Hero Banner with Glassmorphism & Feature Highlights */}
        <HeroBanner section={getSection('hero')} />

        <PwaInstallPrompt />

        {/* 4. 4-Column Key Metrics & Trust Stats Bar (2x2 Mobile, 1x4 Desktop) */}
        <TrustStatsBar section={getSection('trust_stats')} />

        {/* 5. Two Primary Patient Action Cards */}
        <PrimaryActionCards section={getSection('primary_actions')} />

        {/* 6. Comprehensive 8-Clinic Responsive Showcase with Direct Booking Links */}
        <ClinicsShowcase clinics={clinics} />

        {/* 7. 3-Step "How It Works" Patient Journey */}
        <HowItWorks section={getSection('how_it_works')} />

        {/* 8. Official Hospital Portal Link Banner */}
        <HospitalBanner section={getSection('hospital_banner')} />

        <HospitalMapCard />

        {/* 9. Parent Guidelines, What to Bring & Central Emergency Info */}
        <TrustAndInfo section={getSection('trust_info')} />

        {/* 10. Interactive Accessible Accordion FAQ Section for Parents */}
        <FaqSection section={getSection('faq')} />
      </main>

      {/* 11. Hospital Footer */}
      <SiteFooter settings={settings} />
    </div>
  );
}
