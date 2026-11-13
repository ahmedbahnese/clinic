import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/authService';
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { appointmentStore } from '@/services/appointmentService';

async function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  const user = await AuthService.verifySession(token);
  return user?.role === 'ADMIN' ? { user, token } : null;
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'صلاحية مدير النظام مطلوبة' }, { status: 403 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true, appointmentRetentionDays: 30, auditLogRetentionDays: 14 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('website_settings')
      .select('appointment_retention_days, audit_log_retention_days')
      .eq('id', 'default')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      success: true,
      appointmentRetentionDays: Number(data?.appointment_retention_days ?? 30),
      auditLogRetentionDays: Number(data?.audit_log_retention_days ?? 14),
    });
  } catch (error) {
    console.error('Retention settings GET error:', error);
    return NextResponse.json({ error: 'تعذر جلب إعدادات الاحتفاظ' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'صلاحية مدير النظام مطلوبة' }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 503 });

  try {
    const body = await req.json().catch(() => ({}));
    const appointmentRetentionDays = Number(body.appointmentRetentionDays);
    const auditLogRetentionDays = Number(body.auditLogRetentionDays);
    if (!Number.isInteger(appointmentRetentionDays) || appointmentRetentionDays < 30 || appointmentRetentionDays > 3650) {
      return NextResponse.json({ error: 'مدة الاحتفاظ بالحجوزات يجب أن تكون بين 30 و3650 يوماً.' }, { status: 400 });
    }
    if (!Number.isInteger(auditLogRetentionDays) || auditLogRetentionDays < 14 || auditLogRetentionDays > 3650) {
      return NextResponse.json({ error: 'مدة الاحتفاظ بسجل العمليات يجب أن تكون بين 14 و3650 يوماً.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('website_settings')
      .update({
        appointment_retention_days: appointmentRetentionDays,
        audit_log_retention_days: auditLogRetentionDays,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'default');
    if (error) throw error;

    appointmentStore.addAuditLog(
      session.user.name || 'مدير النظام',
      session.user.role,
      'تعديل مدد الاحتفاظ',
      `الحجوزات: ${appointmentRetentionDays} يوم، سجل العمليات: ${auditLogRetentionDays} يوم`
    );
    return NextResponse.json({ success: true, appointmentRetentionDays, auditLogRetentionDays });
  } catch (error) {
    console.error('Retention settings PATCH error:', error);
    return NextResponse.json({ error: 'تعذر حفظ إعدادات الاحتفاظ' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'صلاحية مدير النظام مطلوبة' }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'قاعدة البيانات غير مهيأة' }, { status: 503 });

  try {
    const supabase = createAdminClient();
    const { data, error } = await (supabase as any).rpc('cleanup_expired_clinic_records');
    if (error) throw error;
    appointmentStore.addAuditLog(
      session.user.name || 'مدير النظام',
      session.user.role,
      'تنظيف السجلات القديمة',
      `تم حذف ${Number(data?.appointments_deleted || 0)} حجز قديم و${Number(data?.audit_logs_deleted || 0)} سجل عمليات وفق مدد الاحتفاظ.`
    );
    return NextResponse.json(data || { success: true });
  } catch (error) {
    console.error('Manual retention cleanup error:', error);
    return NextResponse.json({ error: 'تعذر تشغيل تنظيف السجلات' }, { status: 500 });
  }
}
