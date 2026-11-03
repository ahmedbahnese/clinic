import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-cairo',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://bsch-clinics.gov.eg'),
  title: 'BSCH Clinics — العيادات الخارجية لمستشفى الأطفال التخصصي بالبحيرة',
  description: 'منصة حجز المواعيد والاستعلام للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة — احجز موعدك بالاسم ورقم الهاتف فقط وتابع حالة حجزك وتعليمات الحضور.',
  icons: {
    icon: [
      { url: '/logo-main.png', type: 'image/png' },
      { url: '/icon.png', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    shortcut: '/logo-main.png',
    apple: '/logo-main.png',
  },
  openGraph: {
    title: 'BSCH Clinics — العيادات الخارجية لمستشفى الأطفال التخصصي بالبحيرة',
    description: 'منصة حجز المواعيد والاستعلام للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة — احجز موعدك بالاسم ورقم الهاتف فقط وتابع حالة حجزك وتعليمات الحضور.',
    images: [{ url: '/logo-main.png', width: 800, height: 800, alt: 'شعار مستشفى الأطفال التخصصي بالبحيرة' }],
    type: 'website',
    locale: 'ar_EG',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BSCH Clinics — العيادات الخارجية لمستشفى الأطفال التخصصي بالبحيرة',
    description: 'منصة حجز المواعيد والاستعلام للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة — احجز موعدك بالاسم ورقم الهاتف فقط وتابع حالة حجزك وتعليمات الحضور.',
    images: ['/logo-main.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#087F78',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className={`${cairo.className} antialiased min-h-screen bg-[#F6F9FB] text-[#163C3A]`}>
        {children}
      </body>
    </html>
  );
}
