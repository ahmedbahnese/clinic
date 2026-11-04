/**
 * BSCH Clinics — Staff Session Cookie
 *
 * The staff session token is stored in an httpOnly cookie (set by the login
 * API route) so Next.js Middleware and server components can protect
 * /staff/* routes before any client JavaScript runs. The token is also
 * returned in the login response body for API Authorization headers.
 */
export const STAFF_SESSION_COOKIE = 'bsch_staff_session';
