import { NextRequest, NextResponse } from 'next/server';
import { cmsService } from '@/services/cmsService';
import { AuthService } from '@/services/authService';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser || staffUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح بتعديل إعدادات الموقع. صلاحية مدير النظام مطلوبة.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const result = await cmsService.updateSettings(body, staffUser, token);

    if (!result.success || !result.settings) {
      return NextResponse.json(
        { error: result.error || 'فشل في حفظ إعدادات الموقع' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'تم حفظ إعدادات الموقع ونشرها بنجاح',
      settings: result.settings,
    });
  } catch (error) {
    console.error('Error updating CMS settings:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء حفظ الإعدادات' }, { status: 500 });
  }
}

