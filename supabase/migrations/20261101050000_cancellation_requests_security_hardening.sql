-- ========================================================================
-- BSCH Clinics — Migration: Cancellation Requests Security Hardening
-- Migration: 20261101050000_cancellation_requests_security_hardening.sql
-- Description:
--   1. Restricts request_cancellation_atomic execution strictly to service_role (revoking from anon/authenticated).
--   2. Prevents direct table modification on cancellation_requests (drops Staff update policy, revokes UPDATE/INSERT/DELETE).
--   3. Hardens RLS SELECT policy on cancellation_requests so receptionists without clinic_id cannot view requests and doctors cannot view them.
--   4. Unifies review_cancellation_request_atomic to route appointment status changes via update_appointment_status_atomic.
--   5. Logs approvals and rejections in public.audit_logs with caller ID, action, timestamp, appointment ID, and request ID.
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. Restrict Table Privileges & Remove Direct UPDATE on cancellation_requests
-- ------------------------------------------------------------------------

-- Revoke write permissions from normal clients
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.cancellation_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cancellation_requests TO authenticated;
GRANT ALL ON TABLE public.cancellation_requests TO service_role;

-- Drop previous staff update policy completely (ensuring status can only be modified via review_cancellation_request_atomic)
DROP POLICY IF EXISTS "Staff update cancellation_requests" ON public.cancellation_requests;

-- ------------------------------------------------------------------------
-- 2. Harden Staff Select Policy (Clinic Confinement)
-- ------------------------------------------------------------------------

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
-- 3. Hardening RPC: request_cancellation_atomic
--    Only backend server via service_role may invoke this function.
-- ------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.request_cancellation_atomic(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_cancellation_atomic(TEXT, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------
-- 4. Hardening RPC: review_cancellation_request_atomic
--    - Enforces verified staff session (ADMIN or RECEPTIONIST).
--    - Disallows DOCTORS from reviewing cancellation requests.
--    - Enforces clinic confinement on RECEPTIONIST (rejects if clinic_id IS NULL or mismatch).
--    - Invokes update_appointment_status_atomic for CANCELLED status transition.
--    - Aborts transaction on status transition failure (preventing orphan APPROVED state).
--    - Records decision in public.audit_logs.
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

