import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { AuthService } from '@/services/authService';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser || staffUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح بالوصول إلى إدارة العيادات. هذه الصفحة مخصصة لمدير النظام فقط.' },
        { status: 403 }
      );
    }

    const clinics = appointmentStore.getAllClinicsIncludingInactive();
    return NextResponse.json({ success: true, clinics });
  } catch (error) {
    console.error('Error fetching admin clinics:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser || staffUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح بإنشاء عيادات جديدة. هذه الصلاحية مخصصة لمدير النظام فقط.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const result = await appointmentStore.createClinic(body, staffUser);

    if (!result.success || !result.clinic) {
      return NextResponse.json({ error: result.error || 'تعذر إنشاء العيادة' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `تم إنشاء عيادة ${result.clinic.name} بنجاح`,
      clinic: result.clinic,
    });
  } catch (error) {
    console.error('Error creating clinic:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
