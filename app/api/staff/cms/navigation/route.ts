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
        { error: 'غير مصرح بتعديل روابط القوائم. صلاحية مدير النظام مطلوبة.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const items = Array.isArray(body) ? body : body.items;

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'صيغة بيانات عناصر القائمة غير صحيحة' }, { status: 400 });
    }

    const result = await cmsService.updateNavigation(items, staffUser, token);
    if (!result.success || !result.navigation) {
      return NextResponse.json({ error: result.error || 'فشل في تحديث عناصر القوائم' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم حفظ عناصر التنقل ونشرها بنجاح',
      navigation: result.navigation,
    });
  } catch (error) {
    console.error('Error updating navigation items:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء تحديث عناصر القوائم' }, { status: 500 });
  }
}

