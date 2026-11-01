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
        { error: 'غير مصرح لك بإعادة نداء المريض. يرجى تسجيل الدخول.' },
        { status: 401 }
      );
    }

    const result = await appointmentStore.recallPatient(id, staffUser, token);
    if (!result.success || !result.appointment) {
      return NextResponse.json({ error: result.error || 'تعذر إعادة نداء المريض' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `تمت إعادة نداء المريض ${result.appointment.patientName} بنجاح`,
      appointment: result.appointment,
    });
  } catch (error) {
    console.error('Error in recall API:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
