import type { Metadata } from "next";
export const metadata: Metadata = { title: "حجز موعد", description: "احجز موعدًا للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة.", alternates: { canonical: "/booking" }, openGraph: { title: "حجز موعد | BSCH Clinics", description: "احجز موعدًا للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة.", url: "/booking", images: ["/images/hospital-logo.png"] } };
export default function BookingLayout({ children }: { children: React.ReactNode }) { return children; }
