-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- Migration: 20261101030000_atomic_status_update_and_privilege_hardening.sql
-- Purpose:
--   1. Harden Trigger `check_appointment_update_permissions`:
--      - Eliminate unsafe `auth.uid() IS NULL` automatic admin bypass.
--      - Require explicit verified session or authenticated role.
--      - Enforce strict immutability of `reference_number` under all circumstances.
--      - Enforce terminal state protection (`COMPLETED`, `CANCELLED`) for non-admins.
--      - Strictly block Receptionists from modifying core patient data or marking COMPLETED.
--      - Strictly isolate Doctors to their active assigned clinic with zero tampering on patient data.
--   2. Atomic Status Update RPC: `update_appointment_status_atomic`:
--      - Executes status update and status history insertion atomically in one transaction.
--      - Row locking (`FOR UPDATE`) eliminates race conditions on `called_count` and state transitions.
--      - Enforces staff verification directly against `public.staff_profiles` (never trusts client roles).
--      - Supports authorized patient self-cancellation strictly via matching verified phone number.
--   3. Atomic Clinic Transfer RPC: `transfer_appointment_clinic_atomic`:
--      - Transactional advisory locking on target clinic and date.
--      - Atomic validation of schedule, active status, capacity, and monotonic queue numbering.
--   4. Hardened RLS Policies on `public.appointments`:
--      - Strictly deny unassigned doctors (`clinic_id IS NULL`) from seeing any appointments.
--      - Confine doctors exclusively to their assigned clinic.
--      - Protect completed appointments from receptionist modification.
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. Hardened Trigger: check_appointment_update_permissions
-- ------------------------------------------------------------------------

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

  -- 2. If caller is not service_role, enforce strict session & role verification
  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'غير مصرح: لا يمكن تعديل الحجوزات دون جلسة موثقة.';
    END IF;

    v_role := public.get_current_staff_role();
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'غير مصرح: حساب المستخدم غير نشط أو غير مسجل في طاقم العمل.';
    END IF;

    -- If Admin, allow update (immutability of reference_number was already checked above)
    IF v_role = 'ADMIN' THEN
      RETURN NEW;
    END IF;

    -- Terminal state protection for non-admin callers
    IF OLD.status = 'COMPLETED' AND NEW.status != 'COMPLETED' THEN
      RAISE EXCEPTION 'لا يمكن تعديل أو إعادة فتح حجز مكتمل تم الكشف عليه مسبقاً إلا بواسطة مدير النظام.';
    END IF;

    IF OLD.status = 'CANCELLED' AND NEW.status != 'CANCELLED' THEN
      RAISE EXCEPTION 'لا يمكن تعديل أو إعادة فتح حجز ملغي مسبقاً.';
    END IF;

    -- Receptionist role restrictions
    IF v_role = 'RECEPTIONIST' THEN
      -- Receptionist cannot change core identity or appointment slot directly
      IF OLD.patient_name != NEW.patient_name
         OR OLD.phone_number != NEW.phone_number
         OR OLD.clinic_id != NEW.clinic_id
         OR OLD.appointment_date != NEW.appointment_date THEN
        RAISE EXCEPTION 'غير مصرح لموظف الاستقبال بتعديل بيانات المريض أو العيادة أو تاريخ الموعد مباشرة. يلزم إجراء تحويل رسمي أو مراجعة مدير النظام.';
      END IF;

      -- Receptionist cannot complete appointments (medical examination is doctor only)
      IF NEW.status = 'COMPLETED' THEN
        RAISE EXCEPTION 'إتمام الكشف الطبي وصرف التذكرة صلاحية طبية مخصصة للأطباء فقط.';
      END IF;
    END IF;

    -- Doctor role restrictions
    IF v_role = 'DOCTOR' THEN
      v_doc_clinic := public.get_doctor_clinic_id();
      IF v_doc_clinic IS NULL OR OLD.clinic_id != v_doc_clinic THEN
        RAISE EXCEPTION 'غير مصرح للطبيب بتعديل مواعيد خاصة بعيادة أخرى أو بدون تعيين عيادة معتمدة.';
      END IF;

      -- Doctor cannot tamper with patient identity or appointment date
      IF OLD.patient_name != NEW.patient_name
         OR OLD.phone_number != NEW.phone_number
         OR OLD.appointment_date != NEW.appointment_date THEN
        RAISE EXCEPTION 'غير مصرح للطبيب بتعديل البيانات الشخصية أو تاريخ الحجز.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_appointment_update_permissions ON public.appointments;
CREATE TRIGGER trigger_check_appointment_update_permissions
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.check_appointment_update_permissions();

-- ------------------------------------------------------------------------
-- 2. Atomic Status Update RPC: update_appointment_status_atomic
-- ------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_appointment_status_atomic(TEXT, appointment_status, UUID, TEXT);
DROP FUNCTION IF EXISTS public.update_appointment_status_atomic(TEXT, appointment_status, UUID, TEXT, TEXT);

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
  v_clean_phone TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_is_recall BOOLEAN := false;
  v_new_called_count INTEGER;
  v_last_called TIMESTAMPTZ;
  v_rows_updated INTEGER;
  v_history_note TEXT;
BEGIN
  -- 1. Determine & Authenticate Caller Identity
  IF auth.uid() IS NOT NULL THEN
    -- Direct Supabase authenticated JWT session
    v_caller_id := auth.uid();
    IF p_staff_user_id IS NOT NULL AND p_staff_user_id != auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: لا يمكن انتحال هوية موظف مختلفة عن الجلسة الموثقة.');
    END IF;
  ELSIF p_staff_user_id IS NOT NULL THEN
    -- Server-mediated service_role call with explicit staff identity
    v_caller_id := p_staff_user_id;
  ELSIF p_target_status = 'CANCELLED' AND p_caller_phone IS NOT NULL THEN
    -- Patient self-cancellation flow
    v_caller_id := NULL;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: يلزم توفير جلسة موظف موثقة أو مطابقة رقم الهاتف للإلغاء.');
  END IF;

  -- 2. Load and verify staff credentials if caller is staff
  IF v_caller_id IS NOT NULL THEN
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
    v_staff_name := v_staff_record.full_name;
  END IF;

  -- 3. Lock appointment row FOR UPDATE to serialize concurrent status modifications
  SELECT * INTO v_apt
  FROM public.appointments
  WHERE (id = p_appointment_id OR reference_number = p_appointment_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الموعد المطلوب غير موجود.');
  END IF;

  -- 4. Authorization & Business Rule Checks
  IF v_caller_id IS NULL THEN
    -- Patient self-cancellation verification
    v_clean_phone := regexp_replace(trim(COALESCE(p_caller_phone, '')), '\s+', '', 'g');
    IF v_clean_phone != v_apt.phone_number THEN
      RETURN jsonb_build_object('success', false, 'error', 'رقم الهاتف غير مطابق لبيانات الحجز.');
    END IF;

    IF v_apt.status = 'COMPLETED' THEN
      RETURN jsonb_build_object('success', false, 'error', 'لا يمكن إلغاء موعد تم الكشف عليه واكتماله مسبقاً.');
    END IF;

    IF v_apt.status = 'CANCELLED' THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الحجز ملغي مسبقاً بالفعل.');
    END IF;

    v_staff_name := 'ولي الأمر';
    v_history_note := COALESCE(p_note, 'طلب إلغاء من ولي الأمر عبر بوابة المتابعة');
  ELSE
    -- Staff authorization checks
    -- Terminal state protection
    IF v_apt.status = 'COMPLETED' AND p_target_status != 'COMPLETED' AND v_role != 'ADMIN' THEN
      RETURN jsonb_build_object('success', false, 'error', 'لا يمكن تعديل أو إعادة فتح حجز مكتمل تم الكشف عليه مسبقاً إلا بواسطة مدير النظام.');
    END IF;

    IF v_apt.status = 'CANCELLED' AND p_target_status != 'CANCELLED' AND v_role != 'ADMIN' THEN
      RETURN jsonb_build_object('success', false, 'error', 'لا يمكن إعادة فتح حجز ملغي مسبقاً.');
    END IF;

    -- Receptionist constraints
    IF v_role = 'RECEPTIONIST' THEN
      IF p_target_status = 'COMPLETED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'إتمام الكشف الطبي وصرف التذكرة صلاحية طبية مخصصة للأطباء فقط.');
      END IF;

      IF v_staff_clinic_id IS NOT NULL AND v_apt.clinic_id != v_staff_clinic_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لموظف الاستقبال بتعديل مواعيد خاصة بعيادة أخرى.');
      END IF;
    END IF;

    -- Doctor constraints
    IF v_role = 'DOCTOR' THEN
      IF v_staff_clinic_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح للطبيب غير المعين على عيادة بتعديل المواعيد.');
      END IF;

      IF v_apt.clinic_id != v_staff_clinic_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح للطبيب بتعديل مواعيد خاصة بعيادة أخرى غير العيادة المخصصة له.');
      END IF;
    END IF;

    -- State transition validity
    IF v_apt.status = 'PENDING_REVIEW' AND p_target_status NOT IN ('CONFIRMED', 'CANCELLED') THEN
      RETURN jsonb_build_object('success', false, 'error', format('لا يمكن تحويل حالة الحجز مباشرة من "%s" إلى "%s".', v_apt.status, p_target_status));
    ELSIF v_apt.status = 'CONFIRMED' AND p_target_status NOT IN ('CHECKED_IN', 'CANCELLED', 'PENDING_REVIEW') THEN
      RETURN jsonb_build_object('success', false, 'error', format('لا يمكن تحويل حالة الحجز مباشرة من "%s" إلى "%s".', v_apt.status, p_target_status));
    ELSIF v_apt.status = 'CHECKED_IN' AND p_target_status NOT IN ('COMPLETED', 'CANCELLED', 'CONFIRMED', 'CHECKED_IN') THEN
      RETURN jsonb_build_object('success', false, 'error', format('لا يمكن تحويل حالة الحجز مباشرة من "%s" إلى "%s".', v_apt.status, p_target_status));
    END IF;

    -- Check if this is a patient recall (calling patient again into CHECKED_IN)
    v_is_recall := (v_apt.status = 'CHECKED_IN' AND p_target_status = 'CHECKED_IN');
    v_history_note := p_note;
  END IF;

  -- 5. Calculate atomic metrics
  v_new_called_count := CASE 
    WHEN p_target_status = 'CHECKED_IN' THEN COALESCE(v_apt.called_count, 0) + 1 
    ELSE COALESCE(v_apt.called_count, 0) 
  END;

  v_last_called := CASE 
    WHEN p_target_status = 'CHECKED_IN' THEN v_now 
    ELSE v_apt.last_called_at 
  END;

  IF v_is_recall AND (v_history_note IS NULL OR v_history_note = '') THEN
    v_history_note := format('إعادة نداء المريض للمرة #%s', v_new_called_count);
  ELSIF v_history_note IS NULL OR v_history_note = '' THEN
    v_history_note := CASE 
      WHEN p_target_status = 'CONFIRMED' THEN 'تأكيد الحجز ومطابقة الموعد'
      WHEN p_target_status = 'CHECKED_IN' THEN 'تسجيل حضور المريض بالعيادة والنداء'
      WHEN p_target_status = 'COMPLETED' THEN 'إتمام الكشف الطبي وتوقيع التذكرة'
      WHEN p_target_status = 'CANCELLED' THEN 'إلغاء الحجز'
      ELSE 'تحديث حالة الحجز'
    END;
  END IF;

  -- 6. Atomically update appointments table
  UPDATE public.appointments
  SET status = p_target_status,
      last_called_at = v_last_called,
      called_count = v_new_called_count,
      updated_at = v_now
  WHERE id = v_apt.id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated != 1 THEN
    RAISE EXCEPTION 'فشل تحديث الحجز في قاعدة البيانات: لم يتأثر أي سجل.';
  END IF;

  -- 7. Atomically record status history in the same transaction
  INSERT INTO public.appointment_status_history (
    appointment_id,
    status,
    note,
    updated_by
  ) VALUES (
    v_apt.id,
    p_target_status,
    v_history_note,
    v_staff_name
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment', jsonb_build_object(
      'id', v_apt.id,
      'reference_number', v_apt.reference_number,
      'clinic_id', v_apt.clinic_id,
      'clinic_name', v_apt.clinic_name,
      'service_id', v_apt.service_id,
      'service_name', v_apt.service_name,
      'patient_name', v_apt.patient_name,
      'phone_number', v_apt.phone_number,
      'appointment_date', v_apt.appointment_date,
      'appointment_time', v_apt.appointment_time,
      'status', p_target_status,
      'queue_number', v_apt.queue_number,
      'last_called_at', v_last_called,
      'called_count', v_new_called_count,
      'updated_at', v_now
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_appointment_status_atomic(TEXT, appointment_status, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_appointment_status_atomic(TEXT, appointment_status, UUID, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------
-- 3. Atomic Clinic Transfer RPC: transfer_appointment_clinic_atomic
-- ------------------------------------------------------------------------

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
  v_apt RECORD;
  v_target_clinic RECORD;
  v_target_schedule RECORD;
  v_effective_capacity INTEGER;
  v_current_target_booked INTEGER;
  v_new_queue_number INTEGER;
  v_dow INTEGER;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_transfer_note TEXT;
  v_rows_updated INTEGER;
BEGIN
  -- 1. Determine Caller Identity
  IF auth.uid() IS NOT NULL THEN
    v_caller_id := auth.uid();
    IF p_staff_user_id IS NOT NULL AND p_staff_user_id != auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: لا يمكن انتحال هوية موظف مختلفة.');
    END IF;
  ELSIF p_staff_user_id IS NOT NULL THEN
    v_caller_id := p_staff_user_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: يلزم توفير جلسة موظف موثقة للتحويل.');
  END IF;

  SELECT id, full_name, role, clinic_id, is_active
  INTO v_staff_record
  FROM public.staff_profiles
  WHERE id = v_caller_id;

  IF NOT FOUND OR v_staff_record.is_active != true THEN
    RETURN jsonb_build_object('success', false, 'error', 'حساب الموظف غير صالح أو غير نشط.');
  END IF;

  -- 2. Lock appointment row FOR UPDATE
  SELECT * INTO v_apt
  FROM public.appointments
  WHERE (id = p_appointment_id OR reference_number = p_appointment_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الموعد المطلوب تحويله غير موجود.');
  END IF;

  IF v_apt.status IN ('COMPLETED', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن تحويل حجز مكتمل أو ملغي مسبقاً.');
  END IF;

  -- Doctor and Receptionist clinic boundary checks
  IF v_staff_record.role = 'DOCTOR' AND v_staff_record.clinic_id IS NOT NULL AND v_staff_record.clinic_id != v_apt.clinic_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح للطبيب بتحويل مريض مسجل في عيادة أخرى.');
  END IF;

  IF v_staff_record.role = 'RECEPTIONIST' AND v_staff_record.clinic_id IS NOT NULL AND v_staff_record.clinic_id != v_apt.clinic_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لموظف الاستقبال بتحويل مريض مسجل في عيادة أخرى.');
  END IF;

  IF v_apt.clinic_id = p_target_clinic_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'الحجز مسجل بالفعل في نفس العيادة المختارة.');
  END IF;

  -- 3. Lock target clinic and appointment date with transactional advisory lock
  PERFORM pg_advisory_xact_lock(hashtext('booking_' || p_target_clinic_id || '_' || v_apt.appointment_date::text));

  -- 4. Validate Target Clinic
  SELECT * INTO v_target_clinic
  FROM public.clinics
  WHERE id = p_target_clinic_id;

  IF NOT FOUND OR NOT v_target_clinic.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'العيادة المحول إليها غير موجودة أو غير مفعلة.');
  END IF;

  -- Check Target Clinic Operating Schedule & Precedence
  SELECT * INTO v_target_schedule
  FROM public.clinic_schedules
  WHERE clinic_id = p_target_clinic_id AND schedule_date = v_apt.appointment_date;

  IF FOUND THEN
    IF v_target_schedule.is_closed THEN
      RETURN jsonb_build_object('success', false, 'error', 'العيادة المحول إليها مغلقة في هذا اليوم نظراً لظرف طارئ أو عطلة رسمية.');
    END IF;
    v_effective_capacity := COALESCE(v_target_schedule.max_capacity, v_target_clinic.max_daily_slots);
  ELSE
    v_dow := EXTRACT(DOW FROM v_apt.appointment_date)::INTEGER;
    IF NOT (v_dow = ANY(v_target_clinic.days_of_week)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'العيادة المحول إليها لا تعمل في هذا اليوم (عطلة أسبوعية).');
    END IF;
    v_effective_capacity := v_target_clinic.max_daily_slots;
  END IF;

  -- Check Target Clinic Capacity
  SELECT COUNT(*) INTO v_current_target_booked
  FROM public.appointments
  WHERE clinic_id = p_target_clinic_id
    AND appointment_date = v_apt.appointment_date
    AND status != 'CANCELLED';

  IF v_current_target_booked >= v_effective_capacity THEN
    RETURN jsonb_build_object('success', false, 'error', format('سعة العيادة المحول إليها مكتملة في هذا اليوم (%s مريض).', v_effective_capacity));
  END IF;

  -- Compute Monotonic Queue Number for Target Clinic
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO v_new_queue_number
  FROM public.appointments
  WHERE clinic_id = p_target_clinic_id
    AND appointment_date = v_apt.appointment_date;

  v_transfer_note := format('تم التحويل من عيادة [%s] إلى عيادة [%s] برقم دور جديد (#%s). السبب: %s',
    v_apt.clinic_name, v_target_clinic.name, v_new_queue_number, COALESCE(p_reason, 'تحويل طبي داخلي'));

  -- 5. Atomically update appointments table
  UPDATE public.appointments
  SET clinic_id = v_target_clinic.id,
      clinic_name = v_target_clinic.name,
      service_id = NULL,
      service_name = 'كشف واستشارة طبية (تحويل عيادة)',
      queue_number = v_new_queue_number,
      status = 'CONFIRMED',
      updated_at = v_now
  WHERE id = v_apt.id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated != 1 THEN
    RAISE EXCEPTION 'فشل تحويل الحجز في قاعدة البيانات.';
  END IF;

  -- 6. Atomically record status history
  INSERT INTO public.appointment_status_history (
    appointment_id,
    status,
    note,
    updated_by
  ) VALUES (
    v_apt.id,
    'CONFIRMED',
    v_transfer_note,
    v_staff_record.full_name
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment', jsonb_build_object(
      'id', v_apt.id,
      'reference_number', v_apt.reference_number,
      'clinic_id', v_target_clinic.id,
      'clinic_name', v_target_clinic.name,
      'patient_name', v_apt.patient_name,
      'phone_number', v_apt.phone_number,
      'appointment_date', v_apt.appointment_date,
      'status', 'CONFIRMED',
      'queue_number', v_new_queue_number,
      'updated_at', v_now
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_appointment_clinic_atomic(TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_appointment_clinic_atomic(TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------
-- 4. Hardened Row Level Security (RLS) Policies on Appointments
-- ------------------------------------------------------------------------

REVOKE ALL ON public.appointments FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;

-- Staff SELECT Policy:
-- - Admin & Receptionist can view appointments
-- - Doctor can ONLY view appointments for their active assigned clinic (NEVER when clinic_id is null)
DROP POLICY IF EXISTS "Staff can view appointments" ON public.appointments;
CREATE POLICY "Staff can view appointments"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff() AND (
      public.get_current_staff_role() IN ('ADMIN', 'RECEPTIONIST')
      OR (
        public.get_current_staff_role() = 'DOCTOR'
        AND public.get_doctor_clinic_id() IS NOT NULL
        AND clinic_id = public.get_doctor_clinic_id()
      )
    )
  );

-- Staff UPDATE Policy:
-- - Admin can update any appointment
-- - Doctor can ONLY update their assigned clinic's appointments
-- - Receptionist can update appointments except those marked COMPLETED
DROP POLICY IF EXISTS "Staff can update appointments" ON public.appointments;
CREATE POLICY "Staff can update appointments"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (
    public.is_active_staff() AND (
      public.get_current_staff_role() = 'ADMIN'
      OR (
        public.get_current_staff_role() = 'DOCTOR'
        AND public.get_doctor_clinic_id() IS NOT NULL
        AND clinic_id = public.get_doctor_clinic_id()
      )
      OR (
        public.get_current_staff_role() = 'RECEPTIONIST'
        AND status != 'COMPLETED'
        AND (
          SELECT clinic_id FROM public.staff_profiles WHERE id = auth.uid()
        ) IS NULL
        OR clinic_id = (
          SELECT clinic_id FROM public.staff_profiles WHERE id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    public.is_active_staff() AND (
      public.get_current_staff_role() = 'ADMIN'
      OR (
        public.get_current_staff_role() = 'DOCTOR'
        AND public.get_doctor_clinic_id() IS NOT NULL
        AND clinic_id = public.get_doctor_clinic_id()
      )
      OR (
        public.get_current_staff_role() = 'RECEPTIONIST'
        AND status != 'COMPLETED'
        AND (
          SELECT clinic_id FROM public.staff_profiles WHERE id = auth.uid()
        ) IS NULL
        OR clinic_id = (
          SELECT clinic_id FROM public.staff_profiles WHERE id = auth.uid()
        )
      )
    )
  );

