import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const hospitalName = "مستشفى الأطفال التخصصي بالبحيرة";
const systemName = "العيادات الخارجية";

export const metadata: Metadata = {
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
      <body>{children}</body>
    </html>
  );
}
