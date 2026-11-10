'use client';

import { useEffect, useState } from 'react';
import { Download, Monitor, Share2, Smartphone, TabletSmartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type Device = 'android' | 'iphone' | 'computer';
const DISMISS_KEY = 'bsch-install-notice-dismissed';

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      // Continue when storage is unavailable.
    }

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIsIOS(ios);
    if (!standalone) setVisible(true);

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onInstallPrompt);
  }, []);

  const closeNotice = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Dismiss for this session when storage is unavailable.
    }
  };

  const shareLink = async (device: Device) => {
    setMessage('');
    if (device === 'iphone') {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'عيادات مستشفى الأطفال التخصصي',
            text: 'أضف منصة العيادات إلى الشاشة الرئيسية للوصول السريع للحجز والمتابعة.',
            url: window.location.href,
          });
          setMessage('تم فتح المشاركة. من قائمة المشاركة اختر «إضافة إلى الشاشة الرئيسية»، ثم وافق على الإضافة.');
          return;
        } catch {
          // The user may have closed the share sheet; show the manual Safari fallback.
        }
      }
      setMessage(isIOS
        ? 'افتح هذه الصفحة في Safari ثم اختر مشاركة ← إضافة إلى الشاشة الرئيسية، ووافق على الإضافة.'
        : 'افتح الرابط في Safari ثم اختر مشاركة ← إضافة إلى الشاشة الرئيسية.');
      return;
    }

    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      if (choice.outcome === 'accepted') {
        closeNotice();
        return;
      }
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'عيادات مستشفى الأطفال التخصصي',
          text: 'افتح منصة العيادات الخارجية واحجز موعدك بسهولة',
          url: window.location.origin,
        });
        return;
      } catch {
        // The user may have closed the native share sheet.
      }
    }

    if (device === 'computer') {
      setMessage('من قائمة المتصفح اختر «تثبيت التطبيق» أو «إنشاء اختصار».');
    } else {
      setMessage('من قائمة Chrome اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».');
    }
  };

  if (!visible) return null;

  return (
    <aside
      className="no-print fixed bottom-4 left-4 right-4 z-[44] mx-auto max-w-2xl rounded-2xl border border-[#B7DCD7] bg-white/95 p-3 shadow-[0_12px_35px_rgba(18,78,74,0.18)] backdrop-blur-md sm:bottom-5 sm:left-auto sm:right-5 sm:p-4"
      dir="rtl"
      role="status"
      aria-label="إضافة الموقع إلى جهازك"
    >
      <button
        type="button"
        onClick={closeNotice}
        className="absolute left-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-[#5A6B82] transition hover:bg-[#F0F7F6] hover:text-[#087F78]"
        aria-label="إغلاق إشعار إضافة الموقع"
        title="إغلاق"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pl-8 sm:pl-10">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#087F78]/10 text-[#087F78]">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[#163C3A]">أضف العيادات إلى جهازك</p>
          <p className="mt-0.5 text-xs leading-5 text-[#5A6B82]">وصول سريع للحجز والمتابعة، بدون تنزيل من متجر التطبيقات.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => void shareLink('android')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#D8E8E6] bg-[#F7FCFB] px-2 text-[11px] font-bold text-[#087F78] transition hover:border-[#087F78] hover:bg-[#E6F4F2]" title="إضافة الموقع إلى Android">
              <Smartphone className="h-4 w-4" aria-hidden="true" />
              <span>Android</span>
            </button>
            <button type="button" onClick={() => void shareLink('iphone')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#D8E8E6] bg-[#F7FCFB] px-2 text-[11px] font-bold text-[#087F78] transition hover:border-[#087F78] hover:bg-[#E6F4F2]" title="إضافة الموقع إلى iPhone">
              <TabletSmartphone className="h-4 w-4" aria-hidden="true" />
              <span>iPhone</span>
            </button>
            <button type="button" onClick={() => void shareLink('computer')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#D8E8E6] bg-[#F7FCFB] px-2 text-[11px] font-bold text-[#087F78] transition hover:border-[#087F78] hover:bg-[#E6F4F2]" title="إضافة الموقع إلى الكمبيوتر">
              <Monitor className="h-4 w-4" aria-hidden="true" />
              <span>كمبيوتر</span>
            </button>
          </div>
          {message && <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-[#52666B]"><Share2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#087F78]" />{message}</p>}
        </div>
      </div>
    </aside>
  );
}
