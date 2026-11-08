-- ============================================================================
-- BSCH Clinics — Production SQL Remediation Bundle 1
-- File: SUPABASE_PRODUCTION_BUNDLE_1.sql
-- Purpose:
--   1. Create reference number sequence (seq_appointment_reference_number).
--   2. Create clinic_services table with per-service daily capacity.
--   3. Extend appointments and clinics tables safely with required columns.
--   4. Safely replace sibling-blocking index with patient-discriminating index.
--   5. Create persistent rate_limit_counters table and hardened RPC.
--   6. Deploy enhanced atomic booking RPC book_appointment_atomic.
--   7. Deploy data-minimized phone tracking RPC track_appointments_by_phone.
--
-- Execution Context: Supabase Dashboard SQL Editor (runs as role postgres)
-- Maintenance Window / Locking:
--   Low locking impact. Creates new index first before dropping old index.
--   Tables are currently empty, so execution completes in < 2 seconds.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Prerequisites: Extensions & Sequences
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SEQUENCE IF NOT EXISTS public.seq_appointment_reference_number START WITH 1001;
GRANT USAGE, SELECT ON SEQUENCE public.seq_appointment_reference_number TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Clinic Services Table (خدمات العيادات الخارجية التخصصية)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_services (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 15,
  required_documents TEXT[] NOT NULL DEFAULT '{"أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي"}',
  instructions TEXT NOT NULL DEFAULT 'الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى.',
  max_daily_capacity INTEGER NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_service_max_daily_capacity CHECK (max_daily_capacity IS NULL OR max_daily_capacity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_clinic_services_clinic_id ON public.clinic_services(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_services_active ON public.clinic_services(is_active);

-- Updated_at trigger on clinic_services
DROP TRIGGER IF EXISTS trigger_clinic_services_updated_at ON public.clinic_services;
CREATE TRIGGER trigger_clinic_services_updated_at
  BEFORE UPDATE ON public.clinic_services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies on clinic_services
ALTER TABLE public.clinic_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active clinic services" ON public.clinic_services;
CREATE POLICY "Public can view active clinic services"
  ON public.clinic_services FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins have full access to clinic services" ON public.clinic_services;
CREATE POLICY "Admins have full access to clinic services"
  ON public.clinic_services FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

GRANT SELECT ON TABLE public.clinic_services TO anon, authenticated;
GRANT ALL ON TABLE public.clinic_services TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Extend Existing Clinics & Appointments Tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS required_documents TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_id TEXT REFERENCES public.clinic_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_name TEXT,
  ADD COLUMN IF NOT EXISTS guardian_national_id TEXT,
  ADD COLUMN IF NOT EXISTS attendance_guidance TEXT;

CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON public.appointments(service_id);

-- Update check constraint on reference_number to support extended sequence numbers
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS chk_reference_number;

ALTER TABLE public.appointments
  ADD CONSTRAINT chk_reference_number 
  CHECK (reference_number ~ '^BSCH-[0-9]{4,10}$');

-- ----------------------------------------------------------------------------
-- 4. Safe Replacement of Sibling-Blocking Unique Index
-- ----------------------------------------------------------------------------
-- Step 4.1: Create normalized composite index (Phone + Normalized Patient Name + Clinic + Date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_apt_per_phone_patient_clinic_day
  ON public.appointments (clinic_id, phone_number, lower(trim(patient_name)), appointment_date)
  WHERE (status <> 'CANCELLED'::appointment_status);

-- Step 4.2: Verify new index is valid before safely dropping the old index
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'idx_unique_active_apt_per_phone_patient_clinic_day'
      AND i.indisvalid = true
  ) THEN
    DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_clinic_day;
    RAISE NOTICE 'SUCCESS: Verified new sibling-friendly index and dropped old blocking index.';
  ELSE
    RAISE EXCEPTION 'CRITICAL: idx_unique_active_apt_per_phone_patient_clinic_day is invalid or missing. Aborting transaction.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Rate Limiting Table & Hardened RPC
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_reset_at ON public.rate_limit_counters(reset_at);
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_counters TO service_role;

-- Rate limit cleanup helper
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.rate_limit_counters
  WHERE reset_at < clock_timestamp() - INTERVAL '1 hour';
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limits() TO service_role;

-- Persistent rate limit check RPC (Fail-closed, wall-clock reset, exclusively service_role)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_reset_at TIMESTAMPTZ;
  v_current_count INTEGER;
  v_retry_after INTEGER;
BEGIN
  -- Strict validation of input parameters
  IF p_key IS NULL OR trim(p_key) = '' OR p_max_requests <= 0 OR p_window_seconds <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', 60, 'error', 'Invalid rate limit parameters');
  END IF;

  -- Opportunistic cleanup roughly 1% of calls
  IF random() < 0.01 THEN
    PERFORM public.cleanup_expired_rate_limits();
  END IF;

  -- Upsert counter with wall-clock window management
  INSERT INTO public.rate_limit_counters (key, count, reset_at)
  VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::INTERVAL)
  ON CONFLICT (key) DO UPDATE
  SET 
    count = CASE 
      WHEN public.rate_limit_counters.reset_at <= v_now THEN 1 
      ELSE public.rate_limit_counters.count + 1 
    END,
    reset_at = CASE 
      WHEN public.rate_limit_counters.reset_at <= v_now THEN v_now + (p_window_seconds || ' seconds')::INTERVAL 
      ELSE public.rate_limit_counters.reset_at 
    END
  RETURNING count, reset_at INTO v_current_count, v_reset_at;

  IF v_current_count > p_max_requests THEN
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset_at - v_now)))::INTEGER);
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', v_retry_after,
      'remaining', 0,
      'reset_at', v_reset_at
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'retry_after_seconds', 0,
    'remaining', p_max_requests - v_current_count,
    'reset_at', v_reset_at
  );
END;
$$;

-- Protect RPC from unauthorized direct caller invocation
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- ----------------------------------------------------------------------------
-- 6. Atomic Booking RPC (Concurrency Lock, Capacity Check & Sibling Support)
-- ----------------------------------------------------------------------------
-- Drop old 8-argument signature to eliminate function ambiguity and obsolete logic
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

    IF v_current_service_bookings >= v_service.max_daily_capacity THEN
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

REVOKE ALL ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Secure Phone Tracking RPC (Data Minimized)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.track_appointments_by_phone(TEXT);

CREATE OR REPLACE FUNCTION public.track_appointments_by_phone(
  p_phone_number TEXT
)
RETURNS TABLE (
  reference_number TEXT,
  clinic_id TEXT,
  clinic_name TEXT,
  masked_patient_name TEXT,
  appointment_date DATE,
  appointment_time TEXT,
  status appointment_status,
  queue_number INTEGER,
  service_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_phone TEXT;
BEGIN
  v_clean_phone := regexp_replace(COALESCE(p_phone_number, ''), '[^0-9]', '', 'g');

  IF v_clean_phone !~ '^01[0125][0-9]{8}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.reference_number,
    a.clinic_id,
    a.clinic_name,
    -- Strictly mask patient name (protect children's privacy from phone enumeration)
    CASE 
      WHEN length(trim(a.patient_name)) <= 4 THEN '***'
      ELSE substring(trim(a.patient_name) from 1 for 1) || '*** ' || substring(trim(a.patient_name) from length(trim(a.patient_name)) for 1)
    END AS masked_patient_name,
    a.appointment_date,
    a.appointment_time,
    a.status,
    a.queue_number,
    a.service_name
  FROM public.appointments a
  WHERE a.phone_number = v_clean_phone
    AND a.status <> 'CANCELLED'::appointment_status
  ORDER BY a.appointment_date DESC, a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_appointments_by_phone(TEXT) TO anon, authenticated, service_role;

COMMIT;

