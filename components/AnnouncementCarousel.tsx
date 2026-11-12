'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
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
  const title = item.title?.trim();
  const summary = item.summary?.trim();
  const details = item.details?.trim();
  const hasText = Boolean(title || summary || (modal && details));
  return <>
    {hasImage && <Image src={item.image_url!} alt="" fill unoptimized className="object-cover" sizes={modal ? '(max-width: 640px) 92vw, 620px' : '(max-width: 640px) 78vw, 430px'} />}
    {!hasImage && <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D39] via-[#087F78] to-[#06302f]" />}
    {hasImage && hasText && <div className="absolute inset-0 bg-gradient-to-b from-[#052b2b]/80 via-transparent to-[#052b2b]/80" />}
    {hasText && <div className={`absolute inset-0 z-10 flex flex-col text-white ${modal ? 'p-6 sm:p-8' : 'p-5 sm:p-7'}`}>
      {title && <h3 className="text-center text-lg font-black leading-tight text-amber-200 drop-shadow-lg sm:text-2xl">{title}</h3>}
      {summary && <p className="my-auto line-clamp-4 text-center text-sm font-bold leading-7 text-white drop-shadow-lg sm:text-base">{summary}</p>}
      {modal && details && details !== summary && <p className="mt-auto max-h-32 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/45 p-4 text-right text-xs leading-6 text-white/95 sm:text-sm">{details}</p>}
    </div>}
    {!hasImage && !hasText && modal && details && <p className="absolute inset-x-5 bottom-5 z-10 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/30 p-4 text-right text-sm leading-7 text-white">{details}</p>}
  </>;
}

export default function AnnouncementCarousel({ config, slot }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [activeIndex, setActiveIndex] = useState(0);
  const [opened, setOpened] = useState<DisplayAnnouncement | null>(null);
  const touchStart = useRef<number | null>(null);
  const announcements = useMemo(() => resolveNoticeAnnouncements(config, slot, now, false), [config, slot, now]);
  const autoplayEnabled = config?.display?.autoplay_enabled !== false;
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
    if (!autoplayEnabled || announcements.length < 2) return;
    const timer = window.setInterval(() => setActiveIndex((index) => (index + 1) % announcements.length), intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [announcements.length, autoplayEnabled, intervalSeconds]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
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
  const renderSide = (item: DisplayAnnouncement | null, side: 'previous' | 'next') => item && <button type="button" onClick={() => change(side === 'previous' ? -1 : 1)} className={`absolute top-1/2 ${side === 'previous' ? 'left-[2%] sm:left-[12%]' : 'right-[2%] sm:right-[12%]'} z-10 w-[58vw] max-w-[340px] -translate-y-1/2 overflow-hidden rounded-3xl opacity-60 shadow-xl transition-all duration-500 hover:opacity-90 ${heightClass} scale-[.84]`} aria-label={side === 'previous' ? 'الإعلان السابق' : 'الإعلان التالي'}><CardContent item={item} /></button>;
  const link = opened ? safeLink(opened.link_url) : null;

  return <section dir="rtl" aria-label="إعلانات المستشفى" className="relative w-full overflow-hidden bg-[#F6F9FB] py-5 sm:py-8" onTouchStart={(event) => { touchStart.current = event.changedTouches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current === null || end === undefined) return; const delta = end - touchStart.current; if (Math.abs(delta) > 45) change(delta < 0 ? 1 : -1); touchStart.current = null; }}>
    <div className={`mx-auto ${widthClass} px-3 sm:px-6`}>
      <div className={`relative mx-auto ${heightClass} w-full max-w-[920px] perspective-[1200px]`}>
        {renderSide(previous, 'previous')}
        {renderSide(next, 'next')}
        <button type="button" onClick={() => setOpened(current)} className={`absolute left-1/2 top-1/2 z-20 w-[78vw] max-w-[430px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-[#0A3D39] text-right shadow-2xl ring-1 ring-black/10 transition duration-500 hover:rotate-y-1 hover:scale-[1.015] ${heightClass}`} aria-label="فتح تفاصيل الإعلان الحالي"><CardContent item={current} /></button>
        {announcements.length > 1 && <><button type="button" onClick={() => change(-1)} className="absolute left-0 top-1/2 z-30 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#087F78] shadow-lg sm:left-[7%]" aria-label="الإعلان السابق"><ChevronLeft className="h-5 w-5" /></button><button type="button" onClick={() => change(1)} className="absolute right-0 top-1/2 z-30 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#087F78] shadow-lg sm:right-[7%]" aria-label="الإعلان التالي"><ChevronRight className="h-5 w-5" /></button></>}
      </div>
      {announcements.length > 1 && <div className="mt-4 flex items-center justify-center gap-2" aria-live="polite"><span className="text-xs font-bold text-[#5A6E85]">{activeIndex + 1} / {announcements.length}</span>{announcements.map((item, index) => <button key={item.id} type="button" onClick={() => setActiveIndex(index)} className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-7 bg-[#087F78]' : 'w-2 bg-[#B7DCD7]'}`} aria-label={`عرض الإعلان ${index + 1}`} />)}</div>}
    </div>
    {opened && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpened(null); }}><div className="relative w-full max-w-2xl" role="dialog" aria-modal="true" aria-label="تفاصيل الإعلان"><button type="button" onClick={() => setOpened(null)} className="absolute -top-12 right-0 z-10 rounded-full bg-white/10 p-2 text-white" aria-label="إغلاق"><X className="h-5 w-5" /></button><div className="relative h-[76vh] max-h-[680px] min-h-[400px] overflow-hidden rounded-3xl bg-[#0A3D39] shadow-2xl"><CardContent item={opened} modal />{link && <a href={link} target={link.startsWith('/') ? undefined : '_blank'} rel="noreferrer" className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-xl bg-white px-6 py-3 text-sm font-black text-[#087F78] shadow-xl">اضغط هنا <ExternalLink className="mr-1 inline h-4 w-4" /></a>}</div>{announcements.length > 1 && <><button type="button" onClick={() => change(-1)} className="absolute left-0 top-1/2 -translate-x-1/2 rounded-full bg-white p-3 text-[#087F78] shadow-xl" aria-label="السابق"><ChevronLeft /></button><button type="button" onClick={() => change(1)} className="absolute right-0 top-1/2 translate-x-1/2 rounded-full bg-white p-3 text-[#087F78] shadow-xl" aria-label="التالي"><ChevronRight /></button></>}</div></div>}
  </section>;
}
