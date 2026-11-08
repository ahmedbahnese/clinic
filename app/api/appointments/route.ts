import { NextRequest, NextResponse } from 'next/server';
import { appointmentStore } from '@/services/appointmentService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { clinicId, patientName, phoneNumber, patientAge, patientAddress, appointmentDate, appointmentTime } = body;

    if (!clinicId || !patientName || !phoneNumber || !appointmentDate) {
      return NextResponse.json(
        { error: 'جميع الحقول المطلوبة (العيادة، اسم المريض، رقم الهاتف، والتاريخ) يجب ملؤها.' },
        { status: 400 }
      );
    }

    const result = await appointmentStore.createAppointment({
      clinicId,
      patientName,
      phoneNumber,
      patientAge,
      patientAddress,
      appointmentDate,
      appointmentTime,
    });

    if (!result.success || !result.appointment) {
      return NextResponse.json(
        { error: result.error || 'تعذر تسجيل الحجز، يرجى المحاولة لاحقاً.' },
        { status: 400 }
      );
    }

    const { appointmentTime: _removedTime, ...restAppointment } = result.appointment;
    const sanitizedAppointment = {
      ...restAppointment,
      attendanceGuidance: 'الحضور صباحاً بأسبقية التسجيل في شباك الاستقبال بالمستشفى',
    };

    return NextResponse.json(
      {
        success: true,
        message: 'تم تسجيل طلب الحجز بنجاح',
        appointment: sanitizedAppointment,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating appointment:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء معالجة الطلب' }, { status: 500 });
  }
}
