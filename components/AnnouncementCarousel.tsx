'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ExternalLink, Pause, Play, X } from 'lucide-react';
import { resolveNoticeAnnouncements, type DisplayAnnouncement } from '@/lib/announcementVisibility';
import type { NoticeBarConfig, NoticeBarDisplayConfig } from '@/types/cms';

type Props = { config?: NoticeBarConfig; slot?: NoticeBarDisplayConfig['placement'] };

function safeLink(value?: string) {
  const link = value?.trim();
  if (!link || /[\u0000-\u001f\\]/.test(link)) return null;
  if (link.startsWith('/') && !link.startsWith('//')) return link;
  try { const parsed = new URL(link); return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null; } catch { return null; }
}

function CardContent({ item, modal = false }: { item: DisplayAnnouncement; modal?: boolean }) {
  const hasImage = Boolean(item.image_url?.trim());
  const hasText = Boolean(item.title?.trim() || item.summary?.trim() || item.details?.trim());
  return <>
    {hasImage && <Image src={item.image_url!} alt="" fill unoptimized className="object-cover" sizes={modal ? '(max-width: 640px) 92vw, 620px' : '(max-width: 640px) 78vw, 430px'} />}
    {hasImage && hasText && <div className="absolute inset-0 bg-gradient-to-t from-[#052b2b]/95 via-[#052b2b]/30 to-transparent" />}
    {!hasImage && <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D39] via-[#087F78] to-[#06302f]" />}
    {hasText && <div className={`absolute inset-x-0 bottom-0 z-10 ${hasImage ? 'p-5 sm:p-7' : 'flex h-full flex-col justify-center p-6 sm:p-8'} text-white`}>
      {item.title?.trim() && <h3 className="text-lg font-black leading-tight text-amber-200 sm:text-2xl">{item.title}</h3>}
      {item.summary?.trim() && <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/95 sm:text-base">{item.summary}</p>}
      {!item.summary?.trim() && item.details?.trim() && <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/95 sm:text-base">{item.details}</p>}
    </div>}
    {!hasImage && !hasText && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/80">إعلان المستشفى</div>}
  </>;
}

export default function AnnouncementCarousel({ config, slot }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [opened, setOpened] = useState<DisplayAnnouncement | null>(null);
  const touchStart = useRef<number | null>(null);
  const announcements = useMemo(() => resolveNoticeAnnouncements(config, slot, now, false), [config, slot, now]);
  const intervalSeconds = Math.min(60, Math.max(2, config?.display?.autoplay_seconds || 5));
  const change = useCallback((direction: -1 | 1) => {
    if (announcements.length < 2) return;
    setActiveIndex((index) => {
      const nextIndex = (index + direction + announcements.length) % announcements.length;
      setOpened((currentOpened) => currentOpened ? announcements[nextIndex] : currentOpened);
      return nextIndex;
    });
  }, [announcements]);

  useEffect(() => { if (activeIndex >= announcements.length) setActiveIndex(0); }, [activeIndex, announcements.length]);
  useEffect(() => {
    if (isPaused || announcements.length < 2) return;
    const timer = window.setInterval(() => setActiveIndex((index) => (index + 1) % announcements.length), intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [announcements.length, intervalSeconds, isPaused]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!opened) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpened(null); else if (event.key === 'ArrowLeft') change(1); else if (event.key === 'ArrowRight') change(-1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [change, opened]);

  if (!config?.is_enabled || announcements.length === 0) return null;
  const current = announcements[activeIndex];
  const previous = announcements.length > 1 ? announcements[(activeIndex - 1 + announcements.length) % announcements.length] : null;
  const next = announcements.length > 1 ? announcements[(activeIndex + 1) % announcements.length] : null;
  const heightClass = config.display?.height === 'compact' ? 'h-[230px] sm:h-[280px]' : 'h-[290px] sm:h-[370px]';
  const widthClass = config.display?.width === 'contained' ? 'max-w-[1100px]' : 'max-w-[1280px]';
  const openCurrent = () => setOpened(current);
  const renderSide = (item: DisplayAnnouncement | null, side: 'previous' | 'next') => item && <button type="button" onClick={() => change(side === 'previous' ? -1 : 1)} className={`absolute top-1/2 ${side === 'previous' ? 'left-[2%] sm:left-[12%]' : 'right-[2%] sm:right-[12%]'} z-10 w-[58vw] max-w-[340px] -translate-y-1/2 overflow-hidden rounded-3xl opacity-60 shadow-xl transition-all duration-500 hover:opacity-90 ${heightClass} scale-[.84]`} aria-label={side === 'previous' ? 'الإعلان السابق' : 'الإعلان التالي'}><CardContent item={item} /></button>;

  return <section dir="rtl" aria-label="إعلانات المستشفى" className="relative w-full overflow-hidden bg-[#F6F9FB] py-7 sm:py-10" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)} onTouchStart={(event) => { touchStart.current = event.changedTouches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current === null || end === undefined) return; const delta = end - touchStart.current; if (Math.abs(delta) > 45) change(delta < 0 ? 1 : -1); touchStart.current = null; }}>
    <div className={`mx-auto ${widthClass} px-3 sm:px-6`}>
      <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-wide text-[#087F78]">معرض إعلانات المستشفى</p><h2 className="mt-1 text-xl font-black text-[#163C3A] sm:text-2xl">آخر التنبيهات والإعلانات</h2></div><button type="button" onClick={() => setIsPaused((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-[#B7DCD7] bg-white px-3 py-2 text-xs font-bold text-[#087F78] shadow-sm" aria-label={isPaused ? 'تشغيل العرض التلقائي' : 'إيقاف العرض التلقائي'}>{isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{isPaused ? 'تشغيل' : 'إيقاف تلقائي'}</button></div>
      <div className={`relative mx-auto ${heightClass} w-full max-w-[920px]`}>
        {renderSide(previous, 'previous')}
        {renderSide(next, 'next')}
        <button type="button" onClick={openCurrent} className={`absolute left-1/2 top-1/2 z-20 w-[78vw] max-w-[430px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-[#0A3D39] text-right shadow-2xl ring-1 ring-black/10 transition-transform duration-500 hover:scale-[1.015] ${heightClass}`} aria-label="فتح تفاصيل الإعلان الحالي"><CardContent item={current} /></button>
        {announcements.length > 1 && <><button type="button" onClick={() => change(-1)} className="absolute left-0 top-1/2 z-30 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#087F78] shadow-lg sm:left-[7%]" aria-label="الإعلان السابق"><ChevronLeft className="h-5 w-5" /></button><button type="button" onClick={() => change(1)} className="absolute right-0 top-1/2 z-30 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#087F78] shadow-lg sm:right-[7%]" aria-label="الإعلان التالي"><ChevronRight className="h-5 w-5" /></button></>}
      </div>
      <div className="mt-5 flex items-center justify-center gap-2" aria-live="polite"><span className="text-xs font-bold text-[#5A6E85]">{activeIndex + 1} / {announcements.length}</span>{announcements.length > 1 && announcements.map((item, index) => <button key={item.id} type="button" onClick={() => setActiveIndex(index)} className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-7 bg-[#087F78]' : 'w-2 bg-[#B7DCD7]'}`} aria-label={`عرض الإعلان ${index + 1}`} />)}</div>
    </div>
    {opened && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpened(null); }}><div className="relative w-full max-w-2xl" role="dialog" aria-modal="true" aria-label="تفاصيل الإعلان"><button type="button" onClick={() => setOpened(null)} className="absolute -top-12 right-0 z-10 rounded-full bg-white/10 p-2 text-white" aria-label="إغلاق"><X className="h-5 w-5" /></button><div className="relative h-[70vh] max-h-[620px] min-h-[360px] overflow-hidden rounded-3xl bg-[#0A3D39] shadow-2xl"><CardContent item={opened} modal />{safeLink(opened.link_url) && <a href={safeLink(opened.link_url)!} target={opened.link_url?.startsWith('/') ? undefined : '_blank'} rel="noreferrer" className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#087F78]">فتح الرابط <ExternalLink className="mr-1 inline h-4 w-4" /></a>}</div>{announcements.length > 1 && <><button type="button" onClick={() => change(-1)} className="absolute left-0 top-1/2 -translate-x-1/2 rounded-full bg-white p-3 text-[#087F78] shadow-xl" aria-label="السابق"><ChevronLeft /></button><button type="button" onClick={() => change(1)} className="absolute right-0 top-1/2 translate-x-1/2 rounded-full bg-white p-3 text-[#087F78] shadow-xl" aria-label="التالي"><ChevronRight /></button></>}</div></div>}
  </section>;
}
