'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Info, X } from 'lucide-react';
import {
  detectPwaEnvironment,
  getPwaInstallInstructions,
  isPwaStandaloneMode,
  PWA_INSTALL_REQUEST_EVENT,
  PWA_INSTALL_STATE_EVENT,
  readPwaInstalledHint,
  writePwaInstalledHint,
  type PwaInstallEnvironment,
} from '@/lib/pwaInstall';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isRunningStandalone(): boolean {
  const legacyStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  return isPwaStandaloneMode(displayModeStandalone, legacyStandalone);
}

function getCurrentEnvironment(): PwaInstallEnvironment {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string; brands?: Array<{ brand: string }> };
  };
  return detectPwaEnvironment({
    userAgent: nav.userAgent || '',
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    userAgentDataPlatform: nav.userAgentData?.platform,
    userAgentDataBrands: nav.userAgentData?.brands?.map(({ brand }) => brand),
  });
}

export function PwaInstallPrompt() {
  const installEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const installedRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [environment, setEnvironment] = useState<PwaInstallEnvironment>({ platform: 'desktop', browser: 'other' });
  const [message, setMessage] = useState('');
  const instructions = getPwaInstallInstructions(environment);

  const handleNativeInstall = useCallback(async () => {
    const deferredPrompt = installEventRef.current;
    if (!deferredPrompt) {
      setVisible(true);
      return;
    }

    installEventRef.current = null;
    setCanPrompt(false);

    try {
      // This runs synchronously from the user's click before the first await.
      const promptResult = deferredPrompt.prompt();
      await promptResult;
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === 'dismissed') {
        setMessage('لم يكتمل التثبيت. يمكنك إعادة المحاولة لاحقًا من زر «تثبيت التطبيق» في الهيدر.');
        setVisible(true);
        return;
      }

      if (!installedRef.current && !isRunningStandalone() && !readPwaInstalledHint()) {
        setMessage('قبلت نافذة المتصفح الطلب، لكن لم يصل تأكيد اكتمال التثبيت بعد. لن نعرض الموقع على أنه مثبت حتى يؤكد المتصفح ذلك.');
        setVisible(true);
      }
    } catch {
      setMessage('تعذر فتح نافذة التثبيت الأصلية. استخدم خطوات المتصفح أدناه، ويمكنك المحاولة مرة أخرى لاحقًا.');
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    const syncInstalledState = () => {
      const standalone = isRunningStandalone();
      const storedHint = readPwaInstalledHint();
      if (standalone && !storedHint) writePwaInstalledHint(true);
      const installed = standalone || storedHint;
      installedRef.current = installed;
      setIsInstalled(installed);
      if (installed) setVisible(false);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      // Keep the browser's native prompt for the explicit header action.
      event.preventDefault();
      installEventRef.current = event as BeforeInstallPromptEvent;
      setCanPrompt(true);
      setEnvironment(getCurrentEnvironment());

      // A fresh installable event is stronger evidence than a stale saved hint.
      if (!isRunningStandalone() && readPwaInstalledHint()) writePwaInstalledHint(false);
      const standalone = isRunningStandalone();
      installedRef.current = standalone;
      setIsInstalled(standalone);
    };

    const onAppInstalled = () => {
      installEventRef.current = null;
      setCanPrompt(false);
      writePwaInstalledHint(true);
      installedRef.current = true;
      setIsInstalled(true);
      setVisible(false);
      setMessage('');
    };

    const onInstallRequest = () => {
      setEnvironment(getCurrentEnvironment());
      if (isRunningStandalone() || readPwaInstalledHint()) {
        installedRef.current = true;
        setIsInstalled(true);
        setMessage('التطبيق مثبت بالفعل على هذا الجهاز.');
        setVisible(true);
        return;
      }

      setMessage('');
      if (installEventRef.current) {
        void handleNativeInstall();
      } else {
        setVisible(true);
      }
    };

    syncInstalledState();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener(PWA_INSTALL_REQUEST_EVENT, onInstallRequest);
    window.addEventListener(PWA_INSTALL_STATE_EVENT, syncInstalledState);
    window.addEventListener('storage', syncInstalledState);

    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    displayMode?.addEventListener('change', syncInstalledState);
    document.addEventListener('visibilitychange', syncInstalledState);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener(PWA_INSTALL_REQUEST_EVENT, onInstallRequest);
      window.removeEventListener(PWA_INSTALL_STATE_EVENT, syncInstalledState);
      window.removeEventListener('storage', syncInstalledState);
      displayMode?.removeEventListener('change', syncInstalledState);
      document.removeEventListener('visibilitychange', syncInstalledState);
    };
  }, [handleNativeInstall]);

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVisible(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={() => setVisible(false)}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        dir="rtl"
        className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#B7DCD7] bg-white p-5 shadow-[0_20px_60px_rgba(18,78,74,0.25)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={() => setVisible(false)}
          className="absolute left-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full text-[#5A6B82] transition hover:bg-[#F0F7F6] hover:text-[#087F78] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#087F78]"
          aria-label="إغلاق نافذة تثبيت التطبيق"
          title="إغلاق"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {isInstalled ? (
          <div className="pt-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-[#087F78]" aria-hidden="true" />
            <h2 id="pwa-install-title" className="mt-3 text-lg font-extrabold text-[#163C3A]">التطبيق مثبت</h2>
            <p className="mt-2 text-sm leading-6 text-[#5A6B82]">يمكنك فتح العيادات من أيقونة الشاشة الرئيسية أو قائمة التطبيقات.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 pl-8">
              <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#087F78]/10 text-[#087F78]">
                <Download className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="pwa-install-title" className="text-lg font-extrabold text-[#163C3A]">{instructions.title}</h2>
                <p className="mt-1 text-sm leading-6 text-[#5A6B82]">استخدم خيار التثبيت الذي يتيحه متصفحك. الإغلاق لا يخفي زر التثبيت من الهيدر.</p>
              </div>
            </div>

            {message && (
              <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-950" role="status" aria-live="polite">
                <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{message}</span>
              </p>
            )}

            <ol className="mt-5 list-decimal space-y-2 pr-6 text-sm leading-6 text-[#294B49]">
              {instructions.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <p className="mt-4 rounded-2xl bg-[#F0F7F6] px-3 py-2.5 text-xs leading-5 text-[#52666B]">{instructions.note}</p>

            {canPrompt && (
              <button
                type="button"
                onClick={() => void handleNativeInstall()}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#087F78] px-4 text-sm font-bold text-white transition hover:bg-[#066B66] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#087F78] focus-visible:ring-offset-2"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                تثبيت التطبيق الآن
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
