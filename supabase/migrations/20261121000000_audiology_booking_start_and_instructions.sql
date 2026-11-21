-- BSCH Clinics — Audiology first available appointment and patient instructions.
-- Safe additive migration. This file is prepared locally and is NOT applied to Supabase.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS booking_start_date DATE;

COMMENT ON COLUMN public.clinics.booking_start_date IS
  'Earliest appointment date patients may book for this clinic; NULL keeps the existing platform rule.';

UPDATE public.clinics
SET booking_start_date = DATE '2027-02-11',
    required_documents = ARRAY['إحضار جواب التأمين أو إيصال الدفع']::TEXT[],
    instructions = E'1. يشترط أن يكون العمر أكبر من 3 شهور وأقل من 5 سنوات. حالات التأخر العقلي أو تأخر الكلام مستثناة من شرط العمر ويمكن أن تكون أكبر من 5 سنوات.\n2. يجب التأكد من عدم وجود كحة أو رشح/نزلة برد أو ارتفاع درجة الحرارة.\n3. ليلة الاختبار: نوم الطفل الساعة 12 مساءً وإيقاظه الساعة 4 فجراً وعدم السماح له بالنوم حتى الوصول للمستشفى وتهيئته للاختبار.\n4. في اليوم السابق للاختبار: غسل الرأس جيدًا بالماء والصابون. عدم وضع كريم على الشعر أو البشرة يوم الاختبار.\n5. الحضور للمستشفى مبكرًا وبحد أقصى الساعة 8:30 صباحًا.\n6. إحضار (كلورال هيدرات 10%) إذا قرر الطبيب استخدامه، ويُعطى فقط تحت إشراف طبي.',
    updated_at = timezone('utc'::text, now())
WHERE id = 'audiology';

-- Preserve the complete ordered preparation instructions in appointment snapshots.
UPDATE public.clinic_services
SET instructions = E'1. يشترط أن يكون العمر أكبر من 3 شهور وأقل من 5 سنوات. حالات التأخر العقلي أو تأخر الكلام مستثناة من شرط العمر ويمكن أن تكون أكبر من 5 سنوات.\n2. يجب التأكد من عدم وجود كحة أو رشح/نزلة برد أو ارتفاع درجة الحرارة.\n3. ليلة الاختبار: نوم الطفل الساعة 12 مساءً وإيقاظه الساعة 4 فجراً وعدم السماح له بالنوم حتى الوصول للمستشفى وتهيئته للاختبار.\n4. في اليوم السابق للاختبار: غسل الرأس جيدًا بالماء والصابون. عدم وضع كريم على الشعر أو البشرة يوم الاختبار.\n5. الحضور للمستشفى مبكرًا وبحد أقصى الساعة 8:30 صباحًا.\n6. إحضار (كلورال هيدرات 10%) إذا قرر الطبيب استخدامه، ويُعطى فقط تحت إشراف طبي.'
WHERE id = 'audiology_abr' AND clinic_id = 'audiology';

UPDATE public.clinic_services
SET instructions = E'1. يشترط أن يكون العمر 5 سنوات فأكثر.\n2. يجب التأكد من عدم وجود كحة أو رشح/نزلة برد أو ارتفاع درجة الحرارة.\n3. ليلة الاختبار: نوم الطفل الساعة 12 مساءً وإيقاظه الساعة 4 فجراً وعدم السماح له بالنوم حتى الوصول للمستشفى وتهيئته للاختبار.\n4. في اليوم السابق للاختبار: غسل الرأس جيدًا بالماء والصابون. عدم وضع كريم على الشعر أو البشرة يوم الاختبار.\n5. الحضور للمستشفى مبكرًا وبحد أقصى الساعة 8:30 صباحًا.\n6. إحضار (كلورال هيدرات 10%) إذا قرر الطبيب استخدامه، ويُعطى فقط تحت إشراف طبي.'
WHERE id = 'audiology_tone_test' AND clinic_id = 'audiology';

CREATE OR REPLACE FUNCTION public.enforce_clinic_booking_start_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_start_date DATE;
  v_is_walk_in_only BOOLEAN := false;
BEGIN
  SELECT booking_start_date
    INTO v_booking_start_date
  FROM public.clinics
  WHERE id = NEW.clinic_id;

  IF v_booking_start_date IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(is_walk_in_only, false)
    INTO v_is_walk_in_only
  FROM public.clinic_services
  WHERE id = NEW.service_id
    AND clinic_id = NEW.clinic_id;

  -- Direct-attendance services retain their existing same-day staff workflow.
  IF COALESCE(v_is_walk_in_only, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.appointment_date < v_booking_start_date THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('أول موعد متاح للحجز في هذه العيادة هو %s', to_char(v_booking_start_date, 'DD/MM/YYYY'));
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_clinic_booking_start_date() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_clinic_booking_start_date ON public.appointments;
CREATE TRIGGER trg_enforce_clinic_booking_start_date
  BEFORE INSERT OR UPDATE OF clinic_id, appointment_date
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_clinic_booking_start_date();
