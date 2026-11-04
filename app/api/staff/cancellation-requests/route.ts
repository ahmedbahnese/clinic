import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { AuthService } from '@/services/authService';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser) {
      return NextResponse.json(
        { error: 'غير مصرح بالوصول إلى لوحة الموظفين. يرجى تسجيل الدخول أولاً.' },
        { status: 401 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    let clinicId = searchParams.get('clinicId') || undefined;
    const status = searchParams.get('status') || undefined;

    // Clinic confinement and role check
    if (staffUser.role !== 'ADMIN' && staffUser.role !== 'RECEPTIONIST') {
      return NextResponse.json(
        { error: 'غير مصرح لهذا الدور بالاطلاع على طلبات الإلغاء.' },
        { status: 403 }
      );
    }

    if (staffUser.role === 'RECEPTIONIST') {
      if (!staffUser.clinicId || staffUser.clinicId.trim() === '') {
        return NextResponse.json(
          { error: 'غير مصرح لموظف الاستقبال غير المعين على عيادة بالاطلاع على طلبات الإلغاء.' },
          { status: 403 }
        );
      }
      if (staffUser.clinicId !== 'general' && staffUser.clinicId !== 'all') {
        clinicId = staffUser.clinicId;
      }
    }

    const requests = await appointmentStore.getCancellationRequests(
      { clinicId, status },
      staffUser
    );

    return NextResponse.json({
      success: true,
      user: {
        id: staffUser.id,
        name: staffUser.name,
        role: staffUser.role,
        clinicId: staffUser.clinicId,
      },
      requests,
    });
  } catch (error) {
    console.error('Error fetching cancellation requests:', error);
    return NextResponse.json({ error: 'تعذر جلب طلبات الإلغاء' }, { status: 500 });
  }
}

