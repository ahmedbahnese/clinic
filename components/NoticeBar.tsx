'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Bell, ChevronLeft, ChevronRight, ExternalLink, PhoneCall, X } from 'lucide-react';
import { resolveNoticeAnnouncements } from '@/lib/announcementVisibility';
import type { NoticeAnnouncement, NoticeBarConfig, NoticeBarDisplayConfig } from '@/types/cms';

const ROTATION_INTERVAL_MS = 5000;

interface NoticeBarProps {
  config?: NoticeBarConfig;
  slot?: NoticeBarDisplayConfig['placement'];
  showFallback?: boolean;
  initialNow?: number;
}

interface DisplayAnnouncement extends NoticeAnnouncement {
  summary: string;
}

function safeDestination(value?: string): string | null {
  const destination = value?.trim();
  if (!destination || /[\u0000-\u001f\\]/.test(destination)) return null;

  if (destination.startsWith('/') && !destination.startsWith('//')) return destination;

  try {
    const parsed = new URL(destination);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    return null;
  }

  return null;
}

export function NoticeBar({ config, slot, showFallback = true, initialNow }: NoticeBarProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [now, setNow] = useState(() => initialNow ?? Date.now());
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [detailsAnnouncement, setDetailsAnnouncement] = useState<DisplayAnnouncement | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const lastSwipeAt = useRef(0);

  useEffect(() => {
    setNow(Date.now());
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(motionPreference.matches);
    updateMotionPreference();
    motionPreference.addEventListener('change', updateMotionPreference);
    return () => motionPreference.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => {
    let timer: number;
    const scheduleClockUpdate = () => {
      const currentTime = Date.now();
      const boundaries = (config?.announcements ?? [])
        .flatMap((announcement) => [announcement.starts_at, announcement.ends_at])
        .filter((value): value is string => Boolean(value))
        .map((value) => Date.parse(value))
        .filter((timestamp) => Number.isFinite(timestamp) && timestamp > currentTime);
      const nextBoundary = boundaries.length > 0 ? Math.min(...boundaries) : currentTime + 60_000;
      const delay = Math.max(50, Math.min(60_000, nextBoundary - currentTime + 50));

      timer = window.setTimeout(() => {
        setNow(Date.now());
        scheduleClockUpdate();
      }, delay);
    };

    scheduleClockUpdate();
    return () => window.clearTimeout(timer);
  }, [config?.announcements]);

  const announcements = useMemo<DisplayAnnouncement[]>(
    () => resolveNoticeAnnouncements(config, slot, now, showFallback),
    [config, now, showFallback, slot],
  );

  useEffect(() => {
    if (activeIndex >= announcements.length) setActiveIndex(0);
  }, [activeIndex, announcements.length]);

  useEffect(() => {
    if (prefersReducedMotion || isPaused || announcements.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % announcements.length);
    }, ROTATION_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [announcements.length, isPaused, prefersReducedMotion]);

  useEffect(() => {
    if (!detailsAnnouncement) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailsAnnouncement(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [detailsAnnouncement]);

  const handleDismiss = () => {
    setIsVisible(false);
  };

  const changeSlide = useCallback((direction: -1 | 1) => {
    setActiveIndex((index) => (index + direction + announcements.length) % announcements.length);
  }, [announcements.length]);

  const currentAnnouncement = announcements[activeIndex % announcements.length];
  if (!currentAnnouncement || config?.is_enabled === false || !isVisible) return null;
  const currentLink = safeDestination(currentAnnouncement.link_url);
  const hotlineLabel = config?.hotline_label?.trim() || 'مستشفى الأطفال التخصصي — دمسنا';
  const display = currentAnnouncement.display || config?.display;
  const widthClass = display?.width === 'contained' ? 'mx-auto max-w-[1100px] rounded-2xl' : 'w-full';
  const heightClass = display?.height === 'compact' ? 'min-h-[64px]' : 'min-h-[88px] sm:min-h-[92px]';
  const placementClass = display?.placement === 'floating' ? 'fixed inset-x-3 top-3 z-[70] mx-auto max-w-[1100px] rounded-2xl shadow-2xl' : 'relative z-50';

  const content = (
    <>
      {currentAnnouncement.image_url ? (
        <Image
          src={currentAnnouncement.image_url}
          alt=""
          width={56}
          height={56}
          unoptimized
          className="absolute inset-0 z-0 h-full w-full rounded-lg object-cover opacity-40"
        />
      ) : (
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/25 sm:h-11 sm:w-11" aria-hidden="true">
          <Bell className="h-4 w-4" />
        </span>
      )}
        <span className="relative z-10 min-w-0 flex-1 rounded-lg bg-black/25 px-2 py-1 text-right">
        <span className="block truncate text-xs font-bold text-amber-300 sm:text-sm">{currentAnnouncement.title}</span>
        <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-emerald-50 sm:text-xs">{currentAnnouncement.summary}</span>
      </span>
      {currentLink && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-emerald-100" aria-hidden="true" />}
    </>
  );

  return (
    <>
      <aside
        dir="rtl"
        aria-label="إعلانات وتنبيهات المستشفى"
        className={`${placementClass} border-b border-[#163C3A] bg-gradient-to-l from-[#0A3D39] via-[#0D5F5A] to-[#124E4A] text-white shadow-xs`}
        style={{ backgroundColor: '#0A3D39' }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsPaused(false);
        }}
      >
        <div className={`${widthClass} flex ${heightClass} items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6`}>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <h2 className="text-[10px] font-bold leading-4 tracking-wide text-emerald-100 sm:text-[11px]">
              إعلانات وتنبيهات المستشفى
            </h2>
            <div
              className="flex min-w-0 items-center gap-2"
              tabIndex={0}
              aria-label={`الإعلان ${activeIndex + 1} من ${announcements.length}: ${currentAnnouncement.title}`}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' && announcements.length > 1) {
                  event.preventDefault();
                  changeSlide(1);
                } else if (event.key === 'ArrowRight' && announcements.length > 1) {
                  event.preventDefault();
                  changeSlide(-1);
                }
              }}
              onTouchStart={(event) => { pointerStartX.current = event.changedTouches[0]?.clientX ?? null; }}
              onTouchEnd={(event) => {
                const endX = event.changedTouches[0]?.clientX;
                if (pointerStartX.current === null || endX === undefined || announcements.length < 2) return;
                const delta = endX - pointerStartX.current;
                if (Math.abs(delta) > 40) {
                  lastSwipeAt.current = Date.now();
                  changeSlide(delta < 0 ? 1 : -1);
                }
                pointerStartX.current = null;
              }}
              onClickCapture={(event) => {
                if (Date.now() - lastSwipeAt.current < 700) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
              {currentLink ? (
                <a
                  key={currentAnnouncement.id}
                  href={currentLink}
                  className="notice-slide-in relative flex min-h-12 min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-lg text-inherit outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-amber-300 sm:gap-3"
                  aria-label={`${currentAnnouncement.title}: ${currentAnnouncement.summary}`}
                >
                  {content}
                </a>
              ) : (
                <button
                  key={currentAnnouncement.id}
                  type="button"
                  onClick={() => setDetailsAnnouncement(currentAnnouncement)}
                  className="notice-slide-in relative flex min-h-12 min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-lg text-inherit text-right outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-amber-300 sm:gap-3"
                  aria-label={`عرض تفاصيل الإعلان: ${currentAnnouncement.title}`}
                >
                  {content}
                </button>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {announcements.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => changeSlide(-1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                  aria-label="الإعلان السابق"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="min-w-7 text-center text-[10px] text-emerald-100" aria-live="polite">
                  {activeIndex + 1}/{announcements.length}
                </span>
                <button
                  type="button"
                  onClick={() => changeSlide(1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                  aria-label="الإعلان التالي"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </>
            )}
            <span className="hidden items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-medium text-emerald-100 lg:inline-flex">
              <PhoneCall className="h-3 w-3 text-amber-300" aria-hidden="true" />
              {hotlineLabel}
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-100 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              aria-label="إغلاق الإعلانات لمدة 24 ساعة"
              title="إغلاق الإعلانات لمدة 24 ساعة"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {detailsAnnouncement && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailsAnnouncement(null);
          }}
        >
          <section
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notice-details-title"
            className="w-full max-w-lg rounded-2xl bg-white p-5 text-[#163C3A] shadow-2xl sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id="notice-details-title" className="text-lg font-bold">{detailsAnnouncement.title}</h2>
              <button
                type="button"
                onClick={() => setDetailsAnnouncement(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
                aria-label="إغلاق تفاصيل الإعلان"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {detailsAnnouncement.image_url && (
              <Image src={detailsAnnouncement.image_url} alt="" width={640} height={360} unoptimized className="mb-4 max-h-56 w-full rounded-xl object-cover" />
            )}
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {detailsAnnouncement.details?.trim() || detailsAnnouncement.summary}
            </p>
            <button
              type="button"
              onClick={() => setDetailsAnnouncement(null)}
              className="mt-5 rounded-xl bg-[#087F78] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#066560] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78] focus-visible:ring-offset-2"
            >
              إغلاق
            </button>
          </section>
        </div>
      )}
    </>
  );
}
