# BSCH Clinics — خطة التراجع والتعافي في حالات الطوارئ (Database Rollback Plan)
## مستشفى الأطفال التخصصي بدمسنا — محافظة البحيرة

---

## 1. الفلسفة العامة وقواعد الأمان (Rollback Invariants)

1. **الترتيب العكسي الإلزامي (Reverse Dependency Order):**
   عند الحاجة للتراجع عن حزم النشر، يجب تنفيذ خطوات التراجع بالترتيب العكسي الدقيق:
   $$\text{Bundle 4} \longrightarrow \text{Bundle 3} \longrightarrow \text{Bundle 2} \longrightarrow \text{Bundle 1}$$
2. **منع فقدان البيانات التشغيلية (Zero Unintended Data Loss):**
   لا يتم حذف الجداول الرئيسية أو إسقاط الأعمدة إلا بعد التأكد من عدم وجود حجوزات حقيقية دخلت النظام، أو بعد أخذ نسخة احتياطية فورية (pg_dump / Supabase Backup).
3. **تنفيذ الإجراءات داخل كتل معاملات (`BEGIN ... COMMIT`):**
   لضمان الذرية، بحيث إما أن ينجح التراجع عن الحزمة بالكامل أو يُلغى التراجع (`ROLLBACK`).

---

## 2. إجراءات التراجع التفصيلية للحزم الأربع

### أولاً: التراجع عن الحزمة الرابعة (Rollback Bundle 4: CMS, Media & Staff Provisioning)

**الهدف:** إزالة جداول الـ CMS ومكتبة الوسائط ومخزن الـ OTP ودالة تأهيل الموظفين.

```sql
BEGIN;

-- 1. إسقاط دالة تأهيل الموظفين
DROP FUNCTION IF EXISTS public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT);

-- 2. إزالة سياسات التخزين وحاوية الملفات public-cms-assets
DROP POLICY IF EXISTS "Public Access to CMS Assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin can upload CMS Assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update CMS Assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete CMS Assets" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'public-cms-assets';

-- 3. إسقاط جدول مخزن الـ OTP
DROP TABLE IF EXISTS public.otp_verifications CASCADE;

-- 4. إسقاط جداول الـ CMS
DROP TABLE IF EXISTS public.media_assets CASCADE;
DROP TABLE IF EXISTS public.navigation_items CASCADE;
DROP TABLE IF EXISTS public.homepage_sections CASCADE;
DROP TABLE IF EXISTS public.website_settings CASCADE;

-- 5. إزالة الأعمدة المضافة لجدول clinics لأغراض العرض
ALTER TABLE public.clinics
  DROP COLUMN IF EXISTS display_order,
  DROP COLUMN IF EXISTS is_featured_on_homepage,
  DROP COLUMN IF EXISTS english_title,
  DROP COLUMN IF EXISTS accent_color,
  DROP COLUMN IF EXISTS icon_name,
  DROP COLUMN IF EXISTS instructions;

COMMIT;
```

---

### ثانياً: التراجع عن الحزمة الثالثة (Rollback Bundle 3: Cancellation Requests System)

**الهدف:** إزالة نظام طلبات الإلغاء والدوال المرتبطة به.

```sql
BEGIN;

-- 1. إسقاط دوال معالجة الإلغاء الذرية
DROP FUNCTION IF EXISTS public.review_cancellation_request_atomic(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.request_cancellation_atomic(UUID, TEXT, TEXT, TEXT, TEXT);

-- 2. إسقاط سياسات الأمان والمحفزات الخاصة بطلبات الإلغاء
DROP TRIGGER IF EXISTS trigger_cancellation_requests_updated_at ON public.cancellation_requests;
DROP POLICY IF EXISTS "Public and anon cannot access cancellation_requests" ON public.cancellation_requests;
DROP POLICY IF EXISTS "Admins can view all cancellation requests" ON public.cancellation_requests;
DROP POLICY IF EXISTS "Receptionists can view cancellation requests for their clinic" ON public.cancellation_requests;

-- 3. إسقاط جدول طلبات الإلغاء
DROP TABLE IF EXISTS public.cancellation_requests CASCADE;

COMMIT;
```

---

### ثالثاً: التراجع عن الحزمة الثانية (Rollback Bundle 2: Core State Transitions & Clinic Transfers)

**الهدف:** إزالة دوال تحويل العيادات وتحديث الحالة الذري وإعادة سياسات RLS الأصلية.

```sql
BEGIN;

-- 1. إسقاط دوال التحويل وتحديث الحالة
DROP FUNCTION IF EXISTS public.transfer_appointment_clinic_atomic(UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_appointment_status_atomic(UUID, appointment_status, TEXT, TEXT, TEXT, TEXT);

-- 2. إزالة محفز مزامنة تاريخ الحالة المتشدد وإعادة المحفز السابق
DROP TRIGGER IF EXISTS trigger_enforce_status_history_integrity ON public.appointments;
DROP FUNCTION IF EXISTS public.enforce_status_history_integrity();

-- 3. استعادة سياسات RLS الأصلية للحجوزات إن تطلب الأمر
DROP POLICY IF EXISTS "Receptionists view assigned clinic appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors view assigned clinic appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins have full access to appointments" ON public.appointments;

COMMIT;
```

---

### رابعاً: التراجع عن الحزمة الأولى (Rollback Bundle 1: Services, Capacity, Sequences & Sibling Fix)

**الهدف:** استعادة البنية الأساسية وإعادة فهرس حجز الإخوة السابق في حال الضرورة القصوى.

> [!CAUTION]
> إعادة الفهرس السابق `idx_unique_active_apt_per_phone_clinic_day` سيمنع أولياء الأمور مجدداً من حجز مواعيد لأطفالهم الإخوة في نفس اليوم ونفس العيادة.

```sql
BEGIN;

-- 1. إسقاط دوال تتبع الحجوزات ومحدد المعدل
DROP FUNCTION IF EXISTS public.track_appointments_by_phone(TEXT);
DROP FUNCTION IF EXISTS public.cleanup_expired_rate_limits();
DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, INTEGER, INTEGER);

-- 2. إسقاط جدول محدد المعدل
DROP TABLE IF EXISTS public.rate_limit_counters CASCADE;

-- 3. استعادة دالة book_appointment_atomic بتوقيعها الأصلي ذي الـ 8 معاملات (دون service_id)
-- (إذا كانت النسخة الأصلية مطلوبة)

-- 4. إزالة حقل service_id من appointments وجدول clinic_services
ALTER TABLE public.appointments DROP COLUMN IF EXISTS service_id;
DROP TABLE IF EXISTS public.clinic_services CASCADE;

-- 5. استعادة فهرس الإخوة القديم وإسقاط الفهرس الموسع
DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_patient_clinic_day;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_apt_per_phone_clinic_day
  ON public.appointments (clinic_id, phone_number, appointment_date)
  WHERE (status != 'CANCELLED');

-- 6. إسقاط المتسلسلة اليومية
DROP SEQUENCE IF EXISTS public.appointment_seq_number_seq CASCADE;

COMMIT;
```

---

## 3. التحقق بعد التراجع (Post-Rollback Verification)

بعد تنفيذ أي خطوة تراجع، قم بتشغيل الاستعلام التالي للتأكد من نظافة الحالة:

```sql
SELECT 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

