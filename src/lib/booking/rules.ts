/** Pure booking-domain rules. These checks are a convenience layer only; SQL/RLS and
 * transactional server-side checks remain authoritative for production writes. */

export const STAFF_ROLES = ["booking", "doctor", "nurse", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const BOOKING_STATUSES = [
  "Pending",
  "Confirmed",
  "Cancelled",
  "NoShow",
  "Completed",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type BookingMode = "public" | "internal";
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface BookingClinicOption {
  id: string;
  active?: boolean;
}

export interface BookingServiceOption {
  id: string;
  clinicId: string;
  /** True when this service may only be booked by staff in person. */
  directOnly: boolean;
  active?: boolean;
}

export interface BookingInput {
  patientName: unknown;
  age: unknown;
  phone: unknown;
  address: unknown;
  clinicId: unknown;
  serviceId: unknown;
  date: unknown;
}

export interface BookingValidationContext {
  /** Current civil date in YYYY-MM-DD form; supplied by the caller for determinism. */
  today: string;
  clinics: readonly BookingClinicOption[];
  services: readonly BookingServiceOption[];
  mode: BookingMode;
}

export type BookingValidationIssueCode =
  | "patient_name_required"
  | "age_invalid"
  | "phone_invalid"
  | "address_required"
  | "address_too_long"
  | "clinic_required"
  | "clinic_unavailable"
  | "service_required"
  | "service_unavailable"
  | "service_clinic_mismatch"
  | "service_direct_only"
  | "date_invalid"
  | "date_in_past"
  | "reference_date_invalid";

export interface BookingValidationIssue {
  code: BookingValidationIssueCode;
  field: "patientName" | "age" | "phone" | "address" | "clinicId" | "serviceId" | "date";
}

export interface NormalizedBookingData {
  patientName: string;
  normalizedPatientName: string;
  age: string;
  phone: string;
  normalizedPhone: string;
  address: string;
  clinicId: string;
  serviceId: string;
  date: string;
}

export interface BookingValidationResult {
  valid: boolean;
  issues: BookingValidationIssue[];
  value?: NormalizedBookingData;
}

export const MAX_ADDRESS_LENGTH = 500;
export const MAX_AGE_TEXT_LENGTH = 40;
export const MIN_PHONE_DIGITS = 7;
export const MAX_PHONE_DIGITS = 15;

/** Convert Arabic-Indic and Persian digits to ASCII digits. */
function toAsciiDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * Produce a comparison/storage-friendly phone representation (digits only).
 * This deliberately does not infer a country code or equate local and E.164 forms.
 */
export function normalizePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  return toAsciiDigits(value).replace(/\D/g, "");
}

/** Accept a 7–15 digit phone with optional leading + and common visual separators. */
export function isValidPhone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const input = toAsciiDigits(value).trim();
  if (!/^\+?[0-9\s().-]+$/.test(input)) return false;
  const digits = input.replace(/\D/g, "");
  return digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS;
}

/** Normalize names for display-independent duplicate comparison. */
export function normalizePatientName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, "")
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Validate and normalize a booking request without performing I/O. */
export function validateBookingInput(
  input: BookingInput,
  context: BookingValidationContext,
): BookingValidationResult {
  const issues: BookingValidationIssue[] = [];
  const add = (code: BookingValidationIssueCode, field: BookingValidationIssue["field"]) => {
    issues.push({ code, field });
  };

  const patientName = typeof input.patientName === "string" ? input.patientName.trim() : "";
  const normalizedPatientName = normalizePatientName(patientName);
  if (!normalizedPatientName) add("patient_name_required", "patientName");

  const age = typeof input.age === "string" ? input.age.trim() : "";
  if (!age || age.length > MAX_AGE_TEXT_LENGTH) add("age_invalid", "age");

  if (!isValidPhone(input.phone)) add("phone_invalid", "phone");

  const address = typeof input.address === "string" ? input.address.trim() : "";
  if (!address) add("address_required", "address");
  else if (address.length > MAX_ADDRESS_LENGTH) add("address_too_long", "address");

  const clinicId = typeof input.clinicId === "string" ? input.clinicId.trim() : "";
  const serviceId = typeof input.serviceId === "string" ? input.serviceId.trim() : "";
  if (!clinicId) add("clinic_required", "clinicId");
  const clinic = clinicId ? context.clinics.find((item) => item.id === clinicId) : undefined;
  if (clinicId && (!clinic || clinic.active === false)) add("clinic_unavailable", "clinicId");

  if (!serviceId) add("service_required", "serviceId");
  const service = serviceId ? context.services.find((item) => item.id === serviceId) : undefined;
  if (serviceId && (!service || service.active === false)) add("service_unavailable", "serviceId");
  if (service && clinicId && service.clinicId !== clinicId) {
    add("service_clinic_mismatch", "serviceId");
  }
  if (service?.directOnly && context.mode === "public") add("service_direct_only", "serviceId");

  if (!isIsoDate(context.today)) add("reference_date_invalid", "date");
  if (!isIsoDate(input.date)) add("date_invalid", "date");
  else if (isIsoDate(context.today) && input.date < context.today) add("date_in_past", "date");

  if (issues.length > 0) return { valid: false, issues };

  const phone = input.phone as string;
  return {
    valid: true,
    issues,
    value: {
      patientName,
      normalizedPatientName,
      age,
      phone: toAsciiDigits(phone).trim(),
      normalizedPhone: normalizePhone(phone),
      address,
      clinicId,
      serviceId,
      date: input.date as string,
    },
  };
}

export function isCapacityConsumingStatus(status: BookingStatus): boolean {
  return status === "Pending" || status === "Confirmed";
}

export interface CapacityBooking {
  clinicId: string;
  serviceId: string;
  date: string;
  status: BookingStatus;
}

/** Count only Pending/Confirmed bookings; optional serviceId gives the service sub-count. */
export function countActiveBookings(
  bookings: readonly CapacityBooking[],
  clinicId: string,
  date: string,
  serviceId?: string,
): number {
  return bookings.filter(
    (booking) =>
      booking.clinicId === clinicId &&
      booking.date === date &&
      isCapacityConsumingStatus(booking.status) &&
      (serviceId === undefined || booking.serviceId === serviceId),
  ).length;
}

export interface CapacityCheckInput {
  clinicCapacity: number | null;
  serviceCapacity: number | null;
  /** Active bookings only, for the clinic and date. */
  currentClinicCount: number;
  /** Active bookings only, for the selected service and date. */
  currentServiceCount: number;
}

export type CapacityFailureReason = "invalid_capacity_or_count" | "clinic_full" | "service_full";
export interface CapacityCheckResult {
  allowed: boolean;
  reason?: CapacityFailureReason;
}

/**
 * Check the clinic-wide shared ceiling and the selected service sub-ceiling
 * independently. A null capacity means no configured ceiling; the limits are
 * never added together.
 */
export function checkBookingCapacity(input: CapacityCheckInput): CapacityCheckResult {
  const validLimit = (value: number | null) =>
    value === null || (Number.isInteger(value) && value >= 0);
  const validCount = (value: number) => Number.isInteger(value) && value >= 0;
  if (
    !validLimit(input.clinicCapacity) ||
    !validLimit(input.serviceCapacity) ||
    !validCount(input.currentClinicCount) ||
    !validCount(input.currentServiceCount)
  ) {
    return { allowed: false, reason: "invalid_capacity_or_count" };
  }
  if (input.clinicCapacity !== null && input.currentClinicCount >= input.clinicCapacity) {
    return { allowed: false, reason: "clinic_full" };
  }
  if (input.serviceCapacity !== null && input.currentServiceCount >= input.serviceCapacity) {
    return { allowed: false, reason: "service_full" };
  }
  return { allowed: true };
}

export interface BookingDuplicateIdentity {
  patientName: string;
  phone: string;
  clinicId: string;
  date: string;
  status: BookingStatus;
}

/** Same normalized phone + patient name in the same clinic/day, among active bookings only. */
export function hasDuplicateBooking(
  candidate: Omit<BookingDuplicateIdentity, "status">,
  existing: readonly BookingDuplicateIdentity[],
): boolean {
  const phone = normalizePhone(candidate.phone);
  const name = normalizePatientName(candidate.patientName);
  if (!phone || !name) return false;
  return existing.some(
    (booking) =>
      isCapacityConsumingStatus(booking.status) &&
      booking.clinicId === candidate.clinicId &&
      booking.date === candidate.date &&
      normalizePhone(booking.phone) === phone &&
      normalizePatientName(booking.patientName) === name,
  );
}

const WEEKDAY_IDS: Readonly<Record<string, IsoWeekday>> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
  "الاثنين": 1,
  "الثلاثاء": 2,
  "الاربعاء": 3,
  "الخميس": 4,
  "الجمعة": 5,
  "السبت": 6,
  "الاحد": 7,
};

/** Convert full English or Arabic weekday names to ISO weekday numbers, preserving order. */
export function weekdayNamesToIsoDays(names: readonly string[]): IsoWeekday[] {
  return names.map((name) => {
    const key = normalizePatientName(name);
    const weekday = WEEKDAY_IDS[key];
    if (weekday === undefined) throw new RangeError(`Unknown weekday name: ${name}`);
    return weekday;
  });
}
