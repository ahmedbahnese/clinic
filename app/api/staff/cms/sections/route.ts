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
        { error: 'غير مصرح بتعديل أقسام الصفحة الرئيسية. صلاحية مدير النظام مطلوبة.' },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (body.action === 'reorder') {
      if (!Array.isArray(body.sections)) {
        return NextResponse.json({ error: 'قائمة ترتيب الأقسام غير صحيحة' }, { status: 400 });
      }

      const result = await cmsService.reorderSections(body.sections, staffUser, token);
      if (!result.success) {
        return NextResponse.json({ error: result.error || 'فشل في إعادة ترتيب الأقسام' }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: 'تم تحديث ترتيب الأقسام ونشره بنجاح',
        sections: result.sections,
      });
    }

    const { sectionId, updates } = body;
    if (!sectionId || !updates) {
      return NextResponse.json({ error: 'معرّف القسم والبيانات المطلوبة للتعديل ناقصة' }, { status: 400 });
    }

    const result = await cmsService.updateSection(sectionId, updates, staffUser, token);
    if (!result.success || !result.section) {
      return NextResponse.json({ error: result.error || 'فشل في تحديث بيانات القسم' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `تم تحديث قسم (${result.section.title || sectionId}) ونشره بنجاح`,
      section: result.section,
    });
  } catch (error) {
    console.error('Error updating CMS section:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء تحديث القسم' }, { status: 500 });
  }
}

