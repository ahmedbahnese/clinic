import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { checkRateLimit, checkIpRateLimit } from '@/lib/otp';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { normalizeAndValidateEgyptianPhone } from '@/lib/rules';

export async function POST(req: NextRequest) {
  try {
    // 1. IP Rate Limiting
    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
    const ipCheck = await checkIpRateLimit(clientIp);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        { error: `تم تجاوز الحد المسموح من المحاولات من هذا العنوان. يرجى الانتظار ${ipCheck.retryAfterSeconds} ثانية.` },
        { status: 429 }
      );
    }

    // 2. Parse Body
    const body = await req.json().catch(() => ({}));
    const { referenceNumber, phoneNumber, reason, turnstileToken } = body;

    if (!referenceNumber || !phoneNumber) {
      return NextResponse.json(
        { error: 'الرقم المرجعي ورقم الهاتف كلاهما مطلوب لتقديم طلب الإلغاء.' },
        { status: 400 }
      );
    }

    const cleanRef = String(referenceNumber).trim().toUpperCase();
    const phoneCheck = normalizeAndValidateEgyptianPhone(String(phoneNumber));
    if (!phoneCheck.isValid) {
      return NextResponse.json(
        { error: 'رقم الهاتف غير صالح. يرجى إدخال رقم هاتف محمول مصري صحيح مكون من 11 رقماً.' },
        { status: 400 }
      );
    }
    const cleanPhone = phoneCheck.normalized;

    // 3. Phone-based Rate Limiting (Max 5 requests per 10 minutes)
    const phoneRateCheck = await checkRateLimit(`cancel_req_${cleanPhone}`, 5, 600);
    if (!phoneRateCheck.allowed) {
      return NextResponse.json(
        { error: `تم تجاوز الحد المسموح من طلبات الإلغاء لهذا الرقم. يرجى الانتظار ${phoneRateCheck.retryAfterSeconds} ثانية قبل المحاولة مجدداً.` },
        { status: 429 }
      );
    }

    // 4. Turnstile Verification (Only when token provided and secret configured)
    if (turnstileToken && process.env.TURNSTILE_SECRET_KEY) {
      const turnstileRes = await verifyTurnstileToken(turnstileToken, clientIp);
      if (!turnstileRes.success) {
        return NextResponse.json(
          { error: turnstileRes.error || 'فشل التحقق الأمني من الرمز، يرجى المحاولة مرة أخرى.' },
          { status: 400 }
        );
      }
    }

    // 5. Submit Cancellation Request
    const result = await appointmentStore.requestCancellation({
      referenceNumber: cleanRef,
      phoneNumber: cleanPhone,
      reason: typeof reason === 'string' ? reason.trim().slice(0, 300) : undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'تعذر تقديم طلب الإلغاء.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message || 'تم إرسال طلب الإلغاء بنجاح وسيتم مراجعته بواسطة موظف الاستقبال بالمستشفى. يظل الحجز فعالاً حتى اعتماد الطلب.',
      requestId: result.requestId,
    });
  } catch (error) {
    console.error('Error submitting cancellation request:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء تقديم طلب الإلغاء.' }, { status: 500 });
  }
}

