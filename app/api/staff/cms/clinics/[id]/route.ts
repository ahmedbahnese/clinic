import { NextRequest, NextResponse } from 'next/server';
import { cmsService } from '@/services/cmsService';
import { AuthService } from '@/services/authService';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser || staffUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح بتعديل بيانات عرض العيادة. صلاحية مدير النظام مطلوبة.' },
        { status: 403 }
      );
    }

    const updates = await req.json().catch(() => ({}));
    const result = await cmsService.updateClinicPresentation(id, updates, staffUser, token);

    if (!result.success || !result.clinic) {
      return NextResponse.json({ error: result.error || 'فشل في تحديث بيانات عرض العيادة' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `تم تحديث مظهر (${result.clinic.name}) ونشره بنجاح`,
      clinic: result.clinic,
    });
  } catch (error) {
    console.error('Error updating clinic presentation:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء تحديث بيانات العيادة' }, { status: 500 });
  }
}

