import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUSES,
  MAX_ADDRESS_LENGTH,
  MAX_AGE_TEXT_LENGTH,
  STAFF_ROLES,
  checkBookingCapacity,
  countActiveBookings,
  hasDuplicateBooking,
  isCapacityConsumingStatus,
  isValidPhone,
  normalizePatientName,
  normalizePhone,
  validateBookingInput,
  weekdayNamesToIsoDays,
  type BookingDuplicateIdentity,
  type BookingInput,
  type BookingValidationContext,
} from "./rules";

const fixtureInput: BookingInput = {
  patientName: "  ليلى اختبار  ",
  age: "  5 سنوات  ",
  phone: "+999 000-0000",
  address: "عنوان اختباري",
  clinicId: "clinic-demo",
  serviceId: "service-demo",
  date: "2026-10-28",
};

const fixtureContext: BookingValidationContext = {
  today: "2026-10-28",
  clinics: [{ id: "clinic-demo", active: true }],
  services: [{ id: "service-demo", clinicId: "clinic-demo", directOnly: false, active: true }],
  mode: "public",
};

const duplicateFixture = (
  overrides: Partial<BookingDuplicateIdentity> = {},
): BookingDuplicateIdentity => ({
  patientName: "ليلى اختبار",
  phone: "00000000000",
  clinicId: "clinic-demo",
  date: "2026-10-29",
  status: "Pending",
  ...overrides,
});

describe("أنواع نطاق الحجز", () => {
  it("يعرض الأدوار والحالات المعتمدة دون خلط الحالات التي تستهلك السعة", () => {
    expect(STAFF_ROLES).toEqual(["booking", "doctor", "nurse", "admin"]);
    expect(BOOKING_STATUSES).toEqual([
      "Pending",
      "Confirmed",
      "Cancelled",
      "NoShow",
      "Completed",
    ]);
    expect(isCapacityConsumingStatus("Pending")).toBe(true);
    expect(isCapacityConsumingStatus("Confirmed")).toBe(true);
    expect(isCapacityConsumingStatus("Cancelled")).toBe(false);
    expect(isCapacityConsumingStatus("NoShow")).toBe(false);
    expect(isCapacityConsumingStatus("Completed")).toBe(false);
  });
});

describe("تطبيع الاسم والهاتف والتحقق منهما", () => {
  it("يطبع المسافات والاختلافات الشائعة في كتابة الاسم العربي", () => {
    expect(normalizePatientName("  إِياد   عَبْدالله  ")).toBe("اياد عبدالله");
    expect(normalizePatientName("  Émile   Demo ")).toBe("emile demo");
    expect(normalizePatientName("   ")).toBe("");
  });

  it("يطبع أرقام الهاتف العربية والفواصل مع إبقاء أصفار البداية", () => {
    expect(normalizePhone("٠١٢ (٣٤٥) ٦٧٨٩")).toBe("0123456789");
    expect(normalizePhone("+999 000-0000")).toBe("9990000000");
    expect(isValidPhone("٠١٢ (٣٤٥) ٦٧٨٩")).toBe(true);
    expect(isValidPhone("+999 000-0000")).toBe(true);
  });

  it("يرفض الهاتف القصير أو الطويل أو المحتوي حروفًا", () => {
    expect(isValidPhone("123456")).toBe(false);
    expect(isValidPhone("0000000000000000")).toBe(false);
    expect(isValidPhone("0000abc0000")).toBe(false);
    expect(isValidPhone("++9990000000")).toBe(false);
  });
});

describe("التحقق من بيانات الحجز", () => {
  it("يقبل عمرًا نصيًا منقحًا حتى الحد الأقصى", () => {
    const atZero = validateBookingInput(fixtureInput, fixtureContext);
    expect(atZero.valid).toBe(true);
    expect(atZero.value).toMatchObject({
      patientName: "ليلى اختبار",
      normalizedPatientName: "ليلي اختبار",
      age: "5 سنوات",
      normalizedPhone: "9990000000",
      clinicId: "clinic-demo",
      serviceId: "service-demo",
      date: "2026-10-28",
    });

    const atMaximum = validateBookingInput(
      { ...fixtureInput, age: "س".repeat(MAX_AGE_TEXT_LENGTH) },
      fixtureContext,
    );
    expect(atMaximum.valid).toBe(true);
    expect(atMaximum.value?.age).toBe("س".repeat(MAX_AGE_TEXT_LENGTH));
  });

  it.each(["", "   ", "س".repeat(MAX_AGE_TEXT_LENGTH + 1), 5])("يرفض العمر الفارغ أو الطويل أو غير النصي: %s", (age) => {
    const result = validateBookingInput({ ...fixtureInput, age }, fixtureContext);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({ code: "age_invalid", field: "age" });
  });

  it("يرفض الاسم الفارغ والهاتف والعنوان غير الصالحين", () => {
    const result = validateBookingInput(
      { ...fixtureInput, patientName: "  ", phone: "abc", address: "  " },
      fixtureContext,
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["patient_name_required", "phone_invalid", "address_required"]),
    );
  });

  it("يقبل حد العنوان ويمنع تجاوزه", () => {
    const withinLimit = validateBookingInput(
      { ...fixtureInput, address: "س".repeat(MAX_ADDRESS_LENGTH) },
      fixtureContext,
    );
    expect(withinLimit.valid).toBe(true);

    const overLimit = validateBookingInput(
      { ...fixtureInput, address: "س".repeat(MAX_ADDRESS_LENGTH + 1) },
      fixtureContext,
    );
    expect(overLimit.issues).toContainEqual({ code: "address_too_long", field: "address" });
  });

  it("يتطلب عيادة وخدمة متاحتين مرتبطتين ببعضهما", () => {
    const missing = validateBookingInput(
      { ...fixtureInput, clinicId: "", serviceId: "unknown" },
      fixtureContext,
    );
    expect(missing.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["clinic_required", "service_unavailable"]),
    );

    const mismatch = validateBookingInput(fixtureInput, {
      ...fixtureContext,
      services: [{ id: "service-demo", clinicId: "other-clinic", directOnly: false }],
    });
    expect(mismatch.issues).toContainEqual({
      code: "service_clinic_mismatch",
      field: "serviceId",
    });
  });

  it("يرفض عيادة أو خدمة معطلة", () => {
    const result = validateBookingInput(fixtureInput, {
      ...fixtureContext,
      clinics: [{ id: "clinic-demo", active: false }],
      services: [{ id: "service-demo", clinicId: "clinic-demo", directOnly: false, active: false }],
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["clinic_unavailable", "service_unavailable"]),
    );
  });

  it("يحجب خدمة direct-only للحجز العام ويسمح بها داخليًا", () => {
    const directOnlyContext: BookingValidationContext = {
      ...fixtureContext,
      services: [{ id: "service-demo", clinicId: "clinic-demo", directOnly: true }],
    };
    const publicResult = validateBookingInput(fixtureInput, directOnlyContext);
    expect(publicResult.issues).toContainEqual({ code: "service_direct_only", field: "serviceId" });

    const internalResult = validateBookingInput(fixtureInput, {
      ...directOnlyContext,
      mode: "internal",
    });
    expect(internalResult.valid).toBe(true);
  });

  it("يقبل يوم اليوم، ويرفض الماضي والتاريخ المستحيل أو تاريخ المرجع غير الصالح", () => {
    expect(validateBookingInput(fixtureInput, fixtureContext).valid).toBe(true);
    const past = validateBookingInput({ ...fixtureInput, date: "2026-10-27" }, fixtureContext);
    expect(past.issues).toContainEqual({ code: "date_in_past", field: "date" });

    const impossible = validateBookingInput({ ...fixtureInput, date: "2026-02-30" }, fixtureContext);
    expect(impossible.issues).toContainEqual({ code: "date_invalid", field: "date" });

    const badReferenceDate = validateBookingInput(fixtureInput, {
      ...fixtureContext,
      today: "yesterday",
    });
    expect(badReferenceDate.issues).toContainEqual({
      code: "reference_date_invalid",
      field: "date",
    });
  });
});

describe("السعة", () => {
  const baseCapacity = {
    clinicCapacity: 10,
    serviceCapacity: 3,
    currentClinicCount: 9,
    currentServiceCount: 2,
  };

  it("يسمح بالحجز قبل السقف ويرفض بلوغ سقف العيادة أو الخدمة", () => {
    expect(checkBookingCapacity(baseCapacity)).toEqual({ allowed: true });
    expect(checkBookingCapacity({ ...baseCapacity, currentClinicCount: 10 })).toEqual({
      allowed: false,
      reason: "clinic_full",
    });
    expect(checkBookingCapacity({ ...baseCapacity, currentServiceCount: 3 })).toEqual({
      allowed: false,
      reason: "service_full",
    });
  });

  it("يتعامل مع حد العيادة والحد الفرعي مستقلين ولا يجمعهما", () => {
    expect(
      checkBookingCapacity({
        clinicCapacity: 5,
        serviceCapacity: 20,
        currentClinicCount: 5,
        currentServiceCount: 1,
      }),
    ).toEqual({ allowed: false, reason: "clinic_full" });

    expect(
      checkBookingCapacity({
        clinicCapacity: 20,
        serviceCapacity: 2,
        currentClinicCount: 2,
        currentServiceCount: 2,
      }),
    ).toEqual({ allowed: false, reason: "service_full" });
  });

  it("يدعم عدم ضبط حد فرعي ويرفض القيم السالبة أو الكسريّة", () => {
    expect(
      checkBookingCapacity({
        clinicCapacity: 5,
        serviceCapacity: null,
        currentClinicCount: 1,
        currentServiceCount: 999,
      }),
    ).toEqual({ allowed: true });
    expect(checkBookingCapacity({ ...baseCapacity, clinicCapacity: -1 })).toEqual({
      allowed: false,
      reason: "invalid_capacity_or_count",
    });
    expect(checkBookingCapacity({ ...baseCapacity, currentServiceCount: 1.5 })).toEqual({
      allowed: false,
      reason: "invalid_capacity_or_count",
    });
  });

  it("يحسب Pending وConfirmed فقط ضمن العدادات النشطة", () => {
    const bookings = [
      { clinicId: "clinic-demo", serviceId: "service-demo", date: "2026-10-29", status: "Pending" as const },
      { clinicId: "clinic-demo", serviceId: "service-demo", date: "2026-10-29", status: "Confirmed" as const },
      { clinicId: "clinic-demo", serviceId: "other-service", date: "2026-10-29", status: "Confirmed" as const },
      { clinicId: "clinic-demo", serviceId: "service-demo", date: "2026-10-29", status: "Cancelled" as const },
      { clinicId: "clinic-demo", serviceId: "service-demo", date: "2026-10-29", status: "NoShow" as const },
      { clinicId: "clinic-demo", serviceId: "service-demo", date: "2026-10-29", status: "Completed" as const },
      { clinicId: "other-clinic", serviceId: "service-demo", date: "2026-10-29", status: "Pending" as const },
      { clinicId: "clinic-demo", serviceId: "service-demo", date: "2026-10-30", status: "Pending" as const },
    ];
    expect(countActiveBookings(bookings, "clinic-demo", "2026-10-29")).toBe(3);
    expect(countActiveBookings(bookings, "clinic-demo", "2026-10-29", "service-demo")).toBe(2);
  });
});

describe("كشف الحجز المكرر", () => {
  it("يطابق الاسم والهاتف بعد التطبيع داخل العيادة واليوم نفسيهما", () => {
    expect(
      hasDuplicateBooking(
        {
          patientName: " إِياد   اختبار ",
          phone: "٠٠٠٠٠٠٠٠٠٠٠",
          clinicId: "clinic-demo",
          date: "2026-10-29",
        },
        [duplicateFixture({ patientName: "اياد اختبار" })],
      ),
    ).toBe(true);
  });

  it.each(["Cancelled", "NoShow", "Completed"] as const)(
    "يتجاهل الحجز ذي الحالة غير النشطة %s",
    (status) => {
      expect(hasDuplicateBooking(
        { patientName: "ليلى اختبار", phone: "00000000000", clinicId: "clinic-demo", date: "2026-10-29" },
        [duplicateFixture({ status })],
      )).toBe(false);
    },
  );

  it("لا يعتبر اختلاف اليوم أو العيادة أو الاسم أو الهاتف تكرارًا", () => {
    const candidate = {
      patientName: "ليلى اختبار",
      phone: "00000000000",
      clinicId: "clinic-demo",
      date: "2026-10-29",
    };
    expect(hasDuplicateBooking(candidate, [duplicateFixture({ date: "2026-10-30" })])).toBe(false);
    expect(hasDuplicateBooking(candidate, [duplicateFixture({ clinicId: "other-clinic" })])).toBe(false);
    expect(hasDuplicateBooking(candidate, [duplicateFixture({ patientName: "اسم آخر" })])).toBe(false);
    expect(hasDuplicateBooking(candidate, [duplicateFixture({ phone: "00000000001" })])).toBe(false);
  });
});

describe("أيام الأسبوع وفق معيار ISO", () => {
  it("يحوّل أسماء الأيام العربية والإنجليزية من الاثنين=1 إلى الأحد=7", () => {
    expect(
      weekdayNamesToIsoDays([
        "Monday",
        "الثلاثاء",
        "الأربعاء",
        "Thursday",
        "الجمعة",
        "Saturday",
        "الأحد",
      ]),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("يتجاهل اختلاف الهمزة وحالة أحرف الإنجليزية ويرفض الاسم المجهول", () => {
    expect(weekdayNamesToIsoDays(["الاحد", "SUNDAY", "الاثنين"])).toEqual([7, 7, 1]);
    expect(() => weekdayNamesToIsoDays(["Funday"])).toThrow(RangeError);
  });
});
