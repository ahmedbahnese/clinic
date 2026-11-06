-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- Migration: 20261106010000_queue_rpc_and_receipt_fields.sql
-- Purpose:
--   1. Add `fee_paid` (رسوم الكشف المدفوعة) to appointments for the
--      printable queue receipt (عرض الإيصال).
--   2. Recreate `update_appointment_status_atomic` with the extended queue
--      lifecycle state machine (SKIPPED transitions + Admin-only reopen of
--      COMPLETED visits). The existing security invariants are preserved:
--      - Terminal protection for COMPLETED/CANCELLED remains Admin-only.
--      - Receptionist cannot mark COMPLETED (medical completion is doctor/admin).
--      - Doctor clinic confinement and identity immutability remain enforced
--        by the existing trigger `check_appointment_update_permissions`.
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. Receipt field: fee_paid
-- ------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS fee_paid NUMERIC(10,2) DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_appointments_fee_paid_non_negative'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT chk_appointments_fee_paid_non_negative CHECK (fee_paid >= 0);
  END IF;
END;
$$;

-- ------------------------------------------------------------------------
-- 2. Extended queue lifecycle in update_appointment_status_atomic
--    New transitions:
--      CONFIRMED  -> SKIPPED        (skip a waiting patient)
--      CHECKED_IN -> SKIPPED        (skip a patient inside the clinic)
--      SKIPPED    -> CHECKED_IN     (إدخال الآن — re-insert into clinic)
--      SKIPPED    -> CANCELLED      (cancel a skipped reservation)
--      COMPLETED  -> CHECKED_IN     (Admin-only reopen after accidental completion)
--      COMPLETED  -> CONFIRMED      (Admin-only reopen back to waiting)
-- ------------------------------------------------------------------------

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

    -- State transition validity (extended queue lifecycle)
    IF v_apt.status = 'PENDING_REVIEW' AND p_target_status NOT IN ('CONFIRMED', 'CANCELLED') THEN
      RETURN jsonb_build_object('success', false, 'error', format('لا يمكن تحويل حالة الحجز مباشرة من "%s" إلى "%s".', v_apt.status, p_target_status));
    ELSIF v_apt.status = 'CONFIRMED' AND p_target_status NOT IN ('CHECKED_IN', 'SKIPPED', 'CANCELLED', 'PENDING_REVIEW') THEN
      RETURN jsonb_build_object('success', false, 'error', format('لا يمكن تحويل حالة الحجز مباشرة من "%s" إلى "%s".', v_apt.status, p_target_status));
    ELSIF v_apt.status = 'CHECKED_IN' AND p_target_status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED', 'CONFIRMED', 'CHECKED_IN') THEN
      RETURN jsonb_build_object('success', false, 'error', format('لا يمكن تحويل حالة الحجز مباشرة من "%s" إلى "%s".', v_apt.status, p_target_status));
    ELSIF v_apt.status = 'SKIPPED' AND p_target_status NOT IN ('CHECKED_IN', 'CANCELLED') THEN
      RETURN jsonb_build_object('success', false, 'error', format('لا يمكن تحويل حالة الحجز مباشرة من "%s" إلى "%s".', v_apt.status, p_target_status));
    ELSIF v_apt.status = 'COMPLETED' AND p_target_status NOT IN ('CHECKED_IN', 'CONFIRMED') THEN
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
      WHEN p_target_status = 'SKIPPED' THEN 'تم تخطي المريض مؤقتاً في طابور الانتظار'
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
      'fee_paid', v_apt.fee_paid,
      'updated_at', v_now
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_appointment_status_atomic(TEXT, appointment_status, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_appointment_status_atomic(TEXT, appointment_status, UUID, TEXT, TEXT) TO authenticated, service_role;
