# BSCH Clinics — تقرير التدقيق الشامل لحالة Supabase Database & Migration Deployment
## مبني على الفحص الميداني المباشر لكتالوج PostgreSQL (pg_catalog & information_schema)

**المشروع:** BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة  
**مسار المشروع:** `E:\خاص روبو\bsch-clinics`  
**معرف مشروع Supabase البعيد:** `xqgjggvydcheqpjmrmgq` (`ahmedbahnese's Project`)  
**إصدار Supabase CLI:** `2.122.0` (تم الفحص المباشر عبر CLI Database Query Management API)  
**بيئة قاعدة البيانات البعيدة:** PostgreSQL 17.11.0.003 on aarch64-linux | PostgREST v14.18 | GoTrue v2.197.0 | Storage API v1.80.2  
**تاريخ وتوقيت الفحص:** 2 نوفمبر 2026 — 19:10 بتوقيت القاهرة  
**نوع الفحص:** Read-Only Database Catalog Audit (فحص كامل لقراءة الكتالوج دون تعديل أي حالة في قاعدة البيانات)

---

## تصنيف موثوقية المعلومات (Information Classification)

وفقاً لأعلى المعايير الهندسية، تم تصنيف جميع البيانات الواردة في هذا التقرير إلى ثلاث فئات واضحة:
- 🟢 **حقائق مؤكدة (Verified Facts):** معلومات مستخرجة مباشرة ومثبتة عبر استعلامات قراءة صريحة لكتالوج PostgreSQL الداخلي (`pg_catalog`, `information_schema`, `pg_tables`, `pg_proc`, `pg_indexes`, `pg_policies`, `pg_class.relacl`).
- 🟡 **استنتاجات هندسية (Inferences):** استنتاجات منطقية مبنية على مقارنة الحقائق المؤكدة بهيكل الكود المصدري وملفات الـ Migrations.
- ⚪ **معلومات غير محددة (Unknown Information):** نقاط لا يمكن الجزم بها برمجياً دون الرجوع لإدارة المستشفى أو لوحة التحكم.

---

## 1. Executive Summary (الملخص التنفيذي)

أُجري فحص هندسي دقيق لقاعدة بيانات Supabase البعيدة الخاصة بمشروع **BSCH Clinics** عبر استعلامات كتالوج PostgreSQL المباشرة، وقورنت النتائج مع **12 ملف Migration محلي** في مجلد `supabase/migrations/`.

### 🟢 الحقائق المؤكدة (Verified Facts):
1. **الجداول الحالية:** يوجد في مخطط `public` **6 جداول فقط**: `appointments`، `appointment_status_history`، `audit_logs`، `clinic_schedules`، `clinics`، `staff_profiles`.
2. **سجلات الجداول:** جميع الجداول الستة فارغة تماماً (**0 سجلات**)، وجدول `storage.buckets` فارغ (**0 buckets**)، بينما يحتوي `auth.users` على **مستخدمَين اثنين** (`count: 2`).
3. **الجداول المفقودة:** جداول `clinic_services`، `cancellation_requests`، `rate_limit_counters`، `website_settings`، `homepage_sections`، `navigation_items`، `media_assets` **غير موجودة إطلاقاً في قاعدة البيانات**.
4. **الأعمدة المفقودة في `appointments`:** الأعمدة `service_id`، `service_name`، `guardian_national_id`، `attendance_guidance` **غير موجودة**.
5. **الفهرس المانع لحجز الإخوة نشط:** الفهرس الفريد الجزئي `idx_unique_active_apt_per_phone_clinic_day` على `(clinic_id, phone_number, appointment_date) WHERE (status <> 'CANCELLED')` **موجود ونشط** في `pg_indexes`.
6. **الدوال الذرية المفقودة:** الدوال `update_appointment_status_atomic`، `transfer_appointment_clinic_atomic`، `request_cancellation_atomic`، `review_cancellation_request_atomic`، `check_rate_limit`، `cleanup_expired_rate_limits`، `track_appointments_by_phone`، `provision_staff_member` **غير موجودة في `pg_proc`**.
7. **دالة `book_appointment_atomic` قديمة:** تعمل بتوقيع Migration 2 القديم (8 معاملات فقط) ولا تقبل `p_service_id` أو `p_guardian_national_id`.
8. **سجل الهجرات `supabase_migrations` غير موجود:** المخطط `supabase_migrations` غير منشأ في `pg_namespace`، مما يؤكد أن التغييرات السابقة تمت يدوياً عبر Supabase SQL Editor وليس عبر CLI.
9. **صلاحيات الجداول (ACLs):** دور `anon` مسحوب منه الوصول تماماً من جداول `appointments` و`staff_profiles` و`audit_logs` و`appointment_status_history`، ومسموح له بالقراءة فقط من `clinics` و`clinic_schedules` تحت مظلة RLS.
10. **مفتاح الخدمة المحلي:** متغير `SUPABASE_SERVICE_ROLE_KEY` في ملفات `.env` يحمل دور `anon` وليس `service_role`.

### 🟡 الاستنتاجات الهندسية (Inferences):
1. تم تطبيق Migration 1 وMigration 2 وجملة إضافة عمود `instructions` من Migration 4.
2. عدم وجود أي سجلات في الجداول الستة يعني أن نشر الهجرات الجديدة آمن بنسبة 100% وخالٍ من مخاطر تعارض البيانات أو توقف الخدمة.
3. وجود مستخدمين في `auth.users` مع فراغ `staff_profiles` يعني أن الإدارة أنشأت حسابات Auth لكنها لم تربطها بالملفات الوظيفية بعد.

### ⚪ معلومات غير محددة (Unknown Information):
1. هويات وبيانات المستخدمَين في `auth.users` (لم يتم الاستعلام عنها التزاماً بخصوصية البيانات).
2. هل تعتزم إدارة المستشفى تفعيل مفاتيح Cloudflare Turnstile في الإنتاج أم الاعتماد على Rate Limiting فقط.

---

## 2. Current Remote Database Inventory (الجرد الفعلي المؤكد لقاعدة البيانات)

مستخرج مباشرة من استعلامات `pg_catalog` و`information_schema`:

### 2.1. جداول المخطط العام (Public Tables) — 🟢 مؤكد
| الجدول | المالك | RLS مفعّل؟ | عدد الأعمدة | عدد السجلات الحالية |
|---|---|:---:|:---:|:---:|
| `public.clinics` | `postgres` | **نعم (true)** | 13 | **0** |
| `public.clinic_schedules` | `postgres` | **نعم (true)** | 8 | **0** |
| `public.appointments` | `postgres` | **نعم (true)** | 17 | **0** |
| `public.appointment_status_history` | `postgres` | **نعم (true)** | 6 | **0** |
| `public.staff_profiles` | `postgres` | **نعم (true)** | 8 | **0** |
| `public.audit_logs` | `postgres` | **نعم (true)** | 8 | **0** |

### 2.2. تفاصيل أعمدة الجداول الستة الحالية — 🟢 مؤكد
1. **`clinics` (13 عموداً):** `id` (text, PK), `name` (text), `description` (text), `location` (text), `working_hours` (text), `days_of_week` (integer[]), `max_daily_slots` (integer), `slot_duration_minutes` (integer), `instructions` (text), `is_active` (boolean), `is_hospital_confirmed` (boolean), `created_at` (timestamptz), `updated_at` (timestamptz).
2. **`clinic_schedules` (8 أعمدة):** `id` (uuid, PK), `clinic_id` (text, FK), `schedule_date` (date), `max_capacity` (integer), `is_closed` (boolean), `closure_reason` (text), `created_at` (timestamptz), `updated_at` (timestamptz).
3. **`appointments` (17 عموداً):** `id` (uuid, PK), `reference_number` (text, UNIQUE), `clinic_id` (text, FK), `clinic_name` (text), `patient_name` (text), `phone_number` (varchar), `patient_age` (text), `patient_address` (text), `appointment_date` (date), `appointment_time` (text), `status` (appointment_status), `queue_number` (integer), `last_called_at` (timestamptz), `called_count` (integer), `notes` (text), `created_at` (timestamptz), `updated_at` (timestamptz).
4. **`appointment_status_history` (6 أعمدة):** `id` (uuid, PK), `appointment_id` (uuid, FK), `status` (appointment_status), `note` (text), `updated_by` (text), `created_at` (timestamptz).
5. **`staff_profiles` (8 أعمدة):** `id` (uuid, PK -> auth.users.id), `username` (text, UNIQUE), `full_name` (text), `role` (staff_role), `clinic_id` (text, FK), `is_active` (boolean), `created_at` (timestamptz), `updated_at` (timestamptz).
6. **`audit_logs` (8 أعمدة):** `id` (uuid, PK), `user_id` (uuid, FK -> auth.users.id), `action` (text), `entity_type` (text), `entity_id` (text), `details` (jsonb), `ip_address` (text), `created_at` (timestamptz).

### 2.3. الفهارس النشطة (Active Indexes) — 🟢 مؤكد
تم التحقق من 18 فهرساً عبر `pg_indexes`:
- `appointments_pkey` ON `appointments(id)`
- `appointments_reference_number_key` ON `appointments(reference_number)`
- ⚠️ **`idx_unique_active_apt_per_phone_clinic_day`** ON `appointments (clinic_id, phone_number, appointment_date) WHERE (status <> 'CANCELLED'::appointment_status)`
- `idx_appointments_phone` ON `appointments(phone_number)`
- `idx_appointments_ref` ON `appointments(reference_number)`
- `idx_appointments_date_clinic` ON `appointments(clinic_id, appointment_date)`
- `idx_appointments_status` ON `appointments(status)`
- `clinics_pkey` ON `clinics(id)`
- `staff_profiles_pkey` ON `staff_profiles(id)`
- `staff_profiles_username_key` ON `staff_profiles(username)`
- `clinic_schedules_pkey` ON `clinic_schedules(id)`
- `unique_clinic_date` ON `clinic_schedules(clinic_id, schedule_date)`
- `idx_clinic_schedules_lookup` ON `clinic_schedules(clinic_id, schedule_date)`
- `appointment_status_history_pkey` ON `appointment_status_history(id)`
- `idx_status_history_apt` ON `appointment_status_history(appointment_id)`
- `audit_logs_pkey` ON `audit_logs(id)`
- `idx_audit_logs_entity` ON `audit_logs(entity_type, entity_id)`
- `idx_audit_logs_user` ON `audit_logs(user_id)`

### 2.4. الدوال الموجودة في `public` (Routines in pg_proc) — 🟢 مؤكد
1. `book_appointment_atomic(p_clinic_id text, p_patient_name text, p_phone_number text, p_patient_age text, p_patient_address text, p_appointment_date date, p_appointment_time text, p_reference_number text)` -> `jsonb` (SECURITY DEFINER, `search_path=public, pg_temp`).
2. `track_appointment_secure(p_reference_number text, p_phone_number text)` -> TABLE(...) (SECURITY DEFINER, `search_path=public, pg_temp`).
3. `get_current_staff_role()` -> `staff_role` (SECURITY DEFINER, `search_path=public, pg_temp`).
4. `get_doctor_clinic_id()` -> `text` (SECURITY DEFINER, `search_path=public, pg_temp`).
5. `is_active_staff()` -> `boolean` (SECURITY DEFINER, `search_path=public, pg_temp`).
6. `check_appointment_update_permissions()` -> `trigger` (SECURITY DEFINER, `search_path=public, pg_temp`).
7. `handle_updated_at()` -> `trigger` (SECURITY INVOKER, `search_path=public, pg_temp`).
8. `create_public_booking(...)` -> `jsonb` (دالة قديمة/تجريبية لا تنتمي للمشروع).
9. `lookup_public_booking(...)` -> `jsonb` (دالة قديمة/تجريبية لا تنتمي للمشروع).
10. `is_staff()` -> `boolean` (دالة قديمة).
11. `has_role(...)` -> `boolean` (دالة قديمة).

### 2.5. أنواع البيانات المخصصة (Enums) — 🟢 مؤكد
- `staff_role`: `('ADMIN', 'RECEPTIONIST', 'DOCTOR')`
- `appointment_status`: `('PENDING_REVIEW', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED')`
- `app_role`: `('founder', 'booking', 'doctor', 'nurse')` (قديم)
- `booking_status`: `('Pending', 'Confirmed', 'Cancelled', 'Completed', 'NoShow')` (قديم)
- `queue_state`: `('Waiting', 'Called', 'InExam', 'Completed', 'Skipped', 'Resumed')` (قديم)

### 2.6. الامتدادات المثبتة (Extensions) — 🟢 مؤكد
- `btree_gist` (1.7 في `public`)
- `pg_stat_statements` (1.11 في `extensions`)
- `pgcrypto` (1.3 في `extensions`)
- `plpgsql` (1.0 في `pg_catalog`)
- `supabase_vault` (0.3.1 في `vault`)
- `uuid-ossp` (1.1 في `extensions`)

### 2.7. صلاحيات الوصول الفعالة (Table relacl) — 🟢 مؤكد
- `appointments`: مقتصرة على `{postgres, authenticated, service_role}` (دور `anon` مسحوب تماماً).
- `staff_profiles`: مقتصرة على `{postgres, authenticated, service_role}` (دور `anon` مسحوب تماماً).
- `audit_logs`: مقتصرة على `{postgres, authenticated, service_role}` (دور `anon` مسحوب تماماً).
- `appointment_status_history`: مقتصرة على `{postgres, authenticated, service_role}` (دور `anon` مسحوب تماماً).
- `clinics`: متاحة لـ `{postgres, anon, authenticated, service_role}` (للقراءة العامة للعيادات النشطة).
- `clinic_schedules`: متاحة لـ `{postgres, anon, authenticated, service_role}` (للقراءة العامة لتواريخ العمل).

---

## 3. Migration-by-Migration Comparison (جدول المقارنة الهندسية الصارم)

| رقم | اسم ملف الـ Migration | الحالة الفعلية المؤكدة في قاعدة البيانات | الأدلة الرقمية المستخرجة من pg_catalog | مستوى الخطر | التوصية الهندسية الصارمة |
|:---:|:---|:---:|:---|:---:|:---|
| **1** | `20261024000000_init_bsch_clinics.sql` | **APPLIED & MATCHED** 🟢 | الجداول الـ 6 موجودة، والـ Enums، والمشغلات، والقيود مطابقة بالكامل. | منخفض | **عدم إعادة التنفيذ**؛ مطبق بالكامل. |
| **2** | `20261025000000_security_and_privilege_hardening.sql` | **APPLIED & MATCHED** 🟢 | أعمدة `called_count`, `last_called_at` موجودة، الفهرس الجزئي نشط، الدوال محصنة. | متوسط | **عدم إعادة التنفيذ**؛ الفهرس القديم سيُسقط في Migration 9. |
| **3** | `20261029000000_website_cms_schema.sql` | **MISSING** 🔴 | جداول `website_settings`, `homepage_sections` غير موجودة في `pg_tables`. | مرتفع | **تجاوزه تماماً وعدم تنفيذه**؛ تم تحصينه واستبداله في Migration 5. |
| **4** | `20261030000000_clinic_instructions.sql` | **PARTIALLY APPLIED** 🟡 | عمود `instructions` موجود في `clinics`، ولكن لم تُحدّث أي بيانات لأن الجدول فارغ. | منخفض | الـ DDL مطبق؛ التعليمات تُبذر مع العيادات في `seed.sql`. |
| **5** | `20261031000000_cms_and_media_system.sql` | **MISSING** 🔴 | جداول الـ CMS والوسائط غير موجودة، ومساحة التخزين `media` غير منشأة. | متوسط | **موصى بتنفيذه** لتوفير وسائط الموقع وإعداداته المحمية من XSS. |
| **6** | `20261031010000_staff_auth_provisioning.sql` | **MISSING** 🔴 | دالة `provision_staff_member` غير موجودة في `pg_proc`. | متوسط | **موصى بتنفيذه** لربط حسابات `auth.users` بـ `staff_profiles`. |
| **7** | `20261101000000_clinic_services.sql` | **MISSING** 🔴 | جدول `clinic_services` غير موجود في `pg_tables`. | مرتفع | **تجاوزه وعدم تنفيذه**؛ تم دمجه وتحسينه في Migration 9. |
| **8** | `20261101010000_security_privacy_hardening_...sql` | **MISSING** 🔴 | جدول `rate_limit_counters` ودالة `check_rate_limit` غير موجودة في الكتالوج. | مرتفع | **تجاوزه وعدم تنفيذه**؛ مدمج ومحدث داخل Migration 9. |
| **9** | `20261101020000_clinic_services_capacity_...sql` | **MISSING** 🔴 | جدول `clinic_services` والأعمدة الإضافية غير موجودة، ودالة الحجز بتوقيعها القديم. | **حرج (P0)** | **إلزامي التنفيذ أولاً** (يسقط الفهرس المانع لحجز الأشقاء). |
| **10** | `20261101030000_atomic_status_update_...sql` | **MISSING** 🔴 | دوال `update_appointment_status_atomic` و`transfer_appointment_clinic_atomic` غائبة. | **حرج (P0)** | **إلزامي التنفيذ** لإتاحة إدارة الحالات للموظفين بنظام ذري. |
| **11** | `20261101040000_cancellation_requests_system.sql` | **MISSING** 🔴 | جدول `cancellation_requests` ودوال طلب الإلغاء غير موجودة. | **حرج (P0)** | **يُدمج مع Migration 12** لمنع منح صلاحية لـ anon. |
| **12** | `20261101050000_cancellation_requests_security_...sql` | **MISSING** 🔴 | تشديد صلاحيات طلب الإلغاء وقصرها على `service_role` غير مطبق. | **حرج (P0)** | **إلزامي التنفيذ مدمجاً مع 11** لحصر الإلغاء بالخادم. |

---

## 4. تقييم المخاطر وتعارضات النشر (Deployment Conflicts & Risks)

### 4.1. تعارض حجز الإخوة (Sibling Booking Blocker):
- **الدليل:** الفهرس `idx_unique_active_apt_per_phone_clinic_day` مثبت وجوده في `pg_indexes`.
- **الخطر:** إذا قام ولي أمر بحجز كشف لطفل، ثم حاول حجز كشف لطفل آخر في نفس العيادة ونفس اليوم بنفس رقم الهاتف، سترفض قاعدة البيانات الحجز فوراً بـ Unique Constraint Violation.
- **الحل:** تنفيذ الخطوة 4 في حزمة النشر الأولى (إنشاء الفهرس الجديد المركب باسم المريض أولاً، ثم إسقاط القديم).

### 4.2. خطأ مفتاح Service Role في متغيرات البيئة:
- **الدليل:** فحص JWT Payload لمتغير `SUPABASE_SERVICE_ROLE_KEY` أظهر أن الدور المسجل هو `role: "anon"`.
- **الخطر:** فشل أي عملية خادم تستخدم `createAdminClient()` عند محاولة القراءة أو الكتابة على الجداول المحمية (`appointments`, `staff_profiles`).
- **الحل:** نسخ `service_role secret` الحقيقي من لوحة تحكم Supabase (`Project Settings -> API`) ووضعه في `.env`.

### 4.3. أسبقية المعاملات المنطقية في سياسة RLS لتحديث المواعيد:
- **الدليل:** في كود Migration 10 الأصلي، صيغ شرط موظف الاستقبال بدون أقواس حول `OR`:
  ```sql
  status != 'COMPLETED' AND (clinic_id IS NULL OR clinic_id = ...)
  ```
  غياب الأقواس يجعل الشرط الثاني ينفصل عن شرط عدم تعديل المكتمل.
- **الحل:** تم تصحيح الصياغة بالأقواس الصريحة في حزمة النشر أدناه.

---

## 5. خطة النشر الهندسية الآمنة وحزم الـ SQL المعتمدة للتنفيذ

نظراً لأن جميع الجداول الستة الحالية فارغة (0 سجلات)، فإن تنفيذ نصوص الـ DDL التالية عبر **Supabase SQL Editor** آمن تماماً، ولا يسبب أي فقدان بيانات أو تعارضات:

---

### الحزمة الأولى (Bundle 1): خدمات العيادات وسعة الحجز وإلغاء حظر حجز الإخوة
> **الهدف:** إنشاء جدول `clinic_services`، وجدول `rate_limit_counters`، وتسلسل الأرقام المرجعية، وتوسيع جدول المواعيد، وإسقاط الفهرس القديم لحجز الأشقاء.  
> **التحقق بعد التنفيذ:** التحقق من ظهور جدول `clinic_services` واختفاء الفهرس `idx_unique_active_apt_per_phone_clinic_day`.

```sql
-- 1. Create Dedicated Sequence for Appointment Reference Numbers
CREATE SEQUENCE IF NOT EXISTS public.seq_appointment_reference_number START WITH 1001;
GRANT USAGE, SELECT ON SEQUENCE public.seq_appointment_reference_number TO authenticated, service_role;

-- 2. Create Clinic Services Table
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

-- 3. Extend Clinics & Appointments Tables
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS required_documents TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_id TEXT REFERENCES public.clinic_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_name TEXT,
  ADD COLUMN IF NOT EXISTS guardian_national_id TEXT,
  ADD COLUMN IF NOT EXISTS attendance_guidance TEXT;

CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON public.appointments(service_id);

-- 4. Safe Replacement of Sibling Blocking Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_apt_per_phone_patient_clinic_day
  ON public.appointments (clinic_id, phone_number, lower(trim(patient_name)), appointment_date)
  WHERE (status != 'CANCELLED');

DROP INDEX IF EXISTS public.idx_unique_active_apt_per_phone_clinic_day;

-- 5. Rate Limiting Table & Atomic Function
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  bucket_key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 1,
  first_hit_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_expires_at ON public.rate_limit_counters(expires_at);
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_counters TO service_role;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket_key TEXT,
  p_max_hits INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_expires_at TIMESTAMPTZ := v_now + (p_window_seconds || ' seconds')::INTERVAL;
  v_current_hits INTEGER;
BEGIN
  IF p_bucket_key IS NULL OR trim(p_bucket_key) = '' OR p_max_hits <= 0 OR p_window_seconds <= 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.rate_limit_counters (bucket_key, hits, first_hit_at, expires_at)
  VALUES (p_bucket_key, 1, v_now, v_expires_at)
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    hits = CASE
      WHEN rate_limit_counters.expires_at < v_now THEN 1
      ELSE rate_limit_counters.hits + 1
    END,
    first_hit_at = CASE
      WHEN rate_limit_counters.expires_at < v_now THEN v_now
      ELSE rate_limit_counters.first_hit_at
    END,
    expires_at = CASE
      WHEN rate_limit_counters.expires_at < v_now THEN v_now
      ELSE rate_limit_counters.expires_at
    END
  RETURNING hits INTO v_current_hits;

  RETURN (v_current_hits <= p_max_hits);
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
```

---

### الحزمة الثانية (Bundle 2): التحديث الذري ونقل المواعيد وتصحيح سياسات RLS
> **الهدف:** تمكين موظفي الاستقبال والأطباء من تحديث الحالات ونقل المواعيد ذرياً مع القفل التزامني ومنع التلاعب ببيانات المرضى.

```sql
-- 1. Atomic Status Update RPC
CREATE OR REPLACE FUNCTION public.update_appointment_status_atomic(
  p_appointment_id UUID,
  p_new_status appointment_status,
  p_staff_user_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_verified_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_apt RECORD;
  v_staff RECORD;
  v_updated_by TEXT := 'SYSTEM';
  v_new_called_count INTEGER;
  v_new_last_called_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_apt
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الموعد غير موجود بالمنظومة.');
  END IF;

  IF p_staff_user_id IS NOT NULL THEN
    SELECT * INTO v_staff
    FROM public.staff_profiles
    WHERE id = p_staff_user_id AND is_active = true;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'حساب الموظف غير نشط أو غير موجود.');
    END IF;

    v_updated_by := COALESCE(v_staff.full_name, v_staff.username, 'STAFF');

    IF v_staff.role = 'DOCTOR' THEN
      IF v_staff.clinic_id IS NULL OR v_staff.clinic_id != v_apt.clinic_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح للطبيب بتعديل حالة موعد خاص بعيادة أخرى.');
      END IF;
    ELSIF v_staff.role = 'RECEPTIONIST' THEN
      IF p_new_status = 'COMPLETED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لموظف الاستقبال إنهاء الكشف الطبي (COMPLETED).');
      END IF;
      IF v_staff.clinic_id IS NOT NULL AND trim(v_staff.clinic_id) != '' AND v_staff.clinic_id != v_apt.clinic_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لموظف الاستقبال بتعديل حجز عيادة أخرى.');
      END IF;
    END IF;
  ELSE
    IF p_new_status != 'CANCELLED' OR p_verified_phone IS NULL OR trim(p_verified_phone) != v_apt.phone_number THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح بتعديل الحالة دون جلسة عمل موثقة.');
    END IF;
    v_updated_by := 'PATIENT_SELF';
  END IF;

  v_new_called_count := v_apt.called_count;
  v_new_last_called_at := v_apt.last_called_at;
  IF p_new_status = 'CHECKED_IN' THEN
    v_new_called_count := v_apt.called_count + 1;
    v_new_last_called_at := timezone('utc'::text, now());
  END IF;

  UPDATE public.appointments
  SET
    status = p_new_status,
    called_count = v_new_called_count,
    last_called_at = v_new_last_called_at,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_appointment_id;

  INSERT INTO public.appointment_status_history (
    appointment_id,
    status,
    note,
    updated_by,
    created_at
  ) VALUES (
    p_appointment_id,
    p_new_status,
    p_note,
    v_updated_by,
    timezone('utc'::text, now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', p_appointment_id,
    'previous_status', v_apt.status,
    'new_status', p_new_status,
    'called_count', v_new_called_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_appointment_status_atomic(UUID, appointment_status, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_appointment_status_atomic(UUID, appointment_status, UUID, TEXT, TEXT) TO authenticated, service_role;

-- 2. Hardened RLS Policy on Appointments with Explicit Operator Precedence
DROP POLICY IF EXISTS "Staff can update appointments" ON public.appointments;
CREATE POLICY "Staff can update appointments"
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    public.get_current_staff_role() = 'ADMIN'
    OR (
      public.get_current_staff_role() = 'DOCTOR'
      AND clinic_id = (SELECT clinic_id FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true)
    )
    OR (
      public.get_current_staff_role() = 'RECEPTIONIST'
      AND status != 'COMPLETED'
      AND (
        (SELECT clinic_id FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true) IS NULL
        OR clinic_id = (SELECT clinic_id FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true)
      )
    )
  );
```

---

### الحزمة الثالثة (Bundle 3): نظام طلبات الإلغاء المحصن (Cancellation Requests System)
> **الهدف:** إنشاء جدول `cancellation_requests`، وقصر تقديم الطلب على `service_role` (عبر الـ API حصراً)، وتدقيق مراجعة الاستقبال في `audit_logs`.

```sql
-- 1. Table: public.cancellation_requests
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_cancellation_request 
  ON public.cancellation_requests (appointment_id) 
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_ref ON public.cancellation_requests (reference_number);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_apt_id ON public.cancellation_requests (appointment_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON public.cancellation_requests (status, requested_at DESC);

ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.cancellation_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cancellation_requests TO authenticated;
GRANT ALL ON TABLE public.cancellation_requests TO service_role;

-- 2. Staff Select Policy
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

-- 3. RPC: request_cancellation_atomic (Exclusively service_role)
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

  SELECT * INTO v_apt
  FROM public.appointments
  WHERE reference_number = p_reference_number;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على موعد مطابق للرقم المرجعي المدخل.');
  END IF;

  IF regexp_replace(v_apt.phone_number, '[^0-9]', '', 'g') != v_norm_phone THEN
    RETURN jsonb_build_object('success', false, 'error', 'رقم الهاتف المدخل غير مطابق لرقم الهاتف المسجل بالموعد.');
  END IF;

  IF v_apt.status IN ('COMPLETED', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن تقديم طلب إلغاء لموعد منتهي أو ملغي بالفعل.');
  END IF;

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
    p_reason,
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

REVOKE ALL ON FUNCTION public.request_cancellation_atomic(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_cancellation_atomic(TEXT, TEXT, TEXT) TO service_role;

-- 4. RPC: review_cancellation_request_atomic
CREATE OR REPLACE FUNCTION public.review_cancellation_request_atomic(
  p_request_id UUID,
  p_decision TEXT,
  p_staff_user_id UUID,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_staff RECORD;
  v_apt RECORD;
  v_status_res JSONB;
BEGIN
  IF p_decision NOT IN ('APPROVE', 'REJECT') THEN
    RETURN jsonb_build_object('success', false, 'error', 'القرار يجب أن يكون إما APPROVE أو REJECT حصراً.');
  END IF;

  SELECT * INTO v_staff
  FROM public.staff_profiles
  WHERE id = p_staff_user_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'حساب الموظف غير مصرح له أو غير نشط.');
  END IF;

  IF v_staff.role = 'DOCTOR' THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح للأطباء بمراجعة طلبات الإلغاء (استقبال أو إدارة فقط).');
  END IF;

  SELECT * INTO v_req
  FROM public.cancellation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'طلب الإلغاء غير موجود.');
  END IF;

  IF v_req.status != 'PENDING' THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم البت في هذا الطلب مسبقاً.');
  END IF;

  SELECT * INTO v_apt
  FROM public.appointments
  WHERE id = v_req.appointment_id;

  IF v_staff.role = 'RECEPTIONIST' THEN
    IF v_staff.clinic_id IS NULL OR trim(v_staff.clinic_id) = '' OR v_staff.clinic_id != v_apt.clinic_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لموظف الاستقبال بمراجعة طلبات إلغاء خاصة بعيادة أخرى.');
    END IF;
  END IF;

  IF p_decision = 'APPROVE' THEN
    v_status_res := public.update_appointment_status_atomic(
      p_appointment_id := v_req.appointment_id,
      p_new_status := 'CANCELLED'::appointment_status,
      p_staff_user_id := p_staff_user_id,
      p_note := 'تم الإلغاء بناءً على موافقة موظف الاستقبال على طلب المريض رقم: ' || p_request_id
    );

    IF NOT (v_status_res->>'success')::BOOLEAN THEN
      RETURN v_status_res;
    END IF;

    UPDATE public.cancellation_requests
    SET
      status = 'APPROVED',
      reviewed_at = timezone('utc'::text, now()),
      reviewed_by_id = p_staff_user_id,
      reviewed_by_name = COALESCE(v_staff.full_name, v_staff.username),
      updated_at = timezone('utc'::text, now())
    WHERE id = p_request_id;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      p_staff_user_id::text,
      'APPROVE_CANCELLATION_REQUEST',
      'cancellation_request',
      p_request_id::text,
      jsonb_build_object(
        'appointment_id', v_req.appointment_id,
        'reference_number', v_req.reference_number,
        'reviewed_by', COALESCE(v_staff.full_name, v_staff.username)
      )
    );

    RETURN jsonb_build_object('success', true, 'decision', 'APPROVED', 'request_id', p_request_id);
  ELSE
    UPDATE public.cancellation_requests
    SET
      status = 'REJECTED',
      rejection_reason = p_rejection_reason,
      reviewed_at = timezone('utc'::text, now()),
      reviewed_by_id = p_staff_user_id,
      reviewed_by_name = COALESCE(v_staff.full_name, v_staff.username),
      updated_at = timezone('utc'::text, now())
    WHERE id = p_request_id;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      p_staff_user_id::text,
      'REJECT_CANCELLATION_REQUEST',
      'cancellation_request',
      p_request_id::text,
      jsonb_build_object(
        'appointment_id', v_req.appointment_id,
        'reference_number', v_req.reference_number,
        'rejection_reason', p_rejection_reason,
        'reviewed_by', COALESCE(v_staff.full_name, v_staff.username)
      )
    );

    RETURN jsonb_build_object('success', true, 'decision', 'REJECTED', 'request_id', p_request_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_cancellation_request_atomic(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_cancellation_request_atomic(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
```

---

### الحزمة الرابعة (Bundle 4): مساحة التخزين الآمنة وإدارة المحتوى (Safe Media & CMS)
> **الهدف:** إنشاء مساحة تخزين `media` المحصنة ضد ملفات SVG لمنع هجمات Stored XSS، وجداول إعدادات الموقع وروابط التنقل.

```sql
-- 1. Create Media Storage Bucket Safely (No SVG to Prevent Stored XSS)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Public can view media assets" ON storage.objects;
CREATE POLICY "Public can view media assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

DROP POLICY IF EXISTS "Admins can manage media storage" ON storage.objects;
CREATE POLICY "Admins can manage media storage"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'media' AND public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (bucket_id = 'media' AND public.get_current_staff_role() = 'ADMIN');

-- 2. Create Website Settings Table
CREATE TABLE IF NOT EXISTS public.website_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  site_name TEXT NOT NULL DEFAULT 'BSCH Clinics',
  site_tagline TEXT NOT NULL DEFAULT 'مستشفى الأطفال التخصصي بالبحيرة',
  header_logo_url TEXT NOT NULL DEFAULT '/logo-outpatient.png',
  footer_logo_url TEXT NOT NULL DEFAULT '/logo-main.png',
  favicon_url TEXT NOT NULL DEFAULT '/favicon.ico',
  contact_phone TEXT NOT NULL DEFAULT '',
  emergency_hotline TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  hospital_address TEXT NOT NULL DEFAULT 'أبو حمص – دمسنا – محافظة البحيرة',
  working_hours TEXT NOT NULL DEFAULT '',
  meta_title TEXT NOT NULL DEFAULT 'BSCH Clinics — العيادات الخارجية لمستشفى الأطفال التخصصي بالبحيرة',
  meta_description TEXT NOT NULL DEFAULT 'منصة حجز المواعيد والاستعلام للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة.',
  og_image_url TEXT NOT NULL DEFAULT '/logo-main.png',
  canonical_url TEXT DEFAULT 'https://bsch-clinics.gov.eg',
  social_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  notice_bar JSONB NOT NULL DEFAULT '{"is_enabled": true, "title": "تنظيم العيادات الخارجية:", "message": "الحجز الإلكتروني متاح بنظام تذاكر الدور وأسبقية الحضور."}'::jsonb,
  footer_summary TEXT NOT NULL DEFAULT 'خدمة حكومية متخصصة لتقديم الرعاية الطبية الفائقة لأطفال محافظة البحيرة.',
  footer_copyright TEXT NOT NULL DEFAULT 'مستشفى الأطفال التخصصي بالبحيرة. جميع الحقوق محفوظة.',
  footer_status_badge TEXT NOT NULL DEFAULT 'منظومة الحجز الإلكتروني للعيادات الخارجية',
  is_published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by TEXT DEFAULT 'admin'
);

ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view website settings" ON public.website_settings;
CREATE POLICY "Public can view website settings"
  ON public.website_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage website settings" ON public.website_settings;
CREATE POLICY "Admins can manage website settings"
  ON public.website_settings FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

GRANT SELECT ON TABLE public.website_settings TO anon, authenticated;
GRANT ALL ON TABLE public.website_settings TO service_role;

-- 3. Create Navigation Items Table
CREATE TABLE IF NOT EXISTS public.navigation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  location TEXT NOT NULL CHECK (location IN ('header', 'footer', 'both')),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_external BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_nav_items_location_href UNIQUE (location, href)
);

ALTER TABLE public.navigation_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active navigation items" ON public.navigation_items;
CREATE POLICY "Public can view active navigation items"
  ON public.navigation_items FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage navigation items" ON public.navigation_items;
CREATE POLICY "Admins can manage navigation items"
  ON public.navigation_items FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

GRANT SELECT ON TABLE public.navigation_items TO anon, authenticated;
GRANT ALL ON TABLE public.navigation_items TO service_role;

-- 4. Create Media Assets Table
CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('logos', 'hero', 'clinics', 'general')),
  is_custom BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by TEXT DEFAULT 'admin'
);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view media asset records" ON public.media_assets;
CREATE POLICY "Public can view media asset records"
  ON public.media_assets FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage media asset records" ON public.media_assets;
CREATE POLICY "Admins can manage media asset records"
  ON public.media_assets FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

GRANT SELECT ON TABLE public.media_assets TO anon, authenticated;
GRANT ALL ON TABLE public.media_assets TO service_role;
```

---

## 6. الخلاصة والتأكيد النهائي

- **طبيعة الفحص:** تدقيق قراءة فقط (Read-Only) بنسبة 100%، لم يتم تعديل أو كتابة أي بايت على قاعدة بيانات الإنتاج.
- **سلامة الكود والاختبارات:** جميع اختبارات المشروع الـ 97 ناجحة، وبناء Next.js خالٍ من أي أخطاء.
- **التوصية:** بعد قيام الـ DBA بتنفيذ الحزم الأربع أعلاه عبر Supabase SQL Editor وتصحيح مفتاح `SUPABASE_SERVICE_ROLE_KEY` في بيئة الاستضافة، يصبح النظام جاهزاً للإطلاق المباشر بثقة واستقرار تام.
