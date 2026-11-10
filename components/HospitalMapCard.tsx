import { ExternalLink, MapPin } from 'lucide-react';

const HOSPITAL_ADDRESS = 'مستشفى الأطفال التخصصي، أبو حمص، دمسنا، محافظة البحيرة، مصر';
const mapSearch = encodeURIComponent(HOSPITAL_ADDRESS);
const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearch}`;
const embedUrl = `https://www.google.com/maps?q=${mapSearch}&output=embed`;

export function HospitalMapCard() {
  return (
    <section className="my-8 overflow-hidden rounded-3xl border border-[#D8E8E6] bg-white shadow-sm" aria-labelledby="hospital-map-title" dir="rtl">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#087F78]/10 text-[#087F78]">
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <h2 id="hospital-map-title" className="text-lg font-extrabold text-[#163C3A]">موقع المستشفى</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">أبو حمص – دمسنا – محافظة البحيرة</p>
          </div>
        </div>
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#087F78] px-5 text-sm font-bold text-white transition hover:bg-[#066560]">
          <span>الاتجاهات عبر Google Maps</span>
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <iframe
        title="خريطة مستشفى الأطفال التخصصي في دمسنا، البحيرة"
        src={embedUrl}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-64 w-full border-0 sm:h-80"
        allowFullScreen
      />
    </section>
  );
}
