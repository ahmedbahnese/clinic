import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AuthService } from '../services/authService.ts';
import { appointmentStore } from '../services/appointmentService.ts';
import { STAFF_SESSION_COOKIE } from '../lib/staffSessionCookie.ts';

// ---------------------------------------------------------------------------
// PHASE 1: Security & Authentication Audit Test Suite
// ---------------------------------------------------------------------------

test('PHASE 1 - AUDIT 1: Session Cookie Specification and Defense in Depth', async (t) => {
  await t.test('STAFF_SESSION_COOKIE constant is defined and matches specification', () => {
    assert.equal(STAFF_SESSION_COOKIE, 'bsch_staff_session');
  });

  await t.test('Login API sets httpOnly, secure (in prod), sameSite=lax, and path=/', () => {
    const loginRoutePath = path.resolve(process.cwd(), 'app/api/auth/login/route.ts');
    const content = fs.readFileSync(loginRoutePath, 'utf8');

    assert.match(content, /response\.cookies\.set\(STAFF_SESSION_COOKIE,\s*session\.token,\s*\{/);
    assert.match(content, /httpOnly:\s*true/);
    assert.match(content, /secure:\s*process\.env\.NODE_ENV\s*===\s*'production'/);
    assert.match(content, /sameSite:\s*['"]lax['"]/);
    assert.match(content, /path:\s*['"]\/['"]/);
    assert.match(content, /maxAge:/);
  });

  await t.test('Logout API clears the httpOnly session cookie with maxAge: 0', () => {
    const logoutRoutePath = path.resolve(process.cwd(), 'app/api/auth/logout/route.ts');
    const content = fs.readFileSync(logoutRoutePath, 'utf8');

    assert.match(content, /response\.cookies\.set\(STAFF_SESSION_COOKIE,\s*['"]['"],\s*\{/);
    assert.match(content, /httpOnly:\s*true/);
    assert.match(content, /maxAge:\s*0/);
  });
});

test('PHASE 1 - AUDIT 2: Middleware & Route Protection Verification', async (t) => {
  const middlewarePath = path.resolve(process.cwd(), 'middleware.ts');
  const middlewareContent = fs.readFileSync(middlewarePath, 'utf8');

  await t.test('Middleware config matches protected paths: /staff, /api/staff, /api/auth', () => {
    assert.match(middlewareContent, /\/staff\/:path\*/);
    assert.match(middlewareContent, /\/api\/staff\/:path\*/);
    assert.match(middlewareContent, /\/api\/auth\/:path\*/);
  });

  await t.test('Middleware redirects unauthenticated /staff requests to /staff/login', () => {
    assert.match(middlewareContent, /if\s*\(pathname\.startsWith\(['"]\/staff['"]\)\s*&&\s*pathname\s*!==\s*STAFF_LOGIN_PATH\)/);
    assert.match(middlewareContent, /if\s*\(!sessionToken\)\s*\{/);
    assert.match(middlewareContent, /loginUrl\.pathname\s*=\s*STAFF_LOGIN_PATH/);
    assert.match(middlewareContent, /return NextResponse\.redirect\(loginUrl\)/);
  });

  await t.test('Middleware bridges httpOnly session cookie to Authorization header for API routes', () => {
    assert.match(middlewareContent, /if\s*\(pathname\.startsWith\(['"]\/api\/['"]\)\)\s*\{/);
    assert.match(middlewareContent, /if\s*\(!authHeader\s*&&\s*sessionToken\)\s*\{/);
    assert.match(middlewareContent, /headers\.set\(['"]authorization['"],\s*`Bearer \$\{sessionToken\}`\)/);
  });

  await t.test('Staff protected layout enforces server-side verifySession before rendering', () => {
    const layoutPath = path.resolve(process.cwd(), 'app/staff/(protected)/layout.tsx');
    const layoutContent = fs.readFileSync(layoutPath, 'utf8');

    assert.match(layoutContent, /cookieStore\.get\(STAFF_SESSION_COOKIE\)\?\.value/);
    assert.match(layoutContent, /await AuthService\.verifySession\(token\)/);
    assert.match(layoutContent, /if\s*\(!staffUser\)\s*\{\s*redirect\(['"]\/staff\/login['"]\);\s*\}/);
  });
});

test('PHASE 1 - AUDIT 3: Token Decoding, Cryptographic Integrity, and Edge Cases', async (t) => {
  const secret = process.env.STAFF_SESSION_SECRET || 'bsch_fallback_secret_key_2026';

  await t.test('Rejects null, undefined, and empty token strings', async () => {
    assert.equal(await AuthService.verifySession(null), null);
    assert.equal(await AuthService.verifySession(undefined), null);
    assert.equal(await AuthService.verifySession(''), null);
    assert.equal(await AuthService.verifySession('   '), null);
  });

  await t.test('Rejects malformed tokens with random format', async () => {
    assert.equal(await AuthService.verifySession('random_invalid_string_12345'), null);
    assert.equal(await AuthService.verifySession('Bearer dummy_token'), null);
    assert.equal(await AuthService.verifySession('bsch_staff_malformed_without_signature'), null);
  });

  await t.test('Validates a legitimate signed bsch_staff token correctly', async () => {
    const session = await AuthService.validateCredentials('admin', 'admin2026');
    assert.ok(session, 'Admin login must succeed in test/dev harness');
    assert.ok(session.token, 'Session must produce a token');

    const verified = await AuthService.verifySession(session.token);
    assert.ok(verified, 'Legitimate token must verify successfully');
    assert.equal(verified.username, 'admin');
    assert.equal(verified.role, 'ADMIN');
  });

  await t.test('Rejects tokens with tampered HMAC signature (Tamper Proofing)', async () => {
    const session = await AuthService.validateCredentials('admin', 'admin2026');
    assert.ok(session);
    const validToken = session.token;

    // Tamper with the last character of the signature
    const lastChar = validToken.slice(-1);
    const tamperedChar = lastChar === 'a' ? 'b' : 'a';
    const tamperedToken = validToken.slice(0, -1) + tamperedChar;

    const result = await AuthService.verifySession(tamperedToken);
    assert.equal(result, null, 'Token with corrupted signature must be rejected');
  });

  await t.test('Rejects tokens where attacker tries to elevate role via modified payload', async () => {
    // Attacker crafts a token claiming ADMIN role for reception user
    const forgedPayload = {
      id: 'user-rec-1',
      username: 'reception',
      role: 'ADMIN', // Spoofed elevation
      clinicId: null,
      exp: Date.now() + 3600000,
    };
    const payloadB64 = Buffer.from(JSON.stringify(forgedPayload)).toString('base64url');
    // Attacker does NOT have the secret, so they provide a dummy or wrong HMAC
    const bogusSig = crypto.createHmac('sha256', 'wrong_secret_attacker_guess').update(payloadB64).digest('hex');
    const forgedToken = `bsch_staff_${payloadB64}.${bogusSig}`;

    const result = await AuthService.verifySession(forgedToken);
    assert.equal(result, null, 'Forged token with invalid HMAC must be completely rejected');
  });

  await t.test('Rejects expired tokens strictly', async () => {
    // Generate an expired token with valid signature
    const expiredPayload = {
      id: 'user-admin-1',
      username: 'admin',
      role: 'ADMIN',
      clinicId: null,
      exp: Date.now() - 5000, // Expired 5 seconds ago
    };
    const payloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
    const expiredToken = `bsch_staff_${payloadB64}.${sig}`;

    const result = await AuthService.verifySession(expiredToken);
    assert.equal(result, null, 'Expired token must return null');
  });

  await t.test('Rejects revoked tokens after AuthService.revokeSession', async () => {
    const session = await AuthService.validateCredentials('reception', 'bsch2026');
    assert.ok(session);
    const token = session.token;

    // Before revocation -> verified
    const beforeRevoke = await AuthService.verifySession(token);
    assert.ok(beforeRevoke, 'Token should be valid before revocation');

    // Revoke
    await AuthService.revokeSession(token);

    // After revocation -> null
    const afterRevoke = await AuthService.verifySession(token);
    assert.equal(afterRevoke, null, 'Revoked token must return null immediately');
  });

  await t.test('Token verification uses constant-time comparison to prevent timing attacks', () => {
    const authServicePath = path.resolve(process.cwd(), 'services/authService.ts');
    const content = fs.readFileSync(authServicePath, 'utf8');

    assert.match(
      content,
      /crypto\.timingSafeEqual/,
      'AuthService must use crypto.timingSafeEqual for signature verification'
    );
  });
});

test('PHASE 1 - AUDIT 4: Role-Based Access Control (RBAC) Strictness on Server Endpoints', async (t) => {
  await t.test('Receptionist is strictly blocked from Admin-only endpoints', () => {
    // Audit API files for ADMIN-only assertions
    const adminEndpoints = [
      'app/api/staff/management/route.ts',
      'app/api/staff/audit-logs/route.ts',
      'app/api/staff/cms/route.ts',
      'app/api/staff/cms/settings/route.ts',
      'app/api/staff/cms/sections/route.ts',
      'app/api/staff/cms/navigation/route.ts',
      'app/api/staff/cms/media/route.ts',
      'app/api/staff/clinics/route.ts',
      'app/api/staff/clinics/[id]/route.ts',
      'app/api/staff/clinics/[id]/schedules/route.ts',
    ];

    for (const ep of adminEndpoints) {
      const epPath = path.resolve(process.cwd(), ep);
      assert.ok(fs.existsSync(epPath), `Endpoint file must exist: ${ep}`);
      const code = fs.readFileSync(epPath, 'utf8');
      assert.match(
        code,
        /staffUser\.role\s*!==\s*['"]ADMIN['"]/,
        `Endpoint ${ep} must enforce role !== 'ADMIN' guard`
      );
    }
  });

  await t.test('Server Actions (createOrUpdateStaff, deleteStaff) strictly require role === "ADMIN"', () => {
    const staffActionPath = path.resolve(process.cwd(), 'app/staff/actions/staffManagement.ts');
    const code = fs.readFileSync(staffActionPath, 'utf8');

    // createOrUpdateStaff guard
    assert.match(
      code,
      /if\s*\(staffUser\.role\s*!==\s*['"]ADMIN['"]\)\s*\{\s*throw new Error\('غير مصرح: إدارة الموظفين متاحة لمدير النظام فقط\.'\);\s*\}/,
      'createOrUpdateStaff must reject non-admin callers'
    );

    // deleteStaff guard
    assert.match(
      code,
      /if\s*\(staffUser\.role\s*!==\s*['"]ADMIN['"]\)\s*\{\s*throw new Error\('غير مصرح: إدارة الموظفين متاحة لمدير النظام فقط\.'\);\s*\}/,
      'deleteStaff must reject non-admin callers'
    );
  });

  await t.test('Doctor role is strictly blocked from cancellation requests and review', () => {
    const listEp = fs.readFileSync(path.resolve(process.cwd(), 'app/api/staff/cancellation-requests/route.ts'), 'utf8');
    assert.match(
      listEp,
      /if\s*\(staffUser\.role\s*!==\s*['"]ADMIN['"]\s*&&\s*staffUser\.role\s*!==\s*['"]RECEPTIONIST['"]\)\s*\{\s*return NextResponse\.json\(\s*\{\s*error:\s*['"]غير مصرح لهذا الدور بالاطلاع على طلبات الإلغاء\.['"]\s*\},\s*\{\s*status:\s*403\s*\}\s*\);/
    );

    const reviewEp = fs.readFileSync(path.resolve(process.cwd(), 'app/api/staff/cancellation-requests/[id]/review/route.ts'), 'utf8');
    assert.match(
      reviewEp,
      /if\s*\(staffUser\.role\s*!==\s*['"]ADMIN['"]\s*&&\s*staffUser\.role\s*!==\s*['"]RECEPTIONIST['"]\)\s*\{\s*return NextResponse\.json\(\s*\{\s*error:\s*['"]غير مصرح لهذا الدور بمراجعة طلبات الإلغاء/
    );
  });

  await t.test('Doctor Clinic Isolation in appointmentStore prevents doctor from viewing other clinics', async () => {
    const docUser: any = {
      id: 'user-doc-1',
      username: 'doctor.echo',
      name: 'د/ شريف عبد الغني',
      role: 'DOCTOR',
      clinicId: 'echo',
      active: true,
    };

    // Query with filter for another clinic e.g. dentistry -> Doctor isolation forces effectiveClinicId to doctor's clinicId ('echo')
    const apts = await appointmentStore.getStaffAppointments({ clinicId: 'dentistry' }, docUser);
    for (const a of apts) {
      assert.equal(a.clinicId, 'echo', 'Doctor query must only return appointments for their assigned clinic');
    }
  });

  await t.test('Unassigned Doctor with null/empty clinicId is denied all appointments', async () => {
    const unassignedDoc: any = {
      id: 'doc-unassigned',
      username: 'doc.unassigned',
      name: 'طبيب غير معين',
      role: 'DOCTOR',
      clinicId: undefined,
      active: true,
    };

    const apts = await appointmentStore.getStaffAppointments({}, unassignedDoc);
    assert.equal(apts.length, 0, 'Doctor without clinic assignment must receive empty array');
  });

  await t.test('Receptionist cannot mark appointment COMPLETED (Doctor/Admin only)', async () => {
    const recUser: any = {
      id: 'user-rec-1',
      username: 'reception',
      name: 'أ/ منى عبد الرحيم',
      role: 'RECEPTIONIST',
      clinicId: 'general',
      active: true,
    };

    // Create a mock checked-in appointment
    const newApt = await appointmentStore.createAppointment({
      clinicId: 'dentistry',
      patientName: 'عمر ياسر ممدوح حسن',
      phoneNumber: '01099887766',
      appointmentDate: '2026-11-16',
      appointmentTime: '10:30',
    });
    assert.ok(newApt.success);
    const aptId = newApt.appointment!.id;

    // Confirm as receptionist
    await appointmentStore.updateStatus(aptId, 'CONFIRMED', recUser);

    // Call / check-in as receptionist
    await appointmentStore.updateStatus(aptId, 'CHECKED_IN', recUser);

    // Attempt to mark COMPLETED as receptionist -> MUST FAIL
    const completeRes = await appointmentStore.updateStatus(aptId, 'COMPLETED', recUser);
    assert.equal(completeRes.success, false, 'Receptionist must not be able to mark appointment COMPLETED');
    assert.match(completeRes.error || '', /صلاحية/);
  });
});
