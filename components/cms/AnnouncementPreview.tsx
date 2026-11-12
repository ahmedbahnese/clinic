'use client';
import React from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { NoticeAnnouncement } from '@/types/cms';

export default function AnnouncementPreview({ announcement, onClose }: { announcement: NoticeAnnouncement; onClose: () => void }) {
  const hasImage = Boolean(announcement.image_url?.trim());
  const hasText = Boolean(announcement.title?.trim() || announcement.summary?.trim() || announcement.details?.trim());
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="relative w-full max-w-2xl" role="dialog" aria-modal="true" aria-label="معاينة الإعلان بالشكل النهائي">
      <button type="button" onClick={onClose} className="absolute -top-12 right-0 rounded-full bg-white/10 p-2 text-white" aria-label="إغلاق المعاينة"><X className="h-5 w-5" /></button>
      <div className="relative min-h-[360px] overflow-hidden rounded-3xl bg-[#0A3D39] shadow-2xl sm:min-h-[480px]">
        {hasImage && <Image src={announcement.image_url!} alt="" fill unoptimized className="object-cover" sizes="(max-width: 640px) 92vw, 620px" />}
        {hasImage && hasText && <div className="absolute inset-0 bg-gradient-to-t from-[#052b2b]/95 via-[#052b2b]/30 to-transparent" />}
        {!hasImage && <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D39] via-[#087F78] to-[#06302f]" />}
        {hasText && <div className={`absolute inset-x-0 bottom-0 z-10 p-6 text-white sm:p-8 ${hasImage ? '' : 'flex h-full flex-col justify-center'}`}>{announcement.title?.trim() && <h3 className="text-xl font-black text-amber-200 sm:text-3xl">{announcement.title}</h3>}{announcement.summary?.trim() && <p className="mt-3 text-sm leading-7 sm:text-base">{announcement.summary}</p>}{!announcement.summary?.trim() && announcement.details?.trim() && <p className="mt-3 whitespace-pre-wrap text-sm leading-7 sm:text-base">{announcement.details}</p>}</div>}
        {!hasImage && !hasText && <div className="absolute inset-0 flex items-center justify-center text-white/80">إعلان بدون نص أو صورة</div>}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex w-full -translate-x-1/2 -translate-y-1/2 justify-between px-[-12px]"><span className="rounded-full bg-white/20 p-3 text-white"><ChevronLeft /></span><span className="rounded-full bg-white/20 p-3 text-white"><ChevronRight /></span></div>
      <p className="mt-3 text-center text-xs text-white/80">هذه معاينة شكل الكرت في Carousel. سيتم عرض الكروت الأخرى بجانبه عند وجود أكثر من إعلان في نفس المكان.</p>
    </div>
  </div>;
}
