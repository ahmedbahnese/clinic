-- ========================================================================
-- BSCH Clinics — Migration: Cancellation Requests System
-- Migration: 20261101040000_cancellation_requests_system.sql
-- Description:
--   1. Creates public.cancellation_requests table to store patient cancellation requests.
--   2. Enforces partial unique index preventing duplicate PENDING requests per appointment.
--   3. Tightens update_appointment_status_atomic to strictly disallow phone-only direct cancellations.
--   4. Creates request_cancellation_atomic RPC for public/patient request submission.
--   5. Creates review_cancellation_request_atomic RPC for authorized staff decision (Approve/Reject).
--   6. Enforces strict RLS and privilege grants.
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. Table: public.cancellation_requests
-- ------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cancellation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  reference_number TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_id UUID REFERENCES public.staff_profiles(id),
  reviewed_by_name TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Partial Unique Index: Only ONE pending request allowed per appointment
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_cancellation_request 
  ON public.cancellation_requests (appointment_id) 
  WHERE status = 'PENDING';

-- Performance Index for reference lookup
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_ref 
  ON public.cancellation_requests (reference_number);

-- Performance Index for appointment FK
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_apt_id 
  ON public.cancellation_requests (appointment_id);

-- Performance Index for staff review queries
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status 
  ON public.cancellation_requests (status, requested_at DESC);

-- Enable RLS
ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------
-- 2. Privileges & RLS Policies on cancellation_requests
-- ------------------------------------------------------------------------

-- Revoke all table modifications from normal users
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.cancellation_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cancellation_requests TO authenticated;
GRANT ALL ON TABLE public.cancellation_requests TO service_role;

-- Drop previous staff update policy completely (preventing direct updates)
DROP POLICY IF EXISTS "Staff update cancellation_requests" ON public.cancellation_requests;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access on cancellation_requests" ON public.cancellation_requests;
CREATE POLICY "Service role full access on cancellation_requests"
  ON public.cancellation_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Staff Members Select Policy (Admin sees all, Receptionist strictly sees assigned clinic)
DROP POLICY IF EXISTS "Staff select cancellation_requests" ON public.cancellation_requests;
CREATE POLICY "Staff select cancellation_requests"
  ON public.cancellation_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      JOIN public.appointments a ON a.id = cancellation_requests.appointment_id
      WHERE sp.id = auth.uid()
        AND sp.is_active = true
        AND (
          sp.role = 'ADMIN'
          OR (
            sp.role = 'RECEPTIONIST' 
            AND sp.clinic_id IS NOT NULL 
            AND trim(sp.clinic_id) != '' 
            AND sp.clinic_id = a.clinic_id
          )
        )
    )
  );

-- ------------------------------------------------------------------------
-- 3. Atomic RPC: request_cancellation_atomic
--    Allows patients/guardians to submit a cancellation request.
--    DOES NOT modify appointment status.
-- ------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_cancellation_atomic(
  p_reference_number TEXT,
  p_phone_number TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_apt RECORD;
  v_clean_phone TEXT;
  v_clean_ref TEXT;
  v_existing RECORD;
  v_request_id UUID;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- Normalize inputs
  v_clean_ref := trim(COALESCE(p_reference_number, ''));
  v_clean_phone := regexp_replace(trim(COALESCE(p_phone_number, '')), '\s+', '', 'g');
  IF v_clean_phone ~ '^(\+20|0020)' THEN
    v_clean_phone := regexp_replace(v_clean_phone, '^(\+20|0020)', '0');
  END IF;

  IF v_clean_ref = '' OR v_clean_phone = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الرقم المرجعي ورقم الهاتف كلاهما مطلوب لتقديم طلب الإلغاء.');
  END IF;

  -- 1. Find appointment (lock row FOR SHARE to inspect current status)
  SELECT id, reference_number, phone_number, clinic_id, clinic_name, patient_name, appointment_date, status
  INTO v_apt
  FROM public.appointments
  WHERE reference_number = v_clean_ref
  FOR SHARE;

  IF NOT FOUND THEN
    -- Generic message for data minimization
    RETURN jsonb_build_object('success', false, 'error', 'بيانات الحجز غير صحيحة أو غير متطابقة.');
  END IF;

  -- 2. Verify phone number strictly matches
  IF v_apt.phone_number != v_clean_phone THEN
    RETURN jsonb_build_object('success', false, 'error', 'بيانات الحجز غير صحيحة أو غير متطابقة.');
  END IF;

  -- 3. Business rule: Cannot request cancellation for terminal states
  IF v_apt.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن تقديم طلب إلغاء لحجز تم الكشف عليه واكتماله مسبقاً.');
  END IF;

  IF v_apt.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا الحجز ملغي مسبقاً بالفعل.');
  END IF;

  -- 4. Check if pending request already exists for this appointment
  SELECT id INTO v_existing
  FROM public.cancellation_requests
  WHERE appointment_id = v_apt.id AND status = 'PENDING';

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'يوجد طلب إلغاء قيد المراجعة بالفعل لهذا الحجز لدى موظفي الاستقبال.');
  END IF;

  -- 5. Insert new cancellation request (APPOINTMENT STATUS REMAINS UNCHANGED)
  INSERT INTO public.cancellation_requests (
    appointment_id,
    reference_number,
    phone_number,
    reason,
    status,
    requested_at,
    created_at,
    updated_at
  ) VALUES (
    v_apt.id,
    v_apt.reference_number,
    v_clean_phone,
    COALESCE(NULLIF(trim(p_reason), ''), 'طلب إلغاء من ولي الأمر عبر بوابة المتابعة'),
    'PENDING',
    v_now,
    v_now,
    v_now
  ) RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'message', 'تم استلام طلب الإلغاء بنجاح، وسيتم مراجعته بواسطة موظف الاستقبال بالمستشفى. يظل الحجز فعالاً حتى اعتماد الطلب.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_cancellation_atomic(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_cancellation_atomic(TEXT, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------
-- 4. Atomic RPC: review_cancellation_request_atomic
--    Allows authorized staff to Approve or Reject a cancellation request.
--    Approving changes appointment status to CANCELLED atomically via update_appointment_status_atomic.
--    Rejecting keeps appointment status intact.
-- ------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.review_cancellation_request_atomic(
  p_request_id UUID,
  p_decision TEXT,
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
  v_req RECORD;
  v_apt RECORD;
  v_decision TEXT := upper(trim(COALESCE(p_decision, '')));
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_audit_note TEXT;
  v_status_result JSONB;
BEGIN
  -- 1. Validate decision value
  IF v_decision NOT IN ('APPROVED', 'REJECTED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'قرار المراجعة غير صالح. يجب أن يكون APPROVED أو REJECTED.');
  END IF;

  -- 2. Determine & Authenticate Caller Identity
  IF auth.uid() IS NOT NULL THEN
    v_caller_id := auth.uid();
    IF p_staff_user_id IS NOT NULL AND p_staff_user_id != auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: لا يمكن انتحال هوية موظف مختلفة.');
    END IF;
  ELSIF p_staff_user_id IS NOT NULL THEN
    v_caller_id := p_staff_user_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: يلزم توفير جلسة موظف موثقة للبت في طلبات الإلغاء.');
  END IF;

  -- 3. Verify Staff Record in staff_profiles
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

  -- Requirement 2: ADMIN or RECEPTIONIST only (DOCTORS ARE STRICTLY FORBIDDEN)
  IF v_staff_record.role NOT IN ('ADMIN', 'RECEPTIONIST') THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: مراجعة طلبات الإلغاء مقتصرة على موظفي الاستقبال وإدارة النظام فقط.');
  END IF;

  -- 4. Lock Cancellation Request Row FOR UPDATE
  SELECT * INTO v_req
  FROM public.cancellation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'طلب الإلغاء غير موجود.');
  END IF;

  IF v_req.status != 'PENDING' THEN
    RETURN jsonb_build_object('success', false, 'error', format('تمت مراجعة هذا الطلب مسبقاً بحالة "%s".', v_req.status));
  END IF;

  -- 5. Lock Appointment Row FOR UPDATE
  SELECT * INTO v_apt
  FROM public.appointments
  WHERE id = v_req.appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الحجز المرتبط بهذا الطلب غير موجود.');
  END IF;

  -- 6. Verify Clinic Confinement
  -- Requirement 2: Receptionist must have clinic_id and match appointment's clinic_id
  IF v_staff_record.role = 'RECEPTIONIST' THEN
    IF v_staff_record.clinic_id IS NULL OR trim(v_staff_record.clinic_id) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: موظف الاستقبال غير معين على عيادة محددة ولا يمكنه مراجعة طلبات الإلغاء.');
    END IF;
    IF v_apt.clinic_id != v_staff_record.clinic_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: لا يمكن لموظف الاستقبال مراجعة طلبات إلغاء خاصة بعيادة أخرى.');
    END IF;
  END IF;

  -- 7. Execute Decision Atomically
  IF v_decision = 'APPROVED' THEN
    v_audit_note := COALESCE(NULLIF(trim(p_reason), ''), 'موافقة على طلب الإلغاء المقدم من ولي الأمر: ' || COALESCE(v_req.reason, 'بدون سبب مذكور'));

    -- Requirement 4: Call update_appointment_status_atomic internally within the same transaction
    v_status_result := public.update_appointment_status_atomic(
      p_appointment_id := v_apt.id::text,
      p_target_status := 'CANCELLED'::appointment_status,
      p_staff_user_id := v_caller_id,
      p_note := v_audit_note,
      p_caller_phone := NULL
    );

    IF NOT (v_status_result->>'success')::boolean THEN
      -- Transaction rollback ensures cancellation request status is NEVER set to APPROVED
      RAISE EXCEPTION 'فشل تحديث حالة الحجز إلى ملغي: %', COALESCE(v_status_result->>'error', 'خطأ غير محدد');
    END IF;

    -- Update cancellation request status
    UPDATE public.cancellation_requests
    SET status = 'APPROVED',
        reviewed_at = v_now,
        reviewed_by_id = v_caller_id,
        reviewed_by_name = v_staff_record.full_name,
        updated_at = v_now
    WHERE id = v_req.id;

    -- Requirement 5: Log approval in public.audit_logs
    INSERT INTO public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      details,
      created_at
    ) VALUES (
      v_caller_id,
      'APPROVE_CANCELLATION_REQUEST',
      'cancellation_request',
      v_req.id::text,
      jsonb_build_object(
        'request_id', v_req.id,
        'appointment_id', v_apt.id,
        'reference_number', v_apt.reference_number,
        'decision', 'APPROVED',
        'reason', v_audit_note,
        'staff_name', v_staff_record.full_name,
        'staff_role', v_staff_record.role,
        'reviewed_at', v_now
      ),
      v_now
    );

    RETURN jsonb_build_object(
      'success', true,
      'decision', 'APPROVED',
      'message', 'تمت الموافقة على طلب الإلغاء وإلغاء الحجز بنجاح.',
      'appointment_id', v_apt.id
    );

  ELSE
    -- REJECTED decision: APPOINTMENT STATUS IS NOT CHANGED
    v_audit_note := COALESCE(NULLIF(trim(p_reason), ''), 'رفض طلب الإلغاء واستمرار الحجز');

    -- Record in appointment history that cancellation request was rejected
    INSERT INTO public.appointment_status_history (
      appointment_id,
      status,
      note,
      updated_by
    ) VALUES (
      v_apt.id,
      v_apt.status, -- remains current status
      'تم رفض طلب الإلغاء المقدم من ولي الأمر. السبب: ' || v_audit_note,
      v_staff_record.full_name
    );

    -- Update cancellation request status
    UPDATE public.cancellation_requests
    SET status = 'REJECTED',
        reviewed_at = v_now,
        reviewed_by_id = v_caller_id,
        reviewed_by_name = v_staff_record.full_name,
        rejection_reason = v_audit_note,
        updated_at = v_now
    WHERE id = v_req.id;

    -- Requirement 5: Log rejection in public.audit_logs
    INSERT INTO public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      details,
      created_at
    ) VALUES (
      v_caller_id,
      'REJECT_CANCELLATION_REQUEST',
      'cancellation_request',
      v_req.id::text,
      jsonb_build_object(
        'request_id', v_req.id,
        'appointment_id', v_apt.id,
        'reference_number', v_apt.reference_number,
        'decision', 'REJECTED',
        'reason', v_audit_note,
        'staff_name', v_staff_record.full_name,
        'staff_role', v_staff_record.role,
        'reviewed_at', v_now
      ),
      v_now
    );

    RETURN jsonb_build_object(
      'success', true,
      'decision', 'REJECTED',
      'message', 'تم رفض طلب الإلغاء واحتفاظ الحجز بحالته النشطة.',
      'appointment_id', v_apt.id,
      'current_status', v_apt.status
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_cancellation_request_atomic(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_cancellation_request_atomic(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------
-- 5. Hardening update_appointment_status_atomic:
--    Disallow direct patient phone cancellation completely.
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
  ELSE
    -- Rejection of any unauthenticated or phone-only direct cancellation
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: تم إلغاء مسار الإلغاء المباشر برقم الهاتف لأسباب أمنية. يلزم تقديم طلب إلغاء للمراجعة أو تسجيل دخول موظف مختص.');
  END IF;

  -- 2. Load and verify staff credentials
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

  -- 3. Lock appointment row FOR UPDATE to serialize concurrent status modifications
  SELECT * INTO v_apt
  FROM public.appointments
  WHERE (id = p_appointment_id OR reference_number = p_appointment_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الموعد المطلوب غير موجود.');
  END IF;

  -- 4. Authorization & Business Rule Checks
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

