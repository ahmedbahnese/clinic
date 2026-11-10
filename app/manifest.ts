import type { MetadataRoute } from 'next';
import { cmsService } from '@/services/cmsService';
import { getPwaIconUrl, getPwaName, DEFAULT_PWA_SHORT_NAME } from '@/lib/appIdentity';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = getPwaName();
  let cmsIcon = '/pwa/icon-512.png';

  try {
    const { settings } = await cmsService.getPublishedContent();
    name = getPwaName(settings.site_name);
    cmsIcon = getPwaIconUrl(settings.favicon_url);
  } catch {
    // Keep the public install manifest available even if the CMS/database is unavailable.
  }

  return {
    id: '/',
    name,
    short_name: name || DEFAULT_PWA_SHORT_NAME,
    description: 'حجز ومتابعة العيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة.',
    lang: 'ar-EG',
    dir: 'rtl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait-primary',
    background_color: '#F6F9FB',
    theme_color: '#087F78',
    icons: [
      { src: cmsIcon, sizes: 'any', purpose: 'any' },
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
