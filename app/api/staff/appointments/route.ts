import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { AuthService } from '@/services/authService';
import { STAFF_SESSION_COOKIE } from '@/lib/staffSessionCookie';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader
      ? authHeader.replace('Bearer ', '').trim()
      : (req.cookies.get(STAFF_SESSION_COOKIE)?.value || '');
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
    const date = searchParams.get('date') || undefined;
    const search = searchParams.get('search') || undefined;

    // If staff user is a doctor assigned to a specific clinic, constrain to their clinic
    if (staffUser.role === 'DOCTOR' && staffUser.clinicId) {
      clinicId = staffUser.clinicId;
    }

    const appointments = await appointmentStore.getStaffAppointments(
      {
        clinicId,
        status,
        date,
        search,
      },
      staffUser,
      token
    );

    return NextResponse.json({
      success: true,
      user: {
        id: staffUser.id,
        username: staffUser.username,
        name: staffUser.name,
        role: staffUser.role,
        clinicId: staffUser.clinicId,
      },
      appointments,
    });
  } catch (error: any) {
    console.error('Error fetching staff appointments:', error);
    const message =
      error?.message && typeof error.message === 'string'
        ? error.message
        : 'تعذر جلب حجوزات الموظفين';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
