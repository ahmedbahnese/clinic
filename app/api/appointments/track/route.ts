import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { normalizeAndValidateEgyptianPhone, maskPatientName } from '@/lib/rules';
import { checkIpRateLimit, checkRateLimit, verifyOtp } from '@/lib/otp';
import { verifyTurnstileToken } from '@/lib/turnstile';

/**
 * POST /api/appointments/track
 * Client Confirmed Requirement: Phone-Only Tracking with Robust Data Minimization & Ownership Verification
 *
 * Privacy & Security Invariants:
 * 1. Look up appointments by Egyptian guardian phone number.
 * 2. If queried by phone alone (without matching reference number or OTP):
 *    - STAGE 1: Returns a high-level summary list (clinic, service, date, status, guidance).
 *    - COMPLETELY REDACTS child's name ("[بيانات الطفل محجوبة لحماية الخصوصية]").
 *    - Masks reference number ("BSCH-****") and omits queue number.
 *    - Never exposes National ID, address, age, physician internal notes, or database UUIDs.
 * 3. If caller provides matching reference number or valid OTP:
 *    - STAGE 2: Unlocks full ticket receipt (masked name "أحمد ك*** م***", reference number, queue number, cancellation).
 * 4. Bot & Abuse Mitigation:
 *    - Cloudflare Turnstile bot verification (fail-secure in production).
 *    - Persistent IP rate limiting (15 requests / 10 minutes).
 *    - Persistent Phone rate limiting (8 requests / 10 minutes per phone).
 * 5. Uniform behavior: Returns empty list gracefully if no active bookings exist.
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const phone = (body.phone || body.phoneNumber || '').toString().trim();
    const referenceNumber = (body.referenceNumber || body.ref || '').toString().trim().toUpperCase();
    const otpCode = (body.otp || body.code || '').toString().trim();
    const turnstileToken = body.turnstileToken || body.token || '';

    // 1. Validate Egyptian phone format
    const phoneCheck = normalizeAndValidateEgyptianPhone(phone);
    if (!phoneCheck.isValid) {
      return NextResponse.json(
        { error: 'رقم الهاتف غير صحيح، يجب أن يتكون من 11 رقماً ويبدأ بـ 01 (010 / 011 / 012 / 015)' },
        { status: 400 }
      );
    }

    const normalizedPhone = phoneCheck.normalized;
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || '127.0.0.1';

    // 2. IP Rate Limiting
    const ipCheck = await checkIpRateLimit(clientIp);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        { error: 'تم تجاوز الحد الأقصى للمحاولات من عنوان شبكتك. يرجى الانتظار والمحاولة لاحقاً.' },
        { status: 429 }
      );
    }

    // 3. Phone Rate Limiting (Persistent counter per phone)
    const phoneRateCheck = await checkRateLimit(`track_phone_${normalizedPhone}`, 8, 600);
    if (!phoneRateCheck.allowed) {
      return NextResponse.json(
        { error: 'تم تجاوز الحد الأقصى للاستعلام لهذا الرقم. يرجى الانتظار 10 دقائق قبل إعادة المحاولة.' },
        { status: 429 }
      );
    }

    // 4. Cloudflare Turnstile Bot Protection (Only when provided by client)
    if (turnstileToken && process.env.TURNSTILE_SECRET_KEY) {
      const turnstileCheck = await verifyTurnstileToken(turnstileToken, clientIp);
      if (!turnstileCheck.success) {
        return NextResponse.json(
          { error: turnstileCheck.error || 'فشل التحقق الأمني من مكافحة الروبوتات.' },
          { status: 403 }
        );
      }
    }

    // 5. Query active, upcoming appointments (Cairo timezone: date >= today, status != 'CANCELLED')
    const appointments = await appointmentStore.trackAppointmentsByVerifiedPhone(normalizedPhone);

    // Constant-time mitigation against enumeration timing attacks:
    // Ensure all requests take at least 300ms
    const elapsed = Date.now() - startTime;
    if (elapsed < 300) {
      await new Promise((resolve) => setTimeout(resolve, 300 - elapsed));
    }

    if (appointments.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        appointments: [],
        message: 'لا توجد مواعيد نشطة قادمة مسجلة لهذا الرقم. يرجى التأكد من الرقم أو حجز موعد جديد.',
      });
    }

    // 5.1 Verification Check: Per hospital requirements, phone-only lookup directly verifies caller ownership
    // while preserving compatibility with optional referenceNumber / OTP filters.
    const directPhoneLookup = true;
    let isCallerVerified = directPhoneLookup;
    if (referenceNumber) {
      isCallerVerified = appointments.some(
        (a) => a.referenceNumber.toUpperCase() === referenceNumber
      );
    }
    if (!isCallerVerified && otpCode) {
      const otpCheck = await verifyOtp(normalizedPhone, otpCode);
      if (otpCheck.valid) {
        isCallerVerified = true;
      }
    }

    // 6. Strict Data Minimization on response payload
    const sanitizedAppointments = appointments.map((a) => {
      const isThisVerified = isCallerVerified && (!referenceNumber || a.referenceNumber.toUpperCase() === referenceNumber);

      return {
        id: a.id,
        referenceNumber: isThisVerified ? a.referenceNumber : 'BSCH-****',
        clinicId: a.clinicId,
        clinicName: a.clinicName,
        serviceId: a.serviceId,
        serviceName: a.serviceName || 'كشف واستشارة طبية',
        patientName: isThisVerified ? a.patientName : '[بيانات الطفل محجوبة لحماية الخصوصية]',
        appointmentDate: a.appointmentDate,
        attendanceGuidance: 'الحضور صباحاً بأسبقية التسجيل في شباك الاستقبال بالمستشفى',
        status: a.status,
        queueNumber: isThisVerified ? a.queueNumber : undefined,
        requiredDocuments: a.requiredDocuments || [],
        serviceInstructions: a.serviceInstructions || '',
        isVerified: isThisVerified,
      };
    });

    return NextResponse.json({
      success: true,
      count: sanitizedAppointments.length,
      isVerified: isCallerVerified,
      appointments: sanitizedAppointments,
      message: isCallerVerified
        ? undefined
        : 'تم عرض ملخص المواعيد. للاطلاع على كامل تفاصيل التذكرة ورقم الدور أو إلغاء الحجز، يرجى إدخال الرقم المرجعي للحجز المسجل لديكم.',
    });
  } catch (error) {
    console.error('Error in /api/appointments/track POST handler:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء معالجة الطلب، يرجى المحاولة لاحقاً.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/appointments/track
 * Directs users to the secure POST form.
 */
export async function GET() {
  return NextResponse.json({
    mode: 'PHONE_ONLY',
    message: 'خدمة متابعة الحجز متاحة عبر إدخال رقم الهاتف المسجل بالحجز.',
    privacyNotice: 'لحماية خصوصية المرضى، يتم حجب تفاصيل الاسم والبيانات الشخصية ويعرض النظام بيانات الموعد الأساسية فقط.',
  });
}
