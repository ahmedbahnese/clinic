import { NextRequest, NextResponse } from 'next/server';
import { STAFF_SESSION_COOKIE } from '@/lib/staffSessionCookie';

const STAFF_LOGIN_PATH = '/staff/login';

/**
 * BSCH Clinics — Staff Area Protection (Defense in Depth — Layer 1)
 *
 * 1. /staff/* pages (except the login page itself) redirect instantly to
 *    /staff/login when the server-issued session cookie is missing.
 *    Strict session verification happens server-side in
 *    app/staff/(protected)/layout.tsx and in every staff API route.
 * 2. /api/staff/* and /api/auth/* requests without an Authorization header
 *    inherit the session cookie value, so API routes keep enforcing
 *    AuthService.verifySession on every call.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(STAFF_SESSION_COOKIE)?.value || '';

  // API routes: bridge the httpOnly cookie into the Authorization header
  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader && sessionToken) {
      const headers = new Headers(request.headers);
      headers.set('authorization', `Bearer ${sessionToken}`);
      return NextResponse.next({ request: { headers } });
    }
    return NextResponse.next();
  }

  // Staff pages: instant redirect for missing sessions
  if (pathname.startsWith('/staff') && pathname !== STAFF_LOGIN_PATH) {
    if (!sessionToken) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = STAFF_LOGIN_PATH;
      loginUrl.search = '';
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/staff/:path*', '/api/staff/:path*', '/api/auth/:path*'],
};
