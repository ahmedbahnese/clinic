'use server';

import { headers } from 'next/headers';
import { appointmentStore } from '@/services/appointmentService';
import { calculatePatientAgeFromBirthDate, normalizeAndValidateEgyptianPhone, validatePatientName, validateGuardianNationalId } from '@/lib/rules';
import { checkIpRateLimit } from '@/lib/otp';
import { verifyTurnstileToken } from '@/lib/turnstile';
import type { Appointment } from '@/types';

export interface BookingFormData {
  clinicId: string;
  serviceId?: string;
  serviceName?: string;
  patientName: string;
  phoneNumber: string;
  patientBirthDate?: string;
  patientAge?: string;
  patientAddress: string;
  nationalId?: string;
  serviceType?: string;
  appointmentDate: string;
  appointmentTime?: string;
  notes?: string;
  turnstileToken?: string;
}

export async function submitBooking(data: BookingFormData): Promise<{
  success: boolean;
  appointment?: Appointment;
  error?: string;
}> {
  try {
    // 0. IP Rate Limiting (Persistent on Supabase, in-memory in dev fallback)
    const headerList = await headers();
    const forwardedFor = headerList.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (headerList.get('x-real-ip') || '127.0.0.1');
    const ipCheck = await checkIpRateLimit(clientIp);
    if (!ipCheck.allowed) {
      return {
        success: false,
        error: `تم تجاوز الحد الأقصى لعدد المحاولات المسموح به من هذا العنوان. يرجى الانتظار لمدة ${ipCheck.retryAfterSeconds || 60} ثانية قبل المحاولة مجدداً.`,
      };
    }

    // 1. Strict Business Logic Check: Walk-in Only services are rejected server-side
    if (data.serviceType === 'WALK_IN_PROCEDURE' || data.serviceType === 'EMERGENCY') {
      return {
        success: false,
        error:
          'هذه الخدمة لا تقبل الحجز الإلكتروني المسبق. يلزم الحضور المباشر للمستشفى، ويتم تسجيل الحالة في نفس اليوم عبر موظف الاستقبال بناءً على التقييم الطبي.',
      };
    }

    // 2. Validate patient name & length
    const nameCheck = validatePatientName(data.patientName);
    if (!nameCheck.isValid) {
      return {
        success: false,
        error: nameCheck.error || 'يرجى إدخال الاسم الرباعي بشكل صحيح',
      };
    }
    if (data.patientName.trim().length > 150) {
      return {
        success: false,
        error: 'اسم المريض طويل جداً (الحد الأقصى 150 حرفاً)',
      };
    }

    // 3. Validate patient address length
    if (data.patientAddress && data.patientAddress.trim().length > 250) {
      return {
        success: false,
        error: 'عنوان المريض طويل جداً (الحد الأقصى 250 حرفاً)',
      };
    }

    if (data.patientBirthDate) {
      const birthAge = calculatePatientAgeFromBirthDate(data.patientBirthDate);
      if (!birthAge.isValid) return { success: false, error: birthAge.error };
    }

    // 4. Validate notes length
    if (data.notes && data.notes.trim().length > 500) {
      return {
        success: false,
        error: 'الملاحظات الإضافية طويلة جداً (الحد الأقصى 500 حرفاً)',
      };
    }

    // 5. Validate Egyptian phone number
    const phoneCheck = normalizeAndValidateEgyptianPhone(data.phoneNumber);
    if (!phoneCheck.isValid) {
      return {
        success: false,
        error: phoneCheck.error || 'يرجى إدخال رقم هاتف محمول مصري صحيح مكون من 11 رقماً',
      };
    }

    // 6. Validate Guardian National ID if provided (optional 14 digits)
    if (data.nationalId && data.nationalId.trim().length > 0) {
      const nidCheck = validateGuardianNationalId(data.nationalId);
      if (!nidCheck.isValid) {
        return {
          success: false,
          error: nidCheck.error || 'الرقم القومي لولي الأمر غير صحيح، يجب أن يتكون من 14 رقماً',
        };
      }
    }

    // 7. Validate Date & Booking Horizon
    if (!data.appointmentDate) {
      return {
        success: false,
        error: 'يرجى اختيار تاريخ الموعد المناسب',
      };
    }

    const maxHorizonDate = new Date();
    maxHorizonDate.setUTCDate(maxHorizonDate.getUTCDate() + 30);
    const maxHorizonString = maxHorizonDate.toISOString().split('T')[0];
    if (data.appointmentDate > maxHorizonString) {
      return {
        success: false,
        error: 'الحجز الإلكتروني متاح بحد أقصى 30 يوماً مقدماً',
      };
    }

    // 8. Server validation of clinic operating days & calendar exceptions (Precedence Rule)
    const clinic = (await appointmentStore.getClinicByIdAsync(data.clinicId)) || appointmentStore.getClinicById(data.clinicId);
    if (!clinic || !clinic.isActive) {
      return {
        success: false,
        error: 'العيادة المختارة غير متاحة للحجز حالياً',
      };
    }

    const scheduleOverride = await appointmentStore.getClinicScheduleForDate(data.clinicId, data.appointmentDate);
    if (scheduleOverride) {
      if (scheduleOverride.isClosed) {
        return {
          success: false,
          error: `العيادة مغلقة في هذا التاريخ${scheduleOverride.closureReason ? ': ' + scheduleOverride.closureReason : ' نظراً لعطلة رسمية أو ظرف طارئ.'}، يرجى اختيار تاريخ آخر.`,
        };
      }
    } else {
      const appointmentDateObj = new Date(data.appointmentDate + 'T12:00:00Z');
      const dayOfWeek = appointmentDateObj.getUTCDay();
      if (!clinic.daysOfWeek.includes(dayOfWeek)) {
        return {
          success: false,
          error: 'العيادة المختارة لا تعمل في هذا اليوم (عطلة أسبوعية). يرجى اختيار يوم عمل رسمي للعيادة.',
        };
      }
    }

    // 9. Server validation of service-clinic match
    if (data.serviceId) {
      const clinicServices = await appointmentStore.getClinicServices(data.clinicId);
      const matched = clinicServices.find((s) => s.id === data.serviceId && s.isActive);
      if (!matched) {
        return {
          success: false,
          error: 'الخدمة المختارة غير متاحة في هذه العيادة أو تم إيقافها',
        };
      }
    }

    // 10. Create appointment in store / database
    const result = await appointmentStore.createAppointment({
      clinicId: data.clinicId,
      serviceId: data.serviceId,
      serviceName: data.serviceName,
      patientName: data.patientName.trim(),
      phoneNumber: phoneCheck.normalized,
      patientBirthDate: data.patientBirthDate,
      patientAge: data.patientAge?.trim(),
      patientAddress: data.patientAddress?.trim(),
      guardianNationalId: data.nationalId?.trim(),
      appointmentDate: data.appointmentDate,
      appointmentTime: data.appointmentTime || '09:00',
      notes: data.notes?.trim(),
    });

    if (!result.success || !result.appointment) {
      return {
        success: false,
        error: result.error || 'تعذر تسجيل طلب الحجز، يرجى المحاولة لاحقاً',
      };
    }

    return {
      success: true,
      appointment: result.appointment,
    };
  } catch (err: any) {
    console.error('Error in submitBooking server action:', err);
    return {
      success: false,
      error: 'حدث خطأ في معالجة طلب الحجز، يرجى إعادة المحاولة',
    };
  }
}
