import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { AuthService } from '@/services/authService';
import { isTodayLocalDate } from '@/lib/rules';

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
        { error: 'غير مصرح لك بتغيير حالة الحجز. يرجى تسجيل دخول الموظفين.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { status, note } = body;

    if (!status) {
      return NextResponse.json({ error: 'الحالة المستهدفة مطلوبة' }, { status: 400 });
    }

    // Strict date scoping guard: queue actions (نداء / تم الكشف / تخطي) are
    // only allowed for appointments scheduled on the current system date.
    // Admin is exempt to allow legitimate corrections and reopen operations.
    if (status === 'CHECKED_IN' || status === 'COMPLETED' || status === 'SKIPPED') {
      if (staffUser.role !== 'ADMIN') {
        const existing = await appointmentStore.getAppointmentByIdAsync(id, token);
        if (!existing) {
          return NextResponse.json({ error: 'الموعد غير موجود' }, { status: 400 });
        }
        if (!isTodayLocalDate(existing.appointmentDate)) {
          return NextResponse.json(
            { error: 'لا يمكن نداء أو إنهاء كشف موعد في تاريخ غير تاريخ اليوم.' },
            { status: 400 }
          );
        }
      }
    }

    const result = await appointmentStore.updateStatus(id, status, staffUser, note, token);
    if (!result.success || !result.appointment) {
      return NextResponse.json({ error: result.error || 'تعذر تحديث الحالة' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم تحديث حالة الحجز بنجاح',
      appointment: result.appointment,
    });
  } catch (error) {
    console.error('Error updating status:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
