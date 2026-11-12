import React from 'react';
import { Calendar, ShieldCheck, UserCheck } from 'lucide-react';
import type { HomepageSection, HowItWorksSectionContent } from '@/types/cms';

interface HowItWorksProps {
  section?: HomepageSection;
}

export function HowItWorks({ section }: HowItWorksProps) {
  if (section && section.is_visible === false) {
    return null;
  }

  const content = (section?.content || {}) as Partial<HowItWorksSectionContent>;

  const title = section?.title || 'كيف يعمل النظام؟';
  const subtitle =
    section?.subtitle ||
    'خطوات بسيطة وواضحة لتنظيم زيارة طفلك للعيادات الخارجية بكل سهولة';

  const defaultSteps = [
    {
      num: '١. احجز',
      title: 'احجز موعدك',
      desc: 'اختر العيادة واليوم والموعد المناسب — يصل طلبك لموظف الحجز للمراجعة والتأكيد.',
      icon: Calendar,
      color: '#087F78',
      bgColor: '#E6F4F2',
    },
    {
      num: '٢. تأكيد الحجز',
      title: 'تأكيد الحجز',
      desc: 'عند التأكيد يصبح حجزك مؤكدًا، وتظهر لك تعليمات الحضور والأوراق المطلوبة مع إمكانية طباعة الإيصال.',
      icon: ShieldCheck,
      color: '#087F78',
      bgColor: '#E6F4F2',
    },
    {
      num: '٣. الحضور والكشف',
      title: 'الحضور والكشف بالعيادة',
      desc: 'حضور المريض في الموعد المحدد وتنظيم الكشف بالعيادة، مع إمكانية التحويل بين العيادات بنفس حجزك.',
      icon: UserCheck,
      color: '#087F78',
      bgColor: '#E6F4F2',
    },
  ];

  const steps = content.steps && content.steps.length > 0
    ? content.steps.map((st, idx) => ({
        num: st.num || `٠${idx + 1}`,
        title: st.title,
        desc: st.desc,
        icon: idx === 0 ? Calendar : idx === 1 ? ShieldCheck : UserCheck,
        color: '#087F78',
        bgColor: '#E6F4F2',
      }))
    : defaultSteps;

  return (
    <section className="bg-white border border-[#E2E8EE]/80 rounded-[22px] p-6 sm:p-8 my-6 sm:my-8 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
      <div className="text-right mb-6">
        <h3 className="text-xl sm:text-2xl font-bold text-[#124E4A]">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-[#5A6B82] mt-1 leading-relaxed">
          {subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div
              key={idx}
              className="flex items-start gap-4 p-4 rounded-xl bg-[#F6F9FB]/80 border border-[#E2E8EE]/80 hover:border-[#79C7C1] hover:shadow-xs transition-all duration-200"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-2xs"
                style={{ backgroundColor: step.bgColor, color: step.color }}
              >
                <Icon className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="space-y-1.5 text-right">
                <span className="inline-block text-xs font-bold text-[#087F78] bg-[#E6F4F2] px-2.5 py-0.5 rounded-full">
                  {step.num}
                </span>
                <p className="text-xs sm:text-sm text-[#163C3A] leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
