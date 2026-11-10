export const DEFAULT_PWA_NAME = 'عيادات مستشفى الأطفال التخصصي';
export const DEFAULT_PWA_SHORT_NAME = 'عيادات الأطفال';

export function getPwaName(siteName?: string | null): string {
  const normalized = siteName?.trim();
  if (!normalized || normalized.toLowerCase() === 'bsch clinics') {
    return DEFAULT_PWA_NAME;
  }
  return normalized.slice(0, 80);
}

export function getPwaIconUrl(iconUrl?: string | null): string {
  const candidate = iconUrl?.trim();
  if (!candidate || candidate.startsWith('//')) return '/pwa/icon-512.png';
  if (candidate.startsWith('/')) return candidate;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString() : '/pwa/icon-512.png';
  } catch {
    return '/pwa/icon-512.png';
  }
}
