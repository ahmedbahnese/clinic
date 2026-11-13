-- ========================================================================
-- BSCH Clinics — Approved outpatient clinics, walk-in services & retention
-- Migration: 20261113000000_clinic_configuration_and_retention.sql
-- ========================================================================

-- Service visibility rule: patients can see a service, but only reception/admin
-- can book services marked as direct attendance.
ALTER TABLE public.clinic_services
  ADD COLUMN IF NOT EXISTS is_walk_in_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clinic_services.is_walk_in_only IS
  'Shown to patients as direct attendance only; online booking is rejected and staff must book it on the same day.';

-- Retention defaults are editable by ADMIN from the staff dashboard.
ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS appointment_retention_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS audit_log_retention_days INTEGER NOT NULL DEFAULT 14;

DO $$ BEGIN
  ALTER TABLE public.website_settings
    ADD CONSTRAINT chk_appointment_retention_days CHECK (appointment_retention_days >= 30 AND appointment_retention_days <= 3650);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.website_settings
    ADD CONSTRAINT chk_audit_log_retention_days CHECK (audit_log_retention_days >= 14 AND audit_log_retention_days <= 3650);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.website_settings
SET appointment_retention_days = COALESCE(appointment_retention_days, 30),
    audit_log_retention_days = COALESCE(audit_log_retention_days, 14)
WHERE id = 'default';

-- ========================================================================
-- Replace the previous provisional clinic list with the six approved clinics.
-- Existing rows are deactivated rather than deleted to preserve foreign keys.
-- ========================================================================
UPDATE public.clinics
SET is_active = false,
    updated_at = timezone('utc'::text, now())
WHERE id NOT IN ('gi', 'nutrition', 'neuro', 'dentistry', 'echo', 'audiology');

INSERT INTO public.clinics (
  id, name, description, location, working_hours, days_of_week,
  max_daily_slots, slot_duration_minutes, instructions, required_documents,
  is_active, is_hospital_confirmed
)
VALUES
(
  'gi', 'عيادة الجهاز الهضمي',
  'كشف ومتابعة حالات الجهاز الهضمي والكبد للأطفال.',
  'مبنى العيادات الخارجية', '08:30-14:00', ARRAY[2,6],
  75, 5, NULL,
  ARRAY['صورة بطاقة الأب والأم', 'شهادة ميلاد كمبيوتر', 'تقارير الطفل'], true, true
),
(
  'nutrition', 'عيادة التغذية',
  'متابعة التغذية والنمو وحالات سوء التغذية والنحافة والسمنة للأطفال.',
  'مبنى العيادات الخارجية', '08:30-14:00', ARRAY[0,3,4],
  50, 5, NULL,
  ARRAY['صورة بطاقة الأب والأم', 'شهادة ميلاد كمبيوتر', 'تقارير الطفل'], true, true
),
(
  'neuro', 'عيادة النفسية والعصبية',
  'تقييم ومتابعة الحالات النفسية والعصبية وتأخر التطور والكلام.',
  'مبنى العيادات الخارجية', '08:30-14:00', ARRAY[6],
  15, 10, NULL, ARRAY[]::TEXT[], true, true
),
(
  'dentistry', 'عيادة الأسنان',
  'خدمات خلع وحشو أسنان الأطفال.',
  'مبنى العيادات الخارجية', '08:30-14:00', ARRAY[0,1,2,3,4,6],
  4, 15, NULL, ARRAY['صورة بطاقة الأب أو الأم'], true, true
),
(
  'echo', 'عيادة الإيكو',
  'فحص الإيكو للأطفال حسب تحويل وتقييم عيادة القلب.',
  'أمام عيادة القلب بالدور الرابع', '08:30-14:00', ARRAY[0,1,2,3,4,6],
  5, 20,
  E'الحضور الساعة 8:30 صباحًا أمام عيادة القلب بالدور الرابع.\n\nللأطفال من 6 شهور حتى 3 سنوات: قد يُطلب تجهيز الطفل بمادة كلورال هيدرات تحت إشراف طبيب عيادة القلب حسب الحالة.\n\nيجب أن يكون الطفل خاليًا من أعراض البرد.\n\nإيقاظ الطفل مبكرًا وعدم السماح له بالنوم في الطريق حتى يمكنه النوم أثناء الفحص عند الحاجة.',
  ARRAY[]::TEXT[], true, true
),
(
  'audiology', 'عيادة السمعيات',
  'خدمات رسم السمع الإلكتروني وفحوصات ضغط الأذن وحالات مبادرة السمع.',
  'مبنى العيادات الخارجية', '08:30-14:00', ARRAY[0,1,2,3,4,6],
  20, 15,
  E'الحضور للمستشفى مبكرًا وبحد أقصى الساعة 8:30 صباحًا.\n\nيجب التأكد من عدم وجود كحة أو رشح/نزلة برد أو ارتفاع درجة الحرارة.',
  ARRAY[]::TEXT[], true, true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  location = EXCLUDED.location,
  working_hours = EXCLUDED.working_hours,
  days_of_week = EXCLUDED.days_of_week,
  max_daily_slots = EXCLUDED.max_daily_slots,
  slot_duration_minutes = EXCLUDED.slot_duration_minutes,
  instructions = EXCLUDED.instructions,
  required_documents = EXCLUDED.required_documents,
  is_active = EXCLUDED.is_active,
  is_hospital_confirmed = EXCLUDED.is_hospital_confirmed,
  updated_at = timezone('utc'::text, now());

-- Keep historical services, but replace the active booking catalogue.
UPDATE public.clinic_services
SET is_active = false,
    updated_at = timezone('utc'::text, now());

INSERT INTO public.clinic_services (
  id, clinic_id, name, required_documents, instructions,
  max_daily_capacity, is_walk_in_only, is_active, display_order
)
VALUES
  ('gi_first_visit', 'gi', 'كشف أول مرة',
   ARRAY['صورة بطاقة الأب والأم', 'شهادة ميلاد كمبيوتر', 'تقارير الطفل'],
   'يرجى إحضار المستندات والتقارير المذكورة عند الحضور.', 75, false, true, 1),
  ('gi_follow_up', 'gi', 'متابعة',
   ARRAY['صورة بطاقة الأب والأم', 'شهادة ميلاد كمبيوتر', 'تقارير الطفل'],
   'يرجى إحضار المستندات والتقارير المذكورة عند الحضور.', 75, false, true, 2),
  ('nutrition_first_visit', 'nutrition', 'كشف أول مرة',
   ARRAY['صورة بطاقة الأب والأم', 'شهادة ميلاد كمبيوتر', 'تقارير الطفل'],
   'يرجى إحضار المستندات والتقارير المذكورة عند الحضور.', 50, false, true, 1),
  ('nutrition_follow_up', 'nutrition', 'متابعة',
   ARRAY['صورة بطاقة الأب والأم', 'شهادة ميلاد كمبيوتر', 'تقارير الطفل'],
   'يرجى إحضار المستندات والتقارير المذكورة عند الحضور.', 50, false, true, 2),
  ('neuro_first_visit', 'neuro', 'كشف أول مرة', ARRAY[]::TEXT[],
   'لا توجد أوراق محددة حاليًا. الحضور في الموعد المحدد.', 15, false, true, 1),
  ('neuro_follow_up', 'neuro', 'متابعة', ARRAY[]::TEXT[],
   'لا توجد أوراق محددة حاليًا. الحضور في الموعد المحدد.', 15, false, true, 2),
  ('dentistry_extraction', 'dentistry', 'خلع', ARRAY['صورة بطاقة الأب أو الأم'],
   'يرجى إحضار صورة بطاقة الأب أو الأم.', 4, false, true, 1),
  ('dentistry_filling', 'dentistry', 'حشو', ARRAY['صورة بطاقة الأب أو الأم'],
   'يرجى إحضار صورة بطاقة الأب أو الأم.', 4, false, true, 2),
  ('echo_first_visit', 'echo', 'كشف أول مرة', ARRAY[]::TEXT[],
   E'الحضور الساعة 8:30 صباحًا أمام عيادة القلب بالدور الرابع.\n\nللأطفال من 6 شهور حتى 3 سنوات: قد يُطلب تجهيز الطفل بمادة كلورال هيدرات تحت إشراف طبيب عيادة القلب حسب الحالة.\n\nيجب أن يكون الطفل خاليًا من أعراض البرد.\n\nإيقاظ الطفل مبكرًا وعدم السماح له بالنوم في الطريق حتى يمكنه النوم أثناء الفحص عند الحاجة.', 5, false, true, 1),
  ('echo_follow_up', 'echo', 'متابعة', ARRAY[]::TEXT[],
   E'الحضور الساعة 8:30 صباحًا أمام عيادة القلب بالدور الرابع.\n\nللأطفال من 6 شهور حتى 3 سنوات: قد يُطلب تجهيز الطفل بمادة كلورال هيدرات تحت إشراف طبيب عيادة القلب حسب الحالة.\n\nيجب أن يكون الطفل خاليًا من أعراض البرد.\n\nإيقاظ الطفل مبكرًا وعدم السماح له بالنوم في الطريق حتى يمكنه النوم أثناء الفحص عند الحاجة.', 5, false, true, 2),
  ('audiology_abr', 'audiology', 'رسم سمع كمبيوتر عن طريق جذع المخ — 3 حالات', ARRAY[]::TEXT[],
   E'يشترط أن يكون العمر أكبر من 3 شهور وأقل من 5 سنوات. حالات التأخر العقلي أو تأخر الكلام مستثناة من شرط العمر ويمكن أن تكون أكبر من 5 سنوات.\n\nيجب التأكد من عدم وجود كحة أو رشح/نزلة برد أو ارتفاع درجة الحرارة.\n\nليلة الاختبار: نوم الطفل الساعة 12 مساءً وإيقاظه الساعة 4 فجراً وعدم السماح له بالنوم حتى الوصول للمستشفى وتهيئته للاختبار.\n\nفي اليوم السابق للاختبار: غسل الرأس جيدًا بالماء والصابون. عدم وضع كريم على الشعر أو البشرة يوم الاختبار.\n\nالحضور للمستشفى مبكرًا وبحد أقصى الساعة 8:30 صباحًا. إحضار كلورال هيدرات إذا قرر الطبيب استخدامه، ويُعطى فقط تحت إشراف طبي.', 3, false, true, 1),
  ('audiology_tone_test', 'audiology', 'رسم سمع للسن 5 سنوات فأكثر — 5 حالات', ARRAY[]::TEXT[],
   E'يشترط أن يكون العمر 5 سنوات فأكثر. يجب التأكد من عدم وجود كحة أو رشح/نزلة برد أو ارتفاع درجة الحرارة.\n\nالحضور للمستشفى مبكرًا وبحد أقصى الساعة 8:30 صباحًا.', 5, false, true, 2),
  ('audiology_ear_pressure', 'audiology', 'حالات ضغط الأذن — حضور مباشر', ARRAY[]::TEXT[],
   'هذه الخدمة بالحضور المباشر فقط ولا يتم الحجز الإلكتروني بها. يتم تسجيلها من موظف الاستقبال أو مدير النظام في نفس اليوم.', NULL, true, true, 3),
  ('audiology_newborn_referral', 'audiology', 'حالات محولة من الوحدات الصحية للمواليد ضمن مبادرة السمع — حضور مباشر', ARRAY[]::TEXT[],
   'هذه الخدمة بالحضور المباشر فقط ولا يتم الحجز الإلكتروني بها. يتم تسجيلها من موظف الاستقبال أو مدير النظام في نفس اليوم.', NULL, true, true, 4)
ON CONFLICT (id) DO UPDATE SET
  clinic_id = EXCLUDED.clinic_id,
  name = EXCLUDED.name,
  required_documents = EXCLUDED.required_documents,
  instructions = EXCLUDED.instructions,
  max_daily_capacity = EXCLUDED.max_daily_capacity,
  is_walk_in_only = EXCLUDED.is_walk_in_only,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  updated_at = timezone('utc'::text, now());

-- ========================================================================
-- Automated retention function. It reads the admin-configured values and
-- deletes only records older than the configured thresholds.
-- ========================================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_clinic_records()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_appointment_days INTEGER := 30;
  v_audit_days INTEGER := 14;
  v_appointment_cutoff DATE;
  v_audit_cutoff TIMESTAMPTZ;
  v_appointments_deleted INTEGER := 0;
  v_audit_logs_deleted INTEGER := 0;
BEGIN
  SELECT COALESCE(appointment_retention_days, 30), COALESCE(audit_log_retention_days, 14)
  INTO v_appointment_days, v_audit_days
  FROM public.website_settings
  WHERE id = 'default';

  v_appointment_days := GREATEST(30, LEAST(v_appointment_days, 3650));
  v_audit_days := GREATEST(14, LEAST(v_audit_days, 3650));
  v_appointment_cutoff := (timezone('Africa/Cairo', now()))::date - v_appointment_days;
  v_audit_cutoff := now() - make_interval(days => v_audit_days);

  CREATE TEMP TABLE IF NOT EXISTS expired_appointment_ids (id UUID PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE expired_appointment_ids;
  INSERT INTO expired_appointment_ids (id)
  SELECT id FROM public.appointments WHERE appointment_date < v_appointment_cutoff;

  -- cancellation_requests and status history are protected by ON DELETE CASCADE;
  -- explicitly deleting requests first also works if a future FK changes.
  DELETE FROM public.cancellation_requests c
  USING expired_appointment_ids e
  WHERE c.appointment_id = e.id;

  DELETE FROM public.appointments a
  USING expired_appointment_ids e
  WHERE a.id = e.id;
  GET DIAGNOSTICS v_appointments_deleted = ROW_COUNT;

  DELETE FROM public.audit_logs
  WHERE created_at < v_audit_cutoff;
  GET DIAGNOSTICS v_audit_logs_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'appointment_retention_days', v_appointment_days,
    'audit_log_retention_days', v_audit_days,
    'appointments_deleted', v_appointments_deleted,
    'audit_logs_deleted', v_audit_logs_deleted,
    'appointment_cutoff', v_appointment_cutoff,
    'audit_cutoff', v_audit_cutoff
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_clinic_records() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_clinic_records() TO service_role;

-- Ensure only staff can call the direct-attendance flow through the existing
-- server-mediated RPC. The API layer also validates this before calling RPC.
COMMENT ON FUNCTION public.cleanup_expired_clinic_records() IS
  'Daily retention: appointments default to 30 days after appointment date; audit logs default to 14 days. Values are ADMIN-configurable.';
