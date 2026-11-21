const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function latestDate(...dates: string[]): string {
  return dates.reduce((latest, value) => (value > latest ? value : latest));
}

/**
 * Returns the date range shown by the booking form.
 * Clinics without a clinic-specific start date keep the existing fixed launch
 * window. Clinics with one use the regular rolling 30-day horizon, but never
 * expose a day earlier than their configured first appointment date.
 */
export function getClinicBookingDateRange(
  today: string,
  platformStartDate: string,
  clinicStartDate?: string,
  horizonDays = 30
): string[] {
  if (!ISO_DATE_PATTERN.test(today) || !ISO_DATE_PATTERN.test(platformStartDate)) return [];
  if (clinicStartDate && !ISO_DATE_PATTERN.test(clinicStartDate)) return [];

  const startDate = clinicStartDate
    ? latestDate(today, platformStartDate, clinicStartDate)
    : platformStartDate;
  const endDate = addCalendarDays(clinicStartDate ? today : platformStartDate, horizonDays);
  if (startDate > endDate) return [];

  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addCalendarDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

export function getLatestClinicBookingDate(today: string, horizonDays = 30): string {
  if (!ISO_DATE_PATTERN.test(today)) return '';
  return addCalendarDays(today, horizonDays);
}

export function isBeforeClinicBookingStartDate(appointmentDate: string, clinicStartDate?: string): boolean {
  return Boolean(
    clinicStartDate &&
    ISO_DATE_PATTERN.test(appointmentDate) &&
    ISO_DATE_PATTERN.test(clinicStartDate) &&
    appointmentDate < clinicStartDate
  );
}

export function formatClinicBookingStartDate(date?: string): string {
  if (!date || !ISO_DATE_PATTERN.test(date)) return '';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

/** Keep the source order and numbering while hiding only the first age rule. */
export function getClinicInstructionLines(instructions: string, hideFirstAgeRule = false): string[] {
  return instructions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !(hideFirstAgeRule && /^1[.)]\s*/.test(line)));
}
