'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import type { NoticeAnnouncement, NoticeBarConfig, NoticeBarDisplayConfig } from '@/types/cms';

const NOTICE_STORAGE_KEY = 'bsch_notice_dismissed_until';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;
const ROTATION_INTERVAL_MS = 5000;
const INTERACTION_PAUSE_MS = 7000;

interface NoticeBarProps {
  config?: NoticeBarConfig;
  slot?: NoticeBarDisplayConfig['placement'];
  showFallback?: boolean;
}

interface DisplayAnnouncement extends NoticeAnnouncement {
  title: string;
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

function isActiveAnnouncement(announcement: NoticeAnnouncement, now: number): boolean {
  if (announcement.is_enabled === false || announcement.show_on_site === false) return false;
  const startsAt = announcement.starts_at ? Date.parse(announcement.starts_at) : Number.NaN;
  const endsAt = announcement.ends_at ? Date.parse(announcement.ends_at) : Number.NaN;
  if (Number.isFinite(startsAt) && startsAt > now) return false;
  if (Number.isFinite(endsAt) && endsAt <= now) return false;
  return Boolean(announcement.title?.trim() || announcement.summary?.trim() || announcement.message?.trim() || announcement.details?.trim() || announcement.image_url || announcement.link_url);
}

function announcementHasText(announcement: DisplayAnnouncement): boolean {
  return Boolean(announcement.title.trim() || announcement.summary.trim());
}

export function NoticeBar({ config, slot, showFallback = true }: NoticeBarProps) {
  const noticeStorageKey = `${NOTICE_STORAGE_KEY}:${(config?.announcements ?? []).map((item) => item.id).join('|') || 'legacy'}`;
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [detailsAnnouncement, setDetailsAnnouncement] = useState<DisplayAnnouncement | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const lastSwipeAt = useRef(0);
  const interactionTimer = useRef<number | null>(null);

  useEffect(() => {
    setIsMounted(true);
    try {
      const dismissedUntil = localStorage.getItem(noticeStorageKey);
      setIsVisible(!dismissedUntil || Date.now() > Number(dismissedUntil));
    } catch {
      setIsVisible(true);
    }

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(motionPreference.matches);
    updateMotionPreference();
    motionPreference.addEventListener('change', updateMotionPreference);
    return () => motionPreference.removeEventListener('change', updateMotionPreference);
  }, [noticeStorageKey]);

  useEffect(() => () => {
    if (interactionTimer.current !== null) window.clearTimeout(interactionTimer.current);
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

  const announcements = useMemo<DisplayAnnouncement[]>(() => {
    const selectedSlot = slot || config?.display?.placement || 'top';
    const activeCampaigns = (config?.announcements ?? []).filter((item) => {
      const itemSlot = item.display?.placement || config?.display?.placement || 'top';
      return itemSlot === selectedSlot && isActiveAnnouncement(item, now);
    });
    if (activeCampaigns.length > 0) {
      return activeCampaigns.map((item) => ({
        ...item,
        // Empty fields stay empty: image-only announcements must not gain placeholder text.
        title: item.title?.trim() || '',
        summary: item.summary?.trim() || item.message?.trim() || item.details?.trim() || '',
      }));
    }

    if (!showFallback) return [];
    return [{
      id: 'legacy-notice',
      title: config?.title?.trim() || 'تنظيم العيادات الخارجية:',
      summary: config?.message?.trim() || 'الحجز الإلكتروني متاح بنظام تذاكر الدور وأسبقية الحضور اليومي بالعيادات التخصصية.',
      details: config?.message?.trim() || 'الحجز الإلكتروني متاح بنظام تذاكر الدور وأسبقية الحضور اليومي بالعيادات التخصصية.',
    }];
  }, [config, now, showFallback, slot]);

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
    try {
      localStorage.setItem(noticeStorageKey, String(Date.now() + DISMISS_DURATION_MS));
    } catch {
      // Ignore storage errors.
    }
  };

  const pauseAfterInteraction = useCallback(() => {
    setIsPaused(true);
    if (interactionTimer.current !== null) window.clearTimeout(interactionTimer.current);
    interactionTimer.current = window.setTimeout(() => {
      setIsPaused(false);
      interactionTimer.current = null;
    }, INTERACTION_PAUSE_MS);
  }, []);

  const changeSlide = useCallback((direction: -1 | 1) => {
    if (announcements.length < 2) return;
    pauseAfterInteraction();
    setActiveIndex((index) => (index + direction + announcements.length) % announcements.length);
  }, [announcements.length, pauseAfterInteraction]);

  const currentAnnouncement = announcements[activeIndex % announcements.length];
  if (!currentAnnouncement || config?.is_enabled === false || !isMounted || !isVisible) return null;

  const currentLink = safeDestination(currentAnnouncement.link_url);
  const display = currentAnnouncement.display || config?.display;
  const isSingleAnnouncement = announcements.length === 1;
  const hasText = announcementHasText(currentAnnouncement);
  const hasAnyImageOnly = announcements.some((announcement) => announcement.image_url && !announcementHasText(announcement));
  const isCompact = display?.height === 'compact';
  const frameHeight = hasAnyImageOnly
    ? (isCompact ? 'h-[76px] sm:h-[88px]' : 'h-[92px] sm:h-[108px]')
    : (isCompact ? 'min-h-[64px] sm:min-h-[68px]' : 'min-h-[76px] sm:min-h-[84px]');
  const widthClass = display?.width === 'contained' ? 'mx-auto max-w-[1100px]' : 'w-full';
  const placementClass = display?.placement === 'floating'
    ? 'fixed inset-x-3 top-3 z-[70] mx-auto max-w-[1100px]'
    : 'relative z-20';
  const transitionDuration = prefersReducedMotion || isSingleAnnouncement ? '0ms' : '500ms';

  const renderAnnouncementContent = (announcement: DisplayAnnouncement, active: boolean) => {
    const image = announcement.image_url ? (
      <span className={`relative block shrink-0 overflow-hidden rounded-lg bg-slate-50 ${
        announcementHasText(announcement)
          ? 'h-14 w-20 sm:h-[68px] sm:w-28'
          : 'h-full w-full'
      }`}>
        <Image
          src={announcement.image_url}
          alt=""
          fill
          sizes={announcementHasText(announcement) ? '(max-width: 640px) 80px, 112px' : '100vw'}
          unoptimized
          className="object-contain"
        />
      </span>
    ) : null;

    const text = announcementHasText(announcement) ? (
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 text-right">
        {announcement.title && (
          <span className="block truncate text-xs font-extrabold leading-5 text-[#124E4A] sm:text-sm">
            {announcement.title}
          </span>
        )}
        {announcement.summary && (
          <span className="line-clamp-2 text-[11px] leading-4 text-slate-600 sm:text-xs sm:leading-5">
            {announcement.summary}
          </span>
        )}
      </span>
    ) : null;

    return (
      <>
        {image}
        {text}
        {active && currentLink && (
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#087F78]" aria-hidden="true" />
        )}
      </>
    );
  };

  const renderSlide = (announcement: DisplayAnnouncement, index: number) => {
    const isActive = index === activeIndex;
    const slideLink = safeDestination(announcement.link_url);
    const canOpenDetails = announcementHasText(announcement);
    const content = renderAnnouncementContent(announcement, isActive);
    const commonClassName = `flex ${frameHeight} w-full items-center ${
      announcement.image_url && !canOpenDetails ? 'p-1' : 'gap-2.5 px-2.5 py-1.5 sm:gap-3 sm:px-3'
    } text-inherit outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#087F78]`;

    if (slideLink) {
      return (
        <a
          href={slideLink}
          tabIndex={isActive ? 0 : -1}
          aria-hidden={!isActive}
          aria-label={[announcement.title, announcement.summary].filter(Boolean).join(': ') || 'فتح الإعلان'}
          className={`${commonClassName} hover:bg-teal-50/50`}
        >
          {content}
        </a>
      );
    }

    if (canOpenDetails) {
      return (
        <button
          type="button"
          tabIndex={isActive ? 0 : -1}
          aria-hidden={!isActive}
          aria-label={`عرض تفاصيل الإعلان${announcement.title ? `: ${announcement.title}` : ''}`}
          onClick={() => setDetailsAnnouncement(announcement)}
          className={`${commonClassName} text-right hover:bg-teal-50/50`}
        >
          {content}
        </button>
      );
    }

    return (
      <div aria-hidden={!isActive} className={commonClassName}>
        {content}
      </div>
    );
  };

  return (
    <>
      <aside
        dir="rtl"
        aria-label="إعلانات وتنبيهات المستشفى"
        className={`${placementClass} ${widthClass} px-3 py-1.5 sm:px-6 sm:py-2`}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsPaused(false);
        }}
      >
        <div className="mx-auto flex w-full max-w-[1100px] items-stretch gap-1.5 rounded-xl border border-[#D8E8E6] bg-white shadow-sm sm:gap-2">
          <div
            className={`relative min-w-0 flex-1 overflow-hidden rounded-xl ${frameHeight}`}
            dir="ltr"
            aria-roledescription="carousel"
            aria-label="إعلانات المستشفى"
            onTouchStart={(event) => {
              pointerStartX.current = event.changedTouches[0]?.clientX ?? null;
              if (!isSingleAnnouncement) pauseAfterInteraction();
            }}
            onTouchEnd={(event) => {
              const endX = event.changedTouches[0]?.clientX;
              if (pointerStartX.current === null || endX === undefined || isSingleAnnouncement) return;
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
            style={{ touchAction: 'pan-y' }}
          >
            <div
              className="flex h-full"
              style={{
                width: `${announcements.length * 100}%`,
                transform: `translate3d(-${activeIndex * (100 / announcements.length)}%, 0, 0)`,
                transitionProperty: 'transform',
                transitionDuration,
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {announcements.map((announcement, index) => (
                <div
                  key={announcement.id}
                  className="h-full shrink-0"
                  style={{ width: `${100 / announcements.length}%` }}
                >
                  {renderSlide(announcement, index)}
                </div>
              ))}
            </div>
          </div>

          {!isSingleAnnouncement && (
            <div className="flex shrink-0 items-center gap-0.5 px-1" dir="rtl">
              <button
                type="button"
                onClick={() => changeSlide(-1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#087F78] transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
                aria-label="الإعلان السابق"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="flex min-w-9 flex-col items-center justify-center gap-1" aria-live="polite" aria-atomic="true" aria-label={`الإعلان ${activeIndex + 1} من ${announcements.length}`}>
                <span className="text-[10px] font-semibold tabular-nums text-slate-500">{activeIndex + 1}/{announcements.length}</span>
                <span className="flex items-center gap-1" aria-hidden="true">
                  {announcements.map((announcement, index) => (
                    <span key={announcement.id} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-3 bg-[#087F78]' : 'w-1.5 bg-slate-300'}`} />
                  ))}
                </span>
              </div>
              <button
                type="button"
                onClick={() => changeSlide(1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#087F78] transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
                aria-label="الإعلان التالي"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            className="my-auto ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
            aria-label="إغلاق الإعلانات لمدة 24 ساعة"
            title="إغلاق الإعلانات لمدة 24 ساعة"
          >
            <X className="h-4 w-4" />
          </button>
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
              <h2 id="notice-details-title" className="text-lg font-bold">{detailsAnnouncement.title || detailsAnnouncement.summary}</h2>
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
              <Image src={detailsAnnouncement.image_url} alt="" width={640} height={360} unoptimized className="mb-4 max-h-56 w-full rounded-xl bg-slate-50 object-contain" />
            )}
            {detailsAnnouncement.details?.trim() && detailsAnnouncement.details.trim() !== detailsAnnouncement.summary && (
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{detailsAnnouncement.details}</p>
            )}
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
