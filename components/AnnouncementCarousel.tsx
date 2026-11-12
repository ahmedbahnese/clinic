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

function MediaPanel({ item, modal = false }: { item: DisplayAnnouncement; modal?: boolean }) {
  const hasImage = Boolean(item.image_url?.trim());
  return <div className={`relative min-h-0 flex-1 overflow-hidden bg-[#0A3D39] ${item.image_frameless ? 'rounded-none' : modal ? 'rounded-none' : ''}`}>
    {hasImage && <Image src={item.image_url!} alt="" fill unoptimized className={`object-cover transition-transform duration-700 ${item.image_3d ? 'scale-[1.04]' : ''}`} style={item.image_3d ? { transform: 'perspective(1000px) rotateX(3deg) rotateY(-3deg) scale(1.04)', transformOrigin: 'center center' } : undefined} sizes={modal ? '(max-width: 640px) 92vw, 620px' : '(max-width: 640px) 78vw, 430px'} />}
    {!hasImage && <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D39] via-[#087F78] to-[#06302f]" />}
  </div>;
}

function CardVisual({ item, modal = false }: { item: DisplayAnnouncement; modal?: boolean }) {
  const title = item.title?.trim();
  const summary = item.summary?.trim();
  return <div className="flex h-full min-h-0 flex-col bg-white text-right" dir="rtl">
    {title && <div className="shrink-0 bg-white px-4 py-2.5 text-center text-base font-black leading-tight text-[#163C3A] sm:px-6 sm:py-3 sm:text-xl">{title}</div>}
    <MediaPanel item={item} modal={modal} />
    {summary && <div className="shrink-0 bg-[#0A3D39] px-4 py-2.5 text-center text-sm font-bold leading-6 text-white sm:px-6 sm:py-3 sm:text-base">{summary}</div>}
  </div>;
}

function cardClasses(item: DisplayAnnouncement, heightClass: string) {
  const frame = item.image_frameless ? 'rounded-none border-0 shadow-none' : 'rounded-3xl border border-black/10 shadow-2xl';
  const depth = item.image_3d ? 'transform-gpu [transform:perspective(1000px)_rotateX(2deg)_rotateY(-2deg)]' : '';
  return `overflow-hidden bg-white transition duration-500 ${frame} ${depth} ${heightClass}`;
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
  const renderSide = (item: DisplayAnnouncement | null, side: 'previous' | 'next') => item && <button type="button" onClick={() => change(side === 'previous' ? -1 : 1)} className={`absolute top-1/2 ${side === 'previous' ? 'left-[2%] sm:left-[12%]' : 'right-[2%] sm:right-[12%]'} z-10 w-[58vw] max-w-[340px] -translate-y-1/2 opacity-60 transition-all duration-500 hover:opacity-90 ${cardClasses(item, heightClass)} scale-[.84]`} aria-label={side === 'previous' ? 'الإعلان السابق' : 'الإعلان التالي'}><CardVisual item={item} /></button>;
  const openedLink = opened ? safeLink(opened.link_url) : null;
  const openedLinkLabel = opened?.link_label?.trim() || 'اضغط هنا';

  return <section dir="rtl" aria-label="إعلانات المستشفى" className="relative w-full overflow-hidden bg-[#F6F9FB] py-5 sm:py-8" onTouchStart={(event) => { touchStart.current = event.changedTouches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current === null || end === undefined) return; const delta = end - touchStart.current; if (Math.abs(delta) > 45) change(delta < 0 ? 1 : -1); touchStart.current = null; }}>
    <div className={`mx-auto ${widthClass} px-3 sm:px-6`}>
      <div className="relative mx-auto w-full max-w-[920px] perspective-[1200px]">
        <div className={`relative mx-auto ${heightClass}`}>
          {renderSide(previous, 'previous')}
          {renderSide(next, 'next')}
          <button type="button" onClick={() => setOpened(current)} className={`absolute left-1/2 top-1/2 z-20 w-[78vw] max-w-[430px] -translate-x-1/2 -translate-y-1/2 text-right ${cardClasses(current, heightClass)}`} aria-label="فتح تفاصيل الإعلان الحالي"><CardVisual item={current} /></button>
          {announcements.length > 1 && <><button type="button" onClick={() => change(-1)} className="absolute left-0 top-1/2 z-30 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#087F78] shadow-lg sm:left-[7%]" aria-label="الإعلان السابق"><ChevronLeft className="h-5 w-5" /></button><button type="button" onClick={() => change(1)} className="absolute right-0 top-1/2 z-30 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#087F78] shadow-lg sm:right-[7%]" aria-label="الإعلان التالي"><ChevronRight className="h-5 w-5" /></button></>}
        </div>
        {announcements.length > 1 && <div className="mt-4 flex items-center justify-center gap-2" aria-live="polite"><span className="text-xs font-bold text-[#5A6E85]">{activeIndex + 1} / {announcements.length}</span>{announcements.map((item, index) => <button key={item.id} type="button" onClick={() => setActiveIndex(index)} className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-7 bg-[#087F78]' : 'w-2 bg-[#B7DCD7]'}`} aria-label={`عرض الإعلان ${index + 1}`} />)}</div>}
      </div>
    </div>
    {opened && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpened(null); }}><div className="relative w-full max-w-2xl" role="dialog" aria-modal="true" aria-label="تفاصيل الإعلان"><button type="button" onClick={() => setOpened(null)} className="absolute -top-12 right-0 z-10 rounded-full bg-white/10 p-2 text-white" aria-label="إغلاق"><X className="h-5 w-5" /></button><div className={`${opened.image_frameless ? 'rounded-none' : 'rounded-3xl'} max-h-[86vh] overflow-y-auto bg-white shadow-2xl`}><div className="h-[52vh] max-h-[560px] min-h-[300px]"><CardVisual item={opened} modal /></div>{(opened.details?.trim() || openedLink) && <div className="space-y-4 bg-white p-5 text-right" dir="rtl">{opened.details?.trim() && <p className="whitespace-pre-wrap text-sm leading-7 text-[#163C3A]">{opened.details.trim()}</p>}{openedLink && <div className="text-center"><a href={openedLink} target={openedLink.startsWith('/') ? undefined : '_blank'} rel="noreferrer" className="inline-flex items-center rounded-xl bg-[#087F78] px-6 py-3 text-sm font-black text-white shadow-lg">{openedLinkLabel} <ExternalLink className="mr-1 h-4 w-4" /></a></div>}</div>}</div>{announcements.length > 1 && <><button type="button" onClick={() => change(-1)} className="absolute left-0 top-1/2 -translate-x-1/2 rounded-full bg-white p-3 text-[#087F78] shadow-xl" aria-label="السابق"><ChevronLeft /></button><button type="button" onClick={() => change(1)} className="absolute right-0 top-1/2 translate-x-1/2 rounded-full bg-white p-3 text-[#087F78] shadow-xl" aria-label="التالي"><ChevronRight /></button></>}</div></div>}
  </section>;
}
