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
      return NextResponse.json({ error: 'صلاحية غير مصرح بها' }, { status: 403 });
    }

    const services = await appointmentStore.getClinicServices(id);
    return NextResponse.json({ success: true, services });
  } catch (error) {
    console.error('Error fetching admin clinic services:', error);
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
      return NextResponse.json({ error: 'صلاحية غير مصرح بها' }, { status: 403 });
    }

    const body = await req.json();
    const result = await appointmentStore.createClinicService(id, body, staffUser, token);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'تعذر إضافة الخدمة' }, { status: 400 });
    }

    return NextResponse.json({ success: true, service: result.service });
  } catch (error) {
    console.error('Error creating clinic service:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

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
      return NextResponse.json({ error: 'صلاحية غير مصرح بها' }, { status: 403 });
    }

    const body = await req.json();
    const { serviceId, ...updates } = body;

    if (!serviceId) {
      return NextResponse.json({ error: 'معرف الخدمة مطلوب' }, { status: 400 });
    }

    const result = await appointmentStore.updateClinicService(id, serviceId, updates, staffUser, token);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'تعذر تحديث الخدمة' }, { status: 400 });
    }

    return NextResponse.json({ success: true, service: result.service });
  } catch (error) {
    console.error('Error updating clinic service:', error);
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
      return NextResponse.json({ error: 'صلاحية غير مصرح بها' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const serviceId = body.serviceId || req.nextUrl.searchParams.get('serviceId');

    if (!serviceId) {
      return NextResponse.json({ error: 'معرف الخدمة مطلوب' }, { status: 400 });
    }

    const result = await appointmentStore.deleteClinicService(id, serviceId, staffUser, token);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'تعذر حذف الخدمة' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      deactivated: result.deactivated,
      message: result.message,
    });
  } catch (error) {
    console.error('Error deleting clinic service:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

