# BSCH Clinics — خطة بذر البيانات واعتماد التشغيل (Database Seed & Governance Plan)
## مستشفى الأطفال التخصصي بدمسنا — محافظة البحيرة

---

## 1. الفلسفة المعمارية والرقابية للبيانات (Data Governance Principles)

تم تصميم وتطبيق مبدأ **عزل البيانات الاسترشادية عن البيانات المعتمدة** (Provisional vs Confirmed Segregation) لحماية المستشفى قانونياً وطبياً وتشغيلياً.

> [!IMPORTANT]
> **قاعدة حظر الاعتماد التلقائي (Zero-Trust Provisioning):**
> لا يجوز لأي برنامج نصي (Migration / Seed Script) إدراج أي عيادة أو خدمة طبية أو مواعيد تشغيل أو تعليمات تحضيرية بحالة `is_hospital_confirmed = true` أو `is_active = true` بشكل افتراضي دون توقيع واعتماد خطي من إدارة المستشفى والفريق الطبي المختص.

### تصنيف حالات البيانات:
| نوع البيان | الحالة الافتراضية في الـ Seed | شرط التفعيل في الإنتاج | أداة التفعيل |
| :--- | :--- | :--- | :--- |
| **العيادات التخصصية** (`clinics`) | `is_hospital_confirmed = false` | مراجعة واعتماد مدير العيادات | لوحة تحكم الإدارة (`Staff CMS`) أو استعلام SQL إداري |
| **الخدمات التخصصية** (`clinic_services`) | `is_active = false` | اعتماد رئيس القسم الطبي المختص | شاشة إدارة الخدمات باللوحة |
| **تعليمات التحضير الطبي** (`instructions`) | مسودة استرشادية (`DRAFT`) | تدقيق الاستشاريين وخلوها من مواعيد صيام حتمية | محرّر المحتوى الطبي باللوحة |
| **حسابات الموظفين** (`staff_profiles`) | تتطلب استدعاء `provision_staff_member` | التحقق من هوية الطبيب/الموظف الفعلية | Supabase SQL Editor أو مسار الإدارة المحمي |

---

## 2. تفاصيل العيادات الاسترشادية (11 عيادة تخصصية)

يتضمن ملف `supabase/seed.sql` بيانات العيادات التخصصية المخططة لمستشفى الأطفال التخصصي بدمسنا:

```sql
-- مثال توثيقي على حماية الاعتماد:
INSERT INTO public.clinics (
  id, name, description, location, working_hours, days_of_week,
  max_daily_slots, slot_duration_minutes, instructions, is_active, is_hospital_confirmed
)
VALUES (
  'cardio', 'عيادة قلب الأطفال',
  'تشخيص ومتابعة أمراض صمامات القلب والعيوب الخلقية وضغط الدم',
  'الدور الرابع - عيادة 1', '08:30-14:00', '{0,1,2,3,4,6}',
  18, 30, 'يرجى مراجعة قياس النبض في غرفة العلامات الحيوية بالدور الأرضي أولاً.',
  true, false -- is_hospital_confirmed = false إلزامية
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
  is_active = EXCLUDED.is_active,
  is_hospital_confirmed = clinics.is_hospital_confirmed, -- الحفاظ على حالة الاعتماد السابقة
  updated_at = timezone('utc'::text, now())
WHERE clinics.is_hospital_confirmed = false;
```

### جدول العيادات الاسترشادية:
1. **عيادة الأسنان (`dentistry`):** الدور الأرضي - عيادة 1 (سعة 20 حالة/يوم).
2. **عيادة الإيكو (`echo`):** الدور الرابع - أمام عيادة القلب (سعة 15 حالة/يوم).
3. **عيادة التغذية العلاجية (`nutrition`):** الدور الثالث - عيادة 3 (سعة 20 حالة/يوم).
4. **عيادة الجهاز الهضمي والكبد (`gi`):** الدور الثاني - عيادة 6 (سعة 20 حالة/يوم).
5. **عيادة السمعيات (`audiology`):** الدور الأرضي - عيادة 4 (سعة 15 حالة/يوم).
6. **عيادة المخ والأعصاب (`neuro`):** الدور الرابع - عيادة 2 (سعة 15 حالة/يوم).
7. **عيادة قلب الأطفال (`cardio`):** الدور الرابع - عيادة 1 (سعة 18 حالة/يوم).
8. **عيادة جراحة الأطفال (`surgery`):** الدور الثاني - عيادة 2 (سعة 20 حالة/يوم).
9. **عيادة الغدد الصماء والنمو (`growth`):** عيادة تخصصية إضافية (سعة 15 حالة/يوم).
10. **عيادة التخاطب وتنمية المهارات (`phonetics`):** عيادة تخصصية إضافية (سعة 15 حالة/يوم).
11. **عيادة الكلى والمسالك البولية للأطفال (`nephrology`):** عيادة تخصصية إضافية (سعة 15 حالة/يوم).

---

## 3. خطة تأهيل حسابات الموظفين (Staff Provisioning Plan)

أظهر الفحص الدقيق لقاعدة البيانات البعيدة وجود حسابين مسجلين في جدول المصادقة الداخلي `auth.users`، بينما جدول `public.staff_profiles` فارغ حالياً (0 سجلات).

### خطوات ربط الحسابين الموجودين (`auth.users` -> `staff_profiles`):

1. **الاستعلام عن معرّفات الحسابات (Read-Only):**
   يقوم مسؤول النظام في Supabase Dashboard بتشغيل الاستعلام التالي لمعرفة البريد الإلكتروني و `id` لكل حساب:
   ```sql
   SELECT id, email, created_at, last_sign_in_at 
   FROM auth.users 
   ORDER BY created_at ASC;
   ```

2. **ربط حساب المدير العام (System Administrator):**
   باستخدام دالة `provision_staff_member` المحمية عبر SQL Editor:
   ```sql
   SELECT public.provision_staff_member(
     p_user_id   => '<USER_UUID_FOR_ADMIN>'::uuid,
     p_username  => 'admin',
     p_full_name => 'إدارة النظم والمعلومات — مستشفى الأطفال',
     p_role      => 'ADMIN',
     p_clinic_id => NULL
   );
   ```

3. **ربط حساب موظف الاستقبال أو الطبيب:**
   ```sql
   SELECT public.provision_staff_member(
     p_user_id   => '<USER_UUID_FOR_STAFF>'::uuid,
     p_username  => 'reception.main',
     p_full_name => 'فريق الاستقبال الرئيسي',
     p_role      => 'RECEPTIONIST',
     p_clinic_id => NULL
   );
   ```

4. **التحقق من صحة الربط:**
   ```sql
   SELECT sp.id, sp.username, sp.full_name, sp.role, sp.clinic_id, sp.is_active, u.email
   FROM public.staff_profiles sp
   JOIN auth.users u ON sp.id = u.id;
   ```

> [!WARNING]
> **إجراء أمني حتمي:** يجب التأكد من تعطيل خيار التسجيل الذاتي (Disable "Allow new users to sign up") في إعدادات **Supabase Dashboard -> Authentication -> Providers -> Email**، لمنع أي شخص خارجي من إنشاء حساب مستخدم.

---

## 4. خطة مراجعة واعتماد التعليمات الطبية والخدمات

### أولاً: التعليمات الطبية (`clinic_instructions_DRAFT.sql`)
- تم عزل التعليمات الطبية الاسترشادية في مسار مسودة `supabase/seed/clinic_instructions_DRAFT.sql`.
- **المعايير المطبقة:**
  1. حذف أي أوقات صيام محددة بدقة (ساعات معينة) قد تشكل خطراً على الأطفال الرضع أو مرضى السكري.
  2. استبدال التوجيهات الدوائية بعبارة: *"التعليمات الخاصة بالأدوية والصيام يحددها الطبيب المعالج فقط بالاتصال بالمستشفى"*.
  3. حصر التعليمات المقترحة على الأوراق الثبوتية (شهادة الميلاد، بطاقة التأمين، الفحوصات والأشعات السابقة، الملابس الفضفاضة، والحضور قبل الموعد بـ 15-30 دقيقة).

### ثانياً: الخدمات التخصصية (`clinic_services_DRAFT.sql`)
- تشتمل المسودة على 12 خدمة تخصصية موزعة على العيادات.
- يتم إدراج جميع الخدمات بحالة `is_active = false`.
- **بروتوكول التفعيل:**
  1. يقوم استشاري العيادة بمراجعة قائمة الخدمات المخصصة لعيادته.
  2. يقوم مدير العيادات بالدخول إلى لوحة التحكم -> إدارة الخدمات.
  3. تفعيل الخدمات المعتمدة رسمياً وتحويل حالتها إلى نشطة (`is_active = true`).

---

## 5. استعلام اعتماد العيادات بعد المراجعة الإدارية (Post-Approval SQL)

عند صدور القرار الإداري باعتماد جدول تشغيل وسعة العيادات، ينفذ مسؤول قاعدة البيانات الاستعلام التالي لنقل العيادات من الحالة الاسترشادية إلى الحالة المعتمدة:

```sql
BEGIN;

-- اعتماد العيادات رسمياً
UPDATE public.clinics
SET 
  is_hospital_confirmed = true,
  updated_at = timezone('utc'::text, now())
WHERE id IN (
  'cardio', 'echo', 'dentistry', 'neuro', 
  'gi', 'nutrition', 'audiology', 'surgery'
);

-- تسجيل إجراء الاعتماد في سجل التدقيق الإداري
INSERT INTO public.audit_logs (
  user_id, action, entity_type, entity_id, details
)
VALUES (
  auth.uid(), -- أو NULL إذا نُفذ من SQL Editor
  'HOSPITAL_CONFIRMATION',
  'clinics',
  'ALL_ACTIVE',
  jsonb_build_object(
    'confirmed_at', timezone('utc'::text, now()),
    'confirmed_by', 'Hospital Administration Board',
    'status', 'OFFICIALLY_CONFIRMED'
  )
);

COMMIT;
```

