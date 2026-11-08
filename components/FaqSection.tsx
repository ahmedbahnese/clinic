'use client';

import React, { useState } from 'react';
import { ChevronDown, HelpCircle, Sparkles } from 'lucide-react';
import type { HomepageSection, FaqSectionContent } from '@/types/cms';

interface FaqSectionProps {
  section?: HomepageSection;
}

interface FaqItem {
  question: string;
  answer: string;
  category?: string;
}

const DEFAULT_FAQ_ITEMS: FaqItem[] = [
  {
    question: 'هل أحتاج لإنشاء حساب أو إدخال كلمة مرور لحجز موعد لطفلي؟',
    answer:
      'لا، إطلاقاً. حرصاً على التيسير وسرعة الخدمة لأولياء الأمور، لا يتطلب النظام إنشاء أي حساب أو كلمة مرور. يمكنك حجز الموعد مباشرة بإدخال اسم الطفل ورقم هاتف ولي الأمر لاختيار العيادة والموعد المناسب في أقل من دقيقة.',
    category: 'إجراءات الحجز',
  },
  {
    question: 'ما هي الخطوات الواجب اتباعها عند الوصول إلى المستشفى في يوم الموعد؟',
    answer:
      'يرجى الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى بالدور الأرضي بمبنى العيادات الخارجية، مع إبراز رقم الهاتف المسجل أو الرقم المرجعي لتأكيد الحضور واستلام تذكرة الدخول للعيادة وتنسيق النداء الآلي.',
    category: 'يوم الكشف',
  },
  {
    question: 'هل يمكنني إلغاء الموعد إذا طرأ ظرف حال دون الحضور؟',
    answer:
      'نعم، يمكنك إلغاء الموعد بكل سهولة في أي وقت عبر الدخول إلى صفحة "متابعة حجز" وإدخال الرقم المرجعي ورقم الهاتف المسجل، ثم الضغط على زر "إلغاء الموعد". نرجو المبادرة بالإلغاء لإتاحة الفرصة لطفل آخر في قائمة الانتظار.',
    category: 'التعديل والإلغاء',
  },
  {
    question: 'ما هي المستندات والتحاليل الواجب إحضارها عند الكشف بالعيادة؟',
    answer:
      'يرجى إحضار أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي، بالإضافة إلى أي تقارير طبية، فحوصات، تحاليل، رسم قلب، أو أشعات سابقة تتعلق بالحالة، مع تدوين قائمة الأدوية التي يتناولها الطفل بانتظام لمناظرتها مع الاستشاري المعالج.',
    category: 'المستندات والفحوصات',
  },
  {
    question: 'كيف يتم تنظيم الحضور واستقبال الأطفال في العيادات الخارجية؟',
    answer:
      'يتم استقبال الأطفال المسجلين مسبقاً عبر المنصة وتنظيم الدخول بنظام تذاكر الدور وأسبقية الحضور اليومي، وفق جدول تشغيل العيادات التخصصية المعتمد بالمستشفى.',
    category: 'المواعيد والتنظيم',
  },
];

export function FaqSection({ section }: FaqSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0); // Open first by default

  if (section && section.is_visible === false) {
    return null;
  }

  const content = (section?.content || {}) as Partial<FaqSectionContent>;

  const title = section?.title || 'إجابات واضحة لاستفساراتكم';
  const subtitle =
    section?.subtitle ||
    'جمعنا لكم أبرز الأسئلة الشائعة حول منظومة الحجز الإلكتروني، تعليمات الحضور، والخدمات الطبية بمستشفى الأطفال التخصصي بالبحيرة.';

  const items: FaqItem[] =
    content.items && content.items.length > 0
      ? content.items
          .filter((it) => it.is_active !== false)
          .map((it) => ({
            question: it.q || it.question || 'سؤال شائع',
            answer: it.a || it.answer || 'إجابة واضحة ومبسطة',
            category: it.category || 'استفسارات عامة',
          }))
      : DEFAULT_FAQ_ITEMS;

  const toggleAccordion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section
      dir="rtl"
      aria-label="الأسئلة الشائعة"
      className="bg-white border border-[#E2E8EE] rounded-[24px] p-6 sm:p-8 md:p-10 my-8 sm:my-12 shadow-xs"
    >
      {/* Header */}
      <div className="text-right mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[#087F78] text-xs font-bold mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>الأسئلة الشائعة</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#124E4A] tracking-tight">
          {title}
        </h2>
        <p className="text-xs sm:text-sm text-[#5A6B82] mt-1 max-w-2xl leading-relaxed">
          {subtitle}
        </p>
      </div>

      {/* Accordion Container */}
      <div className="space-y-3" role="region" aria-label="قائمة الأسئلة الشائعة">
        {items.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={index}
              className={`rounded-2xl border transition-all duration-200 ease-out overflow-hidden ${
                isOpen
                  ? 'border-[#087F78] bg-[#F6F9FB]/90 shadow-2xs'
                  : 'border-[#E2E8EE] bg-white hover:border-[#79C7C1]'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleAccordion(index)}
                aria-expanded={isOpen}
                aria-controls={`faq-answer-${index}`}
                id={`faq-question-${index}`}
                className="w-full min-h-[52px] px-5 py-4 flex items-center justify-between gap-4 text-right cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#087F78] focus-visible:ring-offset-2"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                      isOpen
                        ? 'bg-[#087F78] text-white shadow-2xs'
                        : 'bg-emerald-50 text-[#087F78] border border-emerald-100'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="font-bold text-sm sm:text-base text-[#163C3A] leading-snug">
                    {item.question}
                  </span>
                </div>

                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform duration-200 ${
                    isOpen
                      ? 'rotate-180 bg-[#087F78]/10 text-[#087F78]'
                      : 'bg-slate-100 text-[#5A6B82]'
                  }`}
                >
                  <ChevronDown className="w-4 h-4 stroke-[2.2]" />
                </div>
              </button>

              {isOpen && (
                <div
                  id={`faq-answer-${index}`}
                  role="region"
                  aria-labelledby={`faq-question-${index}`}
                  className="px-5 pb-5 pt-1 text-xs sm:text-sm text-[#5A6B82] leading-relaxed border-t border-slate-100/80 mr-10"
                >
                  {item.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
