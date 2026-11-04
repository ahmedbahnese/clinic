import type { Clinic, ClinicService, ClinicScheduleException, Appointment, AppointmentSlot, AppointmentStatus, CreateAppointmentInput, AuditLogItem, StaffUser, CancellationRequest } from '../types/index.ts';
import { normalizeAndValidateEgyptianPhone, validatePatientName, generateReferenceNumber, canTransitionStatus, formatLocalDate, getTodayCairoDateString, validateGuardianNationalId, maskPatientName } from '../lib/rules.ts';
import { generateBookingCode, hashBookingCode } from '../lib/trackingAccess.ts';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient, createUserClient, getSystemSupabaseClient, getAuthenticatedServerClient, isSupabaseConfigured, isSupabaseAdminConfigured, isMockStoreAllowed } from '../lib/supabase/admin.ts';
import type { Database } from '../types/database.types.ts';

const isValidUuid = (id?: string | null): boolean =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Pre-defined pediatric outpatient clinics from BSCH
// Note: Marked as isHospitalConfirmed = false until verified by hospital administration
const INITIAL_CLINICS: Clinic[] = [
  {
    id: 'dentistry',
    name: 'عيادة الأسنان',
    description: 'فحص وعلاج أسنان الأطفال، حشو وقائي، علاج العصب وتقويم الأسنان المبكر',
    location: 'الدور الأرضي - عيادة 1',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6], // Sat to Thu
    maxDailySlots: 20,
    slotDurationMinutes: 30,
    instructions: 'إحضار بطاقة التأمين الصحي وشهادة ميلاد الطفل. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الطبية الخاصة بالأدوية أو الصيام يحددها الطبيب المعالج فقط.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'echo',
    name: 'عيادة الإيكو',
    description: 'فحص الموجات فوق الصوتية على قلب الأطفال والكشف المبكر عن عيوب القلب الخلقية',
    location: 'أمام عيادة القلب بالدور الرابع',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 15,
    slotDurationMinutes: 30,
    instructions: 'يلزم إحضار تقرير الطبيب المعالج، وفحوصات الموجات الصوتية السابقة على القلب. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الطبية الخاصة بالأدوية أو الفحص يحددها الطبيب المعالج فقط.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'nutrition',
    name: 'عيادة التغذية',
    description: 'متابعة النمو، حساسية الطعام، سوء التغذية، وسمنة ونحافة الأطفال',
    location: 'الدور الثالث - عيادة 3',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 20,
    slotDurationMinutes: 30,
    instructions: 'إحضار بطاقة التطعيمات ودفتر متابعة نمو الطفل منذ الولادة مع الفحوصات والتحاليل السابقة إن وُجدت. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الطبية الخاصة بالحمية الغذائية أو التحاليل يحددها الطبيب المعالج فقط.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'gi',
    name: 'عيادة الجهاز الهضمي',
    description: 'علاج اضطرابات الهضم، حساسية القمح، الارتجاع والتهابات المعدة والأمعاء',
    location: 'الدور الثاني - عيادة 6',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 20,
    slotDurationMinutes: 30,
    instructions: 'إحضار التحاليل المعملية السابقة وأشعة السونار إن وُجدت. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى لإنهاء التسجيل. التعليمات الطبية الخاصة بالصيام أو الأدوية يحددها الطبيب المعالج فقط.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'audiology',
    name: 'عيادة السمعيات',
    description: 'قياس السمع لحديثي الولادة والأطفال، فحص ضغط الأذن والتأهيل السمعي',
    location: 'الدور الأرضي - عيادة 4',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 15,
    slotDurationMinutes: 30,
    instructions: 'إحضار بطاقة التأمين الصحي وشهادة ميلاد الطفل وأي فحوصات سمعية سابقة. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الخاصة بالتحضير للفحص يحددها الطبيب المعالج فقط.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'neuro',
    name: 'عيادة النفسية والعصبية',
    description: 'متابعة التشنجات والصرع، تأخر التطور الحركي، فرط الحركة وتشتت الانتباه',
    location: 'الدور الرابع - عيادة 2',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 15,
    slotDurationMinutes: 30,
    instructions: 'إحضار أصل رسم المخ الكهربائي أو الأشعة السابقة إن وُجدت. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الطبية الخاصة بالأدوية يحددها الطبيب المعالج فقط.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'cardio',
    name: 'عيادة قلب الأطفال',
    description: 'تشخيص ومتابعة أمراض صمامات القلب والعيوب الخلقية وضغط الدم',
    location: 'الدور الرابع - عيادة 1',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 18,
    slotDurationMinutes: 30,
    instructions: 'يرجى مراجعة غرفة العلامات الحيوية لقياس النبض والضغط أولاً، وإحضار الفحوصات والتقارير السابقة. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الطبية الخاصة بالأدوية يحددها الطبيب المعالج فقط.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'surgery',
    name: 'عيادة جراحة الأطفال',
    description: 'مناظرة حالات الفتق، الخصية المعلقة، التشوهات الخلقية، وجراحات البطن',
    location: 'الدور الثاني - عيادة 2',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 20,
    slotDurationMinutes: 30,
    instructions: 'إحضار التحاليل المعملية وتقارير أشعة السونار الخاصة بالحالة إن وُجدت. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الطبية الخاصة بالصيام أو التحضير الجراحي يحددها الطبيب المعالج فقط.',
    isActive: true,
    isHospitalConfirmed: false,
  },
];

function getTodayDateString(): string {
  return getTodayCairoDateString();
}

const INITIAL_SERVICES: ClinicService[] = [
  {
    id: 'srv_dent_exam',
    clinicId: 'dentistry',
    name: 'كشف وتشخيص أسنان الأطفال',
    requiredDocuments: ['أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي', 'أي أشعة سينية أو بانوراما سابقة للأسنان إن وجدت'],
    instructions: 'DRAFT — requires approval from the hospital\'s physicians. يرجى تنظيف أسنان وفم الطفل بالفرشاة والمعجون جيداً قبل الحضور. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'srv_dent_pulp',
    clinicId: 'dentistry',
    name: 'علاج العصب والحشو الوقائي للأطفال',
    requiredDocuments: ['شهادة ميلاد الطفل', 'الأشعة السابقة وفحوصات الأسنان'],
    instructions: 'DRAFT — requires approval from the hospital\'s physicians. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى لإنهاء تسجيل التذكرة. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    isActive: true,
    displayOrder: 2,
  },
  {
    id: 'srv_echo_standard',
    clinicId: 'echo',
    name: 'فحص موجات فوق صوتية على قلب الأطفال (إيكو)',
    requiredDocuments: ['أصل شهادة ميلاد الطفل', 'تقرير الطبيب المعالج المحول للفحص', 'أي فحوصات أو تقارير إيكو سابقة'],
    instructions: 'DRAFT — requires approval from the hospital\'s physicians. ارتداء ملابس خفيفة يسهل فتحها من منطقة الصدر لتيسير التصوير. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى مع الحرص على هدوء الطفل. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'srv_cardio_exam',
    clinicId: 'cardio',
    name: 'مناظرة وكشف قلب الأطفال والعيوب الخلقية',
    requiredDocuments: ['أصل شهادة ميلاد الطفل', 'رسم قلب (ECG) حديث إن وجد', 'تقارير الإيكو والفحوصات القلبية السابقة'],
    instructions: 'DRAFT — requires approval from the hospital\'s physicians. قياس العلامات الحيوية بغرفة الفحص الأولي أولاً. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'srv_surg_consult',
    clinicId: 'surgery',
    name: 'مناظرة وتقييم جراحة الأطفال العامة',
    requiredDocuments: ['أصل شهادة ميلاد الطفل ودفتر التطعيمات', 'فحوصات السونار والتحاليل المعملية السابقة'],
    instructions: 'DRAFT — requires approval from the hospital\'s physicians. ارتداء ملابس فضفاضة لتسهيل الفحص السريري. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'srv_surg_hernia',
    clinicId: 'surgery',
    name: 'متابعة حالات الفتق والخصية المعلقة وجراحات البطن',
    requiredDocuments: ['شهادة ميلاد الطفل', 'تقارير السونار والعمليات الجراحية السابقة إن وجدت'],
    instructions: 'DRAFT — requires approval from the hospital\'s physicians. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    isActive: true,
    displayOrder: 2,
  },
  {
    id: 'srv_gi_consult',
    clinicId: 'gi',
    name: 'كشف أمراض الجهاز الهضمي والكبد وسوء الامتصاص',
    requiredDocuments: ['أصل شهادة ميلاد الطفل', 'تحاليل الدم ووظائف الكبد السابقة', 'تقارير سونار البطن إن وجدت'],
    instructions: 'DRAFT — requires approval from the hospital\'s physicians. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'srv_neuro_consult',
    clinicId: 'neuro',
    name: 'كشف المخ والأعصاب ومتابعة التشنجات والصرع',
    requiredDocuments: ['أصل شهادة ميلاد الطفل ودفتر التطعيمات', 'أصل رسم المخ (EEG) وصور الرنين المغناطيسي (MRI) إن وجدت'],
    instructions: 'DRAFT — requires approval from the hospital\'s physicians. إحضار أي مقاطع فيديو موثقة للحركات غير الطبيعية بالهاتف. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'srv_audio_abr',
    clinicId: 'audiology',
    name: 'فحص وقياس استجابة السمع بجذع المخ (ABR)',
    requiredDocuments: ['أصل شهادة ميلاد الطفل', 'نتائج فحص المسح السمعي لحديثي الولادة'],
    instructions: 'DRAFT — requires approval from the hospital\'s physicians. التأكد من نظافة أذن الطفل التامة قبل الفحص. في قياس ABR يفضل أن يكون الرضيع في نوم عميق. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'srv_nutr_assess',
    clinicId: 'nutrition',
    name: 'تقييم التغذية العلاجية ومتابعة النمو وحساسية الطعام',
    requiredDocuments: ['شهادة ميلاد الطفل ودفتر التطعيمات الموثق به الوزن والطول منذ الولادة', 'تحاليل صورة الدم الشاملة وفيتامين د إن وجدت'],
    instructions: 'DRAFT — requires approval from the hospital\'s physicians. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى لتسجيل القياسات الحيوية. التعليمات الخاصة بالصيام أو الأدوية تُحدد من الطبيب المعالج، يرجى الاتصال بالمستشفى للتأكد قبل الحضور.',
    isActive: true,
    displayOrder: 1,
  },
];

const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: 'apt-1',
    referenceNumber: 'BSCH-1042',
    clinicId: 'echo',
    clinicName: 'عيادة الإيكو',
    patientName: 'أحمد محمود إبراهيم النجار',
    phoneNumber: '01012345678',
    patientAge: '4 سنوات',
    patientAddress: 'أبو حمص - دمسنا',
    appointmentDate: getTodayDateString(),
    appointmentTime: '09:00',
    status: 'CONFIRMED',
    queueNumber: 3,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    statusHistory: [
      {
        status: 'PENDING_REVIEW',
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        note: 'تم استلام طلب الحجز عبر البوابة الإلكترونية',
      },
      {
        status: 'CONFIRMED',
        timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
        note: 'تمت مراجعة الطلب وتأكيد الحجز برقم دور 3',
        updatedBy: 'موظف الاستقبال',
      },
    ],
  },
  {
    id: 'apt-2',
    referenceNumber: 'BSCH-2849',
    clinicId: 'dentistry',
    clinicName: 'عيادة الأسنان',
    patientName: 'سارة محمد أحمد الخولي',
    phoneNumber: '01198765432',
    patientAge: '6 سنوات',
    patientAddress: 'كفر الدوار',
    appointmentDate: getTodayDateString(),
    appointmentTime: '09:30',
    status: 'PENDING_REVIEW',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    statusHistory: [
      {
        status: 'PENDING_REVIEW',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        note: 'طلب حجز جديد بانتظار مراجعة موظف الاستقبال',
      },
    ],
  },
  {
    id: 'apt-3',
    referenceNumber: 'BSCH-3915',
    clinicId: 'gi',
    clinicName: 'عيادة الجهاز الهضمي',
    patientName: 'يوسف كريم عادل الشريف',
    phoneNumber: '01255554444',
    patientAge: '2 سنة',
    patientAddress: 'إيتاي البارود',
    appointmentDate: getTodayDateString(),
    appointmentTime: '08:30',
    status: 'CHECKED_IN',
    queueNumber: 1,
    lastCalledAt: new Date(Date.now() - 120000).toISOString(),
    calledCount: 1,
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 120000).toISOString(),
    statusHistory: [
      {
        status: 'PENDING_REVIEW',
        timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
      },
      {
        status: 'CONFIRMED',
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        updatedBy: 'موظف الاستقبال',
      },
      {
        status: 'CHECKED_IN',
        timestamp: new Date(Date.now() - 120000).toISOString(),
        note: 'حضر المريض وتم تسجيل الدخول ونداء الدور 1',
        updatedBy: 'موظف الاستقبال',
      },
    ],
  },
];

const INITIAL_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    staffName: 'أ/ منى عبد الرحيم (موظف الحجز)',
    staffRole: 'RECEPTIONIST',
    action: 'تأكيد حجز',
    details: 'تم تأكيد حجز المريض أحمد محمود بالعيادة مع منح الدور #3',
    referenceNumber: 'BSCH-1042',
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 120000).toISOString(),
    staffName: 'أ/ منى عبد الرحيم (موظف الحجز)',
    staffRole: 'RECEPTIONIST',
    action: 'تسجيل حضور ونداء',
    details: 'تسجيل حضور المريض يوسف كريم واستدعائه لشاشة الانتظار بالدور #1',
    referenceNumber: 'BSCH-3915',
  },
];

class AppointmentServiceStore {
  private clinics: Clinic[] = [...INITIAL_CLINICS];
  private services: ClinicService[] = [...INITIAL_SERVICES];
  private appointments: Appointment[] = [...INITIAL_APPOINTMENTS];
  private auditLogs: AuditLogItem[] = [...INITIAL_AUDIT_LOGS];
  private schedules: ClinicScheduleException[] = [];
  private cancellationRequests: CancellationRequest[] = [];

  public addAuditLog(staffName: string, staffRole: string, action: string, details: string, referenceNumber?: string) {
    const item: AuditLogItem = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      staffName,
      staffRole,
      action,
      details,
      referenceNumber,
    };
    this.auditLogs.unshift(item);

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        supabase.from('audit_logs').insert({
          action,
          entity_type: referenceNumber ? 'APPOINTMENT' : 'CLINIC',
          entity_id: referenceNumber || 'SYSTEM',
          details: {
            staffName,
            staffRole,
            description: details,
            referenceNumber,
          },
        }).then();
      } catch (err) {
        console.warn('Supabase audit log insert error:', err);
      }
    }
  }

  public getAuditLogs(): AuditLogItem[] {
    return this.auditLogs.slice(0, 100);
  }

  public async getClinicServices(clinicId?: string): Promise<ClinicService[]> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        let query = (supabase as any).from('clinic_services').select('*').eq('is_active', true);
        if (clinicId) {
          query = query.eq('clinic_id', clinicId);
        }
        query = query.order('display_order', { ascending: true });
        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          return data.map((s: any) => ({
            id: s.id,
            clinicId: s.clinic_id,
            name: s.name,
            requiredDocuments: s.required_documents || [],
            instructions: s.instructions || '',
            maxDailyCapacity: s.max_daily_capacity !== null && s.max_daily_capacity !== undefined ? Number(s.max_daily_capacity) : undefined,
            isActive: s.is_active,
            displayOrder: s.display_order,
            createdAt: s.created_at,
            updatedAt: s.updated_at,
          }));
        }
      } catch (err) {
        console.warn('Supabase fetch clinic_services fallback to local store:', err);
      }
    }

    let list = this.services.filter((s) => s.isActive);
    if (clinicId) {
      list = list.filter((s) => s.clinicId === clinicId);
    }
    return list.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  public async createClinicService(
    clinicId: string,
    input: Partial<ClinicService>,
    staffUser: StaffUser,
    userToken?: string
  ): Promise<{ success: boolean; service?: ClinicService; error?: string }> {
    if (staffUser.role !== 'ADMIN') {
      return { success: false, error: 'إضافة الخدمات يتطلب صلاحية مدير النظام' };
    }
    if (!input.name || input.name.trim().length === 0) {
      return { success: false, error: 'اسم الخدمة مطلوب' };
    }

    const newService: ClinicService = {
      id: input.id || `srv_${clinicId}_${Date.now()}`,
      clinicId,
      name: input.name.trim(),
      requiredDocuments: input.requiredDocuments || [
        'أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي',
        'أي تقارير طبية أو فحوصات سابقة تخص الحالة',
      ],
      instructions: input.instructions?.trim() || 'الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى.',
      maxDailyCapacity: input.maxDailyCapacity !== undefined && input.maxDailyCapacity !== null ? Number(input.maxDailyCapacity) : undefined,
      isActive: input.isActive ?? true,
      displayOrder: input.displayOrder ?? (this.services.length + 1),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isSupabaseConfigured()) {
      try {
        const { client: supabase } = await getAuthenticatedServerClient(userToken);
        const { error } = await (supabase as any).from('clinic_services').insert({
          id: newService.id,
          clinic_id: newService.clinicId,
          name: newService.name,
          required_documents: newService.requiredDocuments,
          instructions: newService.instructions,
          max_daily_capacity: newService.maxDailyCapacity ?? null,
          is_active: newService.isActive,
          display_order: newService.displayOrder,
        });
        if (error) {
          return { success: false, error: 'تعذر حفظ الخدمة في قاعدة البيانات.' };
        }
      } catch {
        return { success: false, error: 'خطأ اتصال بقاعدة البيانات' };
      }
    }

    this.services.push(newService);
    return { success: true, service: newService };
  }

  public async updateClinicService(
    clinicId: string,
    serviceId: string,
    updates: Partial<ClinicService>,
    staffUser: StaffUser,
    userToken?: string
  ): Promise<{ success: boolean; service?: ClinicService; error?: string }> {
    if (staffUser.role !== 'ADMIN') {
      return { success: false, error: 'تعديل الخدمات يتطلب صلاحية مدير النظام' };
    }

    const service = this.services.find((s) => s.id === serviceId && s.clinicId === clinicId);
    if (!service) {
      return { success: false, error: 'الخدمة غير موجودة' };
    }

    if (isSupabaseConfigured()) {
      try {
        const { client: supabase } = await getAuthenticatedServerClient(userToken);
        const { error } = await (supabase as any)
          .from('clinic_services')
          .update({
            name: updates.name ?? service.name,
            required_documents: updates.requiredDocuments ?? service.requiredDocuments,
            instructions: updates.instructions ?? service.instructions,
            max_daily_capacity: updates.maxDailyCapacity !== undefined ? (updates.maxDailyCapacity ? Number(updates.maxDailyCapacity) : null) : (service.maxDailyCapacity ?? null),
            is_active: updates.isActive ?? service.isActive,
            display_order: updates.displayOrder ?? service.displayOrder,
            updated_at: new Date().toISOString(),
          })
          .eq('id', serviceId);
        if (error) {
          return { success: false, error: 'تعذر تعديل الخدمة في قاعدة البيانات.' };
        }
      } catch {
        return { success: false, error: 'خطأ اتصال بقاعدة البيانات' };
      }
    }

    if (updates.name !== undefined) service.name = updates.name;
    if (updates.requiredDocuments !== undefined) service.requiredDocuments = updates.requiredDocuments;
    if (updates.instructions !== undefined) service.instructions = updates.instructions;
    if (updates.maxDailyCapacity !== undefined) {
      service.maxDailyCapacity = updates.maxDailyCapacity ? Number(updates.maxDailyCapacity) : undefined;
    }
    if (updates.isActive !== undefined) service.isActive = updates.isActive;
    if (updates.displayOrder !== undefined) service.displayOrder = updates.displayOrder;
    service.updatedAt = new Date().toISOString();

    return { success: true, service };
  }

  public async deleteClinicService(
    clinicId: string,
    serviceId: string,
    staffUser: StaffUser,
    userToken?: string
  ): Promise<{ success: boolean; deactivated?: boolean; message?: string; error?: string }> {
    if (staffUser.role !== 'ADMIN') {
      return { success: false, error: 'حذف الخدمات يتطلب صلاحية مدير النظام' };
    }
    const service = this.services.find((s) => s.id === serviceId && s.clinicId === clinicId);
    if (!service) {
      return { success: false, error: 'الخدمة غير موجودة' };
    }

    let hasAppointments = false;
    if (isSupabaseConfigured()) {
      try {
        const { client: supabase } = await getAuthenticatedServerClient(userToken);
        const { count } = await (supabase as any)
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('service_id', serviceId);
        hasAppointments = (count || 0) > 0;
      } catch (err) {
        console.warn('Check service appointments error:', err);
      }
    } else {
      hasAppointments = this.appointments.some((a) => a.serviceId === serviceId);
    }

    if (hasAppointments) {
      // Safe soft deactivation to preserve historical appointments
      await this.updateClinicService(clinicId, serviceId, { isActive: false }, staffUser, userToken);
      return {
        success: true,
        deactivated: true,
        message: 'تم إيقاف تفعيل الخدمة لمنع الحجوزات الجديدة مع الحفاظ على سجلات الحجوزات السابقة المرتبطة بها.',
      };
    }

    if (isSupabaseConfigured()) {
      try {
        const { client: supabase } = await getAuthenticatedServerClient(userToken);
        await (supabase as any).from('clinic_services').delete().eq('id', serviceId);
      } catch (err) {
        return { success: false, error: 'تعذر حذف الخدمة من قاعدة البيانات' };
      }
    }
    this.services = this.services.filter((s) => s.id !== serviceId);
    return { success: true, deactivated: false, message: 'تم حذف الخدمة بنجاح.' };
  }

  public async getAllClinics(): Promise<Clinic[]> {
    const allServices = await this.getClinicServices();
    if (isSupabaseConfigured()) {
      try {
        const { client: supabase } = await getAuthenticatedServerClient();
        const { data, error } = await supabase
          .from('clinics')
          .select('*')
          .eq('is_active', true)
          .order('display_order', { ascending: true });
        if (!error && data && data.length > 0) {
          const rows = data as unknown as Database['public']['Tables']['clinics']['Row'][];
          return rows.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description || undefined,
            location: c.location,
            workingHours: c.working_hours,
            daysOfWeek: c.days_of_week,
            maxDailySlots: c.max_daily_slots,
            slotDurationMinutes: c.slot_duration_minutes,
            instructions: c.instructions || undefined,
            requiredDocuments: (c as any).required_documents || [],
            services: allServices.filter((s) => s.clinicId === c.id),
            isActive: c.is_active,
            isHospitalConfirmed: c.is_hospital_confirmed,
          }));
        }
      } catch (err) {
        console.warn('Supabase fetch clinics fallback to local store:', err);
      }
    }
    return this.clinics
      .filter((c) => c.isActive)
      .map((c) => ({
        ...c,
        requiredDocuments: c.requiredDocuments || ['أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي'],
        services: allServices.filter((s) => s.clinicId === c.id),
      }));
  }

  public getAllClinicsIncludingInactive(): Clinic[] {
    return this.clinics;
  }

  public getClinicById(id: string): Clinic | undefined {
    return this.clinics.find((c) => c.id === id);
  }

  public async createClinic(
    input: Partial<Clinic>,
    staffUser: StaffUser
  ): Promise<{ success: boolean; clinic?: Clinic; error?: string }> {
    if (staffUser.role !== 'ADMIN') {
      return { success: false, error: 'إنشاء عيادات جديدة يتطلب صلاحية مدير النظام' };
    }
    if (!input.name || input.name.trim().length === 0) {
      return { success: false, error: 'اسم العيادة مطلوب' };
    }
    if (!input.location || input.location.trim().length === 0) {
      return { success: false, error: 'موقع العيادة مطلوب' };
    }

    const clinicId = input.id?.trim() || `clinic_${Date.now()}`;
    if (this.clinics.some((c) => c.id === clinicId)) {
      return { success: false, error: 'معرف العيادة مستخدم مسبقاً' };
    }

    const newClinic: Clinic = {
      id: clinicId,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      location: input.location.trim(),
      workingHours: input.workingHours?.trim() || '08:30-14:00',
      daysOfWeek: input.daysOfWeek && input.daysOfWeek.length > 0 ? input.daysOfWeek : [0, 1, 2, 3, 4, 6],
      maxDailySlots: Number(input.maxDailySlots) > 0 ? Number(input.maxDailySlots) : 20,
      slotDurationMinutes: Number(input.slotDurationMinutes) > 0 ? Number(input.slotDurationMinutes) : 30,
      instructions: input.instructions?.trim() || 'إحضار شهادة ميلاد الطفل والتأمين الصحي. الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى.',
      requiredDocuments: input.requiredDocuments || [
        'أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي',
        'صورة بطاقة ولي الأمر',
      ],
      isActive: input.isActive ?? true,
      isHospitalConfirmed: input.isHospitalConfirmed ?? false,
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { error } = await supabase.from('clinics').insert({
          id: newClinic.id,
          name: newClinic.name,
          description: newClinic.description || null,
          location: newClinic.location,
          working_hours: newClinic.workingHours,
          days_of_week: newClinic.daysOfWeek,
          max_daily_slots: newClinic.maxDailySlots,
          slot_duration_minutes: newClinic.slotDurationMinutes,
          instructions: newClinic.instructions || null,
          required_documents: newClinic.requiredDocuments,
          is_active: newClinic.isActive,
          is_hospital_confirmed: newClinic.isHospitalConfirmed,
        } as any);

        if (error) {
          console.error('Supabase create clinic error:', error);
          return { success: false, error: 'فشل في حفظ العيادة في قاعدة البيانات المركزية' };
        }
      } catch (err: any) {
        return { success: false, error: 'خطأ اتصال بقاعدة البيانات' };
      }
    } else if (!isMockStoreAllowed()) {
      return { success: false, error: 'خدمة إنشاء العيادات غير متصلة بقاعدة البيانات في الإنتاج' };
    }

    this.clinics.push(newClinic);
    this.addAuditLog(
      staffUser.name,
      staffUser.role,
      'إنشاء عيادة جديدة',
      `تم إنشاء عيادة جديدة: ${newClinic.name} بسعة يومية ${newClinic.maxDailySlots}`
    );

    return { success: true, clinic: newClinic };
  }

  public async updateClinic(
    clinicId: string,
    updates: Partial<Clinic>,
    staffUser: StaffUser
  ): Promise<{ success: boolean; clinic?: Clinic; error?: string }> {
    if (staffUser.role !== 'ADMIN') {
      return { success: false, error: 'تعديل بيانات العيادات يتطلب صلاحية مدير النظام' };
    }
    const clinic = this.getClinicById(clinicId);
    if (!clinic) {
      return { success: false, error: 'العيادة غير موجودة' };
    }

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { error } = await supabase
          .from('clinics')
          .update({
            name: updates.name !== undefined ? updates.name : clinic.name,
            description: updates.description !== undefined ? updates.description : clinic.description,
            location: updates.location !== undefined ? updates.location : clinic.location,
            working_hours: updates.workingHours !== undefined ? updates.workingHours : clinic.workingHours,
            days_of_week: updates.daysOfWeek !== undefined ? updates.daysOfWeek : clinic.daysOfWeek,
            max_daily_slots: updates.maxDailySlots !== undefined ? updates.maxDailySlots : clinic.maxDailySlots,
            is_active: updates.isActive !== undefined ? updates.isActive : clinic.isActive,
            is_hospital_confirmed: updates.isHospitalConfirmed !== undefined ? updates.isHospitalConfirmed : (clinic.isHospitalConfirmed ?? false),
            instructions: updates.instructions !== undefined ? updates.instructions : clinic.instructions,
            required_documents: updates.requiredDocuments !== undefined ? updates.requiredDocuments : (clinic.requiredDocuments || []),
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', clinicId);

        if (error) {
          console.error('Supabase update clinic failed with code:', error.code);
          return {
            success: false,
            error: 'فشل في حفظ تعديلات العيادة في قاعدة البيانات المركزية. يرجى المحاولة لاحقاً.',
          };
        }
      } catch (err: any) {
        console.error('Supabase update clinic exception:', err?.message || 'Network error');
        return {
          success: false,
          error: 'تعذر الاتصال بقاعدة البيانات لتحديث العيادة. يرجى التحقق من الشبكة.',
        };
      }
    } else if (!isMockStoreAllowed()) {
      return {
        success: false,
        error: 'خدمة إدارة العيادات غير متصلة بقاعدة البيانات في بيئة الإنتاج.',
      };
    }

    // Apply updates locally only after DB confirmation (or in permitted mock mode)
    if (updates.name !== undefined) clinic.name = updates.name;
    if (updates.description !== undefined) clinic.description = updates.description;
    if (updates.location !== undefined) clinic.location = updates.location;
    if (updates.workingHours !== undefined) clinic.workingHours = updates.workingHours;
    if (updates.daysOfWeek !== undefined) clinic.daysOfWeek = updates.daysOfWeek;
    if (updates.maxDailySlots !== undefined) clinic.maxDailySlots = updates.maxDailySlots;
    if (updates.isActive !== undefined) clinic.isActive = updates.isActive;
    if (updates.instructions !== undefined) clinic.instructions = updates.instructions;
    if (updates.requiredDocuments !== undefined) clinic.requiredDocuments = updates.requiredDocuments;
    if (updates.isHospitalConfirmed !== undefined) clinic.isHospitalConfirmed = updates.isHospitalConfirmed;

    this.addAuditLog(
      staffUser.name,
      staffUser.role,
      'تعديل إعدادات العيادة',
      `تم تحديث إعدادات ${clinic.name}: الحالة ${clinic.isActive ? 'مفعلة' : 'متوقفة'}، السعة ${clinic.maxDailySlots}، الاعتماد: ${clinic.isHospitalConfirmed ? 'معتمد' : 'تجريبي'}`
    );

    return { success: true, clinic };
  }

  public async deleteClinic(
    clinicId: string,
    staffUser: StaffUser
  ): Promise<{ success: boolean; deactivated?: boolean; message?: string; error?: string }> {
    if (staffUser.role !== 'ADMIN') {
      return { success: false, error: 'حذف العيادات يتطلب صلاحية مدير النظام' };
    }
    const clinic = this.getClinicById(clinicId);
    if (!clinic) {
      return { success: false, error: 'العيادة غير موجودة' };
    }

    let hasAppointments = false;
    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { count } = await (supabase as any)
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('clinic_id', clinicId);
        hasAppointments = (count || 0) > 0;
      } catch (err) {
        console.warn('Check clinic appointments error:', err);
      }
    } else {
      hasAppointments = this.appointments.some((a) => a.clinicId === clinicId);
    }

    if (hasAppointments) {
      // Safe soft deactivation
      await this.updateClinic(clinicId, { isActive: false }, staffUser);
      return {
        success: true,
        deactivated: true,
        message: `تم إيقاف تفعيل "${clinic.name}" لمنع الحجوزات الجديدة مع الحفاظ على سجلات وتاريخ مواعيد المرضى السابقة.`,
      };
    }

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        await supabase.from('clinics').delete().eq('id', clinicId);
      } catch (err) {
        return { success: false, error: 'تعذر حذف العيادة من قاعدة البيانات' };
      }
    }

    this.clinics = this.clinics.filter((c) => c.id !== clinicId);
    this.addAuditLog(
      staffUser.name,
      staffUser.role,
      'حذف عيادة',
      `تم حذف العيادة ${clinic.name} نهائياً لعدم وجود حجوزات سابقة مرتبطة بها`
    );

    return { success: true, deactivated: false, message: `تم حذف العيادة "${clinic.name}" بنجاح.` };
  }

  public async getClinicSchedules(clinicId: string): Promise<ClinicScheduleException[]> {
    const todayCairo = getTodayCairoDateString();
    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { data, error } = await (supabase as any)
          .from('clinic_schedules')
          .select('*')
          .eq('clinic_id', clinicId)
          .gte('schedule_date', todayCairo)
          .order('schedule_date', { ascending: true });

        if (!error && data && Array.isArray(data)) {
          return data.map((s: any) => ({
            id: s.id,
            clinicId: s.clinic_id,
            scheduleDate: s.schedule_date,
            maxCapacity: s.max_capacity,
            isClosed: s.is_closed,
            closureReason: s.closure_reason || undefined,
            createdAt: s.created_at,
            updatedAt: s.updated_at,
          }));
        }
      } catch (err) {
        console.warn('Supabase getClinicSchedules error:', err);
      }
    }

    return this.schedules
      .filter((s) => s.clinicId === clinicId && s.scheduleDate >= todayCairo)
      .sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));
  }

  public async getClinicScheduleForDate(
    clinicId: string,
    scheduleDate: string
  ): Promise<ClinicScheduleException | undefined> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { data, error } = await (supabase as any)
          .from('clinic_schedules')
          .select('*')
          .eq('clinic_id', clinicId)
          .eq('schedule_date', scheduleDate)
          .maybeSingle();

        if (!error && data) {
          return {
            id: data.id,
            clinicId: data.clinic_id,
            scheduleDate: data.schedule_date,
            maxCapacity: data.max_capacity,
            isClosed: data.is_closed,
            closureReason: data.closure_reason || undefined,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      } catch (err) {
        console.warn('Supabase getClinicScheduleForDate error:', err);
      }
    }

    return this.schedules.find((s) => s.clinicId === clinicId && s.scheduleDate === scheduleDate);
  }

  public async upsertClinicScheduleException(
    clinicId: string,
    input: Partial<ClinicScheduleException>,
    staffUser: StaffUser
  ): Promise<{ success: boolean; schedule?: ClinicScheduleException; error?: string }> {
    if (staffUser.role !== 'ADMIN') {
      return { success: false, error: 'إدارة استثناءات التقويم تتطلب صلاحية مدير النظام' };
    }
    const clinic = this.getClinicById(clinicId);
    if (!clinic) {
      return { success: false, error: 'العيادة غير موجودة' };
    }
    if (!input.scheduleDate) {
      return { success: false, error: 'تاريخ الاستثناء مطلوب' };
    }
    const todayCairo = getTodayCairoDateString();
    if (input.scheduleDate < todayCairo) {
      return { success: false, error: 'لا يمكن إضافة استثناء لتاريخ ماضي' };
    }

    const scheduleItem: ClinicScheduleException = {
      id: input.id || `sched_${clinicId}_${input.scheduleDate}`,
      clinicId,
      scheduleDate: input.scheduleDate,
      maxCapacity: input.maxCapacity !== undefined ? Number(input.maxCapacity) : clinic.maxDailySlots,
      isClosed: Boolean(input.isClosed),
      closureReason: input.closureReason?.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { error } = await (supabase as any)
          .from('clinic_schedules')
          .upsert(
            {
              clinic_id: scheduleItem.clinicId,
              schedule_date: scheduleItem.scheduleDate,
              max_capacity: scheduleItem.maxCapacity,
              is_closed: scheduleItem.isClosed,
              closure_reason: scheduleItem.closureReason || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'clinic_id,schedule_date' }
          );

        if (error) {
          console.error('Supabase upsert schedule error:', error);
          return { success: false, error: 'فشل حفظ الاستثناء في قاعدة البيانات' };
        }
      } catch (err) {
        return { success: false, error: 'خطأ اتصال بقاعدة البيانات' };
      }
    }

    // Update local memory
    const existingIndex = this.schedules.findIndex(
      (s) => s.clinicId === clinicId && s.scheduleDate === input.scheduleDate
    );
    if (existingIndex >= 0) {
      this.schedules[existingIndex] = scheduleItem;
    } else {
      this.schedules.push(scheduleItem);
    }

    this.addAuditLog(
      staffUser.name,
      staffUser.role,
      'تعديل جدول العيادة',
      `تم تعديل استثناء تاريخ ${scheduleItem.scheduleDate} لعيادة ${clinic.name}: ${scheduleItem.isClosed ? 'إغلاق عطلة' : `سعة استثنائية (${scheduleItem.maxCapacity})`}`
    );

    return { success: true, schedule: scheduleItem };
  }

  public async deleteClinicScheduleException(
    clinicId: string,
    scheduleDate: string,
    staffUser: StaffUser
  ): Promise<{ success: boolean; error?: string }> {
    if (staffUser.role !== 'ADMIN') {
      return { success: false, error: 'حذف استثناءات التقويم يتطلب صلاحية مدير النظام' };
    }
    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        await (supabase as any)
          .from('clinic_schedules')
          .delete()
          .eq('clinic_id', clinicId)
          .eq('schedule_date', scheduleDate);
      } catch (err) {
        return { success: false, error: 'تعذر حذف الاستثناء من قاعدة البيانات' };
      }
    }
    this.schedules = this.schedules.filter(
      (s) => !(s.clinicId === clinicId && s.scheduleDate === scheduleDate)
    );
    return { success: true };
  }

  public getAvailableSlots(clinicId: string, dateStr: string): AppointmentSlot[] {
    const clinic = this.getClinicById(clinicId);
    if (!clinic) return [];

    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();

    if (!clinic.daysOfWeek.includes(dayOfWeek)) {
      return []; // Clinic closed on this day
    }

    const slotTimes = [
      '08:30', '09:00', '09:30', '10:00', '10:30',
      '11:00', '11:30', '12:00', '12:30', '13:00', '13:30'
    ];

    const dayBookings = this.appointments.filter(
      (a) => a.clinicId === clinicId && a.appointmentDate === dateStr && a.status !== 'CANCELLED'
    );

    const slotCapacity = 3;

    return slotTimes.map((time) => {
      const bookedInSlot = dayBookings.filter((a) => a.appointmentTime === time).length;
      return {
        id: `${clinicId}-${dateStr}-${time}`,
        clinicId,
        date: dateStr,
        time,
        capacity: slotCapacity,
        bookedCount: bookedInSlot,
        isAvailable: bookedInSlot < slotCapacity,
      };
    });
  }

  public async createAppointment(input: CreateAppointmentInput): Promise<{
    success: boolean;
    appointment?: Appointment;
    error?: string;
  }> {
    const phoneCheck = normalizeAndValidateEgyptianPhone(input.phoneNumber);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.error || 'رقم هاتف غير صالح' };
    }

    const nameCheck = validatePatientName(input.patientName);
    if (!nameCheck.isValid) {
      return { success: false, error: nameCheck.error || 'اسم المريض غير صالح' };
    }

    const clinic = this.getClinicById(input.clinicId);
    if (!clinic || !clinic.isActive) {
      return { success: false, error: 'العيادة المختارة غير موجودة أو غير مفعلة' };
    }

    if (!input.appointmentDate) {
      return { success: false, error: 'تاريخ الموعد مطلوب' };
    }

    const todayCairo = getTodayCairoDateString();
    if (input.appointmentDate < todayCairo) {
      return { success: false, error: 'لا يمكن حجز موعد في تاريخ سابق' };
    }

    // Maximum booking horizon: 30 days ahead
    const maxHorizonDate = new Date();
    maxHorizonDate.setUTCDate(maxHorizonDate.getUTCDate() + 30);
    const maxHorizonString = maxHorizonDate.toISOString().split('T')[0];
    if (input.appointmentDate > maxHorizonString) {
      return { success: false, error: 'الحجز الإلكتروني متاح بحد أقصى 30 يوماً مقدماً' };
    }

    // Check schedule overrides, closures, and capacity from clinic_schedules (Precedence rule)
    let effectiveCapacity = clinic.maxDailySlots;
    const scheduleOverride = await this.getClinicScheduleForDate(input.clinicId, input.appointmentDate);
    if (scheduleOverride) {
      if (scheduleOverride.isClosed) {
        return {
          success: false,
          error: `العيادة مغلقة في هذا التاريخ${scheduleOverride.closureReason ? ': ' + scheduleOverride.closureReason : ' نظراً لعطلة رسمية أو ظرف طارئ.'}`,
        };
      }
      if (scheduleOverride.maxCapacity !== undefined && scheduleOverride.maxCapacity !== null) {
        effectiveCapacity = scheduleOverride.maxCapacity;
      }
    } else {
      const appointmentDateObj = new Date(input.appointmentDate + 'T12:00:00Z');
      const dayOfWeek = appointmentDateObj.getUTCDay();
      if (!clinic.daysOfWeek.includes(dayOfWeek)) {
        return {
          success: false,
          error: 'العيادة المختارة لا تعمل في هذا اليوم (عطلة أسبوعية). يرجى اختيار يوم عمل رسمي للعيادة.',
        };
      }
    }

    // Resolve service details & validate service-clinic match
    const clinicServices = await this.getClinicServices(input.clinicId);
    let matchedService: ClinicService | undefined;
    if (input.serviceId) {
      matchedService = clinicServices.find((s) => s.id === input.serviceId && s.isActive);
      if (!matchedService) {
        return { success: false, error: 'الخدمة المختارة غير تابعة لهذه العيادة أو غير مفعلة' };
      }
    } else {
      matchedService = clinicServices.find((s) => s.isActive) || clinicServices[0];
    }
    const resolvedServiceName = input.serviceName || matchedService?.name || 'كشف واستشارة طبية';

    // Check per-service capacity if defined
    if (matchedService?.maxDailyCapacity) {
      let currentServiceBooked = 0;
      if (isSupabaseConfigured()) {
        try {
          const supabase = createAdminClient();
          const { count } = await (supabase as any)
            .from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('clinic_id', input.clinicId)
            .eq('service_id', matchedService.id)
            .eq('appointment_date', input.appointmentDate)
            .neq('status', 'CANCELLED');
          currentServiceBooked = count || 0;
        } catch (err) {
          console.warn('Check service booked count error:', err);
        }
      } else {
        currentServiceBooked = this.appointments.filter(
          (a) =>
            a.clinicId === input.clinicId &&
            a.serviceId === matchedService!.id &&
            a.appointmentDate === input.appointmentDate &&
            a.status !== 'CANCELLED'
        ).length;
      }

      if (currentServiceBooked >= matchedService.maxDailyCapacity) {
        return {
          success: false,
          error: `عفواً، اكتملت السعة اليومية المتاحة لخدمة "${matchedService.name}" في هذا التاريخ (${matchedService.maxDailyCapacity} مريض). يرجى اختيار موعد آخر أو خدمة بديلة.`,
        };
      }
    }

    // Generate unambiguous CSPRNG booking code
    const bookingCode = generateBookingCode();
    const bookingCodeHash = hashBookingCode(bookingCode);

    const slots = this.getAvailableSlots(input.clinicId, input.appointmentDate);
    let selectedTime = input.appointmentTime;

    if (selectedTime) {
      const targetSlot = slots.find((s) => s.time === selectedTime);
      if (targetSlot && !targetSlot.isAvailable) {
        return { success: false, error: 'الموعد المحدد ممتلئ، يرجى اختيار موعد آخر' };
      }
    } else {
      const firstAvailable = slots.find((s) => s.isAvailable);
      selectedTime = firstAvailable ? firstAvailable.time : '09:00';
    }

    let ref = generateReferenceNumber();
    while (this.appointments.some((a) => a.referenceNumber === ref)) {
      ref = generateReferenceNumber();
    }

    // Attempt Supabase atomic function if configured
    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { data, error } = await (supabase as any).rpc('book_appointment_atomic', {
          p_clinic_id: input.clinicId,
          p_patient_name: input.patientName.trim(),
          p_phone_number: phoneCheck.normalized,
          p_patient_age: input.patientAge?.trim() || null,
          p_patient_address: input.patientAddress?.trim() || null,
          p_appointment_date: input.appointmentDate,
          p_appointment_time: selectedTime || '09:00',
          p_reference_number: null, // Strictly server/database-generated sequence
          p_service_id: matchedService?.id || null,
          p_guardian_national_id: input.guardianNationalId?.trim() || null,
          p_staff_user_id: input.isWalkIn ? (input.staffUserId || null) : null,
        });

        if (error) {
          console.error('Supabase atomic booking RPC error code:', error.code);
          return {
            success: false,
            error: error.message?.includes('duplicate') || error.message?.includes('مسبق')
              ? 'يوجد حجز مسبق بالفعل لنفس الهاتف في هذه العيادة في نفس اليوم'
              : 'فشل في تسجيل الحجز في قاعدة البيانات المركزية، يرجى المحاولة لاحقاً.',
          };
        }

        if (data && typeof data === 'object') {
          const res = data as { success: boolean; error?: string; appointment?: any; [key: string]: any };
          if (!res.success) {
            return { success: false, error: res.error || 'فشل تسجيل الحجز في قاعدة البيانات' };
          }
          const dbApt = res.appointment || (res.appointment_id || res.reference_number ? res : null);
          if (dbApt) {
            const mappedApt: Appointment = {
              id: dbApt.id || dbApt.appointment_id || dbApt.reference_number || `apt-${Date.now()}`,
              referenceNumber: dbApt.reference_number,
              clinicId: dbApt.clinic_id || input.clinicId,
              clinicName: dbApt.clinic_name || clinic.name,
              serviceId: matchedService?.id,
              serviceName: resolvedServiceName,
              patientName: dbApt.patient_name || input.patientName.trim(),
              phoneNumber: dbApt.phone_number || phoneCheck.normalized,
              patientAge: dbApt.patient_age || input.patientAge?.trim() || undefined,
              patientAddress: dbApt.patient_address || input.patientAddress?.trim() || undefined,
              bookingCode: bookingCode, // Unhashed transient code returned once for the ticket receipt
              bookingCodeHash: bookingCodeHash,
              requiredDocuments: matchedService?.requiredDocuments,
              serviceInstructions: matchedService?.instructions,
              appointmentDate: dbApt.appointment_date || input.appointmentDate,
              appointmentTime: dbApt.appointment_time || selectedTime || '09:00',
              status: dbApt.status || (input.isWalkIn ? 'CONFIRMED' : 'PENDING_REVIEW'),
              queueNumber: dbApt.queue_number ?? undefined,
              createdAt: dbApt.created_at || new Date().toISOString(),
              updatedAt: dbApt.updated_at || new Date().toISOString(),
              statusHistory: [
                {
                  status: dbApt.status || (input.isWalkIn ? 'CONFIRMED' : 'PENDING_REVIEW'),
                  timestamp: new Date().toISOString(),
                  note: input.isWalkIn
                    ? 'تسجيل حضوري مباشر من مكتب الاستقبال بالمستشفى'
                    : 'تم استلام وتأكيد طلب الحجز بنجاح في قاعدة البيانات المركزية',
                },
              ],
            };
            this.appointments.unshift(mappedApt);
            return { success: true, appointment: mappedApt };
          }
        }

        return {
          success: false,
          error: 'استجابة غير متوقعة من قاعدة البيانات المركزية، يرجى التحقق من حالة الحجز.',
        };
      } catch (err: any) {
        console.error('Supabase booking exception:', err?.message || 'Network exception');

        // Requirement 8: Reconciliation check before failing
        // In case of a network timeout where write may have succeeded, check if ref exists
        try {
          const supabase = createAdminClient();
          const { data: existingApt } = await supabase
            .from('appointments')
            .select('id, reference_number, clinic_id, clinic_name, patient_name, phone_number, patient_age, patient_address, appointment_date, appointment_time, status, queue_number, created_at, updated_at')
            .eq('reference_number', ref)
            .maybeSingle();

          if (existingApt) {
            const mappedApt: Appointment = {
              id: (existingApt as any).id,
              referenceNumber: (existingApt as any).reference_number,
              clinicId: (existingApt as any).clinic_id,
              clinicName: (existingApt as any).clinic_name,
              patientName: (existingApt as any).patient_name,
              phoneNumber: (existingApt as any).phone_number,
              patientAge: (existingApt as any).patient_age || undefined,
              patientAddress: (existingApt as any).patient_address || undefined,
              appointmentDate: (existingApt as any).appointment_date,
              appointmentTime: (existingApt as any).appointment_time,
              status: (existingApt as any).status,
              queueNumber: (existingApt as any).queue_number,
              createdAt: (existingApt as any).created_at,
              updatedAt: (existingApt as any).updated_at,
              statusHistory: [],
            };
            this.appointments.unshift(mappedApt);
            return { success: true, appointment: mappedApt };
          }
        } catch {
          // Ignore secondary reconciliation error
        }

        return {
          success: false,
          error: 'تعذر الاتصال بقاعدة البيانات المركزية لتسجيل الحجز. لم يتم تأكيد الحجز، يرجى إعادة المحاولة.',
        };
      }
    }

    // Fallback: strictly checked by isMockStoreAllowed()
    if (!isMockStoreAllowed()) {
      return {
        success: false,
        error: 'خدمة الحجز الإلكتروني غير متصلة بقاعدة البيانات المركزية في بيئة الإنتاج.',
      };
    }

    // Local memory transaction check fallback (allows siblings with different patient names)
    const normalizedInputName = input.patientName.trim().toLowerCase().replace(/\s+/g, ' ');
    const existing = this.appointments.find(
      (a) =>
        a.phoneNumber === phoneCheck.normalized &&
        a.clinicId === input.clinicId &&
        a.appointmentDate === input.appointmentDate &&
        a.patientName.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedInputName &&
        a.status !== 'CANCELLED'
    );
    if (existing) {
      return {
        success: false,
        error: `يوجد حجز مسبق بالفعل لنفس المريض في ${clinic.name} بنفس التاريخ برقم مرجعي (${existing.referenceNumber})`,
      };
    }

    const dayBookingsCount = this.appointments.filter(
      (a) => a.clinicId === input.clinicId && a.appointmentDate === input.appointmentDate && a.status !== 'CANCELLED'
    ).length;

    if (dayBookingsCount >= effectiveCapacity) {
      return {
        success: false,
        error: `عفواً، اكتملت السعة اليومية المتاحة للعيادة في هذا التاريخ (${effectiveCapacity} مريض). يرجى اختيار موعد آخر.`,
      };
    }
    const queueNumber = dayBookingsCount + 1;

    const now = new Date().toISOString();
    const initialStatus: AppointmentStatus = input.isWalkIn ? 'CONFIRMED' : 'PENDING_REVIEW';

    const newAppointment: Appointment = {
      id: `apt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      referenceNumber: ref,
      clinicId: clinic.id,
      clinicName: clinic.name,
      serviceId: matchedService?.id,
      serviceName: resolvedServiceName,
      guardianNationalId: input.guardianNationalId ? input.guardianNationalId.trim() : undefined,
      bookingCode: bookingCode,
      bookingCodeHash: bookingCodeHash,
      requiredDocuments: matchedService?.requiredDocuments,
      serviceInstructions: matchedService?.instructions,
      patientName: input.patientName.trim(),
      phoneNumber: phoneCheck.normalized,
      patientAge: input.patientAge?.trim() || undefined,
      patientAddress: input.patientAddress?.trim() || undefined,
      appointmentDate: input.appointmentDate,
      appointmentTime: selectedTime || '09:00',
      status: initialStatus,
      queueNumber,
      createdAt: now,
      updatedAt: now,
      statusHistory: [
        {
          status: initialStatus,
          timestamp: now,
          note: input.isWalkIn
            ? 'حجز حضوري مباشر من مكتب الاستقبال بالمستشفى'
            : 'تم إرسال طلب الحجز بنجاح عبر بوابة المواعيد الإلكترونية',
        },
      ],
    };

    this.appointments.unshift(newAppointment);

    if (input.isWalkIn) {
      this.addAuditLog(
        'الاستقبال والحجز',
        'RECEPTIONIST',
        'حجز حضوري سريع',
        `تسجيل مريض حضوري (${newAppointment.patientName}) في ${clinic.name} دور #${queueNumber}`,
        ref
      );
    }

    return { success: true, appointment: newAppointment };
  }

  public async trackAppointment(
    referenceNumber: string,
    phoneNumber: string
  ): Promise<Appointment[]> {
    if (!referenceNumber || !phoneNumber) return [];
    let cleanRef = referenceNumber.trim().toUpperCase();
    if (/^[0-9]{4,6}$/.test(cleanRef)) {
      cleanRef = `BSCH-${cleanRef}`;
    }

    const phoneCheck = normalizeAndValidateEgyptianPhone(phoneNumber);
    if (!phoneCheck.isValid) return [];
    const cleanPhone = phoneCheck.normalized;

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { data, error } = await (supabase as any).rpc('track_appointment_secure', {
          p_reference_number: cleanRef,
          p_phone_number: cleanPhone,
        });
        if (!error && data && Array.isArray(data) && data.length > 0) {
          return data.map((dbApt: any) => ({
            id: dbApt.reference_number,
            referenceNumber: dbApt.reference_number,
            clinicId: dbApt.clinic_id,
            clinicName: dbApt.clinic_name,
            patientName: dbApt.patient_name,
            phoneNumber: cleanPhone,
            appointmentDate: dbApt.appointment_date,
            appointmentTime: dbApt.appointment_time,
            status: dbApt.status,
            queueNumber: dbApt.queue_number,
            hasPendingCancellation: this.cancellationRequests.some((r) => (r.referenceNumber === dbApt.reference_number || r.appointmentId === dbApt.id) && r.status === 'PENDING'),
            createdAt: '',
            updatedAt: '',
            statusHistory: [],
          }));
        }
      } catch (err) {
        console.warn('Supabase trackAppointment error:', err);
      }
    }

    // In-memory fallback: strictly check BOTH referenceNumber and phoneNumber
    return this.appointments
      .filter(
        (a) =>
          a.referenceNumber.toUpperCase() === cleanRef &&
          a.phoneNumber === cleanPhone
      )
      .map((a) => ({
        ...a,
        hasPendingCancellation: a.hasPendingCancellation || this.cancellationRequests.some((r) => (r.referenceNumber === a.referenceNumber || r.appointmentId === a.id) && r.status === 'PENDING'),
      }));
  }

  public async getActiveBookingHashesForPhone(phoneNumber: string): Promise<string[]> {
    const phoneCheck = normalizeAndValidateEgyptianPhone(phoneNumber);
    if (!phoneCheck.isValid) return [];
    const cleanPhone = phoneCheck.normalized;
    const todayCairo = getTodayCairoDateString();

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { data, error } = await (supabase as any)
          .from('appointments')
          .select('booking_code_hash')
          .eq('phone_number', cleanPhone)
          .gte('appointment_date', todayCairo)
          .neq('status', 'CANCELLED');
        if (!error && data && Array.isArray(data)) {
          return data.map((r: any) => r.booking_code_hash).filter(Boolean);
        }
      } catch (err) {
        console.warn('Supabase getActiveBookingHashesForPhone error:', err);
      }
    }

    return this.appointments
      .filter((a) => a.phoneNumber === cleanPhone && a.appointmentDate >= todayCairo && a.status !== 'CANCELLED')
      .map((a) => a.bookingCodeHash)
      .filter((h): h is string => Boolean(h));
  }

  public async trackAppointmentsByVerifiedPhone(
    phoneNumber: string
  ): Promise<Appointment[]> {
    const phoneCheck = normalizeAndValidateEgyptianPhone(phoneNumber);
    if (!phoneCheck.isValid) return [];
    const cleanPhone = phoneCheck.normalized;
    const todayCairo = getTodayCairoDateString();
    const allServices = await this.getClinicServices();

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { data, error } = await (supabase as any)
          .from('appointments')
          .select('id, reference_number, clinic_id, clinic_name, service_id, service_name, patient_name, patient_age, patient_address, appointment_date, appointment_time, status, queue_number')
          .eq('phone_number', cleanPhone)
          .gte('appointment_date', todayCairo)
          .neq('status', 'CANCELLED')
          .order('appointment_date', { ascending: true });

        if (!error && data && Array.isArray(data)) {
          return data.map((dbApt: any) => {
            const matchedService = dbApt.service_id
              ? allServices.find((s) => s.id === dbApt.service_id)
              : allServices.find((s) => s.clinicId === dbApt.clinic_id);
            const clinic = this.getClinicById(dbApt.clinic_id);
            return {
              id: dbApt.id || dbApt.reference_number,
              referenceNumber: dbApt.reference_number,
              clinicId: dbApt.clinic_id,
              clinicName: dbApt.clinic_name,
              serviceId: dbApt.service_id || matchedService?.id,
              serviceName: dbApt.service_name || matchedService?.name || 'كشف واستشارة طبية',
              patientName: maskPatientName(dbApt.patient_name),
              phoneNumber: cleanPhone,
              appointmentDate: dbApt.appointment_date,
              appointmentTime: '',
              status: dbApt.status,
              queueNumber: dbApt.queue_number ?? undefined,
              hasPendingCancellation: this.cancellationRequests.some((r) => (r.referenceNumber === dbApt.reference_number || r.appointmentId === dbApt.id) && r.status === 'PENDING'),
              requiredDocuments: [
                ...(clinic?.requiredDocuments || []),
                ...(matchedService?.requiredDocuments || []),
              ],
              serviceInstructions: matchedService?.instructions || clinic?.instructions || 'الحضور صباحاً بأسبقية التسجيل في شباك الاستقبال.',
              createdAt: '',
              updatedAt: '',
              statusHistory: [],
            };
          });
        }
      } catch (err) {
        console.warn('Supabase trackAppointmentsByVerifiedPhone error:', err);
      }
    }

    return this.appointments
      .filter((a) => a.phoneNumber === cleanPhone && a.appointmentDate >= todayCairo && a.status !== 'CANCELLED')
      .map((a) => {
        const matchedService = a.serviceId
          ? allServices.find((s) => s.id === a.serviceId)
          : allServices.find((s) => s.clinicId === a.clinicId);
        const clinic = this.getClinicById(a.clinicId);
        return {
          id: a.id,
          referenceNumber: a.referenceNumber,
          clinicId: a.clinicId,
          clinicName: a.clinicName,
          serviceId: a.serviceId || matchedService?.id,
          serviceName: a.serviceName || matchedService?.name || 'كشف واستشارة طبية',
          patientName: maskPatientName(a.patientName),
          phoneNumber: cleanPhone,
          appointmentDate: a.appointmentDate,
          appointmentTime: '',
          status: a.status,
          queueNumber: a.queueNumber,
          hasPendingCancellation: a.hasPendingCancellation || this.cancellationRequests.some((r) => (r.referenceNumber === a.referenceNumber || r.appointmentId === a.id) && r.status === 'PENDING'),
          requiredDocuments: [
            ...(clinic?.requiredDocuments || []),
            ...(matchedService?.requiredDocuments || a.requiredDocuments || []),
          ],
          serviceInstructions: matchedService?.instructions || clinic?.instructions || a.serviceInstructions || 'الحضور صباحاً بأسبقية التسجيل في شباك الاستقبال.',
          createdAt: '',
          updatedAt: '',
          statusHistory: [],
        };
      })
      .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate));
  }

  public getAppointmentById(id: string): Appointment | undefined {
    return this.appointments.find((a) => a.id === id || a.referenceNumber === id);
  }

  public async getAppointmentByIdAsync(id: string, userToken?: string): Promise<Appointment | undefined> {
    const memoryApt = this.appointments.find((a) => a.id === id || a.referenceNumber === id);
    if (memoryApt) return memoryApt;

    if (isSupabaseConfigured()) {
      try {
        const { client } = await getAuthenticatedServerClient(userToken);
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        let query = (client as any).from('appointments').select('*');
        if (isUUID) {
          query = query.eq('id', id);
        } else {
          query = query.eq('reference_number', id);
        }
        const { data, error } = await query.maybeSingle();
        if (!error && data) {
          const mapped: Appointment = {
            id: data.id,
            referenceNumber: data.reference_number,
            clinicId: data.clinic_id,
            clinicName: data.clinic_name,
            serviceId: data.service_id,
            serviceName: data.service_name,
            patientName: data.patient_name,
            phoneNumber: data.phone_number,
            patientAge: data.patient_age || undefined,
            patientAddress: data.patient_address || undefined,
            appointmentDate: data.appointment_date,
            appointmentTime: data.appointment_time,
            status: data.status,
            queueNumber: data.queue_number,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            statusHistory: [],
          };
          this.appointments.unshift(mapped);
          return mapped;
        }
      } catch (err) {
        console.warn('Failed to fetch appointment by id from Supabase:', err);
      }
    }

    return undefined;
  }

  public async updateStatus(
    id: string,
    targetStatus: AppointmentStatus,
    updatedByOrUser: string | StaffUser,
    note?: string,
    userToken?: string
  ): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    const apt = await this.getAppointmentByIdAsync(id, userToken);
    if (!apt) {
      return { success: false, error: 'الموعد غير موجود' };
    }

    const staffUser: StaffUser | null = typeof updatedByOrUser === 'object' ? updatedByOrUser : null;
    const staffName: string = typeof updatedByOrUser === 'string' ? updatedByOrUser : updatedByOrUser.name;

    // Role-based privilege checks
    if (staffUser) {
      if (staffUser.role === 'RECEPTIONIST') {
        if (targetStatus === 'COMPLETED') {
          return { success: false, error: 'إتمام الكشف الطبي وصرف التذكرة صلاحية طبية مخصصة للأطباء فقط' };
        }
        if (
          staffUser.clinicId &&
          staffUser.clinicId !== 'general' &&
          staffUser.clinicId !== 'all' &&
          staffUser.username !== 'reception' &&
          apt.clinicId !== staffUser.clinicId
        ) {
          return { success: false, error: 'غير مصرح لموظف الاستقبال بتعديل مواعيد خاصة بعيادة أخرى' };
        }
      } else if (staffUser.role === 'DOCTOR') {
        if (!staffUser.clinicId) {
          return { success: false, error: 'غير مصرح للطبيب غير المعين على عيادة بتعديل المواعيد' };
        }
        if (apt.clinicId !== staffUser.clinicId) {
          return { success: false, error: 'غير مصرح للطبيب بتعديل مواعيد خاصة بعيادة أخرى' };
        }
      }
    }

    // Terminal state protection
    if (apt.status === 'COMPLETED' && (!staffUser || staffUser.role !== 'ADMIN')) {
      return { success: false, error: 'لا يمكن تعديل حجز تم الكشف عليه واكتماله مسبقاً إلا بواسطة مدير النظام' };
    }
    if (apt.status === 'CANCELLED' && (!staffUser || staffUser.role !== 'ADMIN')) {
      return { success: false, error: 'لا يمكن إعادة فتح حجز ملغي مسبقاً' };
    }

    if (!canTransitionStatus(apt.status, targetStatus)) {
      return {
        success: false,
        error: `لا يمكن تحويل حالة الحجز من "${apt.status}" إلى "${targetStatus}"`,
      };
    }

    const now = new Date().toISOString();

    if (isSupabaseConfigured()) {
      try {
        const isRealJwt = userToken && userToken.startsWith('eyJ') && userToken.split('.').length === 3;
        let client: any = null;
        let staffUserId: string | null = null;

        if (isRealJwt) {
          client = createUserClient(userToken);
          staffUserId = staffUser && isValidUuid(staffUser.id) ? staffUser.id : null;
        } else {
          const sys = await getSystemSupabaseClient();
          client = sys.client;
          staffUserId = sys.userId || (staffUser && isValidUuid(staffUser.id) ? staffUser.id : null);
        }

        const { data, error: rpcError } = await (client as any).rpc('update_appointment_status_atomic', {
          p_appointment_id: apt.id,
          p_target_status: targetStatus,
          p_staff_user_id: staffUserId,
          p_note: note || null,
          p_caller_phone: null,
        });

        if (rpcError) {
          console.error('Supabase update_appointment_status_atomic error:', rpcError.message || rpcError.code);
          return {
            success: false,
            error: rpcError.message || 'فشل في تحديث حالة الحجز في قاعدة البيانات المركزية. يرجى إعادة المحاولة.',
          };
        }

        if (data && !data.success) {
          return {
            success: false,
            error: data.error || 'تعذر تحديث حالة الحجز وفقاً لقواعد الأمان.',
          };
        }
      } catch (err: any) {
        console.error('Supabase status update exception:', err?.message || 'Network error');
        return {
          success: false,
          error: 'تعذر الاتصال بقاعدة البيانات لتحديث حالة الحجز.',
        };
      }
    } else if (!isMockStoreAllowed()) {
      return {
        success: false,
        error: 'خدمة تعديل الحالات غير متصلة بقاعدة البيانات في بيئة الإنتاج.',
      };
    }

    // Apply status change in local memory store only after database confirms (or in permitted mock mode)
    apt.status = targetStatus;
    apt.updatedAt = now;

    if (targetStatus === 'CHECKED_IN') {
      apt.lastCalledAt = now;
      apt.calledCount = (apt.calledCount || 0) + 1;
    }

    apt.statusHistory.push({
      status: targetStatus,
      timestamp: now,
      note: note || undefined,
      updatedBy: staffName,
    });

    this.addAuditLog(
      staffName,
      staffUser?.role || 'STAFF',
      `تحديث الحالة إلى ${targetStatus}`,
      note || `تم تغيير حالة الحجز للمريض ${apt.patientName}`,
      apt.referenceNumber
    );

    return { success: true, appointment: apt };
  }

  public async recallPatient(
    id: string,
    staffUser: StaffUser,
    userToken?: string
  ): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    const apt = await this.getAppointmentByIdAsync(id, userToken);
    if (!apt) {
      return { success: false, error: 'الحجز غير موجود' };
    }

    if (staffUser.role === 'DOCTOR' && staffUser.clinicId && staffUser.clinicId !== apt.clinicId) {
      return { success: false, error: 'غير مصرح للطبيب بنداء مرضى عيادة أخرى' };
    }
    if (
      staffUser.role === 'RECEPTIONIST' &&
      staffUser.clinicId &&
      staffUser.clinicId !== 'general' &&
      staffUser.clinicId !== 'all' &&
      staffUser.username !== 'reception' &&
      staffUser.clinicId !== apt.clinicId
    ) {
      return { success: false, error: 'غير مصرح لموظف الاستقبال بنداء مرضى عيادة أخرى' };
    }

    if (apt.status !== 'CHECKED_IN' && apt.status !== 'CONFIRMED') {
      return { success: false, error: 'يمكن نداء أو إعادة نداء المرضى في حالة "مؤكد" أو "حضر المريض" فقط' };
    }

    const now = new Date().toISOString();
    const newCalledCount = (apt.calledCount || 0) + 1;
    const recallNote = newCalledCount > 1 ? `إعادة نداء المريض للمرة #${newCalledCount}` : 'نداء المريض وتسجيل الحضور بالعيادة';

    if (isSupabaseConfigured()) {
      try {
        const isRealJwt = userToken && userToken.startsWith('eyJ') && userToken.split('.').length === 3;
        let client: any = null;
        let staffUserId: string | null = null;

        if (isRealJwt) {
          client = createUserClient(userToken);
          staffUserId = isValidUuid(staffUser.id) ? staffUser.id : null;
        } else {
          const sys = await getSystemSupabaseClient();
          client = sys.client;
          staffUserId = sys.userId || (isValidUuid(staffUser.id) ? staffUser.id : null);
        }

        const { data, error: rpcError } = await (client as any).rpc('update_appointment_status_atomic', {
          p_appointment_id: apt.id,
          p_target_status: 'CHECKED_IN',
          p_staff_user_id: staffUserId,
          p_note: recallNote,
          p_caller_phone: null,
        });

        if (rpcError) {
          console.error('Supabase recallPatient RPC failed:', rpcError.message || rpcError.code);
          return { success: false, error: rpcError.message || 'فشل تسجيل نداء المريض في قاعدة البيانات المركزية.' };
        }

        if (data && !data.success) {
          return { success: false, error: data.error || 'تعذر تسجيل نداء المريض.' };
        }
      } catch (err: any) {
        console.error('Supabase recallPatient exception:', err?.message || 'Network error');
        return { success: false, error: 'تعذر الاتصال بقاعدة البيانات لتسجيل النداء.' };
      }
    } else if (!isMockStoreAllowed()) {
      return { success: false, error: 'خدمة نداء المرضى غير متصلة بقاعدة البيانات في بيئة الإنتاج.' };
    }

    apt.status = 'CHECKED_IN';
    apt.lastCalledAt = now;
    apt.calledCount = newCalledCount;
    apt.updatedAt = now;

    apt.statusHistory.push({
      status: 'CHECKED_IN',
      timestamp: now,
      note: recallNote,
      updatedBy: staffUser.name,
    });

    this.addAuditLog(
      staffUser.name,
      staffUser.role,
      'إعادة نداء المريض',
      `إعادة نداء مريض (${apt.clinicName}) للمرة #${apt.calledCount}`,
      apt.referenceNumber
    );

    return { success: true, appointment: apt };
  }

  public async transferClinic(
    id: string,
    targetClinicId: string,
    reason: string,
    staffUser: StaffUser,
    userToken?: string
  ): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    // 1. Validate Staff Authorization
    const apt = await this.getAppointmentByIdAsync(id, userToken);
    if (!apt) {
      return { success: false, error: 'الحجز غير موجود' };
    }

    if (staffUser.role === 'DOCTOR' && staffUser.clinicId) {
      if (apt.clinicId !== staffUser.clinicId) {
        return { success: false, error: 'الطبيب مصرح له فقط بتحويل الحالات المسجلة بعيادته الخاصة' };
      }
    }
    if (
      staffUser.role === 'RECEPTIONIST' &&
      staffUser.clinicId &&
      staffUser.clinicId !== 'general' &&
      staffUser.clinicId !== 'all' &&
      staffUser.username !== 'reception'
    ) {
      if (apt.clinicId !== staffUser.clinicId) {
        return { success: false, error: 'موظف الاستقبال غير مصرح له بتحويل حالات من عيادة أخرى' };
      }
    }

    const targetClinic = this.getClinicById(targetClinicId);
    if (!targetClinic) {
      return { success: false, error: 'العيادة المحول إليها غير متوفرة' };
    }

    if (!targetClinic.isActive) {
      return { success: false, error: 'العيادة المحول إليها غير مفعلة حالياً' };
    }

    if (apt.clinicId === targetClinicId) {
      return { success: false, error: 'المريض مسجل بالفعل في هذه العيادة' };
    }

    // 2. Validate Target Clinic Calendar & Schedule Precedence
    const scheduleException = await this.getClinicScheduleForDate(targetClinic.id, apt.appointmentDate);
    if (scheduleException?.isClosed) {
      return {
        success: false,
        error: `العيادة المحول إليها مغلقة في هذا التاريخ (${scheduleException.closureReason || 'عطلة رسمية'})`,
      };
    }
    if (!scheduleException) {
      const dayOfWeek = new Date(apt.appointmentDate + 'T12:00:00Z').getDay();
      if (!targetClinic.daysOfWeek.includes(dayOfWeek)) {
        return { success: false, error: 'العيادة المحول إليها لا تعمل في هذا اليوم (عطلة أسبوعية)' };
      }
    }
    const effectiveCapacity = scheduleException?.maxCapacity ?? targetClinic.maxDailySlots;

    // 3. Count Target Clinic Bookings & Execute Transfer
    let targetDayCount = 0;
    if (isSupabaseConfigured()) {
      try {
        const isRealJwt = userToken && userToken.startsWith('eyJ') && userToken.split('.').length === 3;
        let client: any = null;
        let staffUserId: string | null = null;

        if (isRealJwt) {
          client = createUserClient(userToken);
          staffUserId = isValidUuid(staffUser.id) ? staffUser.id : null;
        } else {
          const sys = await getSystemSupabaseClient();
          client = sys.client;
          staffUserId = sys.userId || (isValidUuid(staffUser.id) ? staffUser.id : null);
        }

        const { data, error: rpcError } = await (client as any).rpc('transfer_appointment_clinic_atomic', {
          p_appointment_id: apt.id,
          p_target_clinic_id: targetClinicId,
          p_staff_user_id: staffUserId,
          p_reason: reason || null,
        });

        if (rpcError) {
          console.error('Supabase transfer_appointment_clinic_atomic failed:', rpcError.message || rpcError.code);
          return { success: false, error: rpcError.message || 'فشل تحويل الحجز في قاعدة البيانات المركزية.' };
        }

        if (data && !data.success) {
          return { success: false, error: data.error || 'تعذر تحويل الحجز.' };
        }

        const newQueue = data?.appointment?.queue_number || (targetDayCount + 1);
        const oldClinicName = apt.clinicName;
        const now = new Date().toISOString();
        const transferNote = `تم التحويل من [${oldClinicName}] إلى [${targetClinic.name}] برقم دور جديد (#${newQueue}). السبب: ${reason || 'تحويل طبي داخلي'}`;

        apt.clinicId = targetClinic.id;
        apt.clinicName = targetClinic.name;
        apt.queueNumber = newQueue;
        apt.status = 'CONFIRMED';
        apt.updatedAt = now;

        apt.statusHistory.push({
          status: 'CONFIRMED',
          timestamp: now,
          note: transferNote,
          updatedBy: staffUser.name,
        });

        this.addAuditLog(
          staffUser.name,
          staffUser.role,
          'تحويل بين العيادات',
          transferNote,
          apt.referenceNumber
        );

        return { success: true, appointment: apt };
      } catch (err: any) {
        console.error('Supabase transferClinic exception:', err?.message || 'Network error');
        return { success: false, error: 'تعذر الاتصال بقاعدة البيانات لتحويل الحجز.' };
      }
    } else if (!isMockStoreAllowed()) {
      return { success: false, error: 'خدمة تحويل العيادات غير متصلة بقاعدة البيانات في بيئة الإنتاج.' };
    }

    targetDayCount = this.appointments.filter(
      (a) => a.clinicId === targetClinicId && a.appointmentDate === apt.appointmentDate && a.status !== 'CANCELLED'
    ).length;

    if (targetDayCount >= effectiveCapacity) {
      return {
        success: false,
        error: `عفواً، سعة العيادة المحول إليها مكتملة في هذا اليوم (${effectiveCapacity} مريض)`,
      };
    }

    const oldClinicName = apt.clinicName;
    const newQueue = targetDayCount + 1;
    const now = new Date().toISOString();
    const transferNote = `تم التحويل من [${oldClinicName}] إلى [${targetClinic.name}] برقم دور جديد (#${newQueue}). السبب: ${reason || 'تحويل طبي داخلي'}`;

    apt.clinicId = targetClinic.id;
    apt.clinicName = targetClinic.name;
    apt.queueNumber = newQueue;
    apt.status = 'CONFIRMED';
    apt.updatedAt = now;

    apt.statusHistory.push({
      status: 'CONFIRMED',
      timestamp: now,
      note: transferNote,
      updatedBy: staffUser.name,
    });

    this.addAuditLog(
      staffUser.name,
      staffUser.role,
      'تحويل بين العيادات',
      transferNote,
      apt.referenceNumber
    );

    return { success: true, appointment: apt };
  }

  public async cancelAppointment(
    idOrRef: string,
    reason?: string,
    caller?: { staffUser?: StaffUser; phoneNumber?: string; userToken?: string }
  ): Promise<{ success: boolean; error?: string }> {
    let apt = this.appointments.find((a) => a.id === idOrRef || a.referenceNumber === idOrRef);

    if (isSupabaseConfigured()) {
      try {
        const isRealJwt = caller?.userToken && caller.userToken.startsWith('eyJ') && caller.userToken.split('.').length === 3;
        let client: any = null;
        let staffUserId: string | null = null;

        if (isRealJwt) {
          client = createUserClient(caller!.userToken!);
          staffUserId = caller?.staffUser && isValidUuid(caller.staffUser.id) ? caller.staffUser.id : null;
        } else {
          const sys = await getSystemSupabaseClient();
          client = sys.client;
          staffUserId = sys.userId || (caller?.staffUser && isValidUuid(caller.staffUser.id) ? caller.staffUser.id : null);
        }
        if (!apt) {
          const { data: dbApt } = await (client as any)
            .from('appointments')
            .select('id, reference_number, clinic_id, clinic_name, patient_name, phone_number, appointment_date, appointment_time, status')
            .or(`id.eq.${idOrRef},reference_number.eq.${idOrRef}`)
            .maybeSingle();

          if (dbApt) {
            apt = {
              id: dbApt.id,
              referenceNumber: dbApt.reference_number,
              clinicId: dbApt.clinic_id,
              clinicName: dbApt.clinic_name,
              patientName: dbApt.patient_name,
              phoneNumber: dbApt.phone_number,
              appointmentDate: dbApt.appointment_date,
              appointmentTime: dbApt.appointment_time,
              status: dbApt.status,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              statusHistory: [],
            };
          }
        }

        if (!apt) {
          return { success: false, error: 'الموعد غير موجود' };
        }

        if (apt.status === 'COMPLETED' || apt.status === 'CANCELLED') {
          return { success: false, error: 'لا يمكن إلغاء حجز مكتمل أو ملغي مسبقاً' };
        }

        // Authorization checks: Only verified staff can cancel directly
        if (caller?.staffUser) {
          if (caller.staffUser.role === 'DOCTOR' && caller.staffUser.clinicId && apt.clinicId !== caller.staffUser.clinicId) {
            return { success: false, error: 'غير مصرح للطبيب بإلغاء حجز تابع لعيادة أخرى' };
          }
          if (
            caller.staffUser.role === 'RECEPTIONIST' &&
            caller.staffUser.clinicId &&
            caller.staffUser.clinicId !== 'general' &&
            caller.staffUser.clinicId !== 'all' &&
            caller.staffUser.username !== 'reception' &&
            apt.clinicId !== caller.staffUser.clinicId
          ) {
            return { success: false, error: 'غير مصرح لموظف الاستقبال بإلغاء حجز تابع لعيادة أخرى' };
          }
        } else {
          return { success: false, error: 'غير مصرح بإلغاء الحجز مباشرة. إلغاء الحجز متاح للموظفين المخولين فقط أو عبر تقديم طلب إلغاء للمراجعة.' };
        }

        const cancelNote = reason ? `تم الإلغاء: ${reason}` : `تم الإلغاء بواسطة ${caller.staffUser.name}`;

        const { data, error: rpcError } = await (client as any).rpc('update_appointment_status_atomic', {
          p_appointment_id: apt.id,
          p_target_status: 'CANCELLED',
          p_staff_user_id: staffUserId,
          p_note: cancelNote,
          p_caller_phone: null,
        });

        if (rpcError) {
          console.error('Supabase cancel RPC failed:', rpcError.message || rpcError.code);
          return { success: false, error: rpcError.message || 'فشل إلغاء الحجز في قاعدة البيانات المركزية.' };
        }

        if (data && !data.success) {
          return { success: false, error: data.error || 'تعذر إلغاء الحجز.' };
        }

        const now = new Date().toISOString();
        apt.status = 'CANCELLED';
        apt.updatedAt = now;
        return { success: true };
      } catch (err: any) {
        console.error('Supabase cancel exception:', err?.message || 'Network error');
        return { success: false, error: 'تعذر الاتصال بقاعدة البيانات لإلغاء الحجز.' };
      }
    } else if (!isMockStoreAllowed()) {
      return { success: false, error: 'خدمة إلغاء الحجز غير متصلة بقاعدة البيانات في بيئة الإنتاج.' };
    }

    if (!apt) {
      return { success: false, error: 'الموعد غير موجود' };
    }
    if (apt.status === 'COMPLETED' || apt.status === 'CANCELLED') {
      return { success: false, error: 'لا يمكن إلغاء حجز مكتمل أو ملغي مسبقاً' };
    }

    if (caller?.staffUser) {
      if (caller.staffUser.role === 'DOCTOR' && caller.staffUser.clinicId && apt.clinicId !== caller.staffUser.clinicId) {
        return { success: false, error: 'غير مصرح للطبيب بإلغاء حجز تابع لعيادة أخرى' };
      }
      if (
        caller.staffUser.role === 'RECEPTIONIST' &&
        caller.staffUser.clinicId &&
        caller.staffUser.clinicId !== 'general' &&
        caller.staffUser.clinicId !== 'all' &&
        caller.staffUser.username !== 'reception' &&
        apt.clinicId !== caller.staffUser.clinicId
      ) {
        return { success: false, error: 'غير مصرح لموظف الاستقبال بإلغاء حجز تابع لعيادة أخرى' };
      }
    } else {
      return { success: false, error: 'غير مصرح بإلغاء الحجز مباشرة. إلغاء الحجز متاح للموظفين المخولين فقط أو عبر تقديم طلب إلغاء للمراجعة.' };
    }

    const now = new Date().toISOString();
    apt.status = 'CANCELLED';
    apt.updatedAt = now;
    apt.statusHistory.push({
      status: 'CANCELLED',
      timestamp: now,
      note: reason ? `تم الإلغاء: ${reason}` : `تم الإلغاء بواسطة ${caller.staffUser.name}`,
      updatedBy: caller.staffUser.name,
    });

    this.addAuditLog(
      caller.staffUser.name,
      caller.staffUser.role,
      'إلغاء حجز',
      reason || 'طلب إلغاء الحجز',
      apt.referenceNumber
    );

    return { success: true };
  }

  public async requestCancellation(input: {
    referenceNumber: string;
    phoneNumber: string;
    reason?: string;
  }): Promise<{ success: boolean; requestId?: string; message?: string; error?: string }> {
    const cleanRef = (input.referenceNumber || '').trim().toUpperCase();
    const phoneCheck = normalizeAndValidateEgyptianPhone(input.phoneNumber || '');
    if (!cleanRef || !phoneCheck.isValid) {
      return { success: false, error: 'الرقم المرجعي ورقم الهاتف كلاهما مطلوب لتقديم طلب الإلغاء.' };
    }
    const cleanPhone = phoneCheck.normalized;

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { data, error: rpcError } = await (supabase as any).rpc('request_cancellation_atomic', {
          p_reference_number: cleanRef,
          p_phone_number: cleanPhone,
          p_reason: input.reason || null,
        });

        if (rpcError) {
          console.error('Supabase request_cancellation_atomic RPC error:', rpcError);
          return { success: false, error: rpcError.message || 'فشل تسجيل طلب الإلغاء في قاعدة البيانات.' };
        }

        if (data && !data.success) {
          return { success: false, error: data.error || 'تعذر تقديم طلب الإلغاء.' };
        }

        const apt = this.appointments.find((a) => a.referenceNumber === cleanRef);
        if (apt) {
          apt.hasPendingCancellation = true;
          this.cancellationRequests.push({
            id: data.request_id || `req-${Date.now()}`,
            appointmentId: apt.id,
            referenceNumber: apt.referenceNumber,
            phoneNumber: cleanPhone,
            reason: input.reason || 'طلب إلغاء من ولي الأمر عبر بوابة المتابعة',
            status: 'PENDING',
            requestedAt: new Date().toISOString(),
            patientName: apt.patientName,
            clinicId: apt.clinicId,
            clinicName: apt.clinicName,
            appointmentDate: apt.appointmentDate,
            currentAppointmentStatus: apt.status,
          });
        }

        return {
          success: true,
          requestId: data.request_id,
          message: data.message || 'تم استلام طلب الإلغاء بنجاح، وسيتم مراجعته بواسطة موظف الاستقبال بالمستشفى. يظل الحجز فعالاً حتى اعتماد الطلب.',
        };
      } catch (err: any) {
        console.error('requestCancellation exception:', err);
        return { success: false, error: 'تعذر الاتصال بقاعدة البيانات لتسجيل طلب الإلغاء.' };
      }
    } else if (!isMockStoreAllowed()) {
      return { success: false, error: 'خدمة طلب الإلغاء غير متصلة بقاعدة البيانات في بيئة الإنتاج.' };
    }

    // In-memory mock path
    const apt = this.appointments.find((a) => a.referenceNumber.toUpperCase() === cleanRef);
    if (!apt) {
      return { success: false, error: 'بيانات الحجز غير صحيحة أو غير متطابقة.' };
    }

    const aptPhoneCheck = normalizeAndValidateEgyptianPhone(apt.phoneNumber);
    if (aptPhoneCheck.normalized !== cleanPhone) {
      return { success: false, error: 'بيانات الحجز غير صحيحة أو غير متطابقة.' };
    }

    if (apt.status === 'COMPLETED') {
      return { success: false, error: 'لا يمكن تقديم طلب إلغاء لحجز تم الكشف عليه واكتماله مسبقاً.' };
    }

    if (apt.status === 'CANCELLED') {
      return { success: false, error: 'هذا الحجز ملغي مسبقاً بالفعل.' };
    }

    const existingPending = this.cancellationRequests.find(
      (r) => r.appointmentId === apt.id && r.status === 'PENDING'
    );
    if (existingPending) {
      return { success: false, error: 'يوجد طلب إلغاء قيد المراجعة بالفعل لهذا الحجز لدى موظفي الاستقبال.' };
    }

    const now = new Date().toISOString();
    const newReq: CancellationRequest = {
      id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      appointmentId: apt.id,
      referenceNumber: apt.referenceNumber,
      phoneNumber: cleanPhone,
      reason: input.reason || 'طلب إلغاء من ولي الأمر عبر بوابة المتابعة',
      status: 'PENDING',
      requestedAt: now,
      patientName: apt.patientName,
      clinicId: apt.clinicId,
      clinicName: apt.clinicName,
      appointmentDate: apt.appointmentDate,
      currentAppointmentStatus: apt.status,
    };

    this.cancellationRequests.push(newReq);
    apt.hasPendingCancellation = true;

    return {
      success: true,
      requestId: newReq.id,
      message: 'تم استلام طلب الإلغاء بنجاح، وسيتم مراجعته بواسطة موظف الاستقبال بالمستشفى. يظل الحجز فعالاً حتى اعتماد الطلب.',
    };
  }

  public async getCancellationRequests(
    filters?: { clinicId?: string; status?: string },
    staffUser?: StaffUser
  ): Promise<CancellationRequest[]> {
    if (staffUser?.role === 'DOCTOR') {
      return [];
    }
    if (staffUser?.role === 'RECEPTIONIST') {
      if (!staffUser.clinicId || staffUser.clinicId.trim() === '') {
        return [];
      }
    }

    let effectiveClinicId = filters?.clinicId;
    if (
      staffUser?.role === 'RECEPTIONIST' &&
      staffUser.clinicId &&
      staffUser.clinicId !== 'general' &&
      staffUser.clinicId !== 'all'
    ) {
      effectiveClinicId = staffUser.clinicId;
    }

    if (isSupabaseConfigured()) {
      try {
        const { client: supabase } = await getAuthenticatedServerClient();
        let query = (supabase as any)
          .from('cancellation_requests')
          .select(`
            id,
            appointment_id,
            reference_number,
            phone_number,
            reason,
            status,
            requested_at,
            reviewed_at,
            reviewed_by_id,
            reviewed_by_name,
            rejection_reason,
            appointments!inner (
              clinic_id,
              clinic_name,
              patient_name,
              appointment_date,
              status
            )
          `)
          .order('requested_at', { ascending: false });

        if (filters?.status && filters.status !== 'ALL') {
          query = query.eq('status', filters.status);
        }
        if (effectiveClinicId && effectiveClinicId !== 'ALL') {
          query = query.eq('appointments.clinic_id', effectiveClinicId);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          return data.map((r: any) => ({
            id: r.id,
            appointmentId: r.appointment_id,
            referenceNumber: r.reference_number,
            phoneNumber: r.phone_number,
            reason: r.reason,
            status: r.status,
            requestedAt: r.requested_at,
            reviewedAt: r.reviewed_at,
            reviewedById: r.reviewed_by_id,
            reviewedByName: r.reviewed_by_name,
            rejectionReason: r.rejection_reason,
            patientName: r.appointments?.patient_name,
            clinicId: r.appointments?.clinic_id,
            clinicName: r.appointments?.clinic_name,
            appointmentDate: r.appointments?.appointment_date,
            currentAppointmentStatus: r.appointments?.status,
          }));
        }
      } catch (err) {
        console.warn('Supabase getCancellationRequests error:', err);
      }
    }

    // In-memory fallback
    return this.cancellationRequests
      .map((r) => {
        const apt = this.appointments.find((a) => a.id === r.appointmentId || a.referenceNumber === r.referenceNumber);
        return {
          ...r,
          patientName: apt?.patientName || r.patientName,
          clinicId: apt?.clinicId || r.clinicId,
          clinicName: apt?.clinicName || r.clinicName,
          appointmentDate: apt?.appointmentDate || r.appointmentDate,
          currentAppointmentStatus: apt?.status || r.currentAppointmentStatus,
        };
      })
      .filter((r) => {
        if (filters?.status && filters.status !== 'ALL' && r.status !== filters.status) {
          return false;
        }
        if (effectiveClinicId && effectiveClinicId !== 'ALL' && r.clinicId !== effectiveClinicId) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  public async reviewCancellationRequest(
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    staffUser: StaffUser,
    reason?: string,
    userToken?: string
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    if (!staffUser || !staffUser.active) {
      return { success: false, error: 'غير مصرح: حساب الموظف غير نشط أو غير مسجل.' };
    }

    if (staffUser.role !== 'ADMIN' && staffUser.role !== 'RECEPTIONIST') {
      return { success: false, error: 'غير مصرح لهذا الدور بمراجعة طلبات الإلغاء. المراجعة مخصصة لموظفي الاستقبال وإدارة النظام فقط.' };
    }

    if (staffUser.role === 'RECEPTIONIST') {
      if (!staffUser.clinicId || staffUser.clinicId.trim() === '') {
        return { success: false, error: 'غير مصرح: موظف الاستقبال غير معين على عيادة محددة ولا يمكنه مراجعة طلبات الإلغاء.' };
      }
    }

    if (isSupabaseConfigured()) {
      try {
        const isRealJwt = userToken && userToken.startsWith('eyJ') && userToken.split('.').length === 3;
        let client: any = null;
        let staffUserId: string | null = null;

        if (isRealJwt) {
          client = createUserClient(userToken);
          staffUserId = isValidUuid(staffUser.id) ? staffUser.id : null;
        } else {
          const sys = await getSystemSupabaseClient();
          client = sys.client;
          staffUserId = sys.userId || (isValidUuid(staffUser.id) ? staffUser.id : null);
        }

        const { data, error: rpcError } = await (client as any).rpc('review_cancellation_request_atomic', {
          p_request_id: requestId,
          p_decision: decision,
          p_staff_user_id: staffUserId,
          p_reason: reason || null,
        });

        if (rpcError) {
          console.error('Supabase review_cancellation_request_atomic error:', rpcError);
          return { success: false, error: rpcError.message || 'فشل مراجعة طلب الإلغاء في قاعدة البيانات.' };
        }

        if (data && !data.success) {
          return { success: false, error: data.error || 'تعذر البت في طلب الإلغاء.' };
        }

        // Update local memory
        const req = this.cancellationRequests.find((r) => r.id === requestId);
        if (req) {
          req.status = decision;
          req.reviewedAt = new Date().toISOString();
          req.reviewedById = staffUser.id;
          req.reviewedByName = staffUser.name;
          if (decision === 'REJECTED') {
            req.rejectionReason = reason;
          }
          const apt = this.appointments.find((a) => a.id === req.appointmentId);
          if (apt) {
            apt.hasPendingCancellation = false;
            if (decision === 'APPROVED') {
              apt.status = 'CANCELLED';
            }
          }
        }

        return {
          success: true,
          message: data.message || (decision === 'APPROVED' ? 'تمت الموافقة على طلب الإلغاء وإلغاء الحجز.' : 'تم رفض طلب الإلغاء واستمرار الحجز.'),
        };
      } catch (err: any) {
        console.error('reviewCancellationRequest exception:', err);
        return { success: false, error: 'تعذر الاتصال بقاعدة البيانات لمراجعة طلب الإلغاء.' };
      }
    } else if (!isMockStoreAllowed()) {
      return { success: false, error: 'خدمة مراجعة طلبات الإلغاء غير متصلة بقاعدة البيانات في بيئة الإنتاج.' };
    }

    // In-memory mock path
    const req = this.cancellationRequests.find((r) => r.id === requestId);
    if (!req) {
      return { success: false, error: 'طلب الإلغاء غير موجود' };
    }

    if (req.status !== 'PENDING') {
      return { success: false, error: `تمت مراجعة هذا الطلب مسبقاً بحالة "${req.status}"` };
    }

    const apt = this.appointments.find((a) => a.id === req.appointmentId || a.referenceNumber === req.referenceNumber);
    if (!apt) {
      return { success: false, error: 'الحجز المرتبط بهذا الطلب غير موجود' };
    }

    // Clinic confinement check for receptionist
    if (staffUser.role === 'RECEPTIONIST') {
      if (!staffUser.clinicId || staffUser.clinicId.trim() === '') {
        return { success: false, error: 'غير مصرح: موظف الاستقبال غير معين على عيادة محددة ولا يمكنه مراجعة طلبات الإلغاء.' };
      }
      if (
        staffUser.clinicId !== 'general' &&
        staffUser.clinicId !== 'all' &&
        apt.clinicId !== staffUser.clinicId
      ) {
        return { success: false, error: 'غير مصرح لموظف الاستقبال بمراجعة طلبات إلغاء خاصة بعيادة أخرى.' };
      }
    }

    const now = new Date().toISOString();

    if (decision === 'APPROVED') {
      const auditNote = reason || `موافقة على طلب الإلغاء المقدم من ولي الأمر: ${req.reason || 'بدون سبب'}`;

      // Call central updateStatus to respect state machine transitions and protections
      const statusRes = await this.updateStatus(apt.id, 'CANCELLED', staffUser, auditNote);
      if (!statusRes.success) {
        return {
          success: false,
          error: `فشل إلغاء الحجز عبر المسار المركزي: ${statusRes.error || 'خطأ غير محدد'}`,
        };
      }

      apt.hasPendingCancellation = false;
      req.status = 'APPROVED';
      req.reviewedAt = now;
      req.reviewedById = staffUser.id;
      req.reviewedByName = staffUser.name;

      this.addAuditLog(
        staffUser.name,
        staffUser.role,
        'موافقة على إلغاء حجز',
        `طلب إلغاء (${req.id}): ${auditNote}`,
        apt.referenceNumber
      );

      return {
        success: true,
        message: 'تمت الموافقة على طلب الإلغاء وإلغاء الحجز بنجاح.',
      };
    } else {
      // REJECTED: APPOINTMENT STATUS REMAINS INTACT
      apt.hasPendingCancellation = false;
      const rejectNote = reason || 'رفض طلب الإلغاء واستمرار الحجز';

      apt.statusHistory.push({
        status: apt.status, // keeps current status
        timestamp: now,
        note: `تم رفض طلب الإلغاء: ${rejectNote}`,
        updatedBy: staffUser.name,
      });

      req.status = 'REJECTED';
      req.reviewedAt = now;
      req.reviewedById = staffUser.id;
      req.reviewedByName = staffUser.name;
      req.rejectionReason = rejectNote;

      this.addAuditLog(
        staffUser.name,
        staffUser.role,
        'رفض طلب إلغاء حجز',
        `طلب إلغاء (${req.id}) للحجز ${apt.referenceNumber}: ${rejectNote}`,
        apt.referenceNumber
      );

      return {
        success: true,
        message: 'تم رفض طلب الإلغاء واحتفاظ الحجز بحالته النشطة.',
      };
    }
  }

  public async getStaffAppointments(
    filters?: {
      clinicId?: string;
      status?: string;
      date?: string;
      search?: string;
    },
    staffUser?: StaffUser,
    userToken?: string
  ): Promise<Appointment[]> {
    // Strict Doctor clinic isolation
    let effectiveClinicId = filters?.clinicId;
    if (staffUser?.role === 'DOCTOR') {
      if (!staffUser.clinicId) {
        return []; // Doctor with no assigned clinic is denied access to all appointments
      }
      effectiveClinicId = staffUser.clinicId;
    }

    if (isSupabaseConfigured()) {
      try {
        const { client: supabase } = await getAuthenticatedServerClient(userToken);

        let query = supabase
          .from('appointments')
          .select('id, reference_number, clinic_id, clinic_name, patient_name, phone_number, patient_age, patient_address, appointment_date, appointment_time, status, queue_number, last_called_at, called_count, notes, created_at, updated_at')
          .order('appointment_date', { ascending: true })
          .order('queue_number', { ascending: true });

        if (effectiveClinicId && effectiveClinicId !== 'ALL') {
          query = query.eq('clinic_id', effectiveClinicId);
        }
        if (filters?.status && filters.status !== 'ALL') {
          query = query.eq('status', filters.status as any);
        }
        if (filters?.date && filters.date !== 'ALL') {
          query = query.eq('appointment_date', filters.date);
        }
        if (filters?.search) {
          const q = filters.search.trim();
          query = query.or(`patient_name.ilike.%${q}%,phone_number.ilike.%${q}%,reference_number.ilike.%${q}%`);
        }

        let { data, error } = await query;
        if (error) {
          // If user client hit permission issue, fallback to system client
          const { client: systemClient, authenticated: systemAuthenticated } = await getSystemSupabaseClient();
          let fallbackQuery = systemClient
            .from('appointments')
            .select('id, reference_number, clinic_id, clinic_name, patient_name, phone_number, patient_age, patient_address, appointment_date, appointment_time, status, queue_number, last_called_at, called_count, notes, created_at, updated_at')
            .order('appointment_date', { ascending: true })
            .order('queue_number', { ascending: true });
          if (effectiveClinicId && effectiveClinicId !== 'ALL') fallbackQuery = fallbackQuery.eq('clinic_id', effectiveClinicId);
          if (filters?.status && filters.status !== 'ALL') fallbackQuery = fallbackQuery.eq('status', filters.status as any);
          if (filters?.date && filters.date !== 'ALL') fallbackQuery = fallbackQuery.eq('appointment_date', filters.date);
          if (filters?.search) {
            const q = filters.search.trim();
            fallbackQuery = fallbackQuery.or(`patient_name.ilike.%${q}%,phone_number.ilike.%${q}%,reference_number.ilike.%${q}%`);
          }
          const fallbackRes = await fallbackQuery;
          if (!fallbackRes.error) {
            data = fallbackRes.data;
            error = null;
          } else if (!systemAuthenticated) {
            console.error('Supabase system client has no authenticated identity for staff appointments:', fallbackRes.error);
            throw new Error(
              'تعذر الوصول إلى بيانات الحجوزات: لا يوجد مفتاح خدمة (service_role) صالح ولا جلسة نظام موثقة. يرجى ضبط SUPABASE_SERVICE_ROLE_KEY بمفتاح service_role الحقيقي أو تزويد حساب الموظف في قاعدة البيانات عبر provision_staff_member.'
            );
          }
        }
        if (error) {
          console.error('Supabase fetch staff appointments error:', error);
          if (!isMockStoreAllowed()) {
            throw new Error('فشل جلب قائمة الحجوزات من قاعدة البيانات المركزية');
          }
        } else if (data) {
          return data.map((dbApt: any) => ({
            id: dbApt.id,
            referenceNumber: dbApt.reference_number,
            clinicId: dbApt.clinic_id,
            clinicName: dbApt.clinic_name,
            patientName: dbApt.patient_name,
            phoneNumber: dbApt.phone_number,
            patientAge: dbApt.patient_age || undefined,
            patientAddress: dbApt.patient_address || undefined,
            appointmentDate: dbApt.appointment_date,
            appointmentTime: dbApt.appointment_time,
            status: dbApt.status,
            queueNumber: dbApt.queue_number,
            lastCalledAt: dbApt.last_called_at || undefined,
            calledCount: dbApt.called_count || 0,
            notes: dbApt.notes || undefined,
            createdAt: dbApt.created_at,
            updatedAt: dbApt.updated_at,
            statusHistory: [],
          }));
        }
      } catch (err: any) {
        console.error('Supabase fetch staff appointments exception:', err?.message || err);
        if (!isMockStoreAllowed()) {
          throw err;
        }
      }
    } else if (!isMockStoreAllowed()) {
      throw new Error('قاعدة البيانات المركزية غير متصلة في بيئة الإنتاج');
    }

    // Local in-memory fallback (development & test mode only)
    let result = [...this.appointments];

    if (effectiveClinicId && effectiveClinicId !== 'ALL') {
      result = result.filter((a) => a.clinicId === effectiveClinicId);
    }

    if (filters?.status && filters.status !== 'ALL') {
      result = result.filter((a) => a.status === filters.status);
    }

    if (filters?.date && filters.date !== 'ALL') {
      result = result.filter((a) => a.appointmentDate === filters.date);
    }

    if (filters?.search) {
      const q = filters.search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.patientName.toLowerCase().includes(q) ||
          a.phoneNumber.includes(q) ||
          a.referenceNumber.toLowerCase().includes(q)
      );
    }

    return result;
  }
}

const globalForStore = globalThis as unknown as {
  appointmentStore?: AppointmentServiceStore;
};

export const appointmentStore = globalForStore.appointmentStore ?? new AppointmentServiceStore();
if (process.env.NODE_ENV !== 'production') {
  globalForStore.appointmentStore = appointmentStore;
}
