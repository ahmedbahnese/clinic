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
        { error: 'غير مصرح بالبت في طلبات الإلغاء. يرجى تسجيل الدخول أولاً.' },
        { status: 401 }
      );
    }

    if (staffUser.role !== 'ADMIN' && staffUser.role !== 'RECEPTIONIST') {
      return NextResponse.json(
        { error: 'غير مصرح لهذا الدور بمراجعة طلبات الإلغاء. المراجعة مخصصة لموظفي الاستقبال وإدارة النظام فقط.' },
        { status: 403 }
      );
    }

    if (staffUser.role === 'RECEPTIONIST' && (!staffUser.clinicId || staffUser.clinicId.trim() === '')) {
      return NextResponse.json(
        { error: 'غير مصرح لموظف الاستقبال غير المعين على عيادة بمراجعة طلبات الإلغاء.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { decision, reason } = body;

    if (!decision || (decision !== 'APPROVED' && decision !== 'REJECTED')) {
      return NextResponse.json(
        { error: 'قرار المراجعة غير صالح. يجب اختيار إما APPROVED أو REJECTED.' },
        { status: 400 }
      );
    }

    const result = await appointmentStore.reviewCancellationRequest(
      id,
      decision,
      staffUser,
      typeof reason === 'string' ? reason.trim().slice(0, 300) : undefined,
      token
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'تعذر البت في طلب الإلغاء' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message || (decision === 'APPROVED' ? 'تمت الموافقة على طلب الإلغاء وإلغاء الحجز.' : 'تم رفض طلب الإلغاء واستمرار الحجز.'),
    });
  } catch (error) {
    console.error('Error reviewing cancellation request:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء مراجعة طلب الإلغاء' }, { status: 500 });
  }
}

