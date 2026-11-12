'use client';
import React, { useState } from 'react';
import { BellRing, PhoneCall, X } from 'lucide-react';
import type { NoticeBarConfig } from '@/types/cms';

type Props = { config?: NoticeBarConfig };

export function NoticeBar({ config }: Props) {
  const [visible, setVisible] = useState(true);
  if (!config || config.urgent_enabled === false || !visible || !(config.title?.trim() || config.message?.trim())) return null;
  return <aside dir="rtl" aria-label="التنبيه العاجل" className="border-b border-amber-200 bg-amber-50 text-[#163C3A]">
    <div className="mx-auto flex min-h-12 max-w-[1100px] items-center gap-3 px-4 py-2 text-xs sm:px-6">
      <BellRing className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="min-w-0 flex-1"><strong className="font-black text-amber-800">{config.title?.trim()}</strong>{config.message?.trim() && <span className="mr-2 text-[#5A6E85]">{config.message.trim()}</span>}</div>
      {config.hotline_label?.trim() && <span className="hidden items-center gap-1 text-[11px] font-bold text-[#087F78] sm:inline-flex"><PhoneCall className="h-3 w-3" />{config.hotline_label.trim()}</span>}
      <button type="button" onClick={() => setVisible(false)} className="rounded-lg p-1.5 text-amber-700 hover:bg-amber-100" aria-label="إغلاق التنبيه العاجل"><X className="h-4 w-4" /></button>
    </div>
  </aside>;
}
