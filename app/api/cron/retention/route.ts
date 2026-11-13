import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin';

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = req.headers.get('authorization') || '';
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'قاعدة البيانات غير مهيأة' }, { status: 503 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await (supabase as any).rpc('cleanup_expired_clinic_records');
    if (error) {
      console.error('Retention cleanup RPC error:', error);
      return NextResponse.json({ success: false, error: 'تعذر تشغيل تنظيف السجلات' }, { status: 500 });
    }
    return NextResponse.json(data || { success: true });
  } catch (error) {
    console.error('Retention cleanup error:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء تنظيف السجلات' }, { status: 500 });
  }
}
