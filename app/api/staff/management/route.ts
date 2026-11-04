import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/authService';
import { getAuthenticatedServerClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { STAFF_SESSION_COOKIE } from '@/lib/staffSessionCookie';

/**
 * BSCH Clinics — Staff Management List Endpoint (ADMIN only)
 *
 * Security chain:
 * 1. Token from the Authorization header (injected by middleware from the
 *    httpOnly cookie) or read directly from the cookie as fallback.
 * 2. AuthService.verifySession re-validates the token against Supabase Auth
 *    and re-reads the role from public.staff_profiles (server-enforced).
 * 3. Strict assertion: role === 'ADMIN' or 403.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token =
      authHeader.replace('Bearer ', '').trim() ||
      req.cookies.get(STAFF_SESSION_COOKIE)?.value ||
      '';

    const staffUser = await AuthService.verifySession(token);
    if (!staffUser) {
      return NextResponse.json(
        { error: 'غير مصرح بالوصول. يرجى تسجيل الدخول أولاً.' },
        { status: 401 }
      );
    }

    if (staffUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح: إدارة الموظفين متاحة لمدير النظام فقط.' },
        { status: 403 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'قاعدة البيانات غير مهيأة حالياً، يرجى المحاولة لاحقاً.' },
        { status: 500 }
      );
    }

    // Resilient client resolution: the caller's own verified session token
    // (ADMIN under RLS can read all staff_profiles), then the service-role
    // key, then the server-side system session. Never throws on env gaps.
    const { client } = await getAuthenticatedServerClient(token);
    if (!client) {
      return NextResponse.json(
        {
          error:
            'تعذر الوصول إلى قاعدة البيانات. تأكد من مفتاح الخدمة (SUPABASE_SERVICE_ROLE_KEY) أو بيانات حساب النظام (STAFF_DEFAULT_PASSWORD) ثم أعد النشر.',
        },
        { status: 500 }
      );
    }

    const { data, error } = await (client as any)
      .from('staff_profiles')
      .select('id, username, full_name, role, clinic_id, is_active, created_at, updated_at')
      .order('username', { ascending: true });

    if (error) {
      console.error('Staff management fetch error:', error);
      return NextResponse.json(
        { error: 'تعذر جلب قائمة الموظفين.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, staff: data || [] });
  } catch (error) {
    console.error('Staff management endpoint error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في الخادم أثناء جلب قائمة الموظفين.' },
      { status: 500 }
    );
  }
}
