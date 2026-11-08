import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { AuthService } from '@/services/authService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser || staffUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'صلاحية مدير النظام مطلوبة' }, { status: 403 });
    }

    const schedules = await appointmentStore.getClinicSchedules(id);
    return NextResponse.json({ success: true, schedules });
  } catch (error) {
    console.error('Error fetching clinic schedules:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser || staffUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'صلاحية مدير النظام مطلوبة' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const result = await appointmentStore.upsertClinicScheduleException(id, body, staffUser);

    if (!result.success || !result.schedule) {
      return NextResponse.json({ error: result.error || 'تعذر حفظ استثناء التقويم' }, { status: 400 });
    }

    return NextResponse.json({ success: true, schedule: result.schedule });
  } catch (error) {
    console.error('Error saving clinic schedule:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
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
      return NextResponse.json({ error: 'صلاحية مدير النظام مطلوبة' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const scheduleDate = body.scheduleDate || req.nextUrl.searchParams.get('date');

    if (!scheduleDate) {
      return NextResponse.json({ error: 'تاريخ الاستثناء مطلوب للحذف' }, { status: 400 });
    }

    const result = await appointmentStore.deleteClinicScheduleException(id, scheduleDate, staffUser);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'تعذر حذف الاستثناء' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'تم حذف استثناء التقويم بنجاح' });
  } catch (error) {
    console.error('Error deleting clinic schedule:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

