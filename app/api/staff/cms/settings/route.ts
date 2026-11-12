import { NextRequest, NextResponse } from 'next/server';
import { cmsService } from '@/services/cmsService';
import { AuthService } from '@/services/authService';

function validateNoticeBar(noticeBar: any) {
  if (!noticeBar || typeof noticeBar !== 'object' || !Array.isArray(noticeBar.announcements)) return null;
  if (noticeBar.announcements.length > 100) return 'لا يمكن حفظ أكثر من 100 إعلان.';
  for (const item of noticeBar.announcements) {
    if (!item || typeof item.id !== 'string' || item.id.length > 120) return 'بيانات أحد الإعلانات غير صالحة.';
    if (typeof item.title !== 'string' || item.title.length > 180) return 'عنوان الإعلان اختياري وبحد أقصى 180 حرفاً.';
    const summary = typeof item.summary === 'string' ? item.summary : item.message;
    if (summary !== undefined && (typeof summary !== 'string' || summary.length > 500)) return 'نص الإعلان المختصر اختياري وبحد أقصى 500 حرف.';
    if (!(item.title?.trim() || summary?.trim() || item.details?.trim() || item.image_url || item.link_url)) return 'يجب أن يحتوي الإعلان على صورة أو تفاصيل أو رابط أو نص واحد على الأقل.';
    if (item.display?.placement && !['top', 'below_header', 'after_hero', 'after_primary_actions', 'after_clinics', 'after_how_it_works', 'before_footer', 'floating'].includes(item.display.placement)) return 'موضع أحد الإعلانات غير صالح.';
    if (item.display?.width && !['full', 'contained'].includes(item.display.width)) return 'عرض مستطيل أحد الإعلانات غير صالح.';
    if (item.display?.height && !['compact', 'standard'].includes(item.display.height)) return 'ارتفاع مستطيل أحد الإعلانات غير صالح.';
    if (item.image_3d !== undefined && typeof item.image_3d !== 'boolean') return 'إعداد الصورة ثلاثية الأبعاد غير صالح.';
    if (item.image_frameless !== undefined && typeof item.image_frameless !== 'boolean') return 'إعداد الصورة بدون إطار غير صالح.';
    const starts = item.starts_at ? Date.parse(item.starts_at) : NaN;
    const ends = item.ends_at ? Date.parse(item.ends_at) : NaN;
    if (item.starts_at && !Number.isFinite(starts)) return 'تاريخ بداية أحد الإعلانات غير صالح.';
    if (item.ends_at && !Number.isFinite(ends)) return 'تاريخ نهاية أحد الإعلانات غير صالح.';
    if (Number.isFinite(starts) && Number.isFinite(ends) && starts >= ends) return 'يجب أن تكون نهاية الإعلان بعد بدايته.';
    if (item.link_url && (typeof item.link_url !== 'string' || item.link_url.length > 1000 || /[\u0000-\u001f\\]/.test(item.link_url))) return 'رابط أحد الإعلانات غير صالح.';
    if (item.link_label !== undefined && (typeof item.link_label !== 'string' || item.link_label.length > 80)) return 'اسم زر الرابط يجب ألا يتجاوز 80 حرفًا.';
  }
  if (noticeBar.display?.autoplay_enabled !== undefined && typeof noticeBar.display.autoplay_enabled !== 'boolean') return 'إعداد التشغيل التلقائي غير صالح.';
  if (noticeBar.display?.autoplay_seconds !== undefined && (!Number.isFinite(Number(noticeBar.display.autoplay_seconds)) || Number(noticeBar.display.autoplay_seconds) < 2 || Number(noticeBar.display.autoplay_seconds) > 60)) return 'مدة الانتقال التلقائي يجب أن تكون بين ثانيتين و60 ثانية.';
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
