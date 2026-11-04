import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/authService';
import { STAFF_SESSION_COOKIE } from '@/lib/staffSessionCookie';

export async function POST(req: NextRequest) {
  try {
    const { currentPassword, newPassword } = await req.json().catch(() => ({}));

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'يرجى إدخال كلمة المرور الحالية وكلمة المرور الجديدة.' },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get('authorization') || '';
    const token =
      authHeader.replace('Bearer ', '').trim() ||
      req.cookies.get(STAFF_SESSION_COOKIE)?.value ||
      '';

    const staffUser = await AuthService.verifySession(token);
    if (!staffUser) {
      return NextResponse.json(
        { error: 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى.' },
        { status: 401 }
      );
    }

    const result = await AuthService.changePassword(
      staffUser,
      (currentPassword || '').toString(),
      (newPassword || '').toString()
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'تعذر تغيير كلمة المرور.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح. استخدم كلمة المرور الجديدة في تسجيل الدخول القادم.',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في الخادم أثناء تغيير كلمة المرور.' },
      { status: 500 }
    );
  }
}
