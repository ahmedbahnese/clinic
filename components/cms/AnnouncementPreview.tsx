'use client';
import React from 'react';
import Image from 'next/image';
import { ExternalLink, X } from 'lucide-react';
import type { NoticeAnnouncement } from '@/types/cms';

function safeLink(value?: string) {
  const link = value?.trim();
  if (!link || /[\u0000-\u001f\\]/.test(link)) return null;
  if (link.startsWith('/') && !link.startsWith('//')) return link;
  try { const parsed = new URL(link); return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null; } catch { return null; }
}

export default function AnnouncementPreview({ announcement, onClose }: { announcement: NoticeAnnouncement; onClose: () => void }) {
  const hasImage = Boolean(announcement.image_url?.trim());
  const title = announcement.title?.trim();
  const summary = announcement.summary?.trim() || announcement.message?.trim();
  const link = safeLink(announcement.link_url);
  const frame = announcement.image_frameless ? 'rounded-none' : 'rounded-3xl';
  const mediaStyle = announcement.image_3d ? { transform: 'perspective(1000px) rotateX(3deg) rotateY(-3deg) scale(1.04)' } : undefined;
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="relative w-full max-w-2xl" role="dialog" aria-modal="true" aria-label="معاينة الإعلان بالشكل النهائي">
      <button type="button" onClick={onClose} className="absolute -top-12 right-0 rounded-full bg-white/10 p-2 text-white" aria-label="إغلاق المعاينة"><X className="h-5 w-5" /></button>
      <div className={`${frame} max-h-[86vh] overflow-y-auto bg-white shadow-2xl`} dir="rtl">
        {title && <div className="bg-white px-5 py-3 text-center text-xl font-black text-[#163C3A]">{title}</div>}
        <div className="relative h-[48vh] max-h-[520px] min-h-[280px] overflow-hidden bg-[#0A3D39]">
          {hasImage && <Image src={announcement.image_url!} alt="" fill unoptimized className="object-cover" style={mediaStyle} sizes="(max-width: 640px) 92vw, 620px" />}
          {!hasImage && <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D39] via-[#087F78] to-[#06302f]" />}
        </div>
        {summary && <div className="bg-[#0A3D39] px-5 py-3 text-center text-sm font-bold leading-6 text-white">{summary}</div>}
        {(announcement.details?.trim() || link) && <div className="space-y-4 bg-white p-5 text-right">{announcement.details?.trim() && <p className="whitespace-pre-wrap text-sm leading-7 text-[#163C3A]">{announcement.details.trim()}</p>}{link && <div className="text-center"><span className="inline-flex items-center rounded-xl bg-[#087F78] px-6 py-3 text-sm font-black text-white shadow-lg">اضغط هنا <ExternalLink className="mr-1 h-4 w-4" /></span></div>}</div>}
      </div>
      <p className="mt-3 text-center text-xs text-white/80">معاينة الشكل النهائي: العنوان قبل الصورة، النص المختصر أسفلها، والتفاصيل والرابط أسفل إطار الصورة عند الفتح.</p>
    </div>
  </div>;
}
