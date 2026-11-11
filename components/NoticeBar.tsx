'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ExternalLink, Pause, Play, X } from 'lucide-react';
import type { NoticeAnnouncement, NoticeBarConfig, NoticeBarDisplayConfig } from '@/types/cms';

const NOTICE_STORAGE_KEY = 'bsch_notice_dismissed_until';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;
const ROTATION_INTERVAL_MS = 5000;
const INTERACTION_PAUSE_MS = 7000;
const SLIDE_GAP_PX = 12;

interface NoticeBarProps {
  config?: NoticeBarConfig;
  slot?: NoticeBarDisplayConfig['placement'];
  showFallback?: boolean;
}

interface DisplayAnnouncement extends NoticeAnnouncement {
  title: string;
  summary: string;
}

interface TrackSlide {
  announcement: DisplayAnnouncement;
  key: string;
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

function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}

export function NoticeBar({ config, slot, showFallback = true }: NoticeBarProps) {
  const noticeStorageKey = `${NOTICE_STORAGE_KEY}:${(config?.announcements ?? []).map((item) => item.id).join('|') || 'legacy'}`;
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [trackPosition, setTrackPosition] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [slideStep, setSlideStep] = useState(0);
  const [slideWidth, setSlideWidth] = useState(0);
  const [isResettingLoop, setIsResettingLoop] = useState(false);
  const pointerStart = useRef<{ x: number; pointerId: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const interactionTimer = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

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
        // Keep missing titles empty, especially for image-only announcements.
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

  const isSingleAnnouncement = announcements.length === 1;
  const activeIndex = announcements.length ? modulo(trackPosition - 1, announcements.length) : 0;
  const currentAnnouncement = announcements[activeIndex];
  const currentLink = safeDestination(currentAnnouncement?.link_url);

  const trackSlides = useMemo<TrackSlide[]>(() => {
    if (announcements.length < 2) {
      return announcements.map((announcement) => ({ announcement, key: announcement.id }));
    }
    const first = announcements[0];
    const last = announcements[announcements.length - 1];
    return [
      { announcement: last, key: `clone-before-${last.id}` },
      ...announcements.map((announcement) => ({ announcement, key: announcement.id })),
      { announcement: first, key: `clone-after-${first.id}` },
    ];
  }, [announcements]);

  useEffect(() => {
    setTrackPosition(isSingleAnnouncement ? 0 : 1);
    setIsResettingLoop(false);
  }, [announcements.length, isSingleAnnouncement]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const firstSlide = track?.querySelector<HTMLElement>('[data-notice-slide]');
    if (!viewport || !track || !firstSlide) return;

    const measure = () => {
      const measuredGap = Number.parseFloat(window.getComputedStyle(track).columnGap) || SLIDE_GAP_PX;
      const viewportWidth = viewport.getBoundingClientRect().width;
      const widthRatio = viewportWidth < 640 ? 0.82 : 0.64;
      const measuredWidth = Math.min(520, viewportWidth * widthRatio);
      setSlideWidth(measuredWidth);
      setSlideStep(measuredWidth + measuredGap);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(firstSlide);
    return () => observer.disconnect();
  }, [announcements.length, isMounted]);

  const pauseAfterInteraction = useCallback(() => {
    setIsPaused(true);
    if (interactionTimer.current !== null) window.clearTimeout(interactionTimer.current);
    interactionTimer.current = window.setTimeout(() => {
      setIsPaused(false);
      interactionTimer.current = null;
    }, INTERACTION_PAUSE_MS);
  }, []);

  const moveTrack = useCallback((direction: -1 | 1) => {
    const count = announcements.length;
    if (count < 2) return;

    setTrackPosition((position) => {
      const destination = position + direction;
      // Reduced-motion users still get immediate manual navigation without an animated clone-wrap.
      if (prefersReducedMotion && (destination === 0 || destination === count + 1)) {
        return destination === 0 ? count : 1;
      }
      return destination;
    });
  }, [announcements.length, prefersReducedMotion]);

  const changeSlide = useCallback((direction: -1 | 1) => {
    pauseAfterInteraction();
    moveTrack(direction);
  }, [moveTrack, pauseAfterInteraction]);

  useEffect(() => {
    if (prefersReducedMotion || isPaused || !isAutoplayEnabled || isViewerOpen || announcements.length < 2) return;
    const timer = window.setInterval(() => moveTrack(1), ROTATION_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [announcements.length, isAutoplayEnabled, isPaused, isViewerOpen, moveTrack, prefersReducedMotion]);

  useEffect(() => {
    if (!isViewerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsViewerOpen(false);
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveTrack(1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveTrack(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isViewerOpen, moveTrack]);

  const handleDismiss = () => {
    setIsVisible(false);
    try {
      localStorage.setItem(noticeStorageKey, String(Date.now() + DISMISS_DURATION_MS));
    } catch {
      // Ignore storage errors.
    }
  };

  const handleTrackTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform' || announcements.length < 2) return;
    const count = announcements.length;
    if (trackPosition === 0 || trackPosition === count + 1) {
      const resetPosition = trackPosition === 0 ? count : 1;
      setIsResettingLoop(true);
      setTrackPosition(resetPosition);
      window.requestAnimationFrame(() => setIsResettingLoop(false));
    }
  };

  const placement = currentAnnouncement?.display || config?.display;
  const widthClass = placement?.width === 'contained' ? 'mx-auto max-w-[1100px]' : 'w-full';
  const placementClass = placement?.placement === 'floating'
    ? 'fixed inset-x-3 top-3 z-[70] mx-auto max-w-[1100px]'
    : 'relative z-20';

  if (!currentAnnouncement || config?.is_enabled === false || !isMounted || !isVisible) return null;

  const openViewer = () => {
    pauseAfterInteraction();
    setIsViewerOpen(true);
  };

  const beginPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerStart.current = { x: event.clientX, pointerId: event.pointerId };
    pauseAfterInteraction();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is not available in a few synthetic/browser test environments.
    }
  };

  const hasAnyImage = announcements.some((announcement) => Boolean(announcement.image_url));
  const hasTitledImage = announcements.some((announcement) => Boolean(announcement.image_url && announcement.title));
  const textCardMinHeight = hasAnyImage && slideWidth > 0
    ? `${slideWidth * 0.625 + (hasTitledImage ? 42 : 0)}px`
    : undefined;

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.pointerId !== event.pointerId || isSingleAnnouncement) return;
    const delta = event.clientX - start.x;
    if (Math.abs(delta) > 40) {
      suppressClickUntil.current = Date.now() + 700;
      changeSlide(delta < 0 ? 1 : -1);
    }
  };

  const renderSlideCard = (announcement: DisplayAnnouncement, slideIndex: number, key: string) => {
    const isActive = slideIndex === trackPosition;
    const slideLink = safeDestination(announcement.link_url);
    const slideLabel = [announcement.title, announcement.summary].filter(Boolean).join(': ') || 'فتح الإعلان';
    const textOnlyContent = !announcement.image_url;

    return (
      <div
        key={key}
        data-notice-slide
        className="shrink-0"
        style={{ width: slideWidth > 0 ? `${slideWidth}px` : 'min(82vw, 520px)', maxWidth: '520px' }}
      >
        <button
          type="button"
          tabIndex={isActive ? 0 : -1}
          aria-hidden={!isActive}
          aria-label={slideLabel}
          onClick={openViewer}
          className={`group block w-full overflow-hidden rounded-2xl border bg-white text-right text-[#163C3A] shadow-sm outline-none transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#087F78] motion-reduce:transition-none ${isActive ? 'border-[#087F78]/55 shadow-md' : 'border-[#D8E8E6]'}`}
        >
          {announcement.image_url ? (
            <span className="relative block aspect-[16/10] w-full overflow-hidden bg-white p-1.5 sm:p-2">
              <Image
                src={announcement.image_url}
                alt=""
                fill
                sizes="(max-width: 640px) 82vw, 520px"
                unoptimized
                draggable={false}
                className="object-contain"
              />
            </span>
          ) : (
            <span
              className={`flex w-full flex-col justify-center gap-2 bg-gradient-to-br from-[#F5FAF9] to-[#E8F4F2] px-4 py-3 text-right sm:px-6 ${hasAnyImage ? '' : 'min-h-[88px] sm:min-h-[96px]'}`}
              style={textCardMinHeight ? { minHeight: textCardMinHeight } : undefined}
            >
              {announcement.title && <span className="text-sm font-extrabold leading-6 text-[#124E4A] sm:text-base">{announcement.title}</span>}
              {announcement.summary && <span className="line-clamp-3 text-xs leading-5 text-slate-600 sm:text-sm">{announcement.summary}</span>}
            </span>
          )}
          {announcement.image_url && announcement.title && (
            <span className="block truncate border-t border-[#EAF1F0] px-3 py-2 text-center text-xs font-bold text-[#124E4A] sm:px-4 sm:py-2.5 sm:text-sm">
              {announcement.title}
            </span>
          )}
          {textOnlyContent && slideLink && (
            <span className="flex items-center justify-center gap-1 border-t border-[#EAF1F0] px-3 py-2 text-[11px] font-bold text-[#087F78]">
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              فتح الإعلان
            </span>
          )}
        </button>
      </div>
    );
  };

  return (
    <>
      <aside
        dir="rtl"
        aria-label="إعلانات وتنبيهات المستشفى"
        className={`${placementClass} ${widthClass} px-3 py-2 sm:px-6 sm:py-3`}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsPaused(false);
        }}
      >
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-4 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E2E8EE] bg-white/90 text-slate-500 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
          aria-label="إغلاق الإعلانات لمدة 24 ساعة"
          title="إغلاق الإعلانات لمدة 24 ساعة"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto flex w-full max-w-[1100px] flex-col items-center gap-2.5">
          <div
            ref={viewportRef}
            className="w-full max-w-[760px] overflow-hidden"
            dir="ltr"
            aria-roledescription="carousel"
            aria-label="إعلانات المستشفى"
            onPointerDown={beginPointer}
            onPointerUp={finishPointer}
            onPointerCancel={() => { pointerStart.current = null; }}
            onClickCapture={(event) => {
              if (Date.now() < suppressClickUntil.current) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            style={{ touchAction: 'pan-y' }}
          >
            <div
              ref={trackRef}
              className={`flex gap-3 ${isSingleAnnouncement ? 'w-full justify-center' : 'w-max'}`}
              onTransitionEnd={handleTrackTransitionEnd}
              style={{
                transform: isSingleAnnouncement ? 'translate3d(0, 0, 0)' : `translate3d(-${trackPosition * slideStep}px, 0, 0)`,
                transitionProperty: 'transform',
                transitionDuration: prefersReducedMotion || isResettingLoop || isSingleAnnouncement ? '0ms' : '500ms',
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {trackSlides.map((slide, index) => renderSlideCard(slide.announcement, index, slide.key))}
            </div>
          </div>

          {!isSingleAnnouncement && (
            <div className="flex items-center justify-center gap-2" dir="rtl">
              <button
                type="button"
                onClick={() => changeSlide(-1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#D8E8E6] bg-white text-[#087F78] shadow-sm transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
                aria-label="الإعلان السابق"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="flex min-w-14 flex-col items-center gap-1" aria-live="polite" aria-atomic="true" aria-label={`الإعلان ${activeIndex + 1} من ${announcements.length}`}>
                <span className="text-[10px] font-semibold tabular-nums text-slate-500">{activeIndex + 1}/{announcements.length}</span>
                {announcements.length <= 8 ? (
                  <span className="flex items-center gap-1" aria-hidden="true">
                    {announcements.map((announcement, index) => (
                      <span key={announcement.id} className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${index === activeIndex ? 'w-3 bg-[#087F78]' : 'w-1.5 bg-slate-300'}`} />
                    ))}
                  </span>
                ) : (
                  <span className="h-1 w-10 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                    <span className="block h-full rounded-full bg-[#087F78]" style={{ width: `${((activeIndex + 1) / announcements.length) * 100}%` }} />
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => changeSlide(1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#D8E8E6] bg-white text-[#087F78] shadow-sm transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
                aria-label="الإعلان التالي"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAutoplayEnabled((enabled) => !enabled);
                  pauseAfterInteraction();
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#D8E8E6] bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
                aria-label={isAutoplayEnabled ? 'إيقاف الحركة التلقائية' : 'تشغيل الحركة التلقائية'}
                title={isAutoplayEnabled ? 'إيقاف الحركة التلقائية' : 'تشغيل الحركة التلقائية'}
              >
                {isAutoplayEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>
      </aside>

      {isViewerOpen && currentAnnouncement && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              pauseAfterInteraction();
              setIsViewerOpen(false);
            }
          }}
        >
          <section
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-label={currentAnnouncement.title || 'تفاصيل الإعلان'}
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white text-[#163C3A] shadow-2xl"
          >
            <button
              type="button"
              onClick={() => {
                pauseAfterInteraction();
                setIsViewerOpen(false);
              }}
              className="absolute left-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
              aria-label="إغلاق الإعلان"
            >
              <X className="h-4 w-4" />
            </button>

            {currentAnnouncement.image_url ? (
              <div className="relative flex aspect-[16/10] max-h-[65vh] w-full items-center justify-center bg-slate-50 p-3 sm:p-6">
                <Image
                  src={currentAnnouncement.image_url}
                  alt={currentAnnouncement.title || ''}
                  fill
                  sizes="(max-width: 768px) 100vw, 672px"
                  unoptimized
                  className="object-contain"
                />
                {!isSingleAnnouncement && (
                  <>
                    <button
                      type="button"
                      onClick={() => changeSlide(-1)}
                      className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-white/95 text-[#087F78] shadow-lg hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
                      aria-label="الإعلان السابق"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => changeSlide(1)}
                      className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-white/95 text-[#087F78] shadow-lg hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78]"
                      aria-label="الإعلان التالي"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>
            ) : !isSingleAnnouncement ? (
              <div className="relative border-b border-slate-100 px-14 py-6">
                <button type="button" onClick={() => changeSlide(-1)} className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 text-[#087F78]" aria-label="الإعلان السابق"><ChevronRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => changeSlide(1)} className="absolute left-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 text-[#087F78]" aria-label="الإعلان التالي"><ChevronLeft className="h-4 w-4" /></button>
                {currentAnnouncement.title && <h2 className="text-base font-extrabold text-[#124E4A]">{currentAnnouncement.title}</h2>}
                {currentAnnouncement.summary && <p className="mt-2 text-sm leading-7 text-slate-700">{currentAnnouncement.summary}</p>}
              </div>
            ) : null}

            <div className="max-h-[35vh] overflow-y-auto px-5 py-4 sm:px-7">
              {!currentAnnouncement.image_url && isSingleAnnouncement && currentAnnouncement.title && (
                <h2 className="text-base font-extrabold text-[#124E4A] sm:text-lg">{currentAnnouncement.title}</h2>
              )}
              {!currentAnnouncement.image_url && isSingleAnnouncement && currentAnnouncement.summary && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{currentAnnouncement.summary}</p>
              )}
              {currentAnnouncement.title && currentAnnouncement.image_url && (
                <h2 className="text-base font-extrabold text-[#124E4A] sm:text-lg">{currentAnnouncement.title}</h2>
              )}
              {currentAnnouncement.summary && currentAnnouncement.image_url && (
                <p className="mt-2 text-sm leading-6 text-slate-700">{currentAnnouncement.summary}</p>
              )}
              {currentAnnouncement.details?.trim() && currentAnnouncement.details.trim() !== currentAnnouncement.summary.trim() && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{currentAnnouncement.details}</p>
              )}
              {currentLink && (
                <a
                  href={currentLink}
                  target={currentLink.startsWith('http') ? '_blank' : undefined}
                  rel={currentLink.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#087F78] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#066560] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F78] focus-visible:ring-offset-2"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  فتح رابط الإعلان
                </a>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
