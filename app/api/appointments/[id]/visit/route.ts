import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { AuthService } from '@/services/authService';
import { Appointment } from '@/types';

/**
 * PATCH /api/appointments/[id]/visit — تعديل الكشف بعد الإتمام
 *
 * Allows an ADMIN (or the assigned DOCTOR) to update diagnosis notes and the
 * fee paid on a visit record. An optional `reopenStatus` lets the ADMIN
 * revert an accidentally completed visit back to in_progress (CHECKED_IN)
 * or waiting (CONFIRMED); non-admins are rejected by the hardened terminal
 * state protection.
 */
export async function PATCH(
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
        { error: 'غير مصرح بتعديل بيانات الكشف. يرجى تسجيل الدخول.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const notes = typeof body.notes === 'string' ? body.notes : undefined;
    const feePaid = typeof body.feePaid === 'number' ? body.feePaid : undefined;
    const reopenStatus = body.reopenStatus;

    let updatedAppointment: { success: boolean; appointment?: Appointment; error?: string } | undefined;

    // Optional reopen (Admin-only via the central state machine protections)
    if (reopenStatus === 'CHECKED_IN' || reopenStatus === 'CONFIRMED') {
      const reopenResult = await appointmentStore.updateStatus(
        id,
        reopenStatus,
        staffUser,
        'إعادة فتح الكشف بعد التعديل (تصحيح إتمام خاطئ)',
        token
      );
      if (!reopenResult.success) {
        return NextResponse.json(
          { error: reopenResult.error || 'تعذر إعادة فتح الكشف.' },
          { status: 400 }
        );
      }
      updatedAppointment = reopenResult;
    } else if (reopenStatus !== undefined && reopenStatus !== null && reopenStatus !== '') {
      return NextResponse.json(
        { error: 'حالة إعادة الفتح المطلوبة غير صالحة.' },
        { status: 400 }
      );
    }

    // Only touch visit details when the caller actually supplied new data
    if (notes !== undefined || feePaid !== undefined) {
      const result = await appointmentStore.updateVisitDetails(
        id,
        { notes, feePaid },
        staffUser,
        token
      );
      if (!result.success || !result.appointment) {
        return NextResponse.json({ error: result.error || 'تعذر تعديل بيانات الكشف' }, { status: 400 });
      }
      updatedAppointment = result;
    }

    return NextResponse.json({
      success: true,
      message: reopenStatus
        ? 'تم تعديل الكشف وإعادة فتح الزيارة بنجاح.'
        : 'تم حفظ تعديلات الكشف بنجاح.',
      appointment: updatedAppointment?.appointment,
    });
  } catch (error) {
    console.error('Error updating visit details:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
