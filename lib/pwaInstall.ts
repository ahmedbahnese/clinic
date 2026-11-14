export const PWA_INSTALL_REQUEST_EVENT = 'bsch:pwa-install-request';
export const PWA_INSTALL_STATE_EVENT = 'bsch:pwa-install-state-change';
export const PWA_INSTALLED_STORAGE_KEY = 'bsch-pwa-installed';

export type PwaPlatform = 'ios' | 'android' | 'desktop';
export type PwaBrowser = 'chrome' | 'edge' | 'safari' | 'firefox' | 'other';

export interface PwaNavigatorHints {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentDataPlatform?: string;
  userAgentDataBrands?: string[];
}

export interface PwaInstallEnvironment {
  platform: PwaPlatform;
  browser: PwaBrowser;
}

export interface PwaInstallInstructions {
  title: string;
  steps: string[];
  note: string;
}

/**
 * Browser APIs, not device labels, control whether the native install flow is used.
 * This helper classifies only the fallback instructions shown when that API is absent.
 */
export function detectPwaEnvironment(hints: PwaNavigatorHints): PwaInstallEnvironment {
  const userAgent = hints.userAgent || '';
  const platformHints = `${hints.platform || ''} ${hints.userAgentDataPlatform || ''} ${userAgent}`;
  const brands = (hints.userAgentDataBrands || []).join(' ');

  const isIOS = /iPhone|iPad|iPod|iOS/i.test(platformHints)
    || (/MacIntel/i.test(hints.platform || '') && (hints.maxTouchPoints || 0) > 1);
  const isAndroid = /Android/i.test(platformHints);

  let browser: PwaBrowser = 'other';
  // Prefer explicit UA tokens. User-Agent Client Hints may describe the
  // emulation engine (for example Chromium while testing an iPhone Safari UA).
  if (/EdgA|EdgiOS|Edg\//i.test(userAgent)) {
    browser = 'edge';
  } else if (/CriOS|Chrome|Chromium/i.test(userAgent)) {
    browser = 'chrome';
  } else if (/FxiOS|Firefox/i.test(userAgent)) {
    browser = 'firefox';
  } else if (/Safari/i.test(userAgent)) {
    browser = 'safari';
  } else if (/Microsoft Edge/i.test(brands)) {
    browser = 'edge';
  } else if (/Google Chrome|Chromium/i.test(brands)) {
    browser = 'chrome';
  } else if (/Firefox/i.test(brands)) {
    browser = 'firefox';
  }

  return {
    platform: isIOS ? 'ios' : isAndroid ? 'android' : 'desktop',
    browser,
  };
}

export function isPwaStandaloneMode(displayModeStandalone: boolean, legacyStandalone: boolean): boolean {
  return displayModeStandalone || legacyStandalone;
}

export function getPwaInstallInstructions(environment: PwaInstallEnvironment): PwaInstallInstructions {
  const { platform, browser } = environment;

  if (platform === 'ios') {
    if (browser === 'safari') {
      return {
        title: 'أضف العيادات إلى الشاشة الرئيسية',
        steps: [
          'في Safari اضغط زر «مشاركة» (المربع مع السهم لأعلى).',
          'اختر «إضافة إلى الشاشة الرئيسية».',
          'اضغط «إضافة»، ثم افتح الأيقونة الجديدة من الشاشة الرئيسية.',
        ],
        note: 'لا يستطيع الموقع تنفيذ الإضافة أو إنشاء الأيقونة تلقائيًا على iPhone.',
      };
    }

    return {
      title: 'أكمل الإضافة من Safari على iPhone',
      steps: [
        'افتح رابط العيادات في Safari؛ المتصفح الحالي لا يتيح للموقع فتح أمر الإضافة مباشرة.',
        'في Safari اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية».',
        'اضغط «إضافة»، ثم افتح الأيقونة من الشاشة الرئيسية.',
      ],
      note: 'لا يوجد رابط App Store رسمي مضبوط لهذا الموقع؛ هذه إضافة للموقع إلى الشاشة الرئيسية وليست تنزيلًا من المتجر.',
    };
  }

  if (platform === 'android') {
    if (browser === 'chrome' || browser === 'edge') {
      return {
        title: 'أضف العيادات على Android',
        steps: [
          `من قائمة ${browser === 'edge' ? 'Edge' : 'Chrome'} ⋮ اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».`,
          'راجع الطلب الذي يعرضه المتصفح ثم أكد الإضافة.',
        ],
        note: 'إذا لم يظهر خيار التثبيت، فالمتصفح لم يعلن إتاحة التثبيت الآن؛ لن نعرض الموقع على أنه مثبت.',
      };
    }

    return {
      title: 'أكمل التثبيت من متصفح يدعم PWA',
      steps: [
        'افتح الموقع في Chrome أو Edge على Android.',
        'من قائمة ⋮ اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»، ثم أكد الإضافة.',
      ],
      note: 'المتصفح الحالي لم يوفّر نافذة تثبيت أصلية لهذا الموقع.',
    };
  }

  if (browser === 'chrome') {
    return {
      title: 'ثبّت العيادات على الكمبيوتر',
      steps: [
        'في Chrome استخدم أيقونة التثبيت بجوار شريط العنوان، أو افتح قائمة ⋮.',
        'اختر «تثبيت التطبيق» أو «تثبيت العيادات»، ثم أكد الطلب.',
      ],
      note: 'إذا لم يظهر خيار التثبيت، لم يعلن المتصفح إتاحته الآن؛ يمكنك المحاولة لاحقًا.',
    };
  }

  if (browser === 'edge') {
    return {
      title: 'ثبّت العيادات على الكمبيوتر',
      steps: [
        'في Edge افتح قائمة «الإعدادات والمزيد» (⋯).',
        'اختر «التطبيقات» ثم «تثبيت هذا الموقع كتطبيق»، وبعدها أكد الطلب.',
      ],
      note: 'إذا لم يظهر خيار التثبيت، لم يعلن المتصفح إتاحته الآن؛ يمكنك المحاولة لاحقًا.',
    };
  }

  if (browser === 'safari') {
    return {
      title: 'أضف العيادات إلى Dock على Mac',
      steps: [
        'في Safari على macOS Sonoma أو أحدث افتح قائمة «ملف».',
        'اختر «إضافة إلى Dock» وأكد الإضافة.',
      ],
      note: 'إذا لم يتوفر «إضافة إلى Dock» في إصدار macOS لديك، استخدم إشارة مرجعية أو افتح الموقع في Chrome أو Edge للتثبيت.',
    };
  }

  if (browser === 'firefox') {
    return {
      title: 'استخدم متصفحًا يدعم تثبيت الموقع كتطبيق',
      steps: [
        'Firefox لا يوفّر لهذا الموقع نافذة تثبيت PWA أصلية.',
        'افتح الموقع في Chrome أو Edge، ثم استخدم خيار «تثبيت التطبيق» من قائمة المتصفح.',
      ],
      note: 'يمكنك حفظ الموقع في الإشارات المرجعية في Firefox للوصول السريع.',
    };
  }

  return {
    title: 'طريقة الإضافة على الكمبيوتر',
    steps: [
      'هذا المتصفح لم يوفّر نافذة تثبيت أصلية للموقع.',
      'للتثبيت كتطبيق، افتح الموقع في Chrome أو Edge واستخدم خيار «تثبيت التطبيق» من قائمة المتصفح.',
    ],
    note: 'لا نعرض الموقع على أنه مثبت ما لم يؤكد المتصفح ذلك.',
  };
}

export function readPwaInstalledHint(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PWA_INSTALLED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePwaInstalledHint(installed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (installed) {
      window.localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(PWA_INSTALLED_STORAGE_KEY);
    }
  } catch {
    // The in-memory and standalone checks still work when storage is unavailable.
  }
  window.dispatchEvent(new Event(PWA_INSTALL_STATE_EVENT));
}
