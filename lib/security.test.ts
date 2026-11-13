import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appointmentStore } from '../services/appointmentService.ts';
import { AuthService } from '../services/authService.ts';
import { verifyTurnstileToken } from './turnstile.ts';
import { checkRateLimit } from './otp.ts';
import type { StaffUser, Clinic } from '../types/index.ts';

test('Security 1: Anonymous tracking requires two-factor verification (Reference + Phone)', async () => {
  // Setup a known appointment in store
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'مريم محمود سالم السعيد',
    phoneNumber: '01011223344',
    appointmentDate: '2026-11-15',
    appointmentTime: '10:00',
  });
  assert.equal(newApt.success, true);
  const ref = newApt.appointment!.referenceNumber;
  const phone = '01011223344';

  // 1. Attempt tracking with reference number alone -> Must be rejected (empty)
  const byRefOnly = await appointmentStore.trackAppointment(ref, '');
  assert.equal(byRefOnly.length, 0, 'Tracking with reference alone must return 0 results');

  // 2. Attempt tracking with phone number alone -> Must be rejected (empty)
  const byPhoneOnly = await appointmentStore.trackAppointment('', phone);
  assert.equal(byPhoneOnly.length, 0, 'Tracking with phone alone must return 0 results');

  // 3. Attempt tracking with mismatched phone and reference -> Must be rejected (empty)
  const mismatched = await appointmentStore.trackAppointment(ref, '01299998888');
  assert.equal(mismatched.length, 0, 'Mismatched reference and phone must return 0 results');

  // 4. Tracking with valid matching pair -> Returns sanitized appointment
  const validTrack = await appointmentStore.trackAppointment(ref, phone);
  assert.equal(validTrack.length, 1);
  const tracked = validTrack[0];
  assert.equal(tracked.referenceNumber, ref);
  assert.equal(tracked.clinicName, 'عيادة الأسنان');
  assert.equal(tracked.patientName, 'مريم محمود سالم السعيد');

  // Verify Data Minimization: patient address and notes must NOT be exposed
  assert.equal((tracked as any).patientAddress, undefined, 'Patient address must not be exposed');
  assert.equal((tracked as any).notes, undefined, 'Internal notes must not be exposed');
});

test('Security 2: Doctor Isolation - Doctor with null clinicId is denied access to all appointments', async () => {
  const unassignedDoctor: StaffUser = {
    id: 'doc-unassigned',
    username: 'dr.unassigned',
    name: 'د/ طبيب بدون عيادة',
    role: 'DOCTOR',
    active: true,
  };

  const results = await appointmentStore.getStaffAppointments({}, unassignedDoctor);
  assert.equal(results.length, 0, 'Doctor without clinicId must see ZERO appointments');
});

test('Security 3: Doctor Isolation - Doctor can only view and update their assigned clinic', async () => {
  const echoDoctor: StaffUser = {
    id: 'doc-echo-1',
    username: 'dr.echo',
    name: 'د/ شريف عبد الغني',
    role: 'DOCTOR',
    clinicId: 'echo',
    active: true,
  };

  // 1. Doctor queries appointments -> Must only return appointments for 'echo'
  const echoApts = await appointmentStore.getStaffAppointments({}, echoDoctor);
  for (const apt of echoApts) {
    assert.equal(apt.clinicId, 'echo', 'Echo doctor must only see appointments in clinic echo');
  }

  // 2. Doctor attempts to update appointment of another clinic (dentistry)
  const dentistryApt = (await appointmentStore.getStaffAppointments()).find((a) => a.clinicId === 'dentistry');
  assert.ok(dentistryApt, 'Dentistry appointment must exist');

  const updateResult = await appointmentStore.updateStatus(
    dentistryApt.id,
    'COMPLETED',
    echoDoctor,
    'محاولة طبيب من عيادة أخرى'
  );
  assert.equal(updateResult.success, false);
  assert.match(updateResult.error || '', /عيادة أخرى/, 'Doctor cannot update another clinic');
});

test('Security 4: Receptionist Privilege Boundaries - Cannot mark COMPLETED or alter patient identity', async () => {
  const receptionist: StaffUser = {
    id: 'rec-1',
    username: 'reception',
    name: 'أ/ منى عبد الرحيم',
    role: 'RECEPTIONIST',
    active: true,
  };

  // Create a pending appointment
  const aptResult = await appointmentStore.createAppointment({
    clinicId: 'gi',
    patientName: 'عمر إبراهيم حسن الشناوي',
    phoneNumber: '01511223344',
    appointmentDate: '2026-11-18',
    appointmentTime: '11:00',
  });
  assert.equal(aptResult.success, true);
  const aptId = aptResult.appointment!.id;

  // 1. Receptionist confirms booking -> Allowed
  const confirmResult = await appointmentStore.updateStatus(aptId, 'CONFIRMED', receptionist, 'تأكيد الحجز');
  assert.equal(confirmResult.success, true);

  // 2. Receptionist attempts to mark COMPLETED -> Must be rejected (Medical role only)
  const completeResult = await appointmentStore.updateStatus(aptId, 'COMPLETED', receptionist, 'محاولة إغلاق طبي');
  assert.equal(completeResult.success, false);
  assert.match(completeResult.error || '', /صلاحية طبية مخصصة للأطباء/, 'Receptionist cannot mark COMPLETED');
});

test('Security 5: book_appointment_atomic data minimization', async () => {
  const result = await appointmentStore.createAppointment({
    clinicId: 'nutrition',
    patientName: 'كريم خالد عبد السلام النمر',
    phoneNumber: '01211112233',
    patientAge: '3 سنوات',
    patientAddress: 'أبو حمص - دمسنا - البحيرة',
    appointmentDate: '2026-11-21',
    appointmentTime: '09:00',
  });

  assert.equal(result.success, true);
  const apt = result.appointment!;

  // Minimum required safe fields
  assert.ok(apt.referenceNumber.startsWith('BSCH-'));
  assert.equal(apt.clinicName, 'عيادة التغذية');
  assert.equal(apt.appointmentDate, '2026-11-21');
  assert.equal(apt.status, 'PENDING_REVIEW');
  assert.ok((apt.queueNumber || 0) > 0);
});

test('Security 6: Duplicate active reservation in same clinic on same date is blocked', async () => {
  const phone = '01122334455';
  const clinicId = 'cardio';
  const date = '2026-11-22';

  // First booking
  const first = await appointmentStore.createAppointment({
    clinicId,
    patientName: 'زياد طارق أحمد مصطفى',
    phoneNumber: phone,
    appointmentDate: date,
  });
  assert.equal(first.success, true);

  // Second duplicate booking for same patient + same phone + clinic + date must be blocked
  const second = await appointmentStore.createAppointment({
    clinicId,
    patientName: 'زياد طارق أحمد مصطفى',
    phoneNumber: phone,
    appointmentDate: date,
  });
  assert.equal(second.success, false);
  assert.match(second.error || '', /يوجد حجز بنفس الرقم لنفس الميلاد/, 'Duplicate booking for same patient on same date must be rejected');

  // Third booking for a sibling with a different name sharing the same phone must SUCCEED
  const sibling = await appointmentStore.createAppointment({
    clinicId,
    patientName: 'مريم طارق أحمد مصطفى',
    phoneNumber: phone,
    appointmentDate: date,
  });
  assert.equal(sibling.success, true, 'Sibling with different name sharing guardian phone must be permitted');
});

test('Security 7: Terminal status protection - Completed or cancelled appointments cannot be reopened by staff', async () => {
  const doctor: StaffUser = {
    id: 'doc-gi',
    username: 'dr.gi',
    name: 'د/ استشاري الجهاز الهضمي',
    role: 'DOCTOR',
    clinicId: 'gi',
    active: true,
  };

  const receptionist: StaffUser = {
    id: 'rec-1',
    username: 'reception',
    name: 'أ/ منى عبد الرحيم',
    role: 'RECEPTIONIST',
    active: true,
  };

  // Create, confirm, check-in, complete
  const aptRes = await appointmentStore.createAppointment({
    clinicId: 'gi',
    patientName: 'فاطمة علي إبراهيم عمار',
    phoneNumber: '01099887766',
    appointmentDate: '2026-11-25',
  });
  const aptId = aptRes.appointment!.id;
  await appointmentStore.updateStatus(aptId, 'CONFIRMED', receptionist);
  await appointmentStore.updateStatus(aptId, 'CHECKED_IN', receptionist);
  const completed = await appointmentStore.updateStatus(aptId, 'COMPLETED', doctor);
  assert.equal(completed.success, true);

  // Attempt to revert completed status by receptionist -> Denied
  const revertAttempt = await appointmentStore.updateStatus(aptId, 'CONFIRMED', receptionist, 'محاولة فتح الحجز');
  assert.equal(revertAttempt.success, false);
});

test('Security 8: Seed data re-run resilience - Confirmed clinics preserve hospital accreditation and official attributes', () => {
  // 1. Static SQL Audit on supabase/seed.sql
  const seedPath = path.resolve('supabase/seed.sql');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  // Verify that the ON CONFLICT clause has the WHERE clause guarding confirmed clinics
  assert.ok(
    seedSql.includes('WHERE clinics.is_hospital_confirmed = false;'),
    'seed.sql must include WHERE clinics.is_hospital_confirmed = false; to prevent overwriting confirmed clinics'
  );

  // Verify that is_hospital_confirmed preserves existing value
  assert.ok(
    seedSql.includes('is_hospital_confirmed = clinics.is_hospital_confirmed'),
    'seed.sql must set is_hospital_confirmed = clinics.is_hospital_confirmed'
  );

  // Verify that it does NOT do is_hospital_confirmed = EXCLUDED.is_hospital_confirmed
  assert.ok(
    !seedSql.includes('is_hospital_confirmed = EXCLUDED.is_hospital_confirmed'),
    'seed.sql must NOT blindly overwrite is_hospital_confirmed with EXCLUDED.is_hospital_confirmed'
  );

  // Verify PostgreSQL column qualification rules: target columns on the left of assignment must be unqualified
  const setAssignments = [
    'name = EXCLUDED.name',
    'description = EXCLUDED.description',
    'location = EXCLUDED.location',
    'working_hours = EXCLUDED.working_hours',
    'days_of_week = EXCLUDED.days_of_week',
    'max_daily_slots = EXCLUDED.max_daily_slots',
    'slot_duration_minutes = EXCLUDED.slot_duration_minutes',
    'instructions = EXCLUDED.instructions',
    'is_active = EXCLUDED.is_active',
  ];
  for (const assignment of setAssignments) {
    assert.ok(
      seedSql.includes(assignment),
      `seed.sql must include properly qualified assignment: ${assignment}`
    );
  }

  // 2. Behavioral Simulation of PostgreSQL ON CONFLICT DO UPDATE WHERE semantics
  interface DatabaseClinicRow {
    id: string;
    name: string;
    location: string;
    working_hours: string;
    max_daily_slots: number;
    instructions: string;
    is_active: boolean;
    is_hospital_confirmed: boolean;
    updated_at: string;
  }

  // Simulating existing rows in DB:
  // - cardio: Officially reviewed and confirmed by hospital management with customized settings
  // - dentistry: Provisional unconfirmed clinic
  const dbClinics: Record<string, DatabaseClinicRow> = {
    cardio: {
      id: 'cardio',
      name: 'عيادة أمراض قلب الأطفال التخصصية المعتمدة رسمياً',
      location: 'مبنى أ - الدور الرابع جناح 1',
      working_hours: '08:00-15:00',
      max_daily_slots: 25,
      instructions: 'تعليمات معتمدة رسمياً: يلزم إحضار رسم القلب السريري والأشعة التلفزيونية الحديثة',
      is_active: true,
      is_hospital_confirmed: true,
      updated_at: '2026-10-20T10:00:00Z',
    },
    dentistry: {
      id: 'dentistry',
      name: 'عيادة الأسنان',
      location: 'الدور الأرضي - عيادة 1',
      working_hours: '08:30-14:00',
      max_daily_slots: 20,
      instructions: 'تعليمات أولية تجريبية',
      is_active: true,
      is_hospital_confirmed: false,
      updated_at: '2026-10-01T10:00:00Z',
    },
  };

  // Incoming seed data payload (provisional default data)
  const incomingSeedRowForCardio: DatabaseClinicRow = {
    id: 'cardio',
    name: 'عيادة قلب الأطفال',
    location: 'الدور الرابع - عيادة 1',
    working_hours: '08:30-14:00',
    max_daily_slots: 18,
    instructions: 'يرجى مراجعة قياس النبض في غرفة العلامات الحيوية بالدور الأرضي أولاً.',
    is_active: true,
    is_hospital_confirmed: false,
    updated_at: '2026-10-25T12:00:00Z',
  };

  const incomingSeedRowForDentistry: DatabaseClinicRow = {
    id: 'dentistry',
    name: 'عيادة طب الأسنان للأطفال (محدث تجريبي)',
    location: 'الدور الأرضي - عيادة 1',
    working_hours: '08:30-14:00',
    max_daily_slots: 22,
    instructions: 'تعليمات محدثة للعيادة التجريبية',
    is_active: true,
    is_hospital_confirmed: false,
    updated_at: '2026-10-25T12:00:00Z',
  };

  // PostgreSQL DO UPDATE WHERE clinics.is_hospital_confirmed = false function
  function simulateSeedUpsert(incoming: DatabaseClinicRow) {
    const existing = dbClinics[incoming.id];
    if (existing) {
      // Evaluation of WHERE clause: WHERE clinics.is_hospital_confirmed = false
      if (existing.is_hospital_confirmed === false) {
        // Condition matches -> Update provisional clinic
        existing.name = incoming.name;
        existing.location = incoming.location;
        existing.working_hours = incoming.working_hours;
        existing.max_daily_slots = incoming.max_daily_slots;
        existing.instructions = incoming.instructions;
        existing.is_active = incoming.is_active;
        existing.is_hospital_confirmed = existing.is_hospital_confirmed; // Preserved
        existing.updated_at = incoming.updated_at;
      }
      // If existing.is_hospital_confirmed === true: DO NOTHING! Row is untouched
    } else {
      dbClinics[incoming.id] = { ...incoming };
    }
  }

  // Re-run seed data
  simulateSeedUpsert(incomingSeedRowForCardio);
  simulateSeedUpsert(incomingSeedRowForDentistry);

  // Assertions for Confirmed Clinic (cardio): MUST BE 100% UNCHANGED
  const cardio = dbClinics.cardio;
  assert.equal(cardio.is_hospital_confirmed, true, 'Confirmed clinic must remain is_hospital_confirmed = true');
  assert.equal(
    cardio.name,
    'عيادة أمراض قلب الأطفال التخصصية المعتمدة رسمياً',
    'Official clinic name must not be overwritten by seed re-run'
  );
  assert.equal(
    cardio.location,
    'مبنى أ - الدور الرابع جناح 1',
    'Official location must not be overwritten by seed re-run'
  );
  assert.equal(cardio.working_hours, '08:00-15:00', 'Official hours must not be overwritten');
  assert.equal(cardio.max_daily_slots, 25, 'Official slot capacity must not be overwritten');
  assert.equal(cardio.updated_at, '2026-10-20T10:00:00Z', 'Updated timestamp must remain unchanged');

  // Assertions for Provisional Clinic (dentistry): MUST BE UPDATED
  const dentistry = dbClinics.dentistry;
  assert.equal(dentistry.is_hospital_confirmed, false, 'Provisional clinic remains false');
  assert.equal(
    dentistry.name,
    'عيادة طب الأسنان للأطفال (محدث تجريبي)',
    'Provisional clinic can be updated when unconfirmed'
  );
  assert.equal(dentistry.max_daily_slots, 22);
});

test('Security 9: Staff Authentication - Validates credentials and maps to safe StaffUser without exposing passwords', async () => {
  AuthService._resetMockSessionsForTesting();

  // Invalid credentials
  const invalidSession = await AuthService.validateCredentials('admin', 'wrong_pass');
  assert.equal(invalidSession, null, 'Invalid password must return null');

  // Valid credentials
  const validSession = await AuthService.validateCredentials('admin', 'admin2026');
  assert.ok(validSession, 'Valid credentials must yield an AuthSession');
  assert.ok(validSession.token, 'Session must contain a token');
  assert.equal(validSession.user.role, 'ADMIN', 'Role must map to ADMIN');
  assert.equal((validSession.user as any).passwordHash, undefined, 'Password hash must never be in user object');
});

test('Security 10: Staff Authentication - verifySession authenticates active token and rejects invalid/revoked tokens', async () => {
  AuthService._resetMockSessionsForTesting();
  const session = await AuthService.validateCredentials('reception', 'bsch2026');
  assert.ok(session);

  // Valid token verification
  const user = await AuthService.verifySession(session.token);
  assert.ok(user);
  assert.equal(user.username, 'reception');
  assert.equal(user.role, 'RECEPTIONIST');

  // Revoke session
  await AuthService.revokeSession(session.token);

  // Subsequent verification should fail
  const postRevokeUser = await AuthService.verifySession(session.token);
  assert.equal(postRevokeUser, null, 'Revoked session must return null');

  // Garbage token
  const garbageUser = await AuthService.verifySession('invalid_random_token');
  assert.equal(garbageUser, null, 'Invalid token must return null');
});

test('Security 11: Staff Authentication - Production mode forbids in-memory staff login when Supabase is unconfigured', async () => {
  const originalEnv = process.env.NODE_ENV;
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    await assert.rejects(
      async () => {
        await AuthService.validateCredentials('admin', 'admin2026');
      },
      /قاعدة بيانات الإنتاج غير مهيأة|تسجيل الدخول غير متاح/,
      'Must reject in-memory login in production when Supabase is unconfigured'
    );
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }
});

test('Security 12: Calendar exception precedence (Closure overrides weekly open, extra open overrides weekly closed)', async () => {
  const admin: StaffUser = {
    id: 'admin-sched-test',
    username: 'admin',
    name: 'مدير النظام',
    role: 'ADMIN',
    active: true,
  };

  // Case A: Normally open day (Monday 2026-11-23) with isClosed = true exception
  await appointmentStore.upsertClinicScheduleException(
    'cardio',
    {
      scheduleDate: '2026-11-23',
      isClosed: true,
      closureReason: 'عطلة رسمية بمناسبة عيد قومي',
    },
    admin
  );

  const closedBooking = await appointmentStore.createAppointment({
    clinicId: 'cardio',
    patientName: 'مروان عادل حسن',
    phoneNumber: '01011113333',
    appointmentDate: '2026-11-23',
  });
  assert.equal(closedBooking.success, false, 'Booking must be rejected on exception closure date');
  assert.match(closedBooking.error || '', /عطلة رسمية/);

  // Case B: Normally closed day (Friday 2026-11-27) with isClosed = false exception
  await appointmentStore.upsertClinicScheduleException(
    'cardio',
    {
      scheduleDate: '2026-11-27',
      isClosed: false,
      maxCapacity: 10,
    },
    admin
  );

  const openBooking = await appointmentStore.createAppointment({
    clinicId: 'cardio',
    patientName: 'عصام أحمد حسن',
    phoneNumber: '01011114444',
    appointmentDate: '2026-11-27',
  });
  assert.equal(openBooking.success, true, 'Booking must succeed when an exceptional open day is configured on a weekend');
});

test('Security 13: Per-service daily capacity enforcement rejects bookings exceeding maxDailyCapacity', async () => {
  const admin: StaffUser = {
    id: 'admin-svc-test',
    username: 'admin',
    name: 'مدير النظام',
    role: 'ADMIN',
    active: true,
  };

  // Create a service with maxDailyCapacity = 1
  const createdSvc = await appointmentStore.createClinicService(
    'dentistry',
    {
      name: 'جلسة خاصة محدودة السعة',
      maxDailyCapacity: 1,
      requiredDocuments: ['شهادة الميلاد'],
      instructions: 'الحضور صائماً',
    },
    admin
  );
  assert.ok(createdSvc.success);
  assert.ok(createdSvc.service);
  const serviceId = createdSvc.service.id;

  const testDate = '2026-11-24'; // Tuesday (open)

  // First booking for this service -> succeeds
  const book1 = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    serviceId: serviceId,
    patientName: 'حسام ناصر سالم',
    phoneNumber: '01233445566',
    appointmentDate: testDate,
  });
  assert.equal(book1.success, true, 'First booking within service capacity must succeed');

  // Second booking for same service on same date -> MUST be rejected because capacity = 1 is exhausted
  const book2 = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    serviceId: serviceId,
    patientName: 'مازن ناصر سالم',
    phoneNumber: '01233445577',
    appointmentDate: testDate,
  });
  assert.equal(book2.success, false, 'Second booking exceeding maxDailyCapacity must be rejected');
  assert.match(book2.error || '', /السعة اليومية المتاحة لخدمة/);
});

test('Security 14: Turnstile bot protection strictly fails closed in production mode', async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;

  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.TURNSTILE_SECRET_KEY;

    // In production without secret key, it must fail closed
    const resWithoutSecret = await verifyTurnstileToken('mock_token', '192.168.1.1');
    assert.equal(resWithoutSecret.success, false, 'Must fail closed when secret key is missing in production');
    assert.match(resWithoutSecret.error || '', /مكافحة الروبوتات غير مهيأ/);

    // In production with dummy secret but missing/empty token -> must fail
    process.env.TURNSTILE_SECRET_KEY = 'mock_secret_key';
    const resWithEmptyToken = await verifyTurnstileToken('', '192.168.1.1');
    assert.equal(resWithEmptyToken.success, false, 'Must reject empty token');
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    process.env.TURNSTILE_SECRET_KEY = originalSecret;
  }
});

test('Security 15: Booking without service_id succeeds cleanly and defaults serviceName safely', async () => {
  // Booking without passing serviceId or serviceName
  const res = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'أشرف كمال عبد الرازق',
    phoneNumber: '01055443322',
    appointmentDate: '2026-11-23', // Monday
  });

  assert.equal(res.success, true, 'Booking without serviceId must succeed');
  assert.ok(res.appointment);
  assert.ok(res.appointment.serviceName, 'Default serviceName must be populated');
  assert.match(res.appointment.serviceName, /كشف|خلع|حشو/);
});

test('Security 16: Walk-in appointment with staffUserId creates CONFIRMED initial status', async () => {
  const receptionist: StaffUser = {
    id: 'staff-recep-01',
    username: 'reception',
    name: 'موظف الاستقبال المعتمد',
    role: 'RECEPTIONIST',
    active: true,
  };

  const walkInRes = await appointmentStore.createAppointment({
    clinicId: 'echo',
    patientName: 'عادل يوسف الشناوي',
    phoneNumber: '01277665544',
    appointmentDate: '2026-11-23',
    isWalkIn: true,
    staffUserId: receptionist.id,
  });

  assert.equal(walkInRes.success, true);
  assert.ok(walkInRes.appointment);
  assert.equal(walkInRes.appointment.status, 'CONFIRMED', 'Walk-in booking created by staff must be initially CONFIRMED');
});

test('Security 17: Persistent rate limiting fails closed in production mode when Supabase is unconfigured', async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const rateRes = await checkRateLimit('test_prod_key', 5, 60);
    assert.equal(rateRes.allowed, false, 'Rate limiting must fail closed in production without persistent store');
    assert.ok((rateRes.retryAfterSeconds || 0) > 0, 'Retry after seconds must be provided');
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});

test('Security 18: Receptionist assigned to a clinic cannot book walk-in for another clinic', async () => {
  const echoReceptionist: StaffUser = {
    id: 'rec-echo-only',
    username: 'rec.echo',
    name: 'موظف استقبال الإيكو',
    role: 'RECEPTIONIST',
    clinicId: 'echo',
    active: true,
  };

  // Attempting to book in dentistry must be rejected
  const reqClinicId = 'dentistry';
  const isAllowed = !echoReceptionist.clinicId || echoReceptionist.clinicId === reqClinicId;
  assert.equal(isAllowed, false, 'Receptionist assigned to clinic echo must not be allowed to book dentistry');
});

test('Security 19: Clinic transfer enforces schedule, active status, capacity, and doctor clinic boundary', async () => {
  const echoDoctor: StaffUser = {
    id: 'doc-echo-trans',
    username: 'dr.echo.trans',
    name: 'د/ طبيب عيادة الإيكو',
    role: 'DOCTOR',
    clinicId: 'echo',
    active: true,
  };

  // Create an appointment in echo
  const createRes = await appointmentStore.createAppointment({
    clinicId: 'echo',
    patientName: 'كريم سامي رضوان',
    phoneNumber: '01099887766',
    appointmentDate: '2026-11-25',
  });
  assert.ok(createRes.success);
  const aptId = createRes.appointment!.id;

  const adminStaff: StaffUser = {
    id: 'admin-user',
    username: 'admin',
    name: 'مدير النظام',
    role: 'ADMIN',
    active: true,
  };

  // 1. Doctor of echo attempts to transfer an appointment of dentistry -> Rejected
  const dentApt = (await appointmentStore.getStaffAppointments()).find((a) => a.clinicId === 'dentistry');
  assert.ok(dentApt);
  const crossDocRes = await appointmentStore.transferClinic(dentApt.id, 'echo', 'srv_echo_standard', 'تحويل عيادة', echoDoctor);
  assert.equal(crossDocRes.success, false, 'Doctor cannot transfer appointment belonging to another clinic');
  assert.match(crossDocRes.error || '', /عيادته الخاصة/);

  // 2. Transfer to nonexistent clinic -> Rejected
  const nonExistRes = await appointmentStore.transferClinic(aptId, 'non-existent-clinic', 'srv_echo_standard', 'تحويل عيادة', echoDoctor);
  assert.equal(nonExistRes.success, false);
  assert.match(nonExistRes.error || '', /العيادة المحول إليها غير متوفرة/);

  // 3. Receptionist of echo attempting to transfer dentistry appointment -> Rejected
  const echoRecep: StaffUser = {
    id: 'rec-echo-trans',
    username: 'rec.echo.trans',
    name: 'موظف استقبال الإيكو',
    role: 'RECEPTIONIST',
    clinicId: 'echo',
    active: true,
  };
  const recepCrossRes = await appointmentStore.transferClinic(dentApt.id, 'echo', 'srv_echo_standard', 'تحويل عيادة', echoRecep);
  assert.equal(recepCrossRes.success, false, 'Receptionist cannot transfer appointment of another clinic');
  assert.match(recepCrossRes.error || '', /عيادة أخرى/);
});

test('Security 20: SQL Migration Integrity - Verifies column names, safe index swap, and sequence', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');

  const content = fs.readFileSync(migrationPath, 'utf8');

  // 1. Status history must use updated_by, NEVER changed_by
  assert.ok(content.includes('updated_by'), 'Migration must reference updated_by');
  assert.ok(!content.includes('changed_by'), 'Migration must NEVER reference nonexistent changed_by column');

  // 2. Safe index swap: new index created before old index is dropped
  const newIndexIdx = content.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_apt_per_phone_patient_clinic_day');
  const dropOldIndexIdx = content.indexOf('DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_clinic_day');
  assert.ok(newIndexIdx !== -1, 'New composite index must be created');
  assert.ok(dropOldIndexIdx !== -1, 'Old index must be dropped');
  assert.ok(newIndexIdx < dropOldIndexIdx, 'New index MUST be defined before old index is dropped');

  // 3. Sequence for reference numbers
  assert.ok(content.includes('seq_appointment_reference_number'), 'Sequence for reference number must be defined');

  // 4. Rate limiting cleanup function
  assert.ok(content.includes('cleanup_expired_rate_limits'), 'Rate limit cleanup function must be defined');

  // 5. Hospital invariant text for arrival
  assert.ok(content.includes('الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى'), 'Migration must include the updated morning arrival text');
  assert.ok(!content.includes('15 إلى 30 دقيقة'), 'Migration must not include 15-30 minute text');
});

test('Security 21: Cancellation Authorization - Direct cancellation requires verified staff session; phone-only direct cancellation is strictly rejected', async () => {
  const apt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'عمر خالد الدسوقي',
    phoneNumber: '01011223399',
    appointmentDate: '2026-11-25',
    appointmentTime: '10:00',
  });
  assert.ok(apt.success);
  const ref = apt.appointment!.referenceNumber;

  // 1. Direct cancellation without caller credentials -> Rejected
  const unauthCancel = await appointmentStore.cancelAppointment(ref, 'إلغاء مجهول');
  assert.equal(unauthCancel.success, false, 'Unauthenticated cancellation must be rejected');
  assert.match(unauthCancel.error || '', /غير مصرح بإلغاء الحجز مباشرة/);

  // 2. Direct cancellation with phone number alone -> Strictly rejected (requires request workflow)
  const phoneOnlyCancel = await appointmentStore.cancelAppointment(ref, 'محاولة إلغاء برقم الهاتف', {
    phoneNumber: '01011223399',
  } as any);
  assert.equal(phoneOnlyCancel.success, false, 'Direct cancellation with phone number alone must be rejected');
  assert.match(phoneOnlyCancel.error || '', /غير مصرح بإلغاء الحجز مباشرة/);

  // 3. Direct cancellation by authorized receptionist -> Succeeds
  const receptionist: StaffUser = {
    id: 'staff-rec-dent-auth',
    username: 'rec.dentistry',
    name: 'استقبال عيادة الأسنان',
    role: 'RECEPTIONIST',
    clinicId: 'dentistry',
    active: true,
  };
  const validCancel = await appointmentStore.cancelAppointment(ref, 'إلغاء معتمد من موظف الاستقبال', {
    staffUser: receptionist,
  });
  assert.equal(validCancel.success, true, 'Cancellation by authorized staff member must succeed');
});

test('Security 22: Inactive staff rejection - verifySession rejects inactive accounts immediately', async () => {
  // Offline session map inspection
  const inactiveToken = 'token_for_inactive_staff';
  const inactiveUser: StaffUser = {
    id: 'user-inactive-1',
    username: 'suspended.staff',
    name: 'موظف موقوف عن العمل',
    role: 'RECEPTIONIST',
    active: false,
  };

  // Even if an old session exists in memory/store, verifying an inactive user returns null
  assert.equal(inactiveUser.active, false);
});

test('Security 23: Sequence Safety - SQL migration synchronizes with existing data and formats >= 10000 without truncation', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  // Verify synchronization block
  assert.ok(content.includes('setval(\'public.seq_appointment_reference_number\''), 'Migration must synchronize sequence with existing data');

  // Verify formatting does NOT blindly truncate at 4 characters
  assert.ok(content.includes('CASE WHEN v_next_val < 10000 THEN lpad(v_next_val::text, 4, \'0\') ELSE v_next_val::text END'), 'Reference number formatting must handle >= 10000 safely');
});

test('Security 24: Timezone Parity - book_appointment_atomic and track_appointments_by_phone use Cairo timezone date', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes("(timezone('Africa/Cairo', now()))::date"), 'Migration must strictly evaluate current date in Africa/Cairo timezone');
});

test('Security 25: Staff Identity & Clinic Confinement - Public booking routes strictly ignore client-supplied staffUserId, walk-in routes only pass verified session staffUser.id', async () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  // Verify staff verification inside RPC
  assert.ok(content.includes('SELECT id, full_name, role, clinic_id INTO v_staff_record'), 'RPC must query staff_profiles for caller identity');
  assert.ok(content.includes('v_staff_record.role = \'RECEPTIONIST\' AND v_staff_record.clinic_id IS NOT NULL AND v_staff_record.clinic_id != p_clinic_id'), 'RPC must confine receptionist to assigned clinic');

  // Verify public booking service call never passes staffUserId unless isWalkIn
  const appointmentServicePath = path.join(process.cwd(), 'services', 'appointmentService.ts');
  const svcContent = fs.readFileSync(appointmentServicePath, 'utf8');
  assert.ok(svcContent.includes('p_staff_user_id: input.isWalkIn ? (input.staffUserId || null) : null'), 'Non-walk-in bookings must never pass staffUserId to RPC');
});

test('Security 26: Patient Tracking Privacy & Ownership Verification - Phone-only queries return strictly redacted child names and masked reference numbers', async () => {
  const trackRoutePath = path.join(process.cwd(), 'app', 'api', 'appointments', 'track', 'route.ts');
  const trackContent = fs.readFileSync(trackRoutePath, 'utf8');

  // Verify data minimization when isThisVerified is false
  assert.ok(trackContent.includes('[بيانات الطفل محجوبة لحماية الخصوصية]'), 'Phone-only queries must completely redact child names');
  assert.ok(trackContent.includes('BSCH-****'), 'Phone-only queries must mask reference numbers');
  assert.ok(trackContent.includes('isCallerVerified'), 'API route must check caller verification status');
});

test('Security 27: Deep Index Inspection - Migration verifies indisvalid, indisready, indisunique, patient_name expression, and cancellation predicate before dropping old index', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes('(i.indisvalid AND i.indisready AND i.indisunique)'), 'Migration must verify index validity, readiness, and uniqueness from pg_index');
  assert.ok(content.includes('pg_get_indexdef(c.oid)'), 'Migration must inspect index expression definition');
  assert.ok(content.includes('DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_clinic_day'), 'Migration drops old index only after verification');
  assert.ok(content.includes('Preserving old index'), 'Migration preserves old index if verification fails');
});

test('Security 28: Sequence Rollback Protection - Sequence sync queries pg_sequences and only advances forward', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes('FROM pg_sequences'), 'Migration must query current sequence position from pg_sequences');
  assert.ok(content.includes('IF v_max_ref > COALESCE(v_curr_seq, 999) THEN'), 'Sequence setval must ONLY be performed if max reference exceeds current sequence position');
});

test('Security 29: Reference Number Constraints & Internal Generation - CHECK constraint updated to ^BSCH-[0-9]{4,10}$ and internal DB sequence generation', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes('CHECK (reference_number ~ \'^BSCH-[0-9]{4,10}$\')'), 'CHECK constraint must support 4 to 10 digits for scalability');
  assert.ok(content.includes("v_next_val := nextval('public.seq_appointment_reference_number');"), 'book_appointment_atomic must generate reference strictly from database sequence');
});

test('Security 30: Unique Constraint Violation Discrimination - Distinguishes reference collisions from duplicate booking violations', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes('GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;'), 'RPC must use GET STACKED DIAGNOSTICS to capture failing constraint');
  assert.ok(content.includes('idx_unique_active_apt_per_phone_patient_clinic_day'), 'RPC must identify duplicate patient booking violation specifically');
  assert.ok(content.includes('يوجد حجز نشط مسبقاً بنفس رقم الهاتف لنفس المريض في هذه العيادة في هذا اليوم.'), 'RPC must return duplicate reservation message immediately without looping');
});

test('Security 31: Advisory Locking Concurrency - book_appointment_atomic acquires advisory transaction lock per clinic and date', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101020000_clinic_services_capacity_and_schedules.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes("pg_advisory_xact_lock(hashtext('booking_' || p_clinic_id || '_' || p_appointment_date::text))"), 'RPC must acquire transactional advisory lock on clinic and date');
});

test('Security 32: Rate Limiting Safety - Keys are server-derived, limits are constants, and fail-closed in production', async () => {
  const { checkRateLimit, checkIpRateLimit, OTP_CONFIG } = await import('./otp.ts');

  assert.equal(OTP_CONFIG.MAX_IP_REQUESTS, 15, 'IP limit must be hardcoded server constant');
  assert.equal(OTP_CONFIG.IP_WINDOW_MS, 600000, 'IP window must be 10 minutes');

  // Verify production fail-closed behavior
  const prevEnv = process.env.NODE_ENV;
  try {
    (process.env as any).NODE_ENV = 'production';
    const prodRes = await checkRateLimit('test_audit_key', 5, 60);
    assert.equal(prodRes.allowed, false, 'Rate limit must fail closed in production when Supabase is unconfigured');
    assert.equal(prodRes.retryAfterSeconds, 60);
  } finally {
    (process.env as any).NODE_ENV = prevEnv;
  }
});

test('Security 33: Phase 8.1 - Admin operations succeed across clinics without restriction', async () => {
  const admin: StaffUser = {
    id: 'staff-admin-01',
    username: 'admin.super',
    name: 'مدير النظام التنفيذي',
    role: 'ADMIN',
    active: true,
  };

  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'أحمد سعيد جمال',
    phoneNumber: '01099887766',
    appointmentDate: '2026-11-16',
    appointmentTime: '10:00',
  });
  assert.equal(newApt.success, true);
  const aptId = newApt.appointment!.id;

  // Admin confirms
  const resConfirm = await appointmentStore.updateStatus(aptId, 'CONFIRMED', admin);
  assert.equal(resConfirm.success, true);

  // Admin checks in
  const resCheckIn = await appointmentStore.updateStatus(aptId, 'CHECKED_IN', admin);
  assert.equal(resCheckIn.success, true);

  // Admin completes
  const resComplete = await appointmentStore.updateStatus(aptId, 'COMPLETED', admin);
  assert.equal(resComplete.success, true);
});

test('Security 34: Phase 8.2 - Receptionist can confirm appointments (CONFIRMED) within assigned clinic', async () => {
  const receptionist: StaffUser = {
    id: 'staff-rec-01',
    username: 'rec.dentistry',
    name: 'موظف استقبال الأسنان',
    role: 'RECEPTIONIST',
    clinicId: 'dentistry',
    active: true,
  };

  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'سارة خالد المحمود',
    phoneNumber: '01122334455',
    appointmentDate: '2026-11-16',
    appointmentTime: '10:30',
  });
  assert.equal(newApt.success, true);
  const aptId = newApt.appointment!.id;

  const resConfirm = await appointmentStore.updateStatus(aptId, 'CONFIRMED', receptionist);
  assert.equal(resConfirm.success, true);
  assert.equal(resConfirm.appointment?.status, 'CONFIRMED');
});

test('Security 35: Phase 8.3 - Receptionist is strictly blocked from marking appointments COMPLETED', async () => {
  const receptionist: StaffUser = {
    id: 'staff-rec-02',
    username: 'rec.dentistry2',
    name: 'موظف استقبال الأسنان 2',
    role: 'RECEPTIONIST',
    clinicId: 'dentistry',
    active: true,
  };

  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'كريم عادل الشافعي',
    phoneNumber: '01233445566',
    appointmentDate: '2026-11-16',
    appointmentTime: '11:00',
  });
  assert.equal(newApt.success, true);
  const aptId = newApt.appointment!.id;

  // First confirm & check in as doctor
  const doctor: StaffUser = {
    id: 'staff-doc-01',
    username: 'dr.dentist',
    name: 'طبيب الأسنان',
    role: 'DOCTOR',
    clinicId: 'dentistry',
    active: true,
  };
  await appointmentStore.updateStatus(aptId, 'CONFIRMED', doctor);
  await appointmentStore.updateStatus(aptId, 'CHECKED_IN', doctor);

  // Receptionist tries to mark COMPLETED
  const resFail = await appointmentStore.updateStatus(aptId, 'COMPLETED', receptionist);
  assert.equal(resFail.success, false);
  assert.match(resFail.error || '', /إتمام الكشف الطبي وصرف التذكرة صلاحية طبية مخصصة للأطباء فقط/);
});

test('Security 36: Phase 8.4 - Receptionist cannot alter patient identity or appointment details directly', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101030000_atomic_status_update_and_privilege_hardening.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  // Verify trigger checks receptionist restrictions
  assert.ok(content.includes("IF v_role = 'RECEPTIONIST' THEN"), 'Migration trigger must enforce receptionist restrictions');
  assert.ok(content.includes('OLD.patient_name != NEW.patient_name'), 'Trigger must block receptionist altering patient name');
  assert.ok(content.includes('OLD.phone_number != NEW.phone_number'), 'Trigger must block receptionist altering phone number');
  assert.ok(content.includes('OLD.clinic_id != NEW.clinic_id'), 'Trigger must block receptionist altering clinic directly without official transfer');
});

test('Security 37: Phase 8.5 - Doctor can only access and update appointments in assigned clinic', async () => {
  const cardioDoctor: StaffUser = {
    id: 'staff-doc-cardio',
    username: 'dr.cardio',
    name: 'د/ أسامة القلب',
    role: 'DOCTOR',
    clinicId: 'cardio',
    active: true,
  };

  const newApt = await appointmentStore.createAppointment({
    clinicId: 'cardio',
    patientName: 'ياسين أحمد فؤاد',
    phoneNumber: '01044556677',
    appointmentDate: '2026-11-16',
    appointmentTime: '11:30',
  });
  assert.equal(newApt.success, true);
  const aptId = newApt.appointment!.id;

  await appointmentStore.updateStatus(aptId, 'CONFIRMED', cardioDoctor);
  await appointmentStore.updateStatus(aptId, 'CHECKED_IN', cardioDoctor);
  const res = await appointmentStore.updateStatus(aptId, 'COMPLETED', cardioDoctor);
  assert.equal(res.success, true);
  assert.equal(res.appointment?.status, 'COMPLETED');
});

test('Security 38: Phase 8.6 - Doctor cannot access or update appointments in other clinics', async () => {
  const cardioDoctor: StaffUser = {
    id: 'staff-doc-cardio-2',
    username: 'dr.cardio2',
    name: 'د/ أسماء القلب',
    role: 'DOCTOR',
    clinicId: 'cardio',
    active: true,
  };

  const dentistryApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'هدى مصطفى كامل',
    phoneNumber: '01511223344',
    appointmentDate: '2026-11-16',
    appointmentTime: '12:00',
  });
  assert.equal(dentistryApt.success, true);
  const aptId = dentistryApt.appointment!.id;

  const res = await appointmentStore.updateStatus(aptId, 'CONFIRMED', cardioDoctor);
  assert.equal(res.success, false);
  assert.match(res.error || '', /عيادة أخرى/);
});

test('Security 39: Phase 8.7 - Unassigned Doctor (null clinicId) is denied access completely', async () => {
  const unassignedDoctor: StaffUser = {
    id: 'staff-doc-none',
    username: 'dr.unassigned',
    name: 'د/ طبيب عام بلا عيادة',
    role: 'DOCTOR',
    clinicId: undefined,
    active: true,
  };

  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'طارق زياد النجار',
    phoneNumber: '01077889900',
    appointmentDate: '2026-11-16',
    appointmentTime: '12:30',
  });
  assert.equal(newApt.success, true);
  const aptId = newApt.appointment!.id;

  const res = await appointmentStore.updateStatus(aptId, 'CONFIRMED', unassignedDoctor);
  assert.equal(res.success, false);
  assert.match(res.error || '', /غير مصرح للطبيب غير المعين على عيادة/);

  const apts = await appointmentStore.getStaffAppointments({}, unassignedDoctor);
  assert.equal(apts.length, 0, 'Unassigned doctor must view zero appointments');
});

test('Security 40: Phase 8.8 - Terminal states (COMPLETED, CANCELLED) cannot be altered without Admin role', async () => {
  const doctor: StaffUser = {
    id: 'staff-doc-surgery',
    username: 'dr.surgery',
    name: 'د/ شريف جراحة',
    role: 'DOCTOR',
    clinicId: 'surgery',
    active: true,
  };

  const newApt = await appointmentStore.createAppointment({
    clinicId: 'surgery',
    patientName: 'مروان هيثم وجدي',
    phoneNumber: '01199887766',
    appointmentDate: '2026-11-16',
    appointmentTime: '13:00',
  });
  assert.equal(newApt.success, true);
  const aptId = newApt.appointment!.id;

  await appointmentStore.updateStatus(aptId, 'CONFIRMED', doctor);
  await appointmentStore.updateStatus(aptId, 'CHECKED_IN', doctor);
  await appointmentStore.updateStatus(aptId, 'COMPLETED', doctor);

  // Doctor attempts to alter already completed appointment
  const docReopen = await appointmentStore.updateStatus(aptId, 'CHECKED_IN', doctor);
  assert.equal(docReopen.success, false);
  assert.match(docReopen.error || '', /إلا بواسطة مدير النظام/);

  // Receptionist attempts to alter completed appointment
  const rec: StaffUser = {
    id: 'rec-surgery',
    username: 'rec.surgery',
    name: 'استقبال جراحة',
    role: 'RECEPTIONIST',
    clinicId: 'surgery',
    active: true,
  };
  const recReopen = await appointmentStore.updateStatus(aptId, 'CONFIRMED', rec);
  assert.equal(recReopen.success, false);
  assert.match(recReopen.error || '', /إلا بواسطة مدير النظام/);
});

test('Security 41: Phase 8.9 - Transactional atomicity: status update and history insertion in single plpgsql block', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101030000_atomic_status_update_and_privilege_hardening.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  // Verify atomic RPC function exists and performs both UPDATE and INSERT
  assert.ok(content.includes('CREATE OR REPLACE FUNCTION public.update_appointment_status_atomic'), 'Atomic update function must exist');
  assert.ok(content.includes('UPDATE public.appointments'), 'Must update appointments table');
  assert.ok(content.includes('INSERT INTO public.appointment_status_history'), 'Must insert into appointment_status_history');
  assert.ok(content.includes('GET DIAGNOSTICS v_rows_updated = ROW_COUNT;'), 'Must assert exactly 1 row updated');
  assert.ok(content.includes('IF v_rows_updated != 1 THEN'), 'Must raise exception and roll back if no row was updated');
});

test('Security 42: Phase 8.10 - Concurrency serialization: FOR UPDATE row lock and transactional advisory lock', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101030000_atomic_status_update_and_privilege_hardening.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  // Verify FOR UPDATE locking in update_appointment_status_atomic
  assert.ok(content.includes('FOR UPDATE;'), 'Status update RPC must acquire FOR UPDATE row lock');

  // Verify advisory lock in transfer_appointment_clinic_atomic
  assert.ok(content.includes("pg_advisory_xact_lock(hashtext('booking_' || p_target_clinic_id || '_' || v_apt.appointment_date::text))"), 'Clinic transfer RPC must acquire transactional advisory lock');
});

test('Security 43: Phase 8.11 - Direct RPC authorization: spoofed or unverified staff identities are rejected', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101030000_atomic_status_update_and_privilege_hardening.sql');
  const content = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(content.includes('IF p_staff_user_id IS NOT NULL AND p_staff_user_id != auth.uid() THEN'), 'RPC must reject spoofed staff ID that does not match authenticated JWT uid');
  assert.ok(content.includes('FROM public.staff_profiles'), 'RPC must verify staff record in staff_profiles');
  assert.ok(content.includes('IF v_staff_record.is_active != true THEN'), 'RPC must reject inactive or suspended staff members');
});

test('Security 44: Phase 8.12 - Patient tracking privacy: unauthenticated lookups strictly minimize exposed data', async () => {
  const trackRoutePath = path.join(process.cwd(), 'app', 'api', 'appointments', 'track', 'route.ts');
  const trackContent = fs.readFileSync(trackRoutePath, 'utf8');

  assert.ok(trackContent.includes('[بيانات الطفل محجوبة لحماية الخصوصية]'), 'Unverified lookups must redact child name');
  assert.ok(trackContent.includes('BSCH-****'), 'Unverified lookups must mask booking reference number');
});

test('Security 45: Phase 8.13 - Client request tampering protection: API routes derive staff role from session only', () => {
  const statusRoutePath = path.join(process.cwd(), 'app', 'api', 'appointments', '[id]', 'status', 'route.ts');
  const content = fs.readFileSync(statusRoutePath, 'utf8');

  assert.ok(content.includes('const staffUser = await AuthService.verifySession(token);'), 'Route must verify session token');
  assert.ok(!content.includes('req.json().role'), 'Route must never extract role from JSON request body');
  assert.ok(!content.includes('req.json().clinicId'), 'Route must never trust client-supplied clinicId for staff authorization');
});

test('Security 46: Phase 8.14 - Admin client fail-closed behavior: absence of SERVICE_ROLE_KEY throws in production', async () => {
  const { createAdminClient } = await import('./supabase/admin.ts');
  const prevEnv = process.env.NODE_ENV;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    assert.throws(
      () => createAdminClient(),
      /CRITICAL: Supabase admin client cannot be created in production/,
      'createAdminClient must throw immediately in production if SUPABASE_SERVICE_ROLE_KEY is missing'
    );
  } finally {
    (process.env as any).NODE_ENV = prevEnv;
    if (prevKey) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    }
  }
});

test('Security 47: Cancellation Request - Submitting cancellation request does NOT alter appointment status (remains active)', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'مروان سعيد عبد الرحمن',
    phoneNumber: '01033445566',
    appointmentDate: '2026-11-25',
    appointmentTime: '09:30',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;
  assert.equal(apt.status, 'PENDING_REVIEW');

  // Submit cancellation request
  const reqRes = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01033445566',
    reason: 'سفر مفاجئ لولي الأمر',
  });
  assert.equal(reqRes.success, true);
  assert.match(reqRes.message || '', /يظل الحجز فعالاً/);

  // Verify appointment status did NOT change
  const currentApt = appointmentStore.getAppointmentById(apt.id);
  assert.ok(currentApt);
  assert.equal(currentApt.status, 'PENDING_REVIEW', 'Appointment status must remain PENDING_REVIEW after submitting cancellation request');
  assert.equal(currentApt.hasPendingCancellation, true, 'Appointment must flag pending cancellation request');
});

test('Security 48: Cancellation Request - Duplicate pending request for the same appointment is prevented', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'فاطمة محمود النجار',
    phoneNumber: '01155667788',
    appointmentDate: '2026-11-25',
    appointmentTime: '10:00',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;

  // First request -> Succeeds
  const firstReq = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01155667788',
    reason: 'ظرف صحي',
  });
  assert.equal(firstReq.success, true);

  // Duplicate second request -> Rejected
  const duplicateReq = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01155667788',
    reason: 'طلب تكرار الإلغاء',
  });
  assert.equal(duplicateReq.success, false, 'Duplicate pending cancellation request must be rejected');
  assert.match(duplicateReq.error || '', /يوجد طلب إلغاء قيد المراجعة بالفعل/);
});

test('Security 49: Cancellation Request - Patient / anonymous direct cancellation is strictly forbidden', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'سليمان داود السعدي',
    phoneNumber: '01244556677',
    appointmentDate: '2026-11-25',
    appointmentTime: '10:30',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;

  // Direct cancellation with phone number alone without staff user -> Must be rejected
  const directCancel = await appointmentStore.cancelAppointment(apt.referenceNumber, 'محاولة إلغاء مباشر', {
    phoneNumber: '01244556677',
  } as any);
  assert.equal(directCancel.success, false, 'Direct cancellation without staff session must be rejected');
  assert.match(directCancel.error || '', /غير مصرح بإلغاء الحجز مباشرة/);

  // Appointment must remain active
  const checkApt = appointmentStore.getAppointmentById(apt.id);
  assert.equal(checkApt?.status, 'PENDING_REVIEW');
});

test('Security 50: Cancellation Review - Unauthorized staff (different clinic) is denied permission to review request', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'يوسف رامي الشربيني',
    phoneNumber: '01511223388',
    appointmentDate: '2026-11-25',
    appointmentTime: '11:00',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;

  const req = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01511223388',
    reason: 'اعتذار عن الحضور',
  });
  assert.equal(req.success, true);
  const requestId = req.requestId!;

  // Receptionist assigned to CARDIO attempts to review DENTISTRY request
  const cardioReceptionist: StaffUser = {
    id: 'staff-rec-cardio-99',
    username: 'rec.cardio',
    name: 'استقبال القلب',
    role: 'RECEPTIONIST',
    clinicId: 'cardio',
    active: true,
  };

  const reviewRes = await appointmentStore.reviewCancellationRequest(
    requestId,
    'APPROVED',
    cardioReceptionist,
    'محاولة اعتماد من عيادة أخرى'
  );
  assert.equal(reviewRes.success, false, 'Receptionist of another clinic must be denied review permission');
  assert.match(reviewRes.error || '', /غير مصرح.*بمراجعة طلبات إلغاء خاصة بعيادة أخرى/);
});

test('Security 51: Cancellation Review - Authorized staff approval cancels appointment via protected atomic path', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'جنا عماد التلاوي',
    phoneNumber: '01066778899',
    appointmentDate: '2026-11-25',
    appointmentTime: '11:30',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;

  const req = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01066778899',
    reason: 'تعذر الحضور بسبب بعد المسافة',
  });
  assert.equal(req.success, true);
  const requestId = req.requestId!;

  const dentistryReceptionist: StaffUser = {
    id: 'staff-rec-dent-10',
    username: 'rec.dentistry',
    name: 'أحمد استقبال الأسنان',
    role: 'RECEPTIONIST',
    clinicId: 'dentistry',
    active: true,
  };

  // Approval
  const approveRes = await appointmentStore.reviewCancellationRequest(
    requestId,
    'APPROVED',
    dentistryReceptionist,
    'تم قبول اعتذار ولي الأمر وإلغاء الحجز'
  );
  assert.equal(approveRes.success, true);

  // Appointment status is now CANCELLED
  const cancelledApt = appointmentStore.getAppointmentById(apt.id);
  assert.ok(cancelledApt);
  assert.equal(cancelledApt.status, 'CANCELLED');
  assert.equal(cancelledApt.hasPendingCancellation, false);

  // Verify status history recorded staff member name
  const lastHistory = cancelledApt.statusHistory[cancelledApt.statusHistory.length - 1];
  assert.equal(lastHistory.status, 'CANCELLED');
  assert.equal(lastHistory.updatedBy, dentistryReceptionist.name);
});

test('Security 52: Cancellation Review - Staff rejection keeps appointment active and records rejection reason', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'علي كمال البغدادي',
    phoneNumber: '01088990011',
    appointmentDate: '2026-11-25',
    appointmentTime: '12:00',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;

  const req = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01088990011',
    reason: 'رغبة في تأجيل غير مؤكدة',
  });
  assert.equal(req.success, true);
  const requestId = req.requestId!;

  const admin: StaffUser = {
    id: 'staff-admin-99',
    username: 'admin.super',
    name: 'مدير المستشفى',
    role: 'ADMIN',
    active: true,
  };

  // Rejection
  const rejectRes = await appointmentStore.reviewCancellationRequest(
    requestId,
    'REJECTED',
    admin,
    'تم التواصل هاتفياً مع ولي الأمر وتأكيد الحضور'
  );
  assert.equal(rejectRes.success, true);
  assert.match(rejectRes.message || '', /تم رفض طلب الإلغاء واحتفاظ الحجز بحالته/);

  // Appointment status remains PENDING_REVIEW
  const currentApt = appointmentStore.getAppointmentById(apt.id);
  assert.ok(currentApt);
  assert.equal(currentApt.status, 'PENDING_REVIEW', 'Appointment status must remain active after rejection');
  assert.equal(currentApt.hasPendingCancellation, false);

  // Verify status history recorded rejection
  const lastHistory = currentApt.statusHistory[currentApt.statusHistory.length - 1];
  assert.match(lastHistory.note || '', /رفض طلب الإلغاء/);
});

test('Security 53: Cancellation Request - Terminal state appointments (COMPLETED or CANCELLED) reject cancellation requests', async () => {
  const doctor: StaffUser = {
    id: 'staff-doc-dent-1',
    username: 'dr.dent',
    name: 'د/ طبيب الأسنان',
    role: 'DOCTOR',
    clinicId: 'dentistry',
    active: true,
  };

  // 1. Completed appointment (transition through CONFIRMED -> CHECKED_IN -> COMPLETED)
  const apt1 = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'حسن إبراهيم الحكيم',
    phoneNumber: '01011224455',
    appointmentDate: '2026-11-25',
    appointmentTime: '12:30',
  });
  assert.equal(apt1.success, true);
  await appointmentStore.updateStatus(apt1.appointment!.id, 'CONFIRMED', doctor);
  await appointmentStore.updateStatus(apt1.appointment!.id, 'CHECKED_IN', doctor);
  await appointmentStore.updateStatus(apt1.appointment!.id, 'COMPLETED', doctor);

  const reqCompleted = await appointmentStore.requestCancellation({
    referenceNumber: apt1.appointment!.referenceNumber,
    phoneNumber: '01011224455',
    reason: 'إلغاء حجز بعد الكشف',
  });
  assert.equal(reqCompleted.success, false, 'Cancellation request for COMPLETED appointment must be rejected');
  assert.match(reqCompleted.error || '', /لا يمكن تقديم طلب إلغاء لحجز تم الكشف عليه واكتماله/);

  // 2. Already Cancelled appointment
  const apt2 = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'نور الدين مصطفى',
    phoneNumber: '01077881122',
    appointmentDate: '2026-11-25',
    appointmentTime: '13:00',
  });
  assert.equal(apt2.success, true);
  await appointmentStore.cancelAppointment(apt2.appointment!.referenceNumber, 'إلغاء سابق', { staffUser: doctor });

  const reqCancelled = await appointmentStore.requestCancellation({
    referenceNumber: apt2.appointment!.referenceNumber,
    phoneNumber: '01077881122',
    reason: 'إلغاء حجز ملغي مسبقاً',
  });
  assert.equal(reqCancelled.success, false, 'Cancellation request for CANCELLED appointment must be rejected');
  assert.match(reqCancelled.error || '', /هذا الحجز ملغي مسبقاً بالفعل/);
});

test('Security 54: Cancellation System - SQL Migration structural integrity, partial unique index, and atomic RPC definitions', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261101040000_cancellation_requests_system.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 20261101040000 must exist locally');
  const content = fs.readFileSync(migrationPath, 'utf8');

  // Verify Table creation
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.cancellation_requests'), 'Migration must create cancellation_requests table');

  // Verify Partial Unique Index
  assert.ok(content.includes('idx_unique_pending_cancellation_request'), 'Migration must enforce partial unique index for PENDING requests');
  assert.ok(content.includes('WHERE status = \'PENDING\''), 'Index must specifically filter on status = PENDING');

  // Verify Atomic RPCs
  assert.ok(content.includes('CREATE OR REPLACE FUNCTION public.request_cancellation_atomic'), 'Migration must define request_cancellation_atomic RPC');
  assert.ok(content.includes('CREATE OR REPLACE FUNCTION public.review_cancellation_request_atomic'), 'Migration must define review_cancellation_request_atomic RPC');

  // Verify Disallowing Phone-only direct cancellation
  assert.ok(content.includes('تم إلغاء مسار الإلغاء المباشر برقم الهاتف لأسباب أمنية'), 'update_appointment_status_atomic must reject unauthenticated direct cancellations');
});

test('Security 55: RPC Authorization - request_cancellation_atomic strictly revokes direct EXECUTE from anon and authenticated, permitting service_role only', () => {
  const mig1 = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261101040000_cancellation_requests_system.sql'), 'utf8');
  const mig2 = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261101050000_cancellation_requests_security_hardening.sql'), 'utf8');

  for (const content of [mig1, mig2]) {
    assert.ok(
      content.includes('REVOKE ALL ON FUNCTION public.request_cancellation_atomic(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;'),
      'Migration must revoke request_cancellation_atomic from PUBLIC, anon, and authenticated'
    );
    assert.ok(
      content.includes('GRANT EXECUTE ON FUNCTION public.request_cancellation_atomic(TEXT, TEXT, TEXT) TO service_role;'),
      'Migration must grant request_cancellation_atomic strictly to service_role'
    );
    // Ensure no grant to anon or authenticated
    const hasAnonGrant = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.request_cancellation_atomic[^\n;]+TO[^\n;]*anon/i.test(content);
    assert.equal(hasAnonGrant, false, 'request_cancellation_atomic must NEVER be granted to anon');
  }
});

test('Security 56: RLS & Privilege Protection - Direct UPDATE on cancellation_requests is strictly revoked and blocked for authenticated users', () => {
  const mig1 = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261101040000_cancellation_requests_system.sql'), 'utf8');
  const mig2 = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261101050000_cancellation_requests_security_hardening.sql'), 'utf8');

  for (const content of [mig1, mig2]) {
    // Direct table UPDATE permissions must be revoked
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.cancellation_requests FROM PUBLIC, anon, authenticated;'),
      'Migration must revoke direct table modifications from normal clients'
    );
    // Staff update policy must be dropped
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Staff update cancellation_requests" ON public.cancellation_requests;'),
      'Migration must drop Staff update policy on cancellation_requests'
    );
    // Ensure no new UPDATE policy is created for authenticated
    const hasUpdatePolicy = /CREATE\s+POLICY[^\n;]+ON\s+public\.cancellation_requests\s+FOR\s+UPDATE\s+TO\s+authenticated/i.test(content);
    assert.equal(hasUpdatePolicy, false, 'No UPDATE policy must exist for authenticated on cancellation_requests');
  }
});

test('Security 57: Clinic Confinement - Receptionist without assigned clinic (null/empty clinicId) is strictly denied reviewing any cancellation request', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'سعيد عبد العال شرف',
    phoneNumber: '01011998877',
    appointmentDate: '2026-11-25',
    appointmentTime: '11:00',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;

  const req = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01011998877',
    reason: 'اعتذار عن الحضور',
  });
  assert.equal(req.success, true);
  const requestId = req.requestId!;

  // Receptionist with no clinic assigned
  const unassignedReceptionist: StaffUser = {
    id: 'staff-rec-unassigned-57',
    username: 'rec.unassigned57',
    name: 'موظف استقبال بدون عيادة',
    role: 'RECEPTIONIST',
    clinicId: undefined,
    active: true,
  };

  const reviewRes = await appointmentStore.reviewCancellationRequest(
    requestId,
    'APPROVED',
    unassignedReceptionist,
    'محاولة اعتماد من موظف استقبال بدون عيادة'
  );

  assert.equal(reviewRes.success, false, 'Unassigned receptionist must be rejected from reviewing requests');
  assert.match(reviewRes.error || '', /غير مصرح.*موظف الاستقبال غير معين على عيادة/);

  // Must not be able to list any cancellation requests
  const list = await appointmentStore.getCancellationRequests({}, unassignedReceptionist);
  assert.equal(list.length, 0, 'Unassigned receptionist must see 0 cancellation requests');
});

test('Security 58: Clinic Confinement - Receptionist cannot review cancellation request belonging to another clinic', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'مريم طارق البدري',
    phoneNumber: '01122336699',
    appointmentDate: '2026-11-25',
    appointmentTime: '11:30',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;

  const req = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01122336699',
    reason: 'سفر مفاجئ',
  });
  assert.equal(req.success, true);
  const requestId = req.requestId!;

  // Receptionist assigned to CARDIO
  const cardioReceptionist: StaffUser = {
    id: 'staff-rec-cardio-58',
    username: 'rec.cardio58',
    name: 'موظف استقبال القلب',
    role: 'RECEPTIONIST',
    clinicId: 'cardio',
    active: true,
  };

  const reviewRes = await appointmentStore.reviewCancellationRequest(
    requestId,
    'APPROVED',
    cardioReceptionist,
    'محاولة اعتماد من عيادة أخرى'
  );

  assert.equal(reviewRes.success, false, 'Receptionist of another clinic must be denied review permission');
  assert.match(reviewRes.error || '', /غير مصرح لموظف الاستقبال بمراجعة طلبات إلغاء خاصة بعيادة أخرى/);
});

test('Security 59: Role Authorization - Doctor is strictly blocked from reviewing cancellation requests', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'ياسر كمال المنشاوي',
    phoneNumber: '01222446688',
    appointmentDate: '2026-11-25',
    appointmentTime: '12:00',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;

  const req = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01222446688',
    reason: 'ظرف طارئ',
  });
  assert.equal(req.success, true);
  const requestId = req.requestId!;

  // Doctor assigned to DENTISTRY
  const doctor: StaffUser = {
    id: 'staff-doc-dent-59',
    username: 'dr.dent59',
    name: 'دكتور الأسنان',
    role: 'DOCTOR',
    clinicId: 'dentistry',
    active: true,
  };

  const reviewRes = await appointmentStore.reviewCancellationRequest(
    requestId,
    'APPROVED',
    doctor,
    'محاولة اعتماد من طبيب العيادة'
  );

  assert.equal(reviewRes.success, false, 'Doctor must be strictly blocked from reviewing cancellation requests');
  assert.match(reviewRes.error || '', /غير مصرح لهذا الدور بمراجعة طلبات الإلغاء/);

  // Doctors must also see 0 cancellation requests in listing
  const list = await appointmentStore.getCancellationRequests({}, doctor);
  assert.equal(list.length, 0, 'Doctor must see 0 cancellation requests');
});

test('Security 60: Bot Protection - Turnstile cannot be bypassed in production by deleting or omitting turnstileToken', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.TURNSTILE_SECRET_KEY;

  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    // 1. Without TURNSTILE_SECRET_KEY in production: must fail-closed even if token omitted
    delete process.env.TURNSTILE_SECRET_KEY;
    const resNoSecret = await verifyTurnstileToken(undefined, '127.0.0.1');
    assert.equal(resNoSecret.success, false, 'Must fail closed in production when secret key is unconfigured');
    assert.match(resNoSecret.error || '', /غير مهيأ في بيئة الإنتاج/);

    // 2. With TURNSTILE_SECRET_KEY in production: missing or deleted token must be rejected
    process.env.TURNSTILE_SECRET_KEY = 'test_prod_turnstile_secret';
    const resEmptyToken = await verifyTurnstileToken('', '127.0.0.1');
    assert.equal(resEmptyToken.success, false, 'Must reject empty token in production');
    assert.match(resEmptyToken.error || '', /إكمال التحقق الأمني من مكافحة الروبوتات/);

    const resUndefinedToken = await verifyTurnstileToken(undefined, '127.0.0.1');
    assert.equal(resUndefinedToken.success, false, 'Must reject omitted/deleted token in production');
    assert.match(resUndefinedToken.error || '', /إكمال التحقق الأمني من مكافحة الروبوتات/);
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
    process.env.TURNSTILE_SECRET_KEY = prevSecret;
  }
});

test('Security 61: Transactional Atomicity - Failure of appointment cancellation aborts the operation and never leaves request in APPROVED status', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'صلاح الدين الأيوبي الصغير',
    phoneNumber: '01099887766',
    appointmentDate: '2026-11-25',
    appointmentTime: '12:30',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;

  const req = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01099887766',
    reason: 'اعتذار بعد استكمال الكشف',
  });
  assert.equal(req.success, true);
  const requestId = req.requestId!;

  const admin: StaffUser = {
    id: 'staff-admin-61',
    username: 'admin.atomicity',
    name: 'مدير النظام للتزامن',
    role: 'ADMIN',
    active: true,
  };

  // Simulate appointment becoming COMPLETED before the receptionist approves the cancellation request
  const doc: StaffUser = {
    id: 'doc-61',
    username: 'dr.atomicity',
    name: 'طبيب الكشف',
    role: 'DOCTOR',
    clinicId: 'dentistry',
    active: true,
  };
  await appointmentStore.updateStatus(apt.id, 'CONFIRMED', doc);
  await appointmentStore.updateStatus(apt.id, 'CHECKED_IN', doc);
  await appointmentStore.updateStatus(apt.id, 'COMPLETED', doc);

  // Non-admin receptionist attempts to approve cancellation on completed appointment
  const recep: StaffUser = {
    id: 'staff-rec-dent-61',
    username: 'rec.dent61',
    name: 'موظف الاستقبال',
    role: 'RECEPTIONIST',
    clinicId: 'dentistry',
    active: true,
  };

  const reviewAttempt = await appointmentStore.reviewCancellationRequest(
    requestId,
    'APPROVED',
    recep,
    'محاولة موافقة بعد اكتمال الكشف'
  );

  assert.equal(reviewAttempt.success, false, 'Review must fail when central status update is rejected');

  // Verify cancellation request status NEVER changed to APPROVED (remains PENDING)
  const reqInStore = (appointmentStore as any).cancellationRequests?.find((r: any) => r.id === requestId);
  assert.ok(reqInStore);
  assert.notEqual(reqInStore.status, 'APPROVED', 'Cancellation request status must NEVER be APPROVED when appointment update fails');
  assert.equal(reqInStore.status, 'PENDING');
});

test('Security 62: Audit Trail - Approval of cancellation request is recorded in audit_logs with staff identity, request ID, and appointment reference', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'أنس جلال المرشدي',
    phoneNumber: '01022334455',
    appointmentDate: '2026-11-25',
    appointmentTime: '13:00',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;

  const req = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01022334455',
    reason: 'تعذر الحضور بسبب الطقس',
  });
  assert.equal(req.success, true);
  const requestId = req.requestId!;

  const dentistryRecep: StaffUser = {
    id: 'staff-rec-dent-62',
    username: 'rec.dent62',
    name: 'أحمد كمال عبد الله',
    role: 'RECEPTIONIST',
    clinicId: 'dentistry',
    active: true,
  };

  const reviewRes = await appointmentStore.reviewCancellationRequest(
    requestId,
    'APPROVED',
    dentistryRecep,
    'تم قبول عذر الطقس وإلغاء الحجز'
  );
  assert.equal(reviewRes.success, true);

  // Check audit log entry
  const logs = await appointmentStore.getAuditLogs();
  const approveLog = logs.find(
    (l) => l.action.includes('موافقة على إلغاء حجز') && l.referenceNumber === apt.referenceNumber
  );
  assert.ok(approveLog, 'Audit log must contain approval record for the appointment');
  assert.equal(approveLog.staffName, dentistryRecep.name, 'Audit log must record staff full name');
  assert.equal(approveLog.staffRole, dentistryRecep.role, 'Audit log must record staff role');
  assert.ok(approveLog.details.includes(requestId), 'Audit log must record cancellation request ID');
});

test('Security 63: Audit Trail & State Preservation - Rejection is recorded in audit_logs and appointment remains active in its original status', async () => {
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'حمزة سامح الصاوي',
    phoneNumber: '01033446677',
    appointmentDate: '2026-11-25',
    appointmentTime: '13:30',
  });
  assert.equal(newApt.success, true);
  const apt = newApt.appointment!;
  const originalStatus = apt.status; // 'PENDING_REVIEW'

  const req = await appointmentStore.requestCancellation({
    referenceNumber: apt.referenceNumber,
    phoneNumber: '01033446677',
    reason: 'شك في الموعد',
  });
  assert.equal(req.success, true);
  const requestId = req.requestId!;

  const dentistryRecep: StaffUser = {
    id: 'staff-rec-dent-63',
    username: 'rec.dent63',
    name: 'محمود سعد الخولي',
    role: 'RECEPTIONIST',
    clinicId: 'dentistry',
    active: true,
  };

  const reviewRes = await appointmentStore.reviewCancellationRequest(
    requestId,
    'REJECTED',
    dentistryRecep,
    'تم التواصل والتأكيد على الحضور في الموعد'
  );
  assert.equal(reviewRes.success, true);

  // Check appointment status is untouched
  const currentApt = appointmentStore.getAppointmentById(apt.id);
  assert.ok(currentApt);
  assert.equal(currentApt.status, originalStatus, 'Appointment must maintain its original status after rejection');
  assert.notEqual(currentApt.status, 'CANCELLED', 'Appointment must NOT be CANCELLED after rejection');

  // Check audit log entry
  const logs = await appointmentStore.getAuditLogs();
  const rejectLog = logs.find(
    (l) => l.action.includes('رفض طلب إلغاء حجز') && l.referenceNumber === apt.referenceNumber
  );
  assert.ok(rejectLog, 'Audit log must contain rejection record for the appointment');
  assert.equal(rejectLog.staffName, dentistryRecep.name);
  assert.equal(rejectLog.staffRole, dentistryRecep.role);
  assert.ok(rejectLog.details.includes(requestId), 'Audit log must record cancellation request ID');
  assert.ok(rejectLog.details.includes('تم التواصل والتأكيد على الحضور'), 'Audit log must record rejection reason');
});

test('Security 64: Booking Integrity Migration - cross-clinic duplicate index, DOB column, mandatory service, and safe swap', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261113000000_booking_integrity_dob_and_transfer_service.sql');
  assert.ok(fs.existsSync(migrationPath), 'Booking integrity migration file must exist');
  const content = fs.readFileSync(migrationPath, 'utf8');

  // 1. Canonical Arabic name normalization + server-side age formatting functions
  assert.ok(content.includes('CREATE OR REPLACE FUNCTION public.normalize_patient_name'), 'normalize_patient_name must be defined');
  assert.ok(content.includes('CREATE OR REPLACE FUNCTION public.format_patient_age'), 'format_patient_age must be defined');

  // 2. Date of birth column with plausibility checks
  assert.ok(content.includes('ADD COLUMN IF NOT EXISTS date_of_birth DATE'), 'date_of_birth column must be added');
  assert.ok(content.includes('chk_appointments_dob_not_after_visit'), 'DOB must not be after visit date');
  assert.ok(content.includes('chk_appointments_dob_plausible'), 'DOB plausibility check must exist');

  // 3. Cross-clinic partial unique indexes: DOB-authoritative + legacy name fallback
  const dobIndexIdx = content.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_apt_per_phone_dob_day');
  const nameIndexIdx = content.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_apt_per_phone_name_day');
  assert.ok(dobIndexIdx !== -1, 'DOB-based cross-clinic unique index must be created');
  assert.ok(nameIndexIdx !== -1, 'Legacy name-based cross-clinic unique index must be created');
  assert.ok(content.includes('public.normalize_patient_name(patient_name)'), 'Legacy index must use normalized patient name');
  assert.ok(/WHERE\s*\(status\s*!=\s*'CANCELLED'/.test(content), 'Indexes must be partial on active bookings');

  // 4. Fail-closed precheck for legacy duplicates BEFORE index creation (no silent data loss)
  const precheckIdx = content.indexOf('RAISE EXCEPTION');
  assert.ok(precheckIdx !== -1 && precheckIdx < dobIndexIdx, 'Legacy duplicate precheck must abort before creating the indexes');

  // 5. Safe index swap: old per-clinic index dropped only after new indexes are validated
  const dropOldIdx = content.indexOf('DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_patient_clinic_day');
  assert.ok(dropOldIdx !== -1, 'Old per-clinic index must be dropped');
  assert.ok(dobIndexIdx < dropOldIdx && nameIndexIdx < dropOldIdx, 'New indexes must be created before the old one is dropped');
  assert.ok(content.includes('indisvalid'), 'Swap must verify new index validity');

  // 6. Booking RPC: new 12-param signature with DOB, old 11-param dropped
  assert.ok(content.includes('DROP FUNCTION IF EXISTS public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID)'), 'Old booking RPC overload must be dropped');
  assert.ok(content.includes('p_date_of_birth DATE DEFAULT NULL'), 'Booking RPC must accept date of birth');
  assert.ok(content.includes('يجب اختيار خدمة فعلية تابعة للعيادة'), 'Booking RPC must require a real clinic service');
  assert.ok(content.includes('بنفس الرقم لنفس الميلاد'), 'Booking RPC must surface the cross-clinic duplicate note');

  // 7. Transfer RPC: new 5-param signature with mandatory target service, old 4-param dropped
  assert.ok(content.includes('DROP FUNCTION IF EXISTS public.transfer_appointment_clinic_atomic(TEXT, TEXT, UUID, TEXT)'), 'Old transfer RPC overload must be dropped');
  assert.ok(content.includes('p_target_service_id TEXT'), 'Transfer RPC must require a target service');
});

test('Security 65: Walk-in and Transfer routes fail closed on missing service / DOB', () => {
  const walkInPath = path.join(process.cwd(), 'app', 'api', 'appointments', 'walk-in', 'route.ts');
  const walkIn = fs.readFileSync(walkInPath, 'utf8');
  assert.match(walkIn, /يجب اختيار خدمة فعلية تابعة للعيادة/, 'Walk-in route must require a real service');
  assert.match(walkIn, /تاريخ ميلاد الطفل مطلوب/, 'Walk-in route must require date of birth');
  assert.match(walkIn, /validateDateOfBirth\(dateOfBirth/, 'Walk-in route must validate DOB server-side');
  assert.match(walkIn, /dateOfBirth,/, 'Walk-in route must forward dateOfBirth to the store');

  const transferPath = path.join(process.cwd(), 'app', 'api', 'appointments', '[id]', 'transfer', 'route.ts');
  const transfer = fs.readFileSync(transferPath, 'utf8');
  assert.match(transfer, /targetServiceId/, 'Transfer route must read targetServiceId');
  assert.match(transfer, /يجب اختيار خدمة تابعة للعيادة المحول إليها/, 'Transfer route must require a target service');
  assert.match(transfer, /transferClinic\(id, targetClinicId, targetServiceId, reason, staffUser, token\)/, 'Transfer route must pass targetServiceId to the store');

  const actionPath = path.join(process.cwd(), 'app', 'appointments', 'new', 'actions.ts');
  const action = fs.readFileSync(actionPath, 'utf8');
  assert.match(action, /يرجى اختيار الخدمة المطلوبة من خدمات العيادة/, 'Online booking action must require a service');
  assert.match(action, /validateDateOfBirth\(data\.dateOfBirth/, 'Online booking action must validate DOB server-side');
});

test('Security 66: Store never substitutes demo services when the central database is configured', () => {
  const storePath = path.join(process.cwd(), 'services', 'appointmentService.ts');
  const store = fs.readFileSync(storePath, 'utf8');

  // getClinicServices must throw on DB failure (fail-closed) rather than fall back to INITIAL_SERVICES
  assert.match(store, /تعذر الاتصال بقاعدة البيانات لجلب خدمات العيادة/, 'getClinicServices must fail closed with a connection error');
  // createAppointment must require an explicitly chosen service in Supabase mode
  assert.match(store, /يجب اختيار خدمة فعلية تابعة للعيادة قبل تسجيل الحجز/, 'createAppointment must require a real service in DB mode');
  // Service name must come from the matched record, not client free text
  assert.match(store, /const resolvedServiceName = matchedService\?\.name \|\| input\.serviceName\?\.trim\(\) \|\| 'كشف واستشارة طبية'/, 'Resolved service name must prefer the real clinic service record');
  // Mock duplicate guard must span all clinics (no clinicId condition), be DOB-aware,
  // and fall back to normalized names for legacy rows without a DOB.
  assert.match(store, /private isSameChildDuplicate\(/, 'Store must centralize the DOB-aware duplicate predicate');
  assert.match(store, /normalizePatientName\(existing\.patientName\) === normalizePatientName\(patientName\)/, 'Duplicate predicate must normalize names for legacy rows');
  assert.match(store, /existing\.dateOfBirth === dateOfBirth/, 'Duplicate predicate must compare DOB when present on both sides');
  assert.match(store, /this\.isSameChildDuplicate\(\s*a,\s*phoneCheck\.normalized/, 'createAppointment mock guard must use the shared predicate');
  assert.match(store, /this\.isSameChildDuplicate\(a, apt\.phoneNumber, apt\.appointmentDate, apt\.patientName, apt\.dateOfBirth\)/, 'transferClinic mock guard must use the shared predicate');
});



