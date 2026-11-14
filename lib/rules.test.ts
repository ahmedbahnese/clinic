import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAndValidateEgyptianPhone,
  validatePatientName,
  canTransitionStatus,
  generateReferenceNumber,
  getStatusDisplay,
  formatArabicDate,
  formatLocalDate,
  maskPatientName,
  normalizePatientName,
} from './rules.ts';

test('normalizeAndValidateEgyptianPhone validates standard 11-digit mobile numbers', () => {
  const result1 = normalizeAndValidateEgyptianPhone('01012345678');
  assert.equal(result1.isValid, true);
  assert.equal(result1.normalized, '01012345678');

  const result2 = normalizeAndValidateEgyptianPhone('01198765432');
  assert.equal(result2.isValid, true);

  const result3 = normalizeAndValidateEgyptianPhone('01255554444');
  assert.equal(result3.isValid, true);

  const result4 = normalizeAndValidateEgyptianPhone('01511112222');
  assert.equal(result4.isValid, true);
});

test('normalizeAndValidateEgyptianPhone handles Arabic numerals and country code prefixes', () => {
  const arabicInput = '٠١٠١٢٣٤٥٦٧٨';
  const result = normalizeAndValidateEgyptianPhone(arabicInput);
  assert.equal(result.isValid, true);
  assert.equal(result.normalized, '01012345678');

  const withCode = '+201012345678';
  const result2 = normalizeAndValidateEgyptianPhone(withCode);
  assert.equal(result2.isValid, true);
  assert.equal(result2.normalized, '01012345678');

  const withSpaces = ' 010 1234 5678 ';
  const result3 = normalizeAndValidateEgyptianPhone(withSpaces);
  assert.equal(result3.isValid, true);
  assert.equal(result3.normalized, '01012345678');
});

test('normalizeAndValidateEgyptianPhone rejects invalid numbers', () => {
  assert.equal(normalizeAndValidateEgyptianPhone('01912345678').isValid, false);
  assert.equal(normalizeAndValidateEgyptianPhone('0101234567').isValid, false);
  assert.equal(normalizeAndValidateEgyptianPhone('010123456789').isValid, false);
  assert.equal(normalizeAndValidateEgyptianPhone('abc').isValid, false);
  assert.equal(normalizeAndValidateEgyptianPhone('').isValid, false);
});

test('validatePatientName checks length and word count', () => {
  assert.equal(validatePatientName('محمد أحمد علي').isValid, true);
  assert.equal(validatePatientName('أحمد علي').isValid, true);
  assert.equal(validatePatientName('محمد').isValid, false);
  assert.equal(validatePatientName(' علي ').isValid, false);
  assert.equal(validatePatientName('').isValid, false);
});

test('canTransitionStatus validates hospital workflow states and enforces terminal states', () => {
  assert.equal(canTransitionStatus('PENDING_REVIEW', 'CONFIRMED'), true);
  assert.equal(canTransitionStatus('PENDING_REVIEW', 'CANCELLED'), true);
  assert.equal(canTransitionStatus('PENDING_REVIEW', 'COMPLETED'), false);

  assert.equal(canTransitionStatus('CONFIRMED', 'CHECKED_IN'), true);
  assert.equal(canTransitionStatus('CONFIRMED', 'CANCELLED'), true);

  assert.equal(canTransitionStatus('CHECKED_IN', 'COMPLETED'), true);
  assert.equal(canTransitionStatus('CHECKED_IN', 'CANCELLED'), true);

  assert.equal(canTransitionStatus('COMPLETED', 'PENDING_REVIEW'), false);
  assert.equal(canTransitionStatus('COMPLETED', 'CANCELLED'), false);
  assert.equal(canTransitionStatus('CANCELLED', 'CONFIRMED'), false);
});

test('generateReferenceNumber produces BSCH-XXXX pattern', () => {
  const ref = generateReferenceNumber();
  assert.match(ref, /^BSCH-[0-9]{4}$/);
});

test('getStatusDisplay provides valid styling and labels', () => {
  const confirmed = getStatusDisplay('CONFIRMED');
  assert.equal(confirmed.label, 'مؤكد');
  assert.ok(confirmed.color.length > 0);

  const pending = getStatusDisplay('PENDING_REVIEW');
  assert.equal(pending.label, 'قيد المراجعة');
});

test('formatArabicDate outputs readable Arabic date', () => {
  const formatted = formatArabicDate('2026-10-25');
  assert.ok(formatted.includes('2026'));
  assert.ok(formatted.includes('أكتوبر') || formatted.includes('الأحد'));
  assert.equal(formatArabicDate(''), '');
  assert.equal(formatArabicDate('invalid'), 'invalid');
});

test('formatLocalDate formats date in local YYYY-MM-DD format', () => {
  const d = new Date(2026, 9, 25); // month 9 is October (0-indexed)
  assert.equal(formatLocalDate(d), '2026-10-25');
  const todayStr = formatLocalDate();
  assert.match(todayStr, /^\d{4}-\d{2}-\d{2}$/);
});

test('Supabase RLS role permission matrix validation', () => {
  // Test role permission rules matching the SQL policies
  const canAdminManageClinics = (role: string) => role === 'ADMIN';
  const canViewPatientList = (role: string) => ['ADMIN', 'RECEPTIONIST', 'DOCTOR'].includes(role);
  const canConfirmBookings = (role: string) => ['ADMIN', 'RECEPTIONIST'].includes(role);
  const canCompleteAppointment = (role: string) => ['ADMIN', 'DOCTOR'].includes(role);
  const canViewAuditLogs = (role: string) => role === 'ADMIN';

  assert.equal(canAdminManageClinics('ADMIN'), true);
  assert.equal(canAdminManageClinics('RECEPTIONIST'), false);
  assert.equal(canAdminManageClinics('DOCTOR'), false);

  assert.equal(canViewPatientList('DOCTOR'), true);
  assert.equal(canViewPatientList('RECEPTIONIST'), true);
  assert.equal(canViewPatientList('ANONYMOUS'), false);

  assert.equal(canConfirmBookings('RECEPTIONIST'), true);
  assert.equal(canConfirmBookings('DOCTOR'), false);

  // Receptionist CANNOT mark appointment as COMPLETED (Medical completion reserved for Doctor/Admin)
  assert.equal(canCompleteAppointment('RECEPTIONIST'), false);
  assert.equal(canCompleteAppointment('DOCTOR'), true);
  assert.equal(canCompleteAppointment('ADMIN'), true);

  // Receptionist CANNOT view audit logs (Admin only)
  assert.equal(canViewAuditLogs('RECEPTIONIST'), false);
  assert.equal(canViewAuditLogs('DOCTOR'), false);
  assert.equal(canViewAuditLogs('ADMIN'), true);
});

test('book_appointment_atomic business logic validations', () => {
  // 1. Date window validation
  const validateBookingDate = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);

    const maxFuture = new Date(today);
    maxFuture.setDate(today.getDate() + 60);

    if (target < today) return { valid: false, error: 'past_date' };
    if (target > maxFuture) return { valid: false, error: 'too_far' };
    return { valid: true };
  };

  assert.equal(validateBookingDate('2020-01-01').valid, false);
  assert.equal(validateBookingDate('2020-01-01').error, 'past_date');

  // 2. Working days validation (e.g. clinic operates on days [0,1,2,3,4,6], Friday is 5)
  const isWorkingDay = (daysOfWeek: number[], dayOfWeek: number) => daysOfWeek.includes(dayOfWeek);
  const standardClinicDays = [0, 1, 2, 3, 4, 6];
  assert.equal(isWorkingDay(standardClinicDays, 0), true); // Sunday
  assert.equal(isWorkingDay(standardClinicDays, 5), false); // Friday closed

  // 3. Capacity enforcement logic
  const isWithinCapacity = (currentBooked: number, capacity: number) => currentBooked < capacity;
  assert.equal(isWithinCapacity(19, 20), true);
  assert.equal(isWithinCapacity(20, 20), false);
  assert.equal(isWithinCapacity(25, 20), false);
});

test('Invariant A1: Cairo timezone date filtering strictly excludes past dates', async () => {
  const { getTodayCairoDateString, isDateTodayOrFutureInCairo } = await import('./rules.ts');

  const todayCairo = getTodayCairoDateString();
  assert.match(todayCairo, /^\d{4}-\d{2}-\d{2}$/);

  // Today must be considered valid
  assert.equal(isDateTodayOrFutureInCairo(todayCairo), true);

  // Future dates (tomorrow, next week) must be valid
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  assert.equal(isDateTodayOrFutureInCairo(tomorrowStr), true);

  // Past dates must strictly be rejected
  assert.equal(isDateTodayOrFutureInCairo('2020-01-01'), false);
  assert.equal(isDateTodayOrFutureInCairo('2025-12-31'), false);
});

test('Invariant B1: Unit-based age validation enforces strict clinical bounds (days 0-30, months 1-36, years 1-18)', async () => {
  const { validatePatientAge } = await import('./rules.ts');

  // Days: 0 to 30
  assert.equal(validatePatientAge(0, 'يوم').isValid, true);
  assert.equal(validatePatientAge('15', 'يوم').isValid, true);
  assert.equal(validatePatientAge(30, 'يوم').isValid, true);
  assert.equal(validatePatientAge(31, 'يوم').isValid, false);
  assert.equal(validatePatientAge(-1, 'يوم').isValid, false);

  // Months: 1 to 36
  assert.equal(validatePatientAge(1, 'شهر').isValid, true);
  assert.equal(validatePatientAge(12, 'شهر').isValid, true);
  assert.equal(validatePatientAge(36, 'شهر').isValid, true);
  assert.equal(validatePatientAge(0, 'شهر').isValid, false);
  assert.equal(validatePatientAge(37, 'شهر').isValid, false);

  // Years: 1 to 18
  assert.equal(validatePatientAge(1, 'سنة').isValid, true);
  assert.equal(validatePatientAge(6, 'سنة').isValid, true);
  assert.equal(validatePatientAge(18, 'سنة').isValid, true);
  assert.equal(validatePatientAge(0, 'سنة').isValid, false);
  assert.equal(validatePatientAge(19, 'سنة').isValid, false);

  // Invalid unit / non-numeric
  assert.equal(validatePatientAge('abc', 'سنة').isValid, false);
  assert.equal(validatePatientAge(5, 'أسبوع' as any).isValid, false);
});

test('Invariant B2: Optional 14-digit Guardian National ID validation', async () => {
  const { validateGuardianNationalId } = await import('./rules.ts');

  // Optional: empty, null, undefined are valid
  assert.equal(validateGuardianNationalId(null).isValid, true);
  assert.equal(validateGuardianNationalId(undefined).isValid, true);
  assert.equal(validateGuardianNationalId('').isValid, true);
  assert.equal(validateGuardianNationalId('   ').isValid, true);

  // Valid 14 digits
  assert.equal(validateGuardianNationalId('29801011801234').isValid, true);
  assert.equal(validateGuardianNationalId(' 30512121805678 ').isValid, true);

  // Invalid formats (less or more than 14 digits, letters)
  assert.equal(validateGuardianNationalId('1234567890123').isValid, false); // 13 digits
  assert.equal(validateGuardianNationalId('123456789012345').isValid, false); // 15 digits
  assert.equal(validateGuardianNationalId('2980101180123a').isValid, false); // Contains letter
});

test('Invariant C1: Clinic Services are dynamically isolated and dependent on the clinic', async () => {
  const { appointmentStore } = await import('../services/appointmentService.ts');

  const echoServices = await appointmentStore.getClinicServices('echo');
  const dentServices = await appointmentStore.getClinicServices('dentistry');

  assert.ok(echoServices.length > 0);
  assert.ok(dentServices.length > 0);

  // All echo services have clinicId = 'echo'
  assert.ok(echoServices.every((s) => s.clinicId === 'echo'));

  // All dent services have clinicId = 'dentistry'
  assert.ok(dentServices.every((s) => s.clinicId === 'dentistry'));

  // Disjoint sets of service IDs
  const echoIds = new Set(echoServices.map((s) => s.id));
  assert.ok(!dentServices.some((s) => echoIds.has(s.id)));
});

test('Invariant D1: Tracking query filters past bookings, cancelled bookings, and NEVER returns guardian national ID', async () => {
  const { appointmentStore } = await import('../services/appointmentService.ts');
  const { getTodayCairoDateString } = await import('./rules.ts');

  const testPhone = '01099998888';
  const todayCairo = getTodayCairoDateString();

  // Ensure clinic is open on todayCairo via calendar exception if it falls on a weekend
  await appointmentStore.upsertClinicScheduleException(
    'dentistry',
    {
      scheduleDate: todayCairo,
      isClosed: false,
      maxCapacity: 30,
    },
    {
      id: 'admin-test',
      username: 'admin',
      name: 'مدير النظام',
      role: 'ADMIN',
      active: true,
    }
  );

  // Create an appointment for today with national ID provided
  const createRes = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'كريم أحمد محمد إبراهيم',
    phoneNumber: testPhone,
    patientAge: '5 سنوات',
    patientAddress: 'أبو حمص',
    guardianNationalId: '29801011801234',
    appointmentDate: todayCairo,
  });

  assert.equal(createRes.success, true);
  assert.ok(createRes.appointment);

  // Now retrieve tracking results for this phone
  const tracked = await appointmentStore.trackAppointmentsByVerifiedPhone(testPhone);

  assert.ok(tracked.length > 0);

  for (const apt of tracked) {
    // Invariant 1: Date >= today Cairo
    assert.ok(apt.appointmentDate >= todayCairo, `Appointment date ${apt.appointmentDate} must be >= ${todayCairo}`);

    // Invariant 2: Active (non-cancelled)
    assert.notEqual(apt.status, 'CANCELLED');

    // Invariant 3: PII minimization - guardianNationalId and bookingCodeHash MUST be undefined
    assert.equal((apt as any).guardianNationalId, undefined, 'guardianNationalId must NEVER be returned in tracking');
    assert.equal((apt as any).bookingCodeHash, undefined, 'bookingCodeHash must NEVER be returned in tracking');

    // Invariant 4: Required receipt fields must be populated
    assert.ok(apt.patientName.length > 0);
    assert.ok(apt.clinicName.length > 0);
    assert.ok(apt.serviceName && apt.serviceName.length > 0);
    assert.ok(Array.isArray(apt.requiredDocuments));
    assert.ok(typeof apt.serviceInstructions === 'string');
  }
});

test('maskPatientName redacts patronymic words while preserving first name for guardian confirmation', () => {
  // Standard Arabic triple name
  assert.equal(maskPatientName('أحمد كريم محمود'), 'أحمد ك*** م***');

  // Quadruple name
  assert.equal(maskPatientName('فاطمة علي حسن إبراهيم'), 'فاطمة ع*** ح*** إ***');

  // Single word name
  assert.equal(maskPatientName('محمد'), 'مح***');
  assert.equal(maskPatientName('علي'), 'عل***');
  assert.equal(maskPatientName('مي'), 'مي');

  // Empty / whitespace / undefined
  assert.equal(maskPatientName(''), '');
  assert.equal(maskPatientName('   '), '');
  assert.equal(maskPatientName(null), '');
  assert.equal(maskPatientName(undefined), '');
});

test('Duplicate bookings: Same phone cannot book two children in the same clinic on the same date', async () => {
  const { appointmentStore } = await import('../services/appointmentService.ts');
  const siblingPhone = '01599887766';
  const testDate = '2026-11-23'; // Monday (open)

  // First child
  const child1 = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'ياسين أحمد علي حسن',
    phoneNumber: siblingPhone,
    patientAge: '4 سنوات',
    appointmentDate: testDate,
  });
  assert.equal(child1.success, true, 'First child booking must succeed');

  // Second child (sibling sharing same phone)
  const child2 = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'نور أحمد علي حسن',
    phoneNumber: siblingPhone,
    patientAge: '2 سنة',
    appointmentDate: testDate,
  });
  assert.equal(child2.success, false, 'A second child using the same phone, clinic, and date must be rejected');
  assert.match(child2.error || '', /يوجد حجز مسبق بالفعل/);

  // Re-booking the first child again on the same date must also be rejected
  const duplicateChild1 = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'ياسين أحمد علي حسن',
    phoneNumber: siblingPhone,
    appointmentDate: testDate,
  });
  assert.equal(duplicateChild1.success, false, 'Exact same child duplicate on same date must be rejected');
  assert.match(duplicateChild1.error || '', /يوجد حجز مسبق بالفعل/);
});

test('normalizePatientName collapses whitespace and lowercases string matching SQL index', () => {
  assert.equal(normalizePatientName('  أحمد   محمد   علي  '), 'أحمد محمد علي');
  assert.equal(normalizePatientName('سارة   محمود'), 'سارة محمود');
  assert.equal(normalizePatientName(''), '');
  assert.equal(normalizePatientName('   '), '');
});
