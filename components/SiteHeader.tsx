'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Home,
  CalendarPlus,
  Search,
  ExternalLink,
  ShieldCheck,
  Menu,
  X,
  Stethoscope,
  Globe,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { NavigationItem } from '@/types/cms';

interface SiteHeaderProps {
  logoUrl?: string;
  navigationItems?: NavigationItem[];
}

export function SiteHeader({ logoUrl = '/logo-main.png', navigationItems }: SiteHeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Icon mapper helper
  const getNavIcon = (href: string) => {
    if (href === '/') return Home;
    if (href.includes('/appointments/new')) return CalendarPlus;
    if (href.includes('/appointments/track')) return Search;
    if (href.includes('/staff')) return ShieldCheck;
    return Globe;
  };

  const activeNavItems = navigationItems && navigationItems.length > 0
    ? navigationItems.filter((i) => i.is_active)
    : [
        { id: 'home', label: 'الرئيسية', href: '/', target: '_self' as const, display_order: 1, is_active: true },
        { id: 'book', label: 'حجز موعد', href: '/appointments/new', target: '_self' as const, display_order: 2, is_active: true },
        { id: 'track', label: 'متابعة حجز', href: '/appointments/track', target: '_self' as const, display_order: 3, is_active: true },
      ];

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md backdrop-saturate-150 border-b border-[#E2E8EE]/80 shadow-[0_1px_4px_0_rgba(18,78,74,0.03)]">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
        {/* Right side: Hospital & Clinic Identity */}
        <Link
          href="/"
          className="flex items-center gap-3 group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#087F78] rounded-xl p-1 transition-opacity hover:opacity-95"
          aria-label="الرئيسية - عيادات مستشفى الأطفال التخصصي بالبحيرة"
        >
          <Image
            src={logoUrl || '/logo-main.png'}
            alt="شعار مستشفى الأطفال التخصصي بالبحيرة - العيادات الخارجية"
            width={160}
            height={160}
            priority
            className="h-14 sm:h-16 w-auto object-contain transition-transform group-hover:scale-105 drop-shadow-xs"
          />
        </Link>

        {/* Center: Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1.5" aria-label="التنقل الرئيسي">
          {activeNavItems.map((item) => {
            const Icon = getNavIcon(item.href);
            const isCurrent =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);

            if (item.target === '_blank') {
              return (
                <a
                  key={item.id}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#79C7C1] text-xs font-semibold text-[#087F78] hover:bg-[#087F78] hover:text-white transition-all shadow-2xs hover:shadow-xs ml-1"
                >
                  <span>{item.label}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              );
            }

            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#087F78] ${
                  isCurrent
                    ? 'bg-[#087F78] text-white shadow-[0_2px_8px_rgba(8,127,120,0.25)]'
                    : 'text-[#163C3A] hover:bg-[#F0F7F6] hover:text-[#087F78]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* Discreet Secondary Link for Employee Portal */}
          <Link
            href="/staff/login"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#5A6B82] hover:text-[#124E4A] hover:bg-slate-100/80 rounded-full transition-colors mr-2 border border-slate-200/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#087F78]"
            title="بوابة دخول الموظفين والأطباء"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#087F78]" />
            <span>بوابة الموظفين</span>
          </Link>
        </nav>

        {/* Left side: External Hospital Site Link */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          <a
            href="https://mohp.gov.eg"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#79C7C1] text-xs font-semibold text-[#087F78] hover:bg-[#087F78] hover:text-white transition-all shadow-2xs hover:shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#087F78]"
          >
            <span>موقع المستشفى</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl text-[#163C3A] hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#087F78]"
            aria-label="القائمة الرئيسية"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#E2E8EE] bg-white px-4 py-4 space-y-2 shadow-lg animate-in slide-in-from-top duration-200">
          <div className="space-y-1.5">
            {activeNavItems.map((item) => {
              const Icon = getNavIcon(item.href);
              const isCurrent =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);

              if (item.target === '_blank') {
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl text-base font-semibold text-[#163C3A] hover:bg-[#F6F9FB]"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-[#087F78]" />
                      <span>{item.label}</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[#8493A6]" />
                  </a>
                );
              }

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                    isCurrent
                      ? 'bg-[#087F78] text-white shadow-xs'
                      : 'text-[#163C3A] hover:bg-[#F6F9FB]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            <Link
              href="/staff/login"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium text-[#163C3A] bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#087F78]" />
                <span>بوابة الموظفين (تسجيل الدخول)</span>
              </div>
              <span className="text-xs text-[#5A6B82]">طاقم العمل</span>
            </Link>

            <a
              href="https://mohp.gov.eg"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[#79C7C1] text-xs font-semibold text-[#087F78] hover:bg-[#087F78] hover:text-white transition-colors"
            >
              <span>موقع المستشفى الرسمي</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
