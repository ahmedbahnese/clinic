'use client';

import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Download, Share, Smartphone, Wifi } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function decodeVapidKey(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [notificationState, setNotificationState] = useState<'idle' | 'working' | 'subscribed' | 'unsupported' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    setIsAndroid(/Android/i.test(ua));
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone);

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotificationState('unsupported');
    } else if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => {
        if (subscription) setNotificationState('subscribed');
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) {
      setMessage(isIOS
        ? 'افتح هذه الصفحة في Safari، ثم اضغط مشاركة واختر «إضافة إلى الشاشة الرئيسية». '
        : 'من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».');
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setMessage('تم بدء تثبيت التطبيق.');
    setInstallEvent(null);
  };

  const enableNotifications = async () => {
    setNotificationState('working');
    setMessage('');
    try {
      if (isIOS && !installed) {
        setNotificationState('idle');
        setMessage('على iPhone، أضف الموقع أولًا إلى الشاشة الرئيسية من Safari، ثم افتح التطبيق من أيقونته لتفعيل الإشعارات.');
        return;
      }
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setNotificationState('unsupported');
        setMessage('الإشعارات غير مدعومة في هذا المتصفح.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotificationState('idle');
        setMessage('لم يتم تفعيل الإشعارات. يمكنك تغيير الإذن من إعدادات المتصفح.');
        return;
      }

      const keyResponse = await fetch('/api/notifications/vapid-public-key', { cache: 'no-store' });
      const keyData = await keyResponse.json();
      if (!keyResponse.ok || !keyData.publicKey) throw new Error(keyData.error || 'خدمة الإشعارات غير مهيأة بعد.');

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(keyData.publicKey) as BufferSource,
        });
      }

      const saveResponse = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      const saveData = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saveData.error || 'تعذر حفظ الاشتراك.');
      setNotificationState('subscribed');
      setMessage('تم تفعيل إشعارات الإعلانات العامة للمستشفى.');
    } catch (error) {
      setNotificationState('error');
      setMessage(error instanceof Error ? error.message : 'تعذر تفعيل الإشعارات الآن.');
    }
  };

  const disableNotifications = async () => {
    setNotificationState('working');
    setMessage('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/notifications/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setNotificationState('idle');
      setMessage('تم إلغاء اشتراك هذا الجهاز في الإشعارات.');
    } catch {
      setNotificationState('subscribed');
      setMessage('تعذر إلغاء الاشتراك الآن؛ يمكنك إيقاف الإذن من إعدادات المتصفح.');
    }
  };

  return (
    <section className="my-6 rounded-3xl border border-[#D8E8E6] bg-gradient-to-l from-white to-[#EFF8F7] p-5 shadow-sm sm:p-7" dir="rtl" aria-labelledby="pwa-install-title">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#087F78]/10 text-[#087F78]"><Smartphone className="h-5 w-5" /></span>
        <div>
          <h2 id="pwa-install-title" className="text-lg font-extrabold text-[#163C3A]">استخدم التطبيق من جهازك</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">أضف عيادات مستشفى الأطفال التخصصي إلى الشاشة الرئيسية لسهولة الوصول، دون تنزيل من متجر التطبيقات.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {!installed && (
          <button type="button" onClick={install} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#087F78] px-5 text-sm font-bold text-white transition hover:bg-[#066560]">
            <Download className="h-4 w-4" />
            <span>{installEvent ? (isAndroid ? 'تثبيت تطبيق Android' : 'تثبيت التطبيق') : isIOS ? 'طريقة التثبيت على iPhone' : 'طريقة التثبيت'}</span>
          </button>
        )}
        {isIOS && !installed && (
          <p className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#D8E8E6] bg-white px-4 text-xs leading-5 text-slate-700">
            <Share className="h-4 w-4 shrink-0 text-[#087F78]" />
            من Safari: مشاركة ← إضافة إلى الشاشة الرئيسية
          </p>
        )}
        {installed && <span className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-50 px-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />التطبيق مثبت على هذا الجهاز</span>}
        {notificationState !== 'unsupported' && notificationState !== 'subscribed' && (
          <button type="button" onClick={enableNotifications} disabled={notificationState === 'working'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#087F78] bg-white px-5 text-sm font-bold text-[#087F78] transition hover:bg-[#087F78]/5 disabled:opacity-60">
            <BellRing className="h-4 w-4" />
            <span>{notificationState === 'working' ? 'جارٍ تفعيل الإشعارات…' : 'تفعيل إشعارات المستشفى'}</span>
          </button>
        )}
        {notificationState === 'subscribed' && <span className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-50 px-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />إشعارات المستشفى مفعّلة</span>}
        {notificationState === 'subscribed' && (
          <button type="button" onClick={disableNotifications} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-600 hover:bg-slate-50">إيقاف الإشعارات على هذا الجهاز</button>
        )}
      </div>
      {message && <p role="status" className="mt-3 text-xs leading-6 text-[#52666B]">{message}</p>}
      <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><Wifi className="mt-0.5 h-3.5 w-3.5 shrink-0" />الحجز والبيانات الشخصية تتطلب اتصالًا بالإنترنت. لن تُخزن بيانات المرضى دون اتصال.</p>
    </section>
  );
}
