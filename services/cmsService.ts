import { createClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  isSupabaseConfigured,
  isSupabaseAdminConfigured,
  isMockStoreAllowed,
} from '../lib/supabase/admin.ts';
import type { StaffUser } from '../types/index.ts';
import type {
  WebsiteSettings,
  HomepageSection,
  NavigationItem,
  ClinicPresentation,
  CmsFullPayload,
  MediaAsset,
} from '../types/cms.ts';

async function safeRevalidatePath(pathStr: string) {
  try {
    const nextCache = await import('next/cache');
    if (typeof nextCache.revalidatePath === 'function') {
      nextCache.revalidatePath(pathStr);
    }
  } catch {
    // Revalidation outside active Next.js server context is safely ignored
  }
}

export const DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  id: 'default',
  site_name: 'BSCH Clinics',
  site_tagline: 'مستشفى الأطفال التخصصي بالبحيرة',
  header_logo_url: '/logo-main.png',
  footer_logo_url: '/logo-main.png',
  favicon_url: '/logo-main.png',
  contact_phone: '',
  emergency_hotline: '',
  contact_email: '',
  hospital_address: 'أبو حمص – دمسنا – محافظة البحيرة',
  working_hours: '',
  meta_title: 'BSCH Clinics — العيادات الخارجية لمستشفى الأطفال التخصصي بالبحيرة',
  meta_description:
    'منصة حجز المواعيد والاستعلام للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة — احجز موعدك بالاسم ورقم الهاتف فقط وتابع حالة حجزك وتعليمات الحضور.',
  og_image_url: '/logo-main.png',
  canonical_url: 'https://albahira.elyoser.cloud',
  hospital_website_url: 'https://albahira.elyoser.cloud',
  social_links: [
    { platform: 'facebook', label: 'فيسبوك المستشفى', url: 'https://facebook.com', is_active: false },
    { platform: 'mohp', label: 'بوابة وزارة الصحة', url: 'https://mohp.gov.eg', is_active: false },
    { platform: 'youtube', label: 'قناة التوعية الصحية', url: 'https://youtube.com', is_active: false },
  ],
  notice_bar: {
    is_enabled: true,
    title: 'تنظيم العيادات الخارجية:',
    message: 'الحجز الإلكتروني متاح بنظام تذاكر الدور وأسبقية الحضور اليومي بالعيادات التخصصية.',
    hotline_label: 'مستشفى الأطفال التخصصي — دمسنا',
  },
  footer_summary:
    'خدمة حكومية متخصصة لتقديم الرعاية الطبية الفائقة لأطفال محافظة البحيرة، من خلال نخبة من أطباء واستشاريي الأطفال في شتى التخصصات الدقيقة.',
  footer_copyright: 'مستشفى الأطفال التخصصي بالبحيرة. جميع الحقوق محفوظة.',
  footer_status_badge: 'نظام إدارة العيادات الخارجية الموحد — متاح ويعمل بكفاءة 🟢',
  is_published: true,
};

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSection[] = [
  {
    id: 'hero',
    display_order: 1,
    is_visible: true,
    title: 'العيادات الخارجية',
    subtitle: 'مستشفى الأطفال التخصصي بالبحيرة',
    badge_text: 'الحجز الإلكتروني متاح الآن لجميع عيادات الأسبوع',
    content: {
      description:
        'منظومة حجز رقمية متكاملة لتقديم رعاية طبية فائقة لأطفال محافظة البحيرة. احجز موعدك بالاسم ورقم الهاتف بدون تسجيل حساب، وتجنب طوابير الانتظار.',
      primary_cta_label: 'احجز موعدك الآن',
      primary_cta_url: '/appointments/new',
      primary_cta_visible: true,
      secondary_cta_label: 'متابعة حجز قائم',
      secondary_cta_url: '/appointments/track',
      secondary_cta_visible: true,
      feature_card_title: 'مميزات الحجز الإلكتروني',
      feature_card_badge: 'خدمة معتمدة',
      feature_card_bullets: [
        { icon: 'Clock', title: 'زمن الحجز: دقيقة واحدة', desc: 'خطوات مبسطة وسلسة تناسب كافة الهواتف الذكية.' },
        { icon: 'Smartphone', title: 'المتطلبات: الاسم ورقم الهاتف فقط', desc: 'بدون الحاجة لإنشاء حساب أو تذكر كلمات مرور معقدة.' },
        { icon: 'Ticket', title: 'إيصال فوري برقم الدور', desc: 'تحديد موعد وتوقيت الحضور مع إمكانية طباعة الإيصال وحفظه.' },
      ],
      feature_card_footer: 'مستشفى الأطفال التخصصي — أبو حمص – دمسنا – محافظة البحيرة',
    },
  },
  {
    id: 'trust_stats',
    display_order: 2,
    is_visible: true,
    title: 'مؤشرات وإحصائيات المستشفى',
    subtitle: 'أرقام موثقة تعكس حجم الخدمة الطبية المتطورة',
    content: {
      items: [
        { value: '٨ عيادات', label: 'عيادات تخصصية دقيقة', desc: 'قلب، أعصاب، أسنان، جراحة، وغيرها', icon: 'Stethoscope', accent_color: '#087F78', bg_color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { value: '١٠٠٪ رقمي', label: 'حجز إلكتروني منظم', desc: 'بدون طوابير شباك وبأرقام دور متتابعة', icon: 'CalendarCheck2', accent_color: '#0D5F5A', bg_color: 'bg-teal-50 text-teal-700 border-teal-100' },
        { value: 'نخبة طبية', label: 'أطباء واستشاريون', desc: 'كوادر مؤهلة في طب وجراحة الأطفال', icon: 'Award', accent_color: '#0284C7', bg_color: 'bg-sky-50 text-sky-700 border-sky-100' },
        { value: 'رعاية فائقة', label: 'أحدث التجهيزات الطبية', desc: 'عيادات تخصصية متكاملة لخدمة أطفال البحيرة', icon: 'ShieldCheck', accent_color: '#087F78', bg_color: 'bg-emerald-50/70 text-emerald-800 border-emerald-200/60' },
      ],
    },
  },
  {
    id: 'primary_actions',
    display_order: 3,
    is_visible: true,
    title: 'الإجراءات الرئيسية',
    subtitle: 'اختر مسارك السريع للوصول إلى الخدمة',
    content: {
      card1_title: 'حجز موعد جديد',
      card1_desc: 'بدون تسجيل حساب – الاسم ورقم الهاتف فقط لاختيار العيادة والموعد المناسب.',
      card1_btn: 'ابدأ الحجز الآن',
      card1_url: '/appointments/new',
      card2_title: 'متابعة حجزي',
      card2_desc: 'معرفة حالة الحجز، تأكيد الموعد، ورقم الدور وتعليمات الحضور برقم هاتفك.',
      card2_btn: 'استعلم عن حجزك',
      card2_url: '/appointments/track',
    },
  },
  {
    id: 'clinics',
    display_order: 4,
    is_visible: true,
    title: 'دليل العيادات التخصصية المتاحة',
    subtitle: 'استعرض التخصصات الدقيقة بمستشفى الأطفال التخصصي بالبحيرة واحجز موعد طفلك مباشرة في العيادة المناسبة.',
    badge_text: 'العيادات الخارجية التخصصية',
    content: {
      link_text: 'عرض جدول كافة العيادات',
      link_url: '/appointments/new',
    },
  },
  {
    id: 'how_it_works',
    display_order: 5,
    is_visible: true,
    title: 'كيف يعمل النظام؟',
    subtitle: 'خطوات بسيطة وواضحة لتنظيم زيارة طفلك للعيادات الخارجية بكل سهولة',
    content: {
      steps: [
        { num: '١. احجز', title: 'احجز موعدك', desc: 'اختر العيادة واليوم والموعد المناسب — يصل طلبك لموظف الحجز للمراجعة والتأكيد.', icon: 'Calendar' },
        { num: '٢. تأكيد الحجز', title: 'تأكيد الحجز', desc: 'عند التأكيد يصبح حجزك مؤكدًا، وتظهر لك تعليمات الحضور والأوراق المطلوبة مع إمكانية طباعة الإيصال.', icon: 'ShieldCheck' },
        { num: '٣. الحضور والكشف', title: 'الحضور والكشف بالعيادة', desc: 'حضور المريض في الموعد المحدد وتنظيم الكشف بالعيادة، مع إمكانية التحويل بين العيادات بنفس حجزك.', icon: 'UserCheck' },
      ],
    },
  },
  {
    id: 'hospital_banner',
    display_order: 6,
    is_visible: true,
    title: 'مستشفى الأطفال التخصصي بالبحيرة',
    subtitle: 'زر موقع المستشفى الرسمي لمعرفة المزيد عن الخدمات والأقسام الطبية',
    content: {
      btn_label: 'زيارة الموقع',
      btn_url: 'https://albahira.elyoser.cloud',
      icon: 'Clock',
    },
  },
  {
    id: 'patient_guidelines',
    display_order: 7,
    is_visible: true,
    title: 'تعليمات هامة لأولياء الأمور',
    subtitle: 'كل ما يهمك معرفته لضمان كشف ميسر وتجربة علاجية متكاملة لطفلك',
    content: {
      cards: [
        {
          title: 'ما يجب إحضاره عند الحضور',
          icon: 'FileText',
          color: '#087F78',
          items: [
            'شهادة ميلاد الطفل أو بطاقة التأمين الصحي (إن وجدت)',
            'أي تقارير طبية، فحوصات، تحاليل، أو أشعات سابقة تخص الحالة',
            'كتابة اسم الأدوية التي يتناولها الطفل بانتظام',
          ],
        },
        {
          title: 'إرشادات وتنظيم الحضور',
          icon: 'AlertCircle',
          color: '#D97706',
          items: [
            'الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى لإنهاء إجراءات التأكيد',
            'يُسمح بمرافق واحد فقط مع الطفل لتجنب الزحام وحرصاً على سلامة الأطفال',
            'في حال التعذر عن الحضور يرجى إلغاء الموعد لإتاحة الفرصة لطفل آخر',
          ],
        },
        {
          title: 'التواصل والاستفسارات',
          icon: 'PhoneCall',
          color: '#2563EB',
          items: [
            'مقر المستشفى: أبو حمص – دمسنا – محافظة البحيرة',
            'تنظيم الدخول: بأسبقية الحضور وتذاكر الانتظار اليومية',
            'الاستعلام وتأكيد الحجز إلكترونياً بالاسم ورقم الهاتف فقط',
          ],
        },
      ],
    },
  },
  {
    id: 'faq',
    display_order: 8,
    is_visible: true,
    title: 'الأسئلة الشائعة لأولياء الأمور',
    subtitle: 'إجابات واضحة ومباشرة عن كافة الاستفسارات المتعلقة بنظام الحجز الإلكتروني ومواعيد الزيارة.',
    badge_text: 'مركز المساعدة والإرشادات',
    content: {
      items: [
        {
          question: 'هل أحتاج لإنشاء حساب أو إدخال كلمة مرور لحجز موعد لطفلي؟',
          answer: 'لا، إطلاقاً. حرصاً على التيسير وسرعة الخدمة لأولياء الأمور، لا يتطلب النظام إنشاء أي حساب أو كلمة مرور. يمكنك حجز الموعد مباشرة بإدخال اسم الطفل ورقم هاتف ولي الأمر لاختيار العيادة والموعد المناسب في أقل من دقيقة.',
          category: 'إجراءات الحجز',
        },
        {
          question: 'ما هي الخطوات الواجب اتباعها عند الوصول إلى المستشفى في يوم الموعد؟',
          answer: 'يرجى الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى بالدور الأرضي بمبنى العيادات الخارجية، مع إبراز رقم الهاتف المسجل أو الرقم المرجعي لتأكيد الحضور واستلام تذكرة الدخول للعيادة وتنسيق النداء الآلي.',
          category: 'يوم الكشف',
        },
        {
          question: 'هل يمكنني إلغاء الموعد إذا طرأ ظرف حال دون الحضور؟',
          answer: 'نعم، يمكنك إلغاء الموعد بكل سهولة في أي وقت عبر الدخول إلى صفحة "متابعة حجز" وإدخال رقم الهاتف المسجل، ثم الضغط على زر "إلغاء الموعد". نرجو المبادرة بالإلغاء لإتاحة الفرصة لطفل آخر في قائمة الانتظار.',
          category: 'التعديل والإلغاء',
        },
        {
          question: 'ما هي المستندات والتحاليل الواجب إحضارها عند الكشف بالعيادة؟',
          answer: 'يرجى إحضار أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي، بالإضافة إلى أي تقارير طبية، فحوصات، تحاليل، رسم قلب، أو أشعات سابقة تتعلق بالحالة، مع تدوين قائمة الأدوية التي يتناولها الطفل بانتظام لمناظرتها مع الاستشاري المعالج.',
          category: 'المستندات والفحوصات',
        },
        {
          question: 'كيف يتم تنظيم الحضور واستقبال الأطفال في العيادات الخارجية؟',
          answer: 'يتم استقبال الأطفال المسجلين مسبقاً عبر المنصة وتنظيم الدخول بنظام تذاكر الدور وأسبقية الحضور اليومي، وفق جدول تشغيل العيادات التخصصية المعتمد بالمستشفى.',
          category: 'المواعيد والتنظيم',
        },
      ],
    },
  },
];

export const DEFAULT_NAV_ITEMS: NavigationItem[] = [
  { id: '5056fe62-61f8-437e-b098-a2f8db156b07', label: 'الرئيسية', href: '/', display_order: 1, is_visible: true, is_external: false, location: 'HEADER', icon_name: 'Home' },
  { id: '7dd7b699-eddf-4a5b-adea-2b22a570d7da', label: 'حجز موعد', href: '/appointments/new', display_order: 2, is_visible: true, is_external: false, location: 'HEADER', icon_name: 'CalendarPlus' },
  { id: '1a727c19-bdc3-4f26-9c0f-c299c58b89d7', label: 'متابعة حجز', href: '/appointments/track', display_order: 3, is_visible: true, is_external: false, location: 'HEADER', icon_name: 'Search' },
];

export const DEFAULT_CLINICS_PRESENTATION: ClinicPresentation[] = [
  { id: 'cardio', name: 'عيادة قلب الأطفال', english_title: 'Pediatric Cardiology', description: 'تشخيص ومتابعة عيوب القلب الخلقية، أمراض الصمامات، واضطراب نبض القلب.', location: 'الدور الرابع - عيادة 1', working_hours: '08:30-14:00', display_order: 1, is_featured_on_homepage: true, accent_color: '#DC2626', icon_name: 'HeartPulse', is_hospital_confirmed: false, is_active: true },
  { id: 'echo', name: 'عيادة الإيكو والموجات الصوتية', english_title: 'Echocardiography Unit', description: 'فحص السونار والإيكو الدقيق على القلب لحديثي الولادة والأطفال.', location: 'أمام عيادة القلب - الدور الرابع', working_hours: '08:30-14:00', display_order: 2, is_featured_on_homepage: true, accent_color: '#0284C7', icon_name: 'Activity', is_hospital_confirmed: false, is_active: true },
  { id: 'dentistry', name: 'عيادة طب أسنان الأطفال', english_title: 'Pediatric Dentistry', description: 'فحص وعلاج تسوس الأسنان، الحشو الوقائي، علاج العصب، وتقويم الأسنان المبكر.', location: 'الدور الأرضي - عيادة 1', working_hours: '08:30-14:00', display_order: 3, is_featured_on_homepage: true, accent_color: '#0D9488', icon_name: 'Smile', is_hospital_confirmed: false, is_active: true },
  { id: 'neuro', name: 'عيادة النفسية والعصبية', english_title: 'Pediatric Neurology', description: 'متابعة نوبات الصرع والتشنجات، تأخر التطور الحركي، وفرط الحركة وتشتت الانتباه.', location: 'الدور الرابع - عيادة 2', working_hours: '08:30-14:00', display_order: 4, is_featured_on_homepage: true, accent_color: '#7C3AED', icon_name: 'Brain', is_hospital_confirmed: false, is_active: true },
  { id: 'gi', name: 'عيادة الجهاز الهضمي', english_title: 'Gastroenterology & Hepatology', description: 'علاج حساسية القمح، الارتجاع المريئي، اضطرابات الهضم والتهابات المعدة والأمعاء.', location: 'الدور الثاني - عيادة 6', working_hours: '08:30-14:00', display_order: 5, is_featured_on_homepage: true, accent_color: '#D97706', icon_name: 'Pill', is_hospital_confirmed: false, is_active: true },
  { id: 'nutrition', name: 'عيادة التغذية ومتابعة النمو', english_title: 'Clinical Nutrition', description: 'تقييم ومتابعة منحنيات النمو، علاج سوء التغذية، وحساسية وبروتينات اللبن.', location: 'الدور الثالث - عيادة 3', working_hours: '08:30-14:00', display_order: 6, is_featured_on_homepage: true, accent_color: '#16A34A', icon_name: 'Baby', is_hospital_confirmed: false, is_active: true },
  { id: 'audiology', name: 'عيادة السمعيات وتخطيط السمع', english_title: 'Audiology Clinic', description: 'المسح السمعي لحديثي الولادة، قياس ضغط الأذن، وتأهيل ضعف السمع وزراعة القوقعة.', location: 'الدور الأرضي - عيادة 4', working_hours: '08:30-14:00', display_order: 7, is_featured_on_homepage: true, accent_color: '#2563EB', icon_name: 'Ear', is_hospital_confirmed: false, is_active: true },
  { id: 'surgery', name: 'عيادة جراحة الأطفال', english_title: 'Pediatric Surgery', description: 'مناظرة جراحات الفتق، الخصية المعلقة، التشوهات الخلقية، وجراحات الجهاز البولي.', location: 'الدور الثاني - عيادة 2', working_hours: '08:30-14:00', display_order: 8, is_featured_on_homepage: true, accent_color: '#E11D48', icon_name: 'Scissors', is_hospital_confirmed: false, is_active: true },
];

export const PRECONFIGURED_MEDIA_ASSETS: MediaAsset[] = [
  { id: 'asset-1', name: 'شعار العيادات الخارجية', url: '/logo-outpatient.png', mime_type: 'image/png', is_custom: false },
  { id: 'asset-2', name: 'شعار المستشفى الرئيسي', url: '/logo-main.png', mime_type: 'image/png', is_custom: false },
  { id: 'asset-3', name: 'أيقونة المتصفح الافتراضية', url: '/favicon.ico', mime_type: 'image/x-icon', is_custom: false },
];

class CmsService {
  private settings: WebsiteSettings = { ...DEFAULT_WEBSITE_SETTINGS };
  private sections: HomepageSection[] = [...DEFAULT_HOMEPAGE_SECTIONS];
  private navigation: NavigationItem[] = [...DEFAULT_NAV_ITEMS];
  private clinicsPresentation: ClinicPresentation[] = [...DEFAULT_CLINICS_PRESENTATION];
  private customAssets: MediaAsset[] = [];

  private getSupabaseClient(userToken?: string) {
    if (userToken && userToken.trim()) {
      try {
        return createUserClient(userToken);
      } catch (e) {
        console.warn('Failed to create user client for CMS, falling back:', e);
      }
    }
    if (isSupabaseAdminConfigured()) {
      try {
        return createAdminClient();
      } catch (e) {
        console.warn('Failed to create admin client for CMS, falling back:', e);
      }
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      '';
    return createClient(url, anonKey);
  }

  public async getPublishedContent(): Promise<CmsFullPayload> {
    if (isSupabaseConfigured()) {
      try {
        const supabase: any = this.getSupabaseClient();
        const [settingsRes, sectionsRes, navRes, clinicsRes] = await Promise.all([
          supabase.from('website_settings').select('*').eq('id', 'default').single(),
          supabase.from('homepage_sections').select('*').order('display_order', { ascending: true }),
          supabase.from('navigation_items').select('*').order('display_order', { ascending: true }),
          supabase.from('clinics').select('id, name, description, location, working_hours, display_order, is_featured_on_homepage, english_title, accent_color, icon_name, is_hospital_confirmed, is_active').eq('is_active', true).order('display_order', { ascending: true }),
        ]);

        const settings = (settingsRes.data as unknown as WebsiteSettings) || this.settings;
        if (!settings.hospital_website_url) {
          settings.hospital_website_url = settings.canonical_url || 'https://albahira.elyoser.cloud';
        }
        const sections = (sectionsRes.data as unknown as HomepageSection[]) || this.sections;
        const rawNav = (navRes.data as unknown as NavigationItem[]) || this.navigation;
        const navigation = rawNav
          .map((n) => ({
            ...n,
            is_active: n.is_active ?? n.is_visible ?? true,
            is_visible: n.is_visible ?? n.is_active ?? true,
            target: n.target || (n.is_external ? '_blank' : '_self'),
          }))
          .filter((n) => n.is_visible !== false && n.is_active !== false)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        const clinics = (clinicsRes.data as unknown as ClinicPresentation[]) || this.clinicsPresentation;

        return {
          settings,
          sections: sections.filter((s) => s.is_visible),
          navigation,
          clinics: clinics.filter((c) => c.is_featured_on_homepage && c.is_active),
        };
      } catch (err) {
        console.warn('Supabase getPublishedContent fallback:', err);
      }
    }

    if (!this.settings.hospital_website_url) {
      this.settings.hospital_website_url = this.settings.canonical_url || 'https://albahira.elyoser.cloud';
    }

    return {
      settings: this.settings,
      sections: this.sections.filter((s) => s.is_visible),
      navigation: this.navigation
        .map((n) => ({
          ...n,
          is_active: n.is_active ?? n.is_visible ?? true,
          is_visible: n.is_visible ?? n.is_active ?? true,
          target: n.target || (n.is_external ? '_blank' : '_self'),
        }))
        .filter((n) => n.is_visible !== false && n.is_active !== false)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
      clinics: this.clinicsPresentation.filter((c) => c.is_featured_on_homepage && c.is_active),
    };
  }

  public async getCmsDashboardData(userToken?: string): Promise<CmsFullPayload & { assets: MediaAsset[] }> {
    let assets: MediaAsset[] = [...PRECONFIGURED_MEDIA_ASSETS, ...this.customAssets];

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = this.getSupabaseClient(userToken);
        const [settingsRes, sectionsRes, navRes, clinicsRes, mediaRes] = await Promise.all([
          supabase.from('website_settings').select('*').eq('id', 'default').single(),
          supabase.from('homepage_sections').select('*').order('display_order', { ascending: true }),
          supabase.from('navigation_items').select('*').order('display_order', { ascending: true }),
          supabase.from('clinics').select('id, name, description, location, working_hours, display_order, is_featured_on_homepage, english_title, accent_color, icon_name, is_hospital_confirmed, is_active').order('display_order', { ascending: true }),
          supabase.from('media_assets').select('*').order('created_at', { ascending: false }),
        ]);

        if (settingsRes.data) {
          this.settings = settingsRes.data as unknown as WebsiteSettings;
          if (!this.settings.hospital_website_url) {
            this.settings.hospital_website_url = this.settings.canonical_url || 'https://albahira.elyoser.cloud';
          }
        }
        if (sectionsRes.data && sectionsRes.data.length > 0) this.sections = sectionsRes.data as unknown as HomepageSection[];
        if (navRes.data && navRes.data.length > 0) {
          this.navigation = (navRes.data as unknown as NavigationItem[]).map((n) => ({
            ...n,
            is_active: n.is_active ?? n.is_visible ?? true,
            is_visible: n.is_visible ?? n.is_active ?? true,
            target: n.target || (n.is_external ? '_blank' : '_self'),
          })).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        }
        if (clinicsRes.data && clinicsRes.data.length > 0) this.clinicsPresentation = clinicsRes.data as unknown as ClinicPresentation[];
        if (mediaRes.data && mediaRes.data.length > 0) {
          assets = mediaRes.data as unknown as MediaAsset[];
        }
      } catch (err) {
        console.warn('Supabase getCmsDashboardData fallback:', err);
      }
    }

    if (!this.settings.hospital_website_url) {
      this.settings.hospital_website_url = this.settings.canonical_url || 'https://albahira.elyoser.cloud';
    }

    return {
      settings: this.settings,
      sections: this.sections,
      navigation: this.navigation.map((n) => ({
        ...n,
        is_active: n.is_active ?? n.is_visible ?? true,
        is_visible: n.is_visible ?? n.is_active ?? true,
        target: n.target || (n.is_external ? '_blank' : '_self'),
      })).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
      clinics: this.clinicsPresentation,
      assets,
    };
  }

  public async updateSettings(
    updates: Partial<WebsiteSettings>,
    user: StaffUser,
    userToken?: string
  ): Promise<{ success: boolean; settings?: WebsiteSettings; error?: string }> {
    if (user.role !== 'ADMIN') {
      return { success: false, error: 'غير مصرح بتعديل إعدادات وهوية الموقع. صلاحية مدير النظام مطلوبة.' };
    }

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = this.getSupabaseClient(userToken);
        const { data: existingDb } = await supabase
          .from('website_settings')
          .select('*')
          .eq('id', 'default')
          .maybeSingle();
        if (existingDb) {
          this.settings = { ...this.settings, ...existingDb };
        }
      } catch (fetchErr) {
        console.warn('Pre-update fetch existing settings warning:', fetchErr);
      }
    }

    const canonicalUrl = updates.canonical_url || updates.hospital_website_url || this.settings.hospital_website_url || this.settings.canonical_url || 'https://albahira.elyoser.cloud';

    const updated: WebsiteSettings = {
      ...this.settings,
      ...updates,
      canonical_url: canonicalUrl,
      hospital_website_url: canonicalUrl,
      id: 'default',
      updated_at: new Date().toISOString(),
      updated_by: user.name || user.username || 'admin',
      is_published: updates.is_published ?? this.settings.is_published ?? true,
      published_at: this.settings.published_at || new Date().toISOString(),
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = this.getSupabaseClient(userToken);
        const dbPayload = {
          id: 'default',
          site_name: updated.site_name,
          site_tagline: updated.site_tagline,
          header_logo_url: updated.header_logo_url,
          footer_logo_url: updated.footer_logo_url,
          favicon_url: updated.favicon_url,
          contact_phone: updated.contact_phone,
          emergency_hotline: updated.emergency_hotline,
          contact_email: updated.contact_email,
          hospital_address: updated.hospital_address,
          working_hours: updated.working_hours,
          meta_title: updated.meta_title,
          meta_description: updated.meta_description,
          og_image_url: updated.og_image_url,
          canonical_url: updated.canonical_url,
          social_links: updated.social_links,
          notice_bar: updated.notice_bar,
          footer_summary: updated.footer_summary,
          footer_copyright: updated.footer_copyright,
          footer_status_badge: updated.footer_status_badge,
          is_published: updated.is_published,
          published_at: updated.published_at,
          updated_at: updated.updated_at,
          updated_by: updated.updated_by,
        };

        const { error } = await supabase
          .from('website_settings')
          .upsert(dbPayload, { onConflict: 'id' });

        if (error) {
          console.error('Supabase updateSettings failed with code:', error.code, error.message);
          return {
            success: false,
            error: 'فشل في حفظ إعدادات وهوية الموقع في قاعدة البيانات المركزية. يرجى مراجعة الصلاحيات والمحاولة لاحقاً.',
          };
        }
      } catch (err: any) {
        console.error('Supabase updateSettings exception:', err?.message || 'Network error');
        return {
          success: false,
          error: 'تعذر الاتصال بقاعدة البيانات المركزية لتحديث الإعدادات. يرجى التحقق من الشبكة.',
        };
      }
    } else if (!isMockStoreAllowed()) {
      return {
        success: false,
        error: 'خدمة حفظ الإعدادات غير متصلة بقاعدة البيانات في بيئة الإنتاج.',
      };
    }

    this.settings = updated;
    await safeRevalidatePath('/');
    await safeRevalidatePath('/appointments/new');
    await safeRevalidatePath('/appointments/track');
    return { success: true, settings: this.settings };
  }

  public async updateSection(
    sectionId: string,
    updates: Partial<HomepageSection>,
    user: StaffUser,
    userToken?: string
  ): Promise<{ success: boolean; section?: HomepageSection; error?: string }> {
    if (user.role !== 'ADMIN') {
      return { success: false, error: 'غير مصرح بتعديل أقسام الصفحة الرئيسية. صلاحية مدير النظام مطلوبة.' };
    }

    const idx = this.sections.findIndex((s) => s.id === sectionId);
    if (idx === -1) {
      return { success: false, error: 'القسم المطلوب غير موجود' };
    }

    const updated: HomepageSection = {
      ...this.sections[idx],
      ...updates,
      updated_at: new Date().toISOString(),
      updated_by: user.name || user.username || 'admin',
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = this.getSupabaseClient(userToken);
        const dbPayload = {
          id: updated.id,
          display_order: updated.display_order,
          is_visible: updated.is_visible,
          title: updated.title,
          subtitle: updated.subtitle,
          badge_text: updated.badge_text,
          content: updated.content,
          updated_at: updated.updated_at,
          updated_by: updated.updated_by,
        };

        const { error } = await supabase
          .from('homepage_sections')
          .upsert(dbPayload, { onConflict: 'id' });

        if (error) {
          console.error('Supabase updateSection failed with code:', error.code, error.message);
          return {
            success: false,
            error: `فشل في حفظ قسم (${updated.title || sectionId}) في قاعدة البيانات المركزية.`,
          };
        }
      } catch (err: any) {
        console.error('Supabase updateSection exception:', err?.message || 'Network error');
        return {
          success: false,
          error: 'تعذر الاتصال بقاعدة البيانات لتحديث القسم.',
        };
      }
    } else if (!isMockStoreAllowed()) {
      return {
        success: false,
        error: 'خدمة تعديل الأقسام غير متصلة بقاعدة البيانات في بيئة الإنتاج.',
      };
    }

    this.sections[idx] = updated;
    await safeRevalidatePath('/');
    return { success: true, section: updated };
  }

  public async reorderSections(
    ordered: (string | { id: string; display_order?: number })[],
    user: StaffUser,
    userToken?: string
  ): Promise<{ success: boolean; sections?: HomepageSection[]; error?: string }> {
    if (user.role !== 'ADMIN') {
      return { success: false, error: 'صلاحية مدير النظام مطلوبة لإعادة ترتيب الأقسام.' };
    }

    ordered.forEach((item, idx) => {
      const id = typeof item === 'string' ? item : item.id;
      const sec = this.sections.find((s) => s.id === id);
      if (sec) {
        sec.display_order = typeof item === 'object' && item.display_order ? item.display_order : idx + 1;
      }
    });

    this.sections.sort((a, b) => a.display_order - b.display_order);

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = this.getSupabaseClient(userToken);
        for (const sec of this.sections) {
          const { error } = await supabase
            .from('homepage_sections')
            .update({ display_order: sec.display_order, updated_at: new Date().toISOString() })
            .eq('id', sec.id);

          if (error) {
            console.error('Supabase reorderSections failed on section:', sec.id, 'code:', error.code, error.message);
            return {
              success: false,
              error: 'فشل في تحديث ترتيب بعض الأقسام في قاعدة البيانات المركزية.',
            };
          }
        }
      } catch (err: any) {
        console.error('Supabase reorderSections exception:', err?.message || 'Network error');
        return {
          success: false,
          error: 'تعذر الاتصال بقاعدة البيانات لإعادة ترتيب الأقسام.',
        };
      }
    } else if (!isMockStoreAllowed()) {
      return {
        success: false,
        error: 'خدمة ترتيب الأقسام غير متصلة بقاعدة البيانات في بيئة الإنتاج.',
      };
    }

    await safeRevalidatePath('/');
    return { success: true, sections: this.sections };
  }

  public async updateNavigation(
    items: NavigationItem[],
    user: StaffUser,
    userToken?: string
  ): Promise<{ success: boolean; navigation?: NavigationItem[]; error?: string }> {
    if (user.role !== 'ADMIN') {
      return { success: false, error: 'صلاحية مدير النظام مطلوبة لتعديل قوائم التنقل.' };
    }

    const isUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = this.getSupabaseClient(userToken);
        const { data: existingDbItems } = await supabase.from('navigation_items').select('*');
        const existingList: any[] = existingDbItems || [];

        const sanitizedItems: NavigationItem[] = [];
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const isAct = item.is_active ?? item.is_visible ?? true;
          const isVis = item.is_visible ?? item.is_active ?? true;
          const isExt = item.is_external ?? (item.target === '_blank');
          const loc = item.location || 'HEADER';

          let matchedId: string;
          if (isUUID(item.id)) {
            matchedId = item.id;
          } else {
            const found = existingList.find((e) => e.location === loc && e.href === item.href);
            if (found && found.id) {
              matchedId = found.id;
            } else {
              matchedId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `nav-${Date.now()}-${idx}`;
            }
          }

          sanitizedItems.push({
            ...item,
            id: matchedId,
            display_order: item.display_order ?? (idx + 1),
            is_active: isAct,
            is_visible: isVis,
            is_external: isExt,
            target: item.target || (isExt ? '_blank' : '_self'),
            location: loc,
          });
        }

        // Delete items removed by the user
        const keepIds = sanitizedItems.map((i) => i.id).filter(Boolean);
        for (const oldItem of existingList) {
          if (!keepIds.includes(oldItem.id)) {
            await supabase.from('navigation_items').delete().eq('id', oldItem.id);
          }
        }

        for (const item of sanitizedItems) {
          const dbItem = {
            id: item.id,
            label: item.label,
            href: item.href,
            display_order: item.display_order,
            is_visible: item.is_visible,
            is_external: item.is_external,
            location: item.location,
            icon_name: item.icon_name || 'Globe',
            updated_at: new Date().toISOString(),
          };
          const { error } = await supabase.from('navigation_items').upsert(dbItem as any, { onConflict: 'id' });
          if (error) {
            console.error('Supabase updateNavigation failed on item:', item.id, 'code:', error.code, error.message);
            return {
              success: false,
              error: 'فشل في حفظ بعض عناصر القوائم في قاعدة البيانات المركزية.',
            };
          }
        }

        this.navigation = sanitizedItems;
      } catch (err: any) {
        console.error('Supabase updateNavigation exception:', err?.message || 'Network error');
        return {
          success: false,
          error: 'تعذر الاتصال بقاعدة البيانات لتحديث القوائم.',
        };
      }
    } else if (!isMockStoreAllowed()) {
      return {
        success: false,
        error: 'خدمة تعديل القوائم غير متصلة بقاعدة البيانات في بيئة الإنتاج.',
      };
    } else {
      this.navigation = items.map((item, idx) => ({
        ...item,
        id: isUUID(item.id) ? item.id : `nav-${Date.now()}-${idx}`,
        display_order: item.display_order ?? (idx + 1),
        is_active: item.is_active ?? item.is_visible ?? true,
        is_visible: item.is_visible ?? item.is_active ?? true,
      }));
    }

    await safeRevalidatePath('/');
    await safeRevalidatePath('/appointments/new');
    await safeRevalidatePath('/appointments/track');
    return { success: true, navigation: this.navigation };
  }

  public async updateClinicPresentation(
    clinicId: string,
    updates: Partial<ClinicPresentation>,
    user: StaffUser,
    userToken?: string
  ): Promise<{ success: boolean; clinic?: ClinicPresentation; error?: string }> {
    if (user.role !== 'ADMIN') {
      return { success: false, error: 'صلاحية مدير النظام مطلوبة لتعديل بيانات عرض العيادة.' };
    }

    const clinic = this.clinicsPresentation.find((c) => c.id === clinicId);
    if (!clinic) {
      return { success: false, error: 'العيادة المطلوبة غير موجودة' };
    }

    if (isSupabaseConfigured()) {
      try {
        const supabase: any = this.getSupabaseClient(userToken);
        const { error } = await supabase
          .from('clinics')
          .update({
            display_order: updates.display_order !== undefined ? updates.display_order : clinic.display_order,
            is_featured_on_homepage: updates.is_featured_on_homepage !== undefined ? updates.is_featured_on_homepage : clinic.is_featured_on_homepage,
            english_title: updates.english_title !== undefined ? updates.english_title : clinic.english_title,
            accent_color: updates.accent_color !== undefined ? updates.accent_color : clinic.accent_color,
            icon_name: updates.icon_name !== undefined ? updates.icon_name : clinic.icon_name,
            description: updates.description !== undefined ? updates.description : clinic.description,
            instructions: updates.instructions !== undefined ? updates.instructions : clinic.instructions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', clinicId);

        if (error) {
          console.error('Supabase updateClinicPresentation failed with code:', error.code, error.message);
          return {
            success: false,
            error: `فشل في تحديث مظهر عيادة (${clinic.name}) في قاعدة البيانات المركزية.`,
          };
        }
      } catch (err: any) {
        console.error('Supabase updateClinicPresentation exception:', err?.message || 'Network error');
        return {
          success: false,
          error: 'تعذر الاتصال بقاعدة البيانات لتحديث مظهر العيادة.',
        };
      }
    } else if (!isMockStoreAllowed()) {
      return {
        success: false,
        error: 'خدمة تعديل مظهر العيادات غير متصلة بقاعدة البيانات في بيئة الإنتاج.',
      };
    }

    // Safety constraint: apply updates to cache only after DB confirms (or in permitted mock mode)
    if (updates.display_order !== undefined) clinic.display_order = updates.display_order;
    if (updates.is_featured_on_homepage !== undefined) clinic.is_featured_on_homepage = updates.is_featured_on_homepage;
    if (updates.english_title !== undefined) clinic.english_title = updates.english_title;
    if (updates.accent_color !== undefined) clinic.accent_color = updates.accent_color;
    if (updates.icon_name !== undefined) clinic.icon_name = updates.icon_name;
    if (updates.description !== undefined) clinic.description = updates.description;
    if (updates.instructions !== undefined) clinic.instructions = updates.instructions;

    await safeRevalidatePath('/');
    return { success: true, clinic };
  }

  public registerCustomAsset(asset: MediaAsset) {
    this.customAssets.unshift(asset);
  }
}

const globalForCms = globalThis as unknown as {
  cmsServiceInstance?: CmsService;
};

export const cmsService = globalForCms.cmsServiceInstance ?? new CmsService();
if (process.env.NODE_ENV !== 'production') {
  globalForCms.cmsServiceInstance = cmsService;
}

