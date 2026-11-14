import type { AppointmentStatus } from '../types/index.ts';

/**
 * Redacts a child's name for privacy in public tracking (e.g. "أحمد كريم محمود" -> "أحمد ك*** م***").
 * Keeps the first name visible for the guardian's confirmation while masking patronymic names.
 */
export function maskPatientName(name?: string | null): string {
  if (!name || typeof name !== 'string') return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    const single = parts[0];
    return single.length <= 2 ? single : single.slice(0, 2) + '***';
  }
  return parts
    .map((part, index) => {
      if (index === 0) return part;
      const firstChar = part.charAt(0);
      return `${firstChar}***`;
    })
    .join(' ');
}

/**
 * Validates Egyptian mobile phone numbers.
 * Must start with 010, 011, 012, or 015 and have exactly 11 digits.
 * Converts Arabic numerals (٠-٩) to standard digits.
 */
export function normalizeAndValidateEgyptianPhone(input: string): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  if (!input || typeof input !== 'string') {
    return { isValid: false, normalized: '', error: 'رقم الهاتف مطلوب' };
  }

  // Convert Arabic-Indic numerals to Latin digits
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let clean = input.trim();
  for (let i = 0; i < arabicNumerals.length; i++) {
    clean = clean.split(arabicNumerals[i]).join(String(i));
  }

  // Remove spaces, hyphens, parentheses
  clean = clean.replace(/[\s\-\(\)\+]/g, '');

  // Handle +20 or 20 country code
  if (clean.startsWith('0020')) {
    clean = clean.slice(4);
  } else if (clean.startsWith('20')) {
    clean = clean.slice(2);
  }

  // If missing leading zero but has 10 digits starting with 10, 11, 12, 15
  if (clean.length === 10 && /^(10|11|12|15)/.test(clean)) {
    clean = '0' + clean;
  }

  const regex = /^01[0125][0-9]{8}$/;
  if (!regex.test(clean)) {
    return {
      isValid: false,
      normalized: clean,
      error: 'يجب إدخال رقم هاتف محمول مصري صحيح مكون من 11 رقمًا (يبدأ بـ 010 أو 011 أو 012 أو 015)',
    };
  }

  return {
    isValid: true,
    normalized: clean,
  };
}

/**
 * Validates patient full name.
 * Requires at least 2 words (preferably 3 or 4 for quadruplicate name), min length 6 chars.
 */
export function validatePatientName(name: string): {
  isValid: boolean;
  error?: string;
} {
  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'اسم المريض مطلوب' };
  }

  const trimmed = name.trim();
  if (trimmed.length < 5) {
    return { isValid: false, error: 'يجب أن لا يقل اسم المريض عن 5 أحرف' };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return { isValid: false, error: 'يرجى إدخال اسم المريض ثنائي على الأقل (ويُفضل رباعي)' };
  }

  return { isValid: true };
}

/**
 * Validates allowed status transitions.
 *
 * Queue lifecycle:
 *   PENDING_REVIEW -> CONFIRMED | CANCELLED
 *   CONFIRMED      -> CHECKED_IN | SKIPPED | CANCELLED | PENDING_REVIEW
 *   CHECKED_IN     -> COMPLETED | SKIPPED | CANCELLED | CONFIRMED | CHECKED_IN
 *   SKIPPED        -> CHECKED_IN | CANCELLED   (إدخال الآن / إلغاء)
 *   COMPLETED      -> CHECKED_IN | CONFIRMED   (Admin-only reopen — the role
 *                      gate is enforced in AppointmentService.updateStatus and
 *                      in the update_appointment_status_atomic RPC)
 *   CANCELLED      -> (terminal)
 */
export function canTransitionStatus(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus
): boolean {
  if (currentStatus === targetStatus) return true;

  switch (currentStatus) {
    case 'PENDING_REVIEW':
      return targetStatus === 'CONFIRMED' || targetStatus === 'CANCELLED';
    case 'CONFIRMED':
      return targetStatus === 'CHECKED_IN' || targetStatus === 'SKIPPED' || targetStatus === 'CANCELLED';
    case 'CHECKED_IN':
      return (
        targetStatus === 'COMPLETED' ||
        targetStatus === 'SKIPPED' ||
        targetStatus === 'CANCELLED' ||
        targetStatus === 'CONFIRMED'
      );
    case 'SKIPPED':
      return targetStatus === 'CHECKED_IN' || targetStatus === 'CANCELLED';
    case 'COMPLETED':
      // Reopen is permitted by the state machine but gated to ADMIN at the
      // service and RPC layers (terminal state protection).
      return targetStatus === 'CHECKED_IN' || targetStatus === 'CONFIRMED';
    case 'CANCELLED':
      // Cancelled appointments cannot be reopened
      return false;
    default:
      return false;
  }
}

/**
 * Canonical normalization for patient name identity checks.
 * Trims leading/trailing whitespace, collapses internal whitespace to a single space, and lowercases.
 * Must match PostgreSQL: lower(regexp_replace(trim(patient_name), '\s+', ' ', 'g'))
 */
export function normalizePatientName(name?: string | null): string {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Generates an appointment reference code (e.g. BSCH-4819).
 * Uses CSPRNG (Web Crypto API) across server and client to minimize collision risk.
 */
export function generateReferenceNumber(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const array = new Uint32Array(1);
    globalThis.crypto.getRandomValues(array);
    const digits = 1000 + (array[0] % 9000);
    return `BSCH-${digits}`;
  }
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `BSCH-${digits}`;
}

/**
 * Returns Arabic badge display info for an appointment status.
 */
export function getStatusDisplay(status: AppointmentStatus): {
  label: string;
  color: string;
  bg: string;
  border: string;
} {
  switch (status) {
    case 'PENDING_REVIEW':
      return {
        label: 'قيد المراجعة',
        color: '#D97706',
        bg: '#FEF3C7',
        border: '#FDE68A',
      };
    case 'CONFIRMED':
      return {
        label: 'مؤكد',
        color: '#087F78',
        bg: '#E6F4F2',
        border: '#B2DFDB',
      };
    case 'CHECKED_IN':
      return {
        label: 'حضر المريض (في الدور)',
        color: '#2563EB',
        bg: '#DBEAFE',
        border: '#BFDBFE',
      };
    case 'SKIPPED':
      return {
        label: 'تم التخطي',
        color: '#C2410C',
        bg: '#FFEDD5',
        border: '#FDBA74',
      };
    case 'COMPLETED':
      return {
        label: 'مكتمل (تم الكشف)',
        color: '#15803D',
        bg: '#DCFCE7',
        border: '#BBF7D0',
      };
    case 'CANCELLED':
      return {
        label: 'ملغي',
        color: '#DC2626',
        bg: '#FEE2E2',
        border: '#FECACA',
      };
    default:
      return {
        label: 'غير معروف',
        color: '#64748B',
        bg: '#F1F5F9',
        border: '#E2E8F0',
      };
  }
}

/**
 * Formats a Date object to YYYY-MM-DD.
 */
export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Calculates a pediatric age from an ISO birth date without rounding up. */
export function calculatePatientAgeFromBirthDate(
  birthDate: string,
  now: Date = new Date()
): { isValid: boolean; formatted?: string; error?: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return { isValid: false, error: 'يرجى اختيار تاريخ ميلاد صحيح' };
  }
  const [year, month, day] = birthDate.split('-').map(Number);
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day || birth > now) {
    return { isValid: false, error: 'تاريخ ميلاد الطفل غير صحيح أو في المستقبل' };
  }
  let years = now.getFullYear() - year;
  let months = now.getMonth() - (month - 1);
  let days = now.getDate() - day;
  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years > 18 || (years === 18 && (months > 0 || days > 0))) {
    return { isValid: false, error: 'عمر الطفل يجب ألا يتجاوز 18 سنة' };
  }
  if (years > 0) return { isValid: true, formatted: `${years} سنة` };
  if (months > 0) return { isValid: true, formatted: `${months} شهر` };
  return { isValid: true, formatted: `${days} يوم` };
}

/**
 * Whether an appointment date (YYYY-MM-DD) matches the current system date.
 * Used by the queue date guard: calling (نداء) or completing (تم الكشف) an
 * appointment on any other date is strictly blocked.
 */
export function isTodayLocalDate(dateStr: string | null | undefined, now: Date = new Date()): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  return dateStr === formatLocalDate(now);
}

/**
 * Returns YYYY-MM-DD representing today in Africa/Cairo timezone.
 */
export function getTodayCairoDateString(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Checks whether an arrival date (YYYY-MM-DD) is today or in the future according to Africa/Cairo timezone.
 */
export function isDateTodayOrFutureInCairo(dateStr: string, now: Date = new Date()): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const todayCairo = getTodayCairoDateString(now);
  return dateStr >= todayCairo;
}

export type AgeUnit = 'يوم' | 'شهر' | 'سنة';

/**
 * Validates pediatric patient age per unit (days 0-30, months 1-36, years 1-18).
 */
export function validatePatientAge(
  val: string | number,
  unit: AgeUnit
): { isValid: boolean; error?: string; formatted?: string } {
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num)) {
    return { isValid: false, error: 'يرجى إدخال قيمة رقمية صحيحة لعمر الطفل' };
  }

  if (unit === 'يوم') {
    if (num < 0 || num > 30) {
      return { isValid: false, error: 'عمر الطفل بالأيام يجب أن يكون بين 0 و 30 يوماً' };
    }
  } else if (unit === 'شهر') {
    if (num < 1 || num > 36) {
      return { isValid: false, error: 'عمر الطفل بالشهور يجب أن يكون بين شهر و 36 شهراً' };
    }
  } else if (unit === 'سنة') {
    if (num < 1 || num > 18) {
      return { isValid: false, error: 'عمر الطفل بالسنوات في مستشفى الأطفال يجب أن يكون بين سنة و 18 سنة' };
    }
  } else {
    return { isValid: false, error: 'وحدة العمر غير معتمدة' };
  }

  return { isValid: true, formatted: `${num} ${unit}` };
}

/**
 * Validates Egyptian 14-digit Guardian National ID (optional field).
 */
export function validateGuardianNationalId(nid?: string | null): { isValid: boolean; error?: string } {
  if (!nid || nid.trim() === '') {
    return { isValid: true }; // Optional field
  }
  const clean = nid.trim().replace(/\s+/g, '');
  if (!/^[0-9]{14}$/.test(clean)) {
    return { isValid: false, error: 'الرقم القومي لولي الأمر يجب أن يتكون من 14 رقماً بالضبط' };
  }
  return { isValid: true };
}

/**
 * Formats a date string (YYYY-MM-DD) into Arabic human-readable format.
 */
export function formatArabicDate(dateStr: string): string {
  try {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const [year, month, day] = parts.map(Number);
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;
    const date = new Date(year, month - 1, day);
    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const arabicMonths = [
      'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const dayName = arabicDays[date.getDay()];
    const monthName = arabicMonths[month - 1];
    return `${dayName}، ${day} ${monthName} ${year}`;
  } catch {
    return dateStr;
  }
}
