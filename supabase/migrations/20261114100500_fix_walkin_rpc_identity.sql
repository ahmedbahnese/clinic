-- Fix walk-in booking identity checks for server-side Supabase RPC calls.
-- The function is executable only by trusted server roles; staff profile and
-- clinic authorization checks remain mandatory below.
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
  p_staff_user_id UUID DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic RECORD;
  v_service RECORD;
  v_service_name TEXT;
  v_schedule RECORD;
  v_effective_capacity INTEGER;
  v_current_clinic_booked INTEGER;
  v_current_service_booked INTEGER;
  v_queue_number INTEGER;
  v_ref TEXT;
  v_new_appointment RECORD;
  v_is_staff BOOLEAN := FALSE;
  v_staff_record RECORD;
  v_staff_name TEXT := NULL;
  v_initial_status appointment_status;
  v_clean_phone TEXT;
  v_clean_name TEXT;
  v_normalized_name TEXT;
  v_patient_age TEXT;
  v_dow INTEGER;
  v_retries INTEGER := 0;
  v_today_cairo DATE := (timezone('Africa/Cairo', now()))::date;
  v_next_val BIGINT;
  v_constraint_name TEXT;
BEGIN
  -- 1. Clean & validate inputs
  v_clean_phone := regexp_replace(trim(COALESCE(p_phone_number, '')), '\s+', '', 'g');
  v_clean_name := trim(COALESCE(p_patient_name, ''));
  v_normalized_name := public.normalize_patient_name(v_clean_name);

  IF v_clean_phone !~ '^01[0125][0-9]{8}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'رقم الهاتف غير صحيح. يجب أن يتكون من 11 رقماً ويبدأ بـ (010, 011, 012, 015).');
  END IF;

  IF length(v_clean_name) < 5 OR array_length(regexp_split_to_array(v_clean_name, '\s+'), 1) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال اسم المريض ثنائي على الأقل.');
  END IF;

  IF p_appointment_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'تاريخ الموعد مطلوب.');
  END IF;

  IF p_appointment_date < v_today_cairo THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن حجز موعد في تاريخ سابق.');
  END IF;

  IF p_appointment_date > (v_today_cairo + INTERVAL '30 days') THEN
    RETURN jsonb_build_object('success', false, 'error', 'الحجز الإلكتروني متاح بحد أقصى 30 يوماً مقدماً.');
  END IF;

  -- 1b. Date of birth validation; age is ALWAYS derived server-side from DOB
  IF p_date_of_birth IS NOT NULL THEN
    IF p_date_of_birth > v_today_cairo THEN
      RETURN jsonb_build_object('success', false, 'error', 'تاريخ الميلاد لا يمكن أن يكون في المستقبل.');
    END IF;
    IF p_date_of_birth < DATE '1900-01-01' THEN
      RETURN jsonb_build_object('success', false, 'error', 'تاريخ الميلاد غير منطقي، يرجى مراجعة شهادة الميلاد.');
    END IF;
    IF p_date_of_birth > p_appointment_date THEN
      RETURN jsonb_build_object('success', false, 'error', 'تاريخ الميلاد بعد تاريخ الكشف، يرجى مراجعة التاريخين.');
    END IF;
    IF age(p_appointment_date, p_date_of_birth) > INTERVAL '18 years' THEN
      RETURN jsonb_build_object('success', false, 'error', 'مستشفى الأطفال التخصصي يستقبل الحالات حتى عمر 18 سنة فقط عند تاريخ الكشف.');
    END IF;
    v_patient_age := public.format_patient_age(p_date_of_birth, p_appointment_date);
  ELSE
    v_patient_age := NULLIF(trim(COALESCE(p_patient_age, '')), '');
  END IF;

  -- 2. Concurrency safety: clinic+date lock, then patient+date lock so the
  --    cross-clinic duplicate check is serialized per child per day.
  PERFORM pg_advisory_xact_lock(hashtext('booking_' || p_clinic_id || '_' || p_appointment_date::text));
  PERFORM pg_advisory_xact_lock(hashtext('patient_day_' || v_clean_phone || '_' || p_appointment_date::text));

  -- 3. Validate clinic
  SELECT * INTO v_clinic FROM public.clinics WHERE id = p_clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المختارة غير موجودة.');
  END IF;

  IF NOT v_clinic.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المختارة غير مفعلة للحجز حالياً.');
  END IF;

  -- 4. Calendar exceptions & weekly schedule precedence
  SELECT * INTO v_schedule FROM public.clinic_schedules
  WHERE clinic_id = p_clinic_id AND schedule_date = p_appointment_date;

  IF FOUND THEN
    IF v_schedule.is_closed THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'العيادة مغلقة في هذا اليوم' || COALESCE(': ' || v_schedule.closure_reason, ' نظراً لعطلة رسمية أو ظرف طارئ.')
      );
    END IF;
    v_effective_capacity := COALESCE(v_schedule.max_capacity, v_clinic.max_daily_slots);
  ELSE
    v_dow := EXTRACT(DOW FROM p_appointment_date)::INTEGER;
    IF NOT (v_dow = ANY(v_clinic.days_of_week)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'العيادة لا تعمل في هذا اليوم (عطلة أسبوعية).');
    END IF;
    v_effective_capacity := v_clinic.max_daily_slots;
  END IF;

  -- 5. Duplicate reservation check: ONE active booking per phone + DOB + day
  --    across ALL clinics. When either side lacks a DOB (legacy), fall back to
  --    the normalized child name. Siblings with distinct DOBs stay allowed.
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.phone_number = v_clean_phone
      AND a.appointment_date = p_appointment_date
      AND a.status != 'CANCELLED'
      AND (
        (p_date_of_birth IS NOT NULL AND a.date_of_birth IS NOT NULL
          AND a.date_of_birth = p_date_of_birth)
        OR ((p_date_of_birth IS NULL OR a.date_of_birth IS NULL)
          AND public.normalize_patient_name(a.patient_name) = v_normalized_name)
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'يوجد حجز بنفس الرقم لنفس الميلاد.');
  END IF;

  -- 6. Clinic daily capacity check
  SELECT COUNT(*) INTO v_current_clinic_booked
  FROM public.appointments
  WHERE clinic_id = p_clinic_id
    AND appointment_date = p_appointment_date
    AND status != 'CANCELLED';

  IF v_current_clinic_booked >= v_effective_capacity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('عفواً، اكتملت السعة اليومية المتاحة للعيادة في هذا اليوم (%s مريض). يرجى اختيار موعد آخر.', v_effective_capacity)
    );
  END IF;

  -- 7. Service is MANDATORY and must be a real active service of this clinic.
  --    No default/substitute service is ever injected.
  IF p_service_id IS NULL OR trim(p_service_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب اختيار خدمة فعلية تابعة للعيادة قبل تسجيل الحجز.');
  END IF;

  SELECT * INTO v_service FROM public.clinic_services
  WHERE id = p_service_id AND clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الخدمة المختارة غير تابعة لهذه العيادة.');
  END IF;

  IF NOT v_service.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'الخدمة المختارة غير مفعلة حالياً.');
  END IF;

  v_service_name := v_service.name;

  IF v_service.max_daily_capacity IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_service_booked
    FROM public.appointments
    WHERE clinic_id = p_clinic_id
      AND service_id = p_service_id
      AND appointment_date = p_appointment_date
      AND status != 'CANCELLED';

    IF v_current_service_booked >= v_service.max_daily_capacity THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('عفواً، اكتملت السعة اليومية المتاحة لخدمة "%s" في هذا اليوم (%s مريض). يرجى اختيار تاريخ آخر أو خدمة بديلة.', v_service.name, v_service.max_daily_capacity)
      );
    END IF;
  END IF;

  -- 8. Monotonic queue number
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO v_queue_number
  FROM public.appointments
  WHERE clinic_id = p_clinic_id
    AND appointment_date = p_appointment_date;

  -- 9. Determine initial status & staff identity strictly
  IF p_staff_user_id IS NOT NULL THEN
    IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') AND COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role' THEN
      IF auth.uid() IS NULL OR auth.uid() != p_staff_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: لا يمكن تحديد هوية موظف مختلفة عن الجلسة الموثقة.');
      END IF;
    END IF;

    SELECT id, full_name, role, clinic_id INTO v_staff_record
    FROM public.staff_profiles
    WHERE id = p_staff_user_id AND is_active = true;

    IF FOUND THEN
      IF v_staff_record.role NOT IN ('ADMIN', 'RECEPTIONIST') THEN
        RETURN jsonb_build_object('success', false, 'error', 'المستخدم غير مصرح له بتسجيل الحجوزات المباشرة.');
      END IF;

      IF v_staff_record.role = 'RECEPTIONIST' AND v_staff_record.clinic_id IS NOT NULL AND v_staff_record.clinic_id != p_clinic_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'موظف الاستقبال غير مصرح له بالتسجيل في عيادة أخرى غير العيادة المخصصة له.');
      END IF;

      v_is_staff := true;
      v_staff_name := v_staff_record.full_name;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'حساب الموظف غير صالح أو غير نشط.');
    END IF;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT id, full_name, role, clinic_id INTO v_staff_record
    FROM public.staff_profiles
    WHERE id = auth.uid() AND is_active = true;

    IF FOUND THEN
      IF v_staff_record.role IN ('ADMIN', 'RECEPTIONIST') THEN
        IF v_staff_record.role = 'RECEPTIONIST' AND v_staff_record.clinic_id IS NOT NULL AND v_staff_record.clinic_id != p_clinic_id THEN
          RETURN jsonb_build_object('success', false, 'error', 'موظف الاستقبال غير مصرح له بالتسجيل في عيادة أخرى غير العيادة المخصصة له.');
        END IF;
        v_is_staff := true;
        v_staff_name := v_staff_record.full_name;
      END IF;
    END IF;
  END IF;

  IF v_is_staff THEN
    v_initial_status := 'CONFIRMED';
  ELSE
    v_initial_status := 'PENDING_REVIEW';
  END IF;

  -- 10. Database-generated reference number sequence
  v_next_val := nextval('public.seq_appointment_reference_number');
  v_ref := 'BSCH-' || CASE WHEN v_next_val < 10000 THEN lpad(v_next_val::text, 4, '0') ELSE v_next_val::text END;

  -- 11. Insert with collision retry and constraint discrimination
  LOOP
    BEGIN
      INSERT INTO public.appointments (
        reference_number,
        clinic_id,
        clinic_name,
        service_id,
        service_name,
        patient_name,
        phone_number,
        patient_age,
        date_of_birth,
        patient_address,
        guardian_national_id,
        appointment_date,
        appointment_time,
        status,
        queue_number
      ) VALUES (
        v_ref,
        v_clinic.id,
        v_clinic.name,
        v_service.id,
        v_service_name,
        v_clean_name,
        v_clean_phone,
        v_patient_age,
        p_date_of_birth,
        p_patient_address,
        p_guardian_national_id,
        p_appointment_date,
        COALESCE(p_appointment_time, '09:00'),
        v_initial_status,
        v_queue_number
      )
      RETURNING * INTO v_new_appointment;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

      IF v_constraint_name = 'appointments_reference_number_key'
         OR v_constraint_name = 'idx_appointments_ref'
         OR v_constraint_name LIKE '%reference_number%'
         OR v_constraint_name LIKE '%ref%' THEN
        v_retries := v_retries + 1;
        IF v_retries > 5 THEN
          RETURN jsonb_build_object('success', false, 'error', 'تعذر توليد رقم مرجعي فريد في الوقت الحالي. يرجى المحاولة مرة أخرى.');
        END IF;
        v_next_val := nextval('public.seq_appointment_reference_number');
        v_ref := 'BSCH-' || CASE WHEN v_next_val < 10000 THEN lpad(v_next_val::text, 4, '0') ELSE v_next_val::text END;
      ELSIF v_constraint_name = 'idx_unique_active_apt_per_phone_dob_day'
         OR v_constraint_name = 'idx_unique_active_apt_per_phone_name_day'
         OR v_constraint_name = 'idx_unique_active_apt_per_phone_patient_clinic_day'
         OR v_constraint_name = 'idx_unique_active_apt_per_phone_clinic_day' THEN
        RETURN jsonb_build_object('success', false, 'error', 'يوجد حجز بنفس الرقم لنفس الميلاد.');
      ELSE
        RETURN jsonb_build_object('success', false, 'error', 'يوجد تعارض مع حجز مسجل مسبقاً (' || COALESCE(v_constraint_name, 'unique violation') || ').');
      END IF;
    END;
  END LOOP;

  -- 12. Initial status history
  INSERT INTO public.appointment_status_history (
    appointment_id,
    status,
    updated_by,
    note
  ) VALUES (
    v_new_appointment.id,
    v_initial_status,
    COALESCE(v_staff_name, CASE WHEN v_is_staff THEN 'طاقم المستشفى' ELSE 'البوابة الإلكترونية' END),
    CASE WHEN v_is_staff THEN 'تسجيل حضوري مباشر من مكتب الاستقبال' ELSE 'طلب حجز إلكتروني جديد' END
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment', jsonb_build_object(
      'id', v_new_appointment.id,
      'reference_number', v_new_appointment.reference_number,
      'clinic_id', v_new_appointment.clinic_id,
      'clinic_name', v_new_appointment.clinic_name,
      'service_id', v_new_appointment.service_id,
      'service_name', v_new_appointment.service_name,
      'patient_name', v_new_appointment.patient_name,
      'phone_number', v_new_appointment.phone_number,
      'patient_age', v_new_appointment.patient_age,
      'date_of_birth', v_new_appointment.date_of_birth,
      'appointment_date', v_new_appointment.appointment_date,
      'appointment_time', v_new_appointment.appointment_time,
      'status', v_new_appointment.status,
      'queue_number', v_new_appointment.queue_number,
      'created_at', v_new_appointment.created_at
    )
  );
END;
$$;


REVOKE ALL ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID, DATE) TO service_role;
