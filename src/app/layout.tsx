import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AppExperience from "@/components/AppExperience";

const hospitalName = "مستشفى الأطفال التخصصي بالبحيرة";
const systemName = "العيادات الخارجية";

export const metadata: Metadata = {
  metadataBase: new URL("https://clinic-six-wheat.vercel.app"),
  title: {
    default: `${systemName} | BSCH Clinics`,
    template: `%s | ${systemName}`,
  },
  description: `${systemName} — بوابة الحجز والمتابعة التابعة لـ${hospitalName}.`,
  applicationName: "BSCH Clinics",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/images/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/images/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/images/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "ar_EG", url: "https://clinic-six-wheat.vercel.app/", siteName: "BSCH Clinics", title: `${systemName} | BSCH Clinics`, description: `${systemName} — بوابة الحجز والمتابعة التابعة لـ${hospitalName}.`, images: [{ url: "/images/hospital-logo.png", width: 512, height: 512, alt: "شعار مستشفى الأطفال التخصصي بالبحيرة" }] },
  twitter: { card: "summary_large_image", title: `${systemName} | BSCH Clinics`, description: `${systemName} — بوابة الحجز والمتابعة التابعة لـ${hospitalName}.`, images: ["/images/hospital-logo.png"] },
  robots: { index: true, follow: true },
  appleWebApp: {
    capable: true,
    title: "BSCH Clinics",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f948b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body><AppExperience>{children}</AppExperience></body>
    </html>
  );
}
