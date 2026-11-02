-- ============================================================================
-- BSCH Clinics — Production SQL Remediation Bundle 2
-- File: SUPABASE_PRODUCTION_BUNDLE_2.sql
-- Purpose:
--   1. Deploy update_appointment_status_atomic RPC with:
--      - Anti-spoofing staff authentication (strictly forces auth.uid() in authenticated sessions).
--      - Restriction of service-role delegation strictly to verified service_role callers.
--      - Removal of unauthenticated direct phone-only cancellations.
--      - Strict PostgreSQL-enforced state machine transitions.
--      - Concurrency serialization via row lock (FOR UPDATE).
--      - Doctor and receptionist role and clinic confinement.
--   2. Deploy transfer_appointment_clinic_atomic RPC with advisory lock & capacity check.
--   3. Deploy hardened check_appointment_update_permissions trigger.
--   4. Deploy hardened RLS policies on appointments with explicit operator precedence.
--
-- Execution Context: Supabase Dashboard SQL Editor (runs as role postgres)
-- Maintenance Window / Locking:
--   Low locking impact. Replaces functions and policies inside a single transaction.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Hardened Trigger Function: check_appointment_update_permissions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_appointment_update_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role staff_role;
  v_doc_clinic TEXT;
  v_is_service_role BOOLEAN;
  v_effective_uid UUID;
BEGIN
  -- Determine whether caller is service_role
  v_is_service_role := (
    current_user = 'service_role' 
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  );

  -- 1. Reference number is ALWAYS strictly immutable under all circumstances
  IF OLD.reference_number != NEW.reference_number THEN
    RAISE EXCEPTION 'الرقم المرجعي للحجز غير قابل للتعديل نهائياً.';
  END IF;

  -- 2. If caller is service_role, allow update (service_role manages system tasks)
  IF v_is_service_role THEN
    RETURN NEW;
  END IF;

  -- 3. In authenticated client sessions, enforce authenticated user session
  v_effective_uid := auth.uid();
  IF v_effective_uid IS NULL THEN
    RAISE EXCEPTION 'غير مصرح: لا يمكن تعديل الحجوزات دون جلسة موثقة.';
  END IF;

  v_role := public.get_current_staff_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'غير مصرح: حساب المستخدم غير نشط أو غير مسجل في طاقم العمل.';
  END IF;

  -- 4. Admins have full access
  IF v_role = 'ADMIN' THEN
    RETURN NEW;
  END IF;

  -- 5. Terminal state protection for non-admins
  IF OLD.status = 'COMPLETED' AND NEW.status != 'COMPLETED' THEN
    RAISE EXCEPTION 'لا يمكن تعديل موعد مكتمل تم الكشف عليه مسبقاً إلا بواسطة مدير النظام.';
  END IF;

  IF OLD.status = 'CANCELLED' AND NEW.status != 'CANCELLED' THEN
    RAISE EXCEPTION 'لا يمكن إعادة فتح موعد ملغي مسبقاً.';
  END IF;

  -- 6. Receptionist constraints
  IF v_role = 'RECEPTIONIST' THEN
    IF NEW.status = 'COMPLETED' THEN
      RAISE EXCEPTION 'غير مصرح لموظف الاستقبال إنهاء الكشف الطبي (COMPLETED).';
    END IF;

    -- Block receptionists from modifying core patient data directly
    IF OLD.patient_name != NEW.patient_name
       OR OLD.phone_number != NEW.phone_number
       OR OLD.patient_address IS DISTINCT FROM NEW.patient_address
       OR OLD.patient_age IS DISTINCT FROM NEW.patient_age
       OR OLD.clinic_id != NEW.clinic_id
       OR OLD.appointment_date != NEW.appointment_date THEN
      RAISE EXCEPTION 'غير مصرح لموظف الاستقبال بتعديل بيانات المريض أو العيادة أو التاريخ مباشرة.';
    END IF;

    -- Enforce clinic confinement if receptionist is clinic-assigned
    SELECT clinic_id INTO v_doc_clinic 
    FROM public.staff_profiles 
    WHERE id = v_effective_uid;

    IF v_doc_clinic IS NOT NULL AND trim(v_doc_clinic) != '' AND OLD.clinic_id != v_doc_clinic THEN
      RAISE EXCEPTION 'غير مصرح لموظف الاستقبال بتعديل مواعيد خاصة بعيادة أخرى.';
    END IF;

    RETURN NEW;
  END IF;

  -- 7. Doctor constraints
  IF v_role = 'DOCTOR' THEN
    SELECT clinic_id INTO v_doc_clinic 
    FROM public.staff_profiles 
    WHERE id = v_effective_uid;

    IF v_doc_clinic IS NULL OR trim(v_doc_clinic) = '' THEN
      RAISE EXCEPTION 'غير مصرح للطبيب غير المعين على عيادة بتعديل المواعيد.';
    END IF;

    IF OLD.clinic_id != v_doc_clinic THEN
      RAISE EXCEPTION 'غير مصرح للطبيب بتعديل مواعيد خاصة بعيادة أخرى.';
    END IF;

    IF OLD.patient_name != NEW.patient_name
       OR OLD.phone_number != NEW.phone_number
       OR OLD.clinic_id != NEW.clinic_id
       OR OLD.appointment_date != NEW.appointment_date THEN
      RAISE EXCEPTION 'غير مصرح للطبيب بتعديل بيانات المريض الأساسية أو العيادة أو التاريخ.';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'غير مصرح: دور المستخدم غير معروف.';
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_appointment_update_permissions ON public.appointments;
CREATE TRIGGER trigger_check_appointment_update_permissions
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_appointment_update_permissions();

-- ----------------------------------------------------------------------------
-- 2. Atomic Status Update RPC (Concurrency Locked & Anti-Spoofing Hardened)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_appointment_status_atomic(TEXT, appointment_status, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_appointment_status_atomic(UUID, appointment_status, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_appointment_status_atomic(
  p_appointment_id TEXT,
  p_target_status appointment_status,
  p_staff_user_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_caller_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_staff_record RECORD;
  v_role staff_role;
  v_staff_clinic_id TEXT;
  v_staff_name TEXT;
  v_apt RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_new_called_count INTEGER;
  v_last_called TIMESTAMPTZ;
  v_is_service_role BOOLEAN;
  v_uuid_id UUID;
BEGIN
  -- Determine whether execution context is service_role
  v_is_service_role := (
    current_user = 'service_role' 
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  );

  -- 1. Anti-Spoofing Caller Identity Verification
  IF auth.uid() IS NOT NULL THEN
    -- Authenticated JWT session: MUST use auth.uid() as true caller identity
    v_caller_id := auth.uid();
    IF p_staff_user_id IS NOT NULL AND p_staff_user_id != auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: لا يمكن انتحال هوية موظف مختلفة عن الجلسة الموثقة.');
    END IF;
  ELSIF v_is_service_role AND p_staff_user_id IS NOT NULL THEN
    -- Server-side admin client may delegate verified staff identity
    v_caller_id := p_staff_user_id;
  ELSE
    -- Unauthenticated callers cannot update appointment status directly!
    -- Direct phone cancellations are blocked; patient must use cancellation requests.
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'غير مصرح: يلزم توفير جلسة موظف موثقة. لإلغاء الموعد يرجى تقديم طلب إلغاء للمراجعة.'
    );
  END IF;

  -- 2. Verify staff member profile & role
  SELECT id, username, full_name, role, clinic_id, is_active
  INTO v_staff_record
  FROM public.staff_profiles
  WHERE id = v_caller_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'حساب الموظف غير مسجل بالنظام.');
  END IF;

  IF v_staff_record.is_active != true THEN
    RETURN jsonb_build_object('success', false, 'error', 'حساب الموظف موقوف عن العمل أو غير نشط.');
  END IF;

  v_role := v_staff_record.role;
  v_staff_clinic_id := v_staff_record.clinic_id;
  v_staff_name := COALESCE(v_staff_record.full_name, v_staff_record.username, 'STAFF');

  -- 3. Lock appointment row FOR UPDATE to serialize concurrent updates
  -- Supports lookup by either UUID or reference_number
  IF p_appointment_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_uuid_id := p_appointment_id::UUID;
    SELECT * INTO v_apt
    FROM public.appointments
    WHERE id = v_uuid_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_apt
    FROM public.appointments
    WHERE reference_number = p_appointment_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الموعد المطلوب غير موجود.');
  END IF;

  -- 4. Role & Clinic Confinement Checks
  IF v_role = 'RECEPTIONIST' THEN
    IF p_target_status = 'COMPLETED' THEN
      RETURN jsonb_build_object('success', false, 'error', 'إتمام الكشف الطبي وصرف التذكرة صلاحية طبية مخصصة للأطباء فقط.');
    END IF;

    IF v_staff_clinic_id IS NOT NULL AND trim(v_staff_clinic_id) != '' AND v_apt.clinic_id != v_staff_clinic_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لموظف الاستقبال بتعديل مواعيد خاصة بعيادة أخرى.');
    END IF;
  ELSIF v_role = 'DOCTOR' THEN
    IF v_staff_clinic_id IS NULL OR trim(v_staff_clinic_id) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح للطبيب غير المعين على عيادة بتعديل المواعيد.');
    END IF;

    IF v_apt.clinic_id != v_staff_clinic_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح للطبيب بتعديل مواعيد خاصة بعيادة أخرى غير العيادة المخصصة له.');
    END IF;
  END IF;

  -- 5. Terminal State Protection
  IF v_apt.status = 'COMPLETED' AND p_target_status != 'COMPLETED' AND v_role != 'ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن تعديل أو إعادة فتح حجز مكتمل تم الكشف عليه مسبقاً إلا بواسطة مدير النظام.');
  END IF;

  IF v_apt.status = 'CANCELLED' AND p_target_status != 'CANCELLED' AND v_role != 'ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن إعادة فتح حجز ملغي مسبقاً.');
  END IF;

  -- 6. Strict State Machine Transitions
  IF v_apt.status = 'PENDING_REVIEW' AND p_target_status NOT IN ('CONFIRMED', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', format('لا يمكن تحويل حالة الحجز مباشرة من "%s" إلى "%s".', v_apt.status, p_target_status));
  ELSIF v_apt.status = 'CONFIRMED' AND p_target_status NOT IN ('CHECKED_IN', 'CANCELLED', 'PENDING_REVIEW') THEN
    RETURN jsonb_build_object('success', false, 'error', format('لا يمكن تحويل حالة الحجز مباشرة من "%s" إلى "%s".', v_apt.status, p_target_status));
  ELSIF v_apt.status = 'CHECKED_IN' AND p_target_status NOT IN ('COMPLETED', 'CANCELLED', 'CONFIRMED', 'CHECKED_IN') THEN
    RETURN jsonb_build_object('success', false, 'error', format('لا يمكن تحويل حالة الحجز مباشرة من "%s" إلى "%s".', v_apt.status, p_target_status));
  END IF;

  -- 7. Call Counter Management
  v_new_called_count := COALESCE(v_apt.called_count, 0);
  v_last_called := v_apt.last_called_at;

  IF p_target_status = 'CHECKED_IN' THEN
    v_new_called_count := v_new_called_count + 1;
    v_last_called := v_now;
  END IF;

  -- 8. Apply Atomic Update
  UPDATE public.appointments
  SET
    status = p_target_status,
    called_count = v_new_called_count,
    last_called_at = v_last_called,
    updated_at = v_now
  WHERE id = v_apt.id;

  -- 9. Insert Status History Audit
  INSERT INTO public.appointment_status_history (
    appointment_id,
    status,
    note,
    updated_by,
    created_at
  ) VALUES (
    v_apt.id,
    p_target_status,
    COALESCE(p_note, 'تحديث الحالة إلى ' || p_target_status::text),
    v_staff_name,
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_apt.id,
    'reference_number', v_apt.reference_number,
    'previous_status', v_apt.status,
    'new_status', p_target_status,
    'called_count', v_new_called_count,
    'last_called_at', v_last_called,
    'updated_by', v_staff_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_appointment_status_atomic(TEXT, appointment_status, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_appointment_status_atomic(TEXT, appointment_status, UUID, TEXT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Atomic Clinic Transfer RPC (Transactional Lock & Capacity Check)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.transfer_appointment_clinic_atomic(TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.transfer_appointment_clinic_atomic(UUID, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.transfer_appointment_clinic_atomic(
  p_appointment_id TEXT,
  p_target_clinic_id TEXT,
  p_staff_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_staff_record RECORD;
  v_role staff_role;
  v_staff_name TEXT;
  v_apt RECORD;
  v_target_clinic RECORD;
  v_target_schedule RECORD;
  v_effective_capacity INTEGER;
  v_current_bookings INTEGER;
  v_new_queue_number INTEGER;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_uuid_id UUID;
  v_is_service_role BOOLEAN;
BEGIN
  v_is_service_role := (
    current_user = 'service_role' 
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  );

  -- 1. Anti-Spoofing Authentication
  IF auth.uid() IS NOT NULL THEN
    v_caller_id := auth.uid();
    IF p_staff_user_id IS NOT NULL AND p_staff_user_id != auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: لا يمكن انتحال هوية موظف مختلفة.');
    END IF;
  ELSIF v_is_service_role AND p_staff_user_id IS NOT NULL THEN
    v_caller_id := p_staff_user_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: يلزم توفير جلسة موظف موثقة لنقل الموعد.');
  END IF;

  SELECT id, username, full_name, role, clinic_id, is_active
  INTO v_staff_record
  FROM public.staff_profiles
  WHERE id = v_caller_id;

  IF NOT FOUND OR v_staff_record.is_active != true THEN
    RETURN jsonb_build_object('success', false, 'error', 'حساب الموظف غير نشط أو غير مسجل.');
  END IF;

  v_role := v_staff_record.role;
  v_staff_name := COALESCE(v_staff_record.full_name, v_staff_record.username, 'STAFF');

  IF v_role NOT IN ('ADMIN', 'RECEPTIONIST') THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: نقل الحالات بين العيادات صلاحية مخصصة للاستقبال والإدارة فقط.');
  END IF;

  -- 2. Lock Appointment Row
  IF p_appointment_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_uuid_id := p_appointment_id::UUID;
    SELECT * INTO v_apt FROM public.appointments WHERE id = v_uuid_id FOR UPDATE;
  ELSE
    SELECT * INTO v_apt FROM public.appointments WHERE reference_number = p_appointment_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الموعد المطلوب نقله غير موجود.');
  END IF;

  IF v_apt.status IN ('COMPLETED', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن نقل موعد مكتمل أو ملغي مسبقاً.');
  END IF;

  IF v_apt.clinic_id = p_target_clinic_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'الموعد مسجل بالفعل في العيادة المستهدفة.');
  END IF;

  -- 3. Lock Target Clinic Transactionally
  PERFORM pg_advisory_xact_lock(hashtext('clinic_booking_' || p_target_clinic_id || '_' || v_apt.appointment_date::text));

  SELECT * INTO v_target_clinic
  FROM public.clinics
  WHERE id = p_target_clinic_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المستهدفة غير متاحة أو غير موجودة.');
  END IF;

  -- Check Target Clinic Schedule
  SELECT * INTO v_target_schedule
  FROM public.clinic_schedules
  WHERE clinic_id = p_target_clinic_id AND schedule_date = v_apt.appointment_date;

  IF FOUND THEN
    IF v_target_schedule.is_closed = true THEN
      RETURN jsonb_build_object('success', false, 'error', 'العيادة المستهدفة مغلقة في تاريخ الموعد: ' || COALESCE(v_target_schedule.closure_reason, ''));
    END IF;
    v_effective_capacity := COALESCE(v_target_schedule.max_capacity, v_target_clinic.max_daily_slots, 20);
  ELSE
    IF NOT (EXTRACT(DOW FROM v_apt.appointment_date)::INTEGER = ANY(v_target_clinic.days_of_week)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'العيادة المستهدفة لا تعمل في هذا اليوم من أيام الأسبوع.');
    END IF;
    v_effective_capacity := COALESCE(v_target_clinic.max_daily_slots, 20);
  END IF;

  -- 4. Check Target Clinic Capacity
  SELECT count(*) INTO v_current_bookings
  FROM public.appointments
  WHERE clinic_id = p_target_clinic_id
    AND appointment_date = v_apt.appointment_date
    AND status <> 'CANCELLED'::appointment_status;

  IF v_current_bookings >= v_effective_capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'سعة العيادة المستهدفة مكتملة في هذا التاريخ.');
  END IF;

  v_new_queue_number := v_current_bookings + 1;

  -- 5. Apply Transfer Update
  UPDATE public.appointments
  SET
    clinic_id = p_target_clinic_id,
    clinic_name = v_target_clinic.name,
    service_id = NULL, -- Reset specific service on clinic transfer
    service_name = NULL,
    queue_number = v_new_queue_number,
    updated_at = v_now
  WHERE id = v_apt.id;

  -- 6. Insert Audit History
  INSERT INTO public.appointment_status_history (
    appointment_id,
    status,
    note,
    updated_by,
    created_at
  ) VALUES (
    v_apt.id,
    v_apt.status,
    'تحويل العيادة من [' || v_apt.clinic_name || '] إلى [' || v_target_clinic.name || '] برقم دور جديد: ' || v_new_queue_number || '. السبب: ' || COALESCE(p_reason, 'تحويل إداري/طبي'),
    v_staff_name,
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_apt.id,
    'previous_clinic', v_apt.clinic_name,
    'new_clinic', v_target_clinic.name,
    'new_queue_number', v_new_queue_number,
    'updated_by', v_staff_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_appointment_clinic_atomic(TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_appointment_clinic_atomic(TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Hardened RLS Policy on Appointments with Explicit Operator Precedence
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can update appointments" ON public.appointments;
CREATE POLICY "Staff can update appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    public.get_current_staff_role() = 'ADMIN'
    OR (
      public.get_current_staff_role() = 'DOCTOR'
      AND clinic_id = (SELECT clinic_id FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true)
    )
    OR (
      public.get_current_staff_role() = 'RECEPTIONIST'
      AND status <> 'COMPLETED'::appointment_status
      AND (
        (SELECT clinic_id FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true) IS NULL
        OR clinic_id = (SELECT clinic_id FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true)
      )
    )
  );

COMMIT;

