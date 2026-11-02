-- ============================================================================
-- BSCH Clinics — Production SQL Remediation Bundle 3
-- File: SUPABASE_PRODUCTION_BUNDLE_3.sql
-- Purpose:
--   1. Create cancellation_requests table with status constraints & partial unique index.
--   2. Strict table privileges: revoke all direct mutations from anon/authenticated.
--   3. Staff select policy with clinic confinement and complete doctor exclusion.
--   4. Deploy request_cancellation_atomic RPC (exclusively service_role).
--   5. Deploy review_cancellation_request_atomic RPC with:
--      - Anti-spoofing staff identity verification (auth.uid()).
--      - Exclusion of doctors and unassigned receptionists.
--      - Clinic confinement check.
--      - Atomic invocation of update_appointment_status_atomic on approval.
--      - Type-safe audit_logs insertion (UUID user_id).
--
-- Execution Context: Supabase Dashboard SQL Editor (runs as role postgres)
-- Maintenance Window / Locking:
--   Low locking impact. Completes in < 2 seconds.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table: public.cancellation_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cancellation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  reference_number TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_id UUID REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  reviewed_by_name TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Partial Unique Index: Exactly one pending request allowed per appointment
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_cancellation_request 
  ON public.cancellation_requests (appointment_id) 
  WHERE (status = 'PENDING');

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_ref ON public.cancellation_requests (reference_number);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_apt_id ON public.cancellation_requests (appointment_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON public.cancellation_requests (status, requested_at DESC);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_cancellation_requests_updated_at ON public.cancellation_requests;
CREATE TRIGGER trigger_cancellation_requests_updated_at
  BEFORE UPDATE ON public.cancellation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Privileges & RLS Policies on cancellation_requests
-- ----------------------------------------------------------------------------
ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;

-- Revoke all direct client modifications (all mutations must go through atomic RPCs)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.cancellation_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cancellation_requests TO authenticated;
GRANT ALL ON TABLE public.cancellation_requests TO service_role;

-- Drop previous policies to ensure clean state
DROP POLICY IF EXISTS "Staff update cancellation_requests" ON public.cancellation_requests;
DROP POLICY IF EXISTS "Staff select cancellation_requests" ON public.cancellation_requests;

-- Staff SELECT Policy (Doctors excluded, Receptionists confined to their clinic, Admins full)
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

-- ----------------------------------------------------------------------------
-- 3. RPC: request_cancellation_atomic (Exclusively service_role)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.request_cancellation_atomic(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.request_cancellation_atomic(UUID, TEXT, TEXT, TEXT, TEXT);

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
  v_existing_id UUID;
  v_req_id UUID;
  v_norm_phone TEXT;
BEGIN
  v_norm_phone := regexp_replace(COALESCE(p_phone_number, ''), '[^0-9]', '', 'g');

  IF p_reference_number IS NULL OR trim(p_reference_number) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الرقم المرجعي مطلوب.');
  END IF;

  -- Lock appointment row FOR UPDATE to prevent race conditions
  SELECT * INTO v_apt
  FROM public.appointments
  WHERE reference_number = trim(p_reference_number)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على موعد مطابق للرقم المرجعي المدخل.');
  END IF;

  IF regexp_replace(v_apt.phone_number, '[^0-9]', '', 'g') != v_norm_phone THEN
    RETURN jsonb_build_object('success', false, 'error', 'رقم الهاتف المدخل غير مطابق لرقم الهاتف المسجل بالموعد.');
  END IF;

  IF v_apt.status IN ('COMPLETED', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن تقديم طلب إلغاء لموعد منتهي أو ملغي بالفعل.');
  END IF;

  -- Check existing pending cancellation requests
  SELECT id INTO v_existing_id
  FROM public.cancellation_requests
  WHERE appointment_id = v_apt.id AND status = 'PENDING'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'يوجد طلب إلغاء قيد المراجعة بالفعل لهذا الموعد.',
      'request_id', v_existing_id
    );
  END IF;

  -- Insert pending cancellation request
  INSERT INTO public.cancellation_requests (
    appointment_id,
    reference_number,
    phone_number,
    reason,
    status
  ) VALUES (
    v_apt.id,
    v_apt.reference_number,
    v_apt.phone_number,
    NULLIF(trim(p_reason), ''),
    'PENDING'
  ) RETURNING id INTO v_req_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'تم استلام طلب الإلغاء بنجاح وهو قيد مراجعة موظفي الاستقبال بالمستشفى.',
    'request_id', v_req_id,
    'appointment_id', v_apt.id
  );
END;
$$;

-- Restrict execution strictly to service_role (invoked via server-side API only)
REVOKE ALL ON FUNCTION public.request_cancellation_atomic(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_cancellation_atomic(TEXT, TEXT, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. RPC: review_cancellation_request_atomic (Anti-Spoofing & Type-Safe Audit)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.review_cancellation_request_atomic(UUID, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.review_cancellation_request_atomic(UUID, TEXT, TEXT, TEXT);

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
  v_is_service_role BOOLEAN;
BEGIN
  v_is_service_role := (
    current_user = 'service_role' 
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  );

  -- 1. Validate Decision Parameter
  IF v_decision NOT IN ('APPROVE', 'APPROVED', 'REJECT', 'REJECTED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'قرار المراجعة غير صالح. يجب أن يكون APPROVED أو REJECTED.');
  END IF;

  -- Normalize decision string
  IF v_decision = 'APPROVE' THEN v_decision := 'APPROVED'; END IF;
  IF v_decision = 'REJECT' THEN v_decision := 'REJECTED'; END IF;

  -- 2. Anti-Spoofing Identity Verification
  IF auth.uid() IS NOT NULL THEN
    v_caller_id := auth.uid();
    IF p_staff_user_id IS NOT NULL AND p_staff_user_id != auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: لا يمكن انتحال هوية موظف مختلفة.');
    END IF;
  ELSIF v_is_service_role AND p_staff_user_id IS NOT NULL THEN
    v_caller_id := p_staff_user_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: يلزم توفير جلسة موظف موثقة للبت في طلبات الإلغاء.');
  END IF;

  -- 3. Verify Staff Record
  SELECT id, username, full_name, role, clinic_id, is_active
  INTO v_staff_record
  FROM public.staff_profiles
  WHERE id = v_caller_id;

  IF NOT FOUND OR v_staff_record.is_active != true THEN
    RETURN jsonb_build_object('success', false, 'error', 'حساب الموظف غير مسجل أو غير نشط.');
  END IF;

  -- Doctors are strictly blocked from reviewing cancellation requests
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
    RETURN jsonb_build_object('success', false, 'error', 'تم البت في طلب الإلغاء هذا مسبقاً ولا يمكن تعديله.');
  END IF;

  -- 5. Lock Appointment Row & Check Clinic Confinement
  SELECT * INTO v_apt
  FROM public.appointments
  WHERE id = v_req.appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الموعد المرتبط بطلب الإلغاء غير موجود.');
  END IF;

  IF v_staff_record.role = 'RECEPTIONIST' THEN
    IF v_staff_record.clinic_id IS NULL OR trim(v_staff_record.clinic_id) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: موظف الاستقبال غير معين على أي عيادة.');
    END IF;

    IF v_apt.clinic_id != v_staff_record.clinic_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لموظف الاستقبال بمراجعة طلبات إلغاء خاصة بعيادة أخرى.');
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- 6. Apply Decision
  -- --------------------------------------------------------------------------
  IF v_decision = 'APPROVED' THEN
    v_audit_note := COALESCE(NULLIF(trim(p_reason), ''), 'موافقة الاستقبال على طلب المريض رقم: ' || p_request_id::text);

    -- Transition appointment status to CANCELLED atomically
    v_status_result := public.update_appointment_status_atomic(
      p_appointment_id := v_apt.id::text,
      p_target_status := 'CANCELLED'::appointment_status,
      p_staff_user_id := v_caller_id,
      p_note := v_audit_note,
      p_caller_phone := NULL
    );

    IF NOT (v_status_result->>'success')::BOOLEAN THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'فشل في إلغاء الموعد: ' || COALESCE(v_status_result->>'error', 'خطأ غير متوقع.')
      );
    END IF;

    -- Update cancellation request status
    UPDATE public.cancellation_requests
    SET status = 'APPROVED',
        reviewed_at = v_now,
        reviewed_by_id = v_caller_id,
        reviewed_by_name = COALESCE(v_staff_record.full_name, v_staff_record.username),
        updated_at = v_now
    WHERE id = v_req.id;

    -- Type-Safe audit_logs insert (v_caller_id is UUID matching auth.users)
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
        'staff_name', COALESCE(v_staff_record.full_name, v_staff_record.username),
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
    -- REJECTED: Appointment remains active in its original status
    v_audit_note := COALESCE(NULLIF(trim(p_reason), ''), 'رفض طلب الإلغاء واستمرار الحجز كالمعتاد.');

    UPDATE public.cancellation_requests
    SET status = 'REJECTED',
        rejection_reason = v_audit_note,
        reviewed_at = v_now,
        reviewed_by_id = v_caller_id,
        reviewed_by_name = COALESCE(v_staff_record.full_name, v_staff_record.username),
        updated_at = v_now
    WHERE id = v_req.id;

    INSERT INTO public.appointment_status_history (
      appointment_id,
      status,
      note,
      updated_by,
      created_at
    ) VALUES (
      v_apt.id,
      v_apt.status,
      'تم رفض طلب الإلغاء من قبل الاستقبال: ' || v_audit_note,
      COALESCE(v_staff_record.full_name, v_staff_record.username),
      v_now
    );

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
        'rejection_reason', v_audit_note,
        'staff_name', COALESCE(v_staff_record.full_name, v_staff_record.username),
        'staff_role', v_staff_record.role,
        'reviewed_at', v_now
      ),
      v_now
    );

    RETURN jsonb_build_object(
      'success', true,
      'decision', 'REJECTED',
      'message', 'تم رفض طلب الإلغاء واستمرار الحجز بنجاح.',
      'appointment_id', v_apt.id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_cancellation_request_atomic(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_cancellation_request_atomic(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;

COMMIT;

