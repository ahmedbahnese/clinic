-- BSCH Clinic: duplicate booking policy and transfer-service selection
-- A phone may have only one active appointment per clinic per day.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.appointments
    WHERE status <> 'CANCELLED'
    GROUP BY clinic_id, phone_number, appointment_date
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'لا يمكن تفعيل منع التكرار قبل معالجة الحجوزات النشطة المتكررة لنفس الهاتف والعيادة واليوم.';
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_patient_clinic_day;
DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_clinic_day;
CREATE UNIQUE INDEX idx_unique_active_apt_per_phone_clinic_day
  ON public.appointments (clinic_id, phone_number, appointment_date)
  WHERE (status <> 'CANCELLED');

-- Keep the original 4-argument RPC for compatibility and add a service-aware overload.
CREATE OR REPLACE FUNCTION public.transfer_appointment_clinic_atomic(
  p_appointment_id TEXT,
  p_target_clinic_id TEXT,
  p_target_service_id TEXT,
  p_staff_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service RECORD;
  v_has_services BOOLEAN;
  v_result JSONB;
  v_appointment_id UUID;
  v_service_name TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_services
    WHERE clinic_id = p_target_clinic_id AND is_active = true
  ) INTO v_has_services;

  IF v_has_services AND p_target_service_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يرجى اختيار خدمة مفعلة تابعة للعيادة المحول إليها.');
  END IF;

  IF p_target_service_id IS NOT NULL THEN
    SELECT id, name INTO v_service
    FROM public.clinic_services
    WHERE id = p_target_service_id
      AND clinic_id = p_target_clinic_id
      AND is_active = true;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'الخدمة المختارة غير تابعة للعيادة المحول إليها أو غير مفعلة.');
    END IF;
  END IF;

  -- Reuse the hardened authorization, schedule and capacity logic.
  v_result := public.transfer_appointment_clinic_atomic(
    p_appointment_id,
    p_target_clinic_id,
    p_staff_user_id,
    p_reason
  );
  IF COALESCE((v_result->>'success')::BOOLEAN, false) = false THEN
    RETURN v_result;
  END IF;

  v_appointment_id := NULLIF(v_result->'appointment'->>'id', '')::UUID;
  IF p_target_service_id IS NULL THEN
    v_service_name := 'كشف واستشارة طبية (تحويل عيادة)';
  ELSE
    v_service_name := v_service.name;
  END IF;
  UPDATE public.appointments
  SET service_id = p_target_service_id,
      service_name = v_service_name,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_appointment_id;

  RETURN v_result || jsonb_build_object(
    'appointment', (v_result->'appointment') || jsonb_build_object(
      'service_id', p_target_service_id,
      'service_name', v_service_name
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_appointment_clinic_atomic(TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_appointment_clinic_atomic(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;
