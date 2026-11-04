import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/authService';
import { STAFF_SESSION_COOKIE } from '@/lib/staffSessionCookie';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim() || req.cookies.get(STAFF_SESSION_COOKIE)?.value || '';
    if (token) {
      await AuthService.revokeSession(token);
    }
  } catch (error) {
    console.error('Logout error:', error);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(STAFF_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
