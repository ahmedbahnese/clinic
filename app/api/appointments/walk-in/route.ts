import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';
import { AuthService } from '@/services/authService';
import { formatLocalDate } from '@/lib/rules';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser || (staffUser.role !== 'RECEPTIONIST' && staffUser.role !== 'ADMIN')) {
      return NextResponse.json(
        { error: 'غير مصرح لك بإجراء حجز حضوري سريع. يرجى تسجيل الدخول بحساب استقبال أو مدير.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { clinicId, serviceId, patientName, phoneNumber, patientAge, patientAddress, appointmentDate, appointmentTime } = body;

    if (!clinicId || !patientName || !phoneNumber) {
      return NextResponse.json(
        { error: 'حقول العيادة، اسم المريض، ورقم الهاتف إلزامية للحجز الحضوري' },
        { status: 400 }
      );
    }

    // Strict Clinic Authorization: Receptionist assigned to a specific clinic cannot book in other clinics
    if (
      staffUser.role === 'RECEPTIONIST' &&
      staffUser.clinicId &&
      staffUser.clinicId !== 'general' &&
      staffUser.clinicId !== 'all' &&
      staffUser.clinicId !== clinicId
    ) {
      return NextResponse.json(
        { error: 'موظف الاستقبال غير مخول بالحجز لعيادة أخرى غير العيادة المخصصة له.' },
        { status: 403 }
      );
    }

    const todayStr = formatLocalDate();
    const targetDate = appointmentDate || todayStr;

    const result = await appointmentStore.createAppointment({
      clinicId,
      serviceId: serviceId || undefined,
      patientName,
      phoneNumber,
      patientAge,
      patientAddress,
      appointmentDate: targetDate,
      appointmentTime: appointmentTime || '09:00',
      isWalkIn: true,
      staffUserId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffUser.id) ? staffUser.id : undefined,
    });

    if (!result.success || !result.appointment) {
      return NextResponse.json(
        { error: result.error || 'تعذر تسجيل الحجز الحضوري' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `تم تسجيل الحجز الحضوري بنجاح برقم دور #${result.appointment.queueNumber} ورقم مرجعي ${result.appointment.referenceNumber}`,
      appointment: result.appointment,
    });
  } catch (error) {
    console.error('Error in walk-in booking API:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
