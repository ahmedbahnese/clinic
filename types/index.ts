/**
 * Appointment lifecycle statuses.
 *
 * Queue lifecycle mapping (شاشة النداء وطابور العيادة):
 *   waiting     => CONFIRMED   (في الانتظار — default active queue state)
 *   in_progress => CHECKED_IN  (جاري الكشف / داخل العيادة)
 *   skipped     => SKIPPED     (تم التخطي — absent/stepped out, kept for manual call)
 *   completed   => COMPLETED   (تم الكشف — retained for daily counters and audit)
 *   cancelled   => CANCELLED   (ملغي)
 */
export type AppointmentStatus =
  | 'PENDING_REVIEW'   // قيد المراجعة
  | 'CONFIRMED'        // مؤكد (في الانتظار)
  | 'CHECKED_IN'       // حضر المريض (جاري الكشف / في قائمة النداء)
  | 'SKIPPED'          // تم التخطي (مؤقتاً خارج الطابور وقابل للنداء اليدوي)
  | 'COMPLETED'        // مكتمل (تم الكشف)
  | 'CANCELLED';       // ملغي

export interface StatusHistoryItem {
  status: AppointmentStatus;
  timestamp: string;
  note?: string;
  updatedBy?: string;
}

export interface ClinicService {
  id: string;
  clinicId: string;
  name: string;
  requiredDocuments: string[];
  instructions: string;
  maxDailyCapacity?: number;
  exceptionDate?: string;
  exceptionCapacity?: number;
  exceptionOnly?: boolean;
  isWalkInOnly?: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClinicScheduleException {
  id: string;
  clinicId: string;
  scheduleDate: string; // YYYY-MM-DD
  maxCapacity?: number;
  isClosed: boolean;
  closureReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Clinic {
  id: string;
  name: string;
  description?: string;
  location: string;
  workingHours: string;
  daysOfWeek: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday (Egypt outpatient usually Sun-Thu or Sat-Thu)
  maxDailySlots: number;
  slotDurationMinutes: number;
  instructions?: string;
  requiredDocuments?: string[];
  services?: ClinicService[];
  isActive: boolean;
  isHospitalConfirmed?: boolean;
}

export interface AppointmentSlot {
  id: string;
  clinicId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  capacity: number;
  bookedCount: number;
  isAvailable: boolean;
}

export interface Appointment {
  id: string;
  referenceNumber: string; // e.g. BSCH-7492
  clinicId: string;
  clinicName: string;
  serviceId?: string;
  serviceName?: string;
  patientName: string;
  phoneNumber: string;
  patientAge?: string;
  dateOfBirth?: string; // YYYY-MM-DD — authoritative age source; patientAge is derived from it
  patientAddress?: string;
  guardianNationalId?: string;
  bookingCode?: string; // One-time unhashed CSPRNG booking code returned only on creation
  bookingCodeHash?: string;
  requiredDocuments?: string[];
  serviceInstructions?: string;
  appointmentDate: string; // YYYY-MM-DD
  appointmentTime: string; // HH:mm
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  feePaid?: number;
  queueNumber?: number;
  lastCalledAt?: string;
  calledCount?: number;
  isVerified?: boolean;
  hasPendingCancellation?: boolean;
  statusHistory: StatusHistoryItem[];
}

export interface CancellationRequest {
  id: string;
  appointmentId: string;
  referenceNumber: string;
  phoneNumber: string;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  reviewedAt?: string;
  reviewedById?: string;
  reviewedByName?: string;
  rejectionReason?: string;
  patientName?: string;
  clinicId?: string;
  clinicName?: string;
  appointmentDate?: string;
  currentAppointmentStatus?: AppointmentStatus;
}

export type StaffRole = 'ADMIN' | 'RECEPTIONIST' | 'DOCTOR';

export interface StaffUser {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
  clinicId?: string;
  active: boolean;
}

export interface CreateAppointmentInput {
  clinicId: string;
  serviceId?: string;
  serviceName?: string;
  patientName: string;
  phoneNumber: string;
  patientAge?: string;
  dateOfBirth?: string; // YYYY-MM-DD — when present, the server/RPC derives patientAge from it
  patientAddress?: string;
  guardianNationalId?: string;
  notes?: string;
  appointmentDate: string;
  appointmentTime?: string;
  isWalkIn?: boolean;
  staffUserId?: string;
  /** Verified staff bearer token used to preserve auth.uid() in staff RPC calls. */
  staffAuthToken?: string;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  staffName: string;
  staffRole: string;
  action: string;
  details: string;
  referenceNumber?: string;
}
