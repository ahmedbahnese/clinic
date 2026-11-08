import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { AuthService } from '@/services/authService';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser) {
      return NextResponse.json(
        { error: 'غير مصرح لك بتحويل المريض. يرجى تسجيل الدخول.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { targetClinicId, reason } = body;

    if (!targetClinicId) {
      return NextResponse.json({ error: 'العيادة المحول إليها مطلوبة' }, { status: 400 });
    }

    const result = await appointmentStore.transferClinic(id, targetClinicId, reason, staffUser, token);
    if (!result.success || !result.appointment) {
      return NextResponse.json({ error: result.error || 'تعذر تحويل المريض' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `تم تحويل المريض إلى ${result.appointment.clinicName} برقم دور جديد #${result.appointment.queueNumber}`,
      appointment: result.appointment,
    });
  } catch (error) {
    console.error('Error in transfer API:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
