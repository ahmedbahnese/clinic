-- ============================================================================
-- BSCH Clinics — Fix book_appointment_atomic RPC
-- يحل مشكلة: record "v_service" is not assigned yet
-- ويمنح صلاحية التنفيذ للـ anon و authenticated و service_role
-- ============================================================================

DROP FUNCTION IF EXISTS public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
  p_clinic_id TEXT,
  p_patient_name TEXT,
  p_phone_number TEXT,
  p_patient_age TEXT DEFAULT NULL,
  p_patient_address TEXT DEFAULT NULL,
  p_appointment_date DATE DEFAULT NULL,
  p_appointment_time TEXT DEFAULT '09:00',
  p_reference_number TEXT DEFAULT NULL,
  p_service_id TEXT DEFAULT NULL,
  p_guardian_national_id TEXT DEFAULT NULL,
  p_staff_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic RECORD;
  v_service RECORD;
  v_service_name TEXT := NULL;
  v_service_capacity INTEGER := NULL;
  v_service_instructions TEXT := NULL;
  v_schedule RECORD;
  v_target_date DATE;
  v_day_of_week INTEGER;
  v_effective_capacity INTEGER;
  v_current_total_bookings INTEGER;
  v_current_service_bookings INTEGER;
  v_queue_number INTEGER;
  v_reference_number TEXT;
  v_appointment_id UUID;
  v_staff RECORD;
  v_created_by TEXT := 'PATIENT_WEB';
  v_initial_status appointment_status := 'PENDING_REVIEW';
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_clean_phone TEXT;
  v_clean_name TEXT;
  v_caller_role staff_role;
  v_seq_num BIGINT;
  v_retry_attempts INTEGER := 0;
BEGIN
  -- 1. Input Sanitization & Validation
  v_clean_phone := regexp_replace(COALESCE(p_phone_number, ''), '[^0-9]', '', 'g');
  v_clean_name := trim(COALESCE(p_patient_name, ''));

  IF length(v_clean_name) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يرجى كتابة اسم المريض ثنائياً على الأقل (5 أحرف على الأقل).');
  END IF;

  IF v_clean_phone !~ '^01[0125][0-9]{8}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'رقم الهاتف المحمول غير صالح، يجب أن يتكون من 11 رقماً ويبدأ بـ 01.');
  END IF;

  -- 2. Staff Identity & Walk-in Verification
  -- Protect against staff identity spoofing: if auth.uid() is present, enforce caller is auth.uid()
  IF auth.uid() IS NOT NULL THEN
    p_staff_user_id := auth.uid();
  END IF;

  IF p_staff_user_id IS NOT NULL THEN
    SELECT * INTO v_staff
    FROM public.staff_profiles
    WHERE id = p_staff_user_id AND is_active = true;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'حساب الموظف غير مسجل أو غير نشط.');
    END IF;

    v_caller_role := v_staff.role;
    IF v_caller_role NOT IN ('ADMIN', 'RECEPTIONIST') THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لهذا الموظف بإنشاء حجوزات مباشرة.');
    END IF;

    -- Receptionist clinic confinement
    IF v_caller_role = 'RECEPTIONIST' AND v_staff.clinic_id IS NOT NULL AND trim(v_staff.clinic_id) != '' THEN
      IF v_staff.clinic_id != p_clinic_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لموظف الاستقبال بحجز موعد لعيادة أخرى.');
      END IF;
    END IF;

    v_created_by := COALESCE(v_staff.full_name, v_staff.username, 'STAFF');
    v_initial_status := 'CONFIRMED'; -- Walk-ins created by staff are confirmed immediately
  END IF;

  -- 3. Clinic Verification
  SELECT * INTO v_clinic
  FROM public.clinics
  WHERE id = p_clinic_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المطلوبة غير متاحة أو غير موجودة.');
  END IF;

  -- 4. Sub-Service Verification (Optional granular service)
  IF p_service_id IS NOT NULL AND trim(p_service_id) != '' THEN
    SELECT * INTO v_service
    FROM public.clinic_services
    WHERE id = p_service_id AND clinic_id = p_clinic_id AND is_active = true;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'الخدمة التخصصية المطلوبة غير متاحة بهذه العيادة.');
    END IF;

    v_service_name := v_service.name;
    v_service_capacity := v_service.max_daily_capacity;
    v_service_instructions := v_service.instructions;
  END IF;

  -- 5. Target Date & Horizon Validation (Strict 30-day window)
  v_target_date := COALESCE(p_appointment_date, (v_now AT TIME ZONE 'Africa/Cairo')::date);

  IF v_target_date < (v_now AT TIME ZONE 'Africa/Cairo')::date THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن حجز موعد في تاريخ ماضٍ.');
  END IF;

  IF v_target_date > (v_now AT TIME ZONE 'Africa/Cairo')::date + INTERVAL '30 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'أقصى أفق مسموح به للحجز المسبق هو 30 يوماً فقط.');
  END IF;

  -- --------------------------------------------------------------------------
  -- 6. Concurrency Serialization: Transactional Advisory Lock per clinic & date
  -- --------------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext('clinic_booking_' || p_clinic_id || '_' || v_target_date::text));

  -- 7. Schedule & Weekly Working Days Verification
  v_day_of_week := EXTRACT(DOW FROM v_target_date)::INTEGER;

  SELECT * INTO v_schedule
  FROM public.clinic_schedules
  WHERE clinic_id = p_clinic_id AND schedule_date = v_target_date;

  IF FOUND THEN
    -- Specific date exception
    IF v_schedule.is_closed = true THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'العيادة مغلقة في هذا التاريخ المحدد: ' || COALESCE(v_schedule.closure_reason, 'إجازة رسمية / طارئة.')
      );
    END IF;
    v_effective_capacity := COALESCE(v_schedule.max_capacity, v_clinic.max_daily_slots, 20);
  ELSE
    -- Standard recurring weekly schedule
    IF NOT (v_day_of_week = ANY(v_clinic.days_of_week)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'العيادة لا تعمل في هذا اليوم من أيام الأسبوع.');
    END IF;
    v_effective_capacity := COALESCE(v_clinic.max_daily_slots, 20);
  END IF;

  -- 8. Capacity Verification (Total Clinic Capacity & Per-Service Capacity)
  SELECT count(*) INTO v_current_total_bookings
  FROM public.appointments
  WHERE clinic_id = p_clinic_id
    AND appointment_date = v_target_date
    AND status <> 'CANCELLED'::appointment_status;

  IF v_current_total_bookings >= v_effective_capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'عذراً، اكتملت سعة الحجز اليومية للعيادة في هذا التاريخ.');
  END IF;

  IF v_service_capacity IS NOT NULL AND v_service_capacity > 0 THEN
    SELECT count(*) INTO v_current_service_bookings
    FROM public.appointments
    WHERE clinic_id = p_clinic_id
      AND service_id = p_service_id
      AND appointment_date = v_target_date
      AND status <> 'CANCELLED'::appointment_status;

    IF v_current_service_bookings >= v_service_capacity THEN
      RETURN jsonb_build_object('success', false, 'error', 'عذراً، اكتملت السعة اليومية المخصصة لهذه الخدمة التخصصية بالتحديد.');
    END IF;
  END IF;

  -- 9. Duplicate Active Booking Prevention (Permits Sibling Bookings)
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE clinic_id = p_clinic_id
      AND phone_number = v_clean_phone
      AND lower(trim(patient_name)) = lower(v_clean_name)
      AND appointment_date = v_target_date
      AND status <> 'CANCELLED'::appointment_status
  ) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'يوجد حجز نشط ومسبق للطفل نفسه بنفس رقم الهاتف في نفس العيادة والتاريخ. لتسجيل طفل آخر يرجى إدخال اسم الطفل بوضوح.'
    );
  END IF;

  -- 10. Queue & Monotonic Reference Number Generation
  v_queue_number := v_current_total_bookings + 1;

  LOOP
    v_seq_num := nextval('public.seq_appointment_reference_number');
    v_reference_number := 'BSCH-' || v_seq_num::text;

    BEGIN
      INSERT INTO public.appointments (
        clinic_id,
        clinic_name,
        patient_name,
        phone_number,
        patient_age,
        patient_address,
        appointment_date,
        appointment_time,
        reference_number,
        queue_number,
        status,
        service_id,
        service_name,
        guardian_national_id,
        attendance_guidance,
        called_count,
        created_at,
        updated_at
      ) VALUES (
        p_clinic_id,
        v_clinic.name,
        v_clean_name,
        v_clean_phone,
        p_patient_age,
        p_patient_address,
        v_target_date,
        COALESCE(p_appointment_time, '09:00'),
        v_reference_number,
        v_queue_number,
        v_initial_status,
        p_service_id,
        v_service_name,
        p_guardian_national_id,
        COALESCE(v_service_instructions, v_clinic.instructions, 'الحضور صباحاً بأسبقية الحضور لإنهاء التذكرة.'),
        0,
        v_now,
        v_now
      ) RETURNING id INTO v_appointment_id;

      -- Successful insert, exit retry loop
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        v_retry_attempts := v_retry_attempts + 1;
        IF v_retry_attempts > 5 THEN
          RETURN jsonb_build_object('success', false, 'error', 'حدث تعارض في الرقم المرجعي للحجز، يرجى إعادة المحاولة.');
        END IF;
    END;
  END LOOP;

  -- 11. Initial Status History Audit
  INSERT INTO public.appointment_status_history (
    appointment_id,
    status,
    note,
    updated_by,
    created_at
  ) VALUES (
    v_appointment_id,
    v_initial_status,
    'حجز مبدئي عبر المنظومة الإلكترونية (' || v_created_by || ')',
    v_created_by,
    v_now
  );

  -- Return sanitized receipt data to caller (both flat and nested 'appointment' for 100% backward compatibility)
  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'reference_number', v_reference_number,
    'queue_number', v_queue_number,
    'clinic_id', p_clinic_id,
    'clinic_name', v_clinic.name,
    'service_name', v_service_name,
    'appointment_date', v_target_date,
    'appointment_time', COALESCE(p_appointment_time, '09:00'),
    'status', v_initial_status,
    'appointment', jsonb_build_object(
      'id', v_appointment_id,
      'reference_number', v_reference_number,
      'queue_number', v_queue_number,
      'clinic_id', p_clinic_id,
      'clinic_name', v_clinic.name,
      'service_name', v_service_name,
      'patient_name', v_clean_name,
      'phone_number', v_clean_phone,
      'patient_age', p_patient_age,
      'patient_address', p_patient_address,
      'appointment_date', v_target_date,
      'appointment_time', COALESCE(p_appointment_time, '09:00'),
      'status', v_initial_status,
      'created_at', v_now
    )
  );
END;
$$;

-- Grant permissions to anon, authenticated and service_role
REVOKE ALL ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID) TO anon, authenticated, service_role;

