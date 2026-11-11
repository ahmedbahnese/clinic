import { NextRequest, NextResponse } from 'next/server';
import { cmsService } from '@/services/cmsService';
import { AuthService } from '@/services/authService';

function validateNoticeBar(noticeBar: any) {
  if (!noticeBar || typeof noticeBar !== 'object' || !Array.isArray(noticeBar.announcements)) return null;
  if (noticeBar.announcements.length > 100) return 'لا يمكن حفظ أكثر من 100 إعلان.';
  for (const item of noticeBar.announcements) {
    if (!item || typeof item.id !== 'string' || item.id.length > 120) return 'بيانات أحد الإعلانات غير صالحة.';
    if (typeof item.title !== 'string' || item.title.trim().length < 1 || item.title.length > 180) return 'عنوان الإعلان مطلوب وبحد أقصى 180 حرفاً.';
    const summary = typeof item.summary === 'string' ? item.summary : item.message;
    if (typeof summary !== 'string' || summary.trim().length < 1 || summary.length > 500) return 'نص الإعلان المختصر مطلوب وبحد أقصى 500 حرف.';
    const starts = item.starts_at ? Date.parse(item.starts_at) : NaN;
    const ends = item.ends_at ? Date.parse(item.ends_at) : NaN;
    if (item.starts_at && !Number.isFinite(starts)) return 'تاريخ بداية أحد الإعلانات غير صالح.';
    if (item.ends_at && !Number.isFinite(ends)) return 'تاريخ نهاية أحد الإعلانات غير صالح.';
    if (Number.isFinite(starts) && Number.isFinite(ends) && starts >= ends) return 'يجب أن تكون نهاية الإعلان بعد بدايته.';
    if (item.link_url && (typeof item.link_url !== 'string' || item.link_url.length > 1000 || /[\u0000-\u001f\\]/.test(item.link_url))) return 'رابط أحد الإعلانات غير صالح.';
  }
  return null;
}

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

    const body = await req.json().catch(() => ({}));
    const noticeError = validateNoticeBar(body.notice_bar);
    if (noticeError) return NextResponse.json({ error: noticeError }, { status: 400 });
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
