import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/authService';
import { STAFF_SESSION_COOKIE } from '@/lib/staffSessionCookie';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader
      ? authHeader.replace('Bearer ', '').trim()
      : (req.cookies.get(STAFF_SESSION_COOKIE)?.value || '');
    const user = await AuthService.verifySession(token);

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({ authenticated: true, user });
  } catch (error) {
    console.error('Session verify error:', error);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
