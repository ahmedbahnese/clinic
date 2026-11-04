import type { Metadata } from "next";
export const metadata: Metadata = { title: "متابعة الحجوزات", description: "تابع حجوزات اليوم والأيام القادمة واعرض إيصال الحجز.", alternates: { canonical: "/track" }, openGraph: { title: "متابعة الحجوزات | BSCH Clinics", description: "تابع حجوزات اليوم والأيام القادمة واعرض إيصال الحجز.", url: "/track", images: ["/images/hospital-logo.png"] } };
export default function TrackLayout({ children }: { children: React.ReactNode }) { return children; }
