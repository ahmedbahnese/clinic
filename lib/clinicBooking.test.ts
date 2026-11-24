import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClinicBookingStartDate,
  getClinicBookingDateRange,
  getLatestClinicBookingDate,
  getClinicInstructionLines,
  isBeforeClinicBookingStartDate,
} from './clinicBooking.ts';

const PLATFORM_START = '2026-12-14';
const AUDIOLOGY_START = '2027-02-11';

test('Audiology returns no dates while its first date is outside the existing 30-day window', () => {
  assert.deepEqual(
    getClinicBookingDateRange('2026-11-21', PLATFORM_START, AUDIOLOGY_START),
    []
  );
});

test('Audiology first date appears when it enters the 30-day window', () => {
  const dates = getClinicBookingDateRange('2027-01-12', PLATFORM_START, AUDIOLOGY_START);
  assert.deepEqual(dates, ['2027-02-11']);
  assert.equal(getLatestClinicBookingDate('2027-01-12'), dates.at(-1));
});

test('Audiology window stays rolling and never exposes dates before the configured first date', () => {
  const dates = getClinicBookingDateRange('2027-01-13', PLATFORM_START, AUDIOLOGY_START);
  assert.equal(dates[0], AUDIOLOGY_START);
  assert.ok(dates.every((date) => date >= AUDIOLOGY_START));
  assert.equal(dates.at(-1), '2027-02-12');
});

test('Clinics without a clinic-specific date retain the existing platform date range', () => {
  const dates = getClinicBookingDateRange('2026-11-21', PLATFORM_START);
  assert.equal(dates[0], PLATFORM_START);
  assert.equal(dates.at(-1), '2027-01-13');
  assert.equal(dates.length, 31);
});

test('The server-side minimum-date check blocks earlier days but allows the first and later days', () => {
  assert.equal(isBeforeClinicBookingStartDate('2027-02-10', AUDIOLOGY_START), true);
  assert.equal(isBeforeClinicBookingStartDate(AUDIOLOGY_START, AUDIOLOGY_START), false);
  assert.equal(isBeforeClinicBookingStartDate('2027-02-12', AUDIOLOGY_START), false);
  assert.equal(isBeforeClinicBookingStartDate('2027-02-10'), false);
});

test('The start date is formatted in Egyptian day/month/year order', () => {
  assert.equal(formatClinicBookingStartDate(AUDIOLOGY_START), '11/02/2027');
  assert.equal(formatClinicBookingStartDate('not-a-date'), '');
});

test('The 5-years-and-older service omits only the first instruction and keeps order', () => {
  const instructions = [
    '1. شرط العمر.',
    '2. خلو الطفل من البرد.',
    '3. التحضير ليلة الاختبار.',
    '4. غسل الرأس.',
    '5. الحضور الساعة 8:30.',
    '6. إحضار كلورال هيدرات 10% إذا قرر الطبيب استخدامه، ويُعطى فقط تحت إشراف طبي.',
  ].join('\n');

  assert.deepEqual(getClinicInstructionLines(instructions, true), instructions.split('\n').slice(1));
  assert.deepEqual(getClinicInstructionLines(instructions, false), instructions.split('\n'));
  assert.match(getClinicInstructionLines(instructions, true)[4], /كلورال هيدرات 10%/);
});
