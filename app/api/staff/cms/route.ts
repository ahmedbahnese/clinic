import { NextRequest, NextResponse } from 'next/server';
import { cmsService } from '@/services/cmsService';
import { AuthService } from '@/services/authService';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser || staffUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح بالوصول إلى إدارة الموقع. صلاحية مدير النظام مطلوبة.' },
        { status: 403 }
      );
    }

    const data = await cmsService.getCmsDashboardData(token);
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error('Error fetching admin CMS data:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

