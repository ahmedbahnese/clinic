'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function PwaRuntime() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const updateConnection = () => setOffline(!navigator.onLine);
    updateConnection();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.warn('PWA service worker registration failed:', error);
      });
    }

    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-xs font-bold text-amber-950 shadow-sm" role="status" aria-live="polite" dir="rtl">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>أنت غير متصل بالإنترنت. الحجز والبيانات تحتاج اتصالًا بالشبكة.</span>
    </div>
  );
}
