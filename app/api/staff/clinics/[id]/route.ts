import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
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
        { error: 'غير مصرح بتعديل إعدادات العيادة. صلاحية مدير النظام مطلوبة.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const result = await appointmentStore.updateClinic(id, body, staffUser);

    if (!result.success || !result.clinic) {
      return NextResponse.json({ error: result.error || 'تعذر تحديث العيادة' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `تم تحديث بيانات ${result.clinic.name} بنجاح`,
      clinic: result.clinic,
    });
  } catch (error) {
    console.error('Error updating clinic:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return PATCH(req, context);
}

export async function DELETE(
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
        { error: 'غير مصرح بحذف العيادات. صلاحية مدير النظام مطلوبة.' },
        { status: 403 }
      );
    }

    const result = await appointmentStore.deleteClinic(id, staffUser);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'تعذر معالجة طلب حذف العيادة' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      deactivated: result.deactivated,
      message: result.message,
    });
  } catch (error) {
    console.error('Error deleting clinic:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
