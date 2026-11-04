import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/services/authService';
import { STAFF_SESSION_COOKIE } from '@/lib/staffSessionCookie';

export const dynamic = 'force-dynamic';

/**
 * BSCH Clinics — Strict Server-Side Staff Protection (Defense in Depth — Layer 2)
 *
 * Every page under app/staff/(protected)/ is rendered only after the session
 * token from the httpOnly cookie passes full verification
 * (Supabase Auth getUser + active staff_profiles check). Unauthenticated or
 * inactive staff are redirected to /staff/login before any content renders.
 */
export default async function StaffProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;

  const staffUser = token ? await AuthService.verifySession(token) : null;
  if (!staffUser) {
    redirect('/staff/login');
  }

  return <>{children}</>;
}
