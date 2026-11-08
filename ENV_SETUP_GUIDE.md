# دليل إعداد المتغيرات البيئية وربط النظام
### Environment Variables Setup & Configuration Guide
**نظام حجز العيادات الخارجية — مستشفى الأطفال التخصصي بالبحيرة (BSCH Clinics)**

---

مرحباً بك! تم إعداد هذا الدليل لتمكينك (أو فريق تقنية المعلومات بالمستشفى) من تهيئة وربط المتغيرات البيئية للنظام بسهولة تامة، سواءً لتشغيل المشروع محلياً على جهازك الخاص أو لنشره على منصة الاستضافة السحابية **Vercel** مع ربطه بقاعدة بيانات **Supabase**.

---

## 📌 الفهرس
1. [نظرة عامة على المتغيرات البيئية](#1-نظرة-عامة-على-المتغيرات-البيئية)
2. [استخراج المفاتيح من لوحة تحكم Supabase](#2-استخراج-المفاتيح-من-لوحة-تحكم-supabase)
3. [الإعداد للتشغيل المحلي (Local Development)](#3-الإعداد-للتشغيل-المحلي-local-development)
4. [الإعداد للنشر على Vercel (Production Deployment)](#4-الإعداد-للنشر-على-vercel-production-deployment)
5. [توليد المفاتيح المشفرة للأمان (Security Keys)](#5-توليد-المفاتيح-المشفرة-للأمان)
6. [الجدول المرجعي لكافة المتغيرات (Master Reference Table)](#6-الجدول-المرجعي-لكافة-المتغيرات)
7. [إرشادات الأمان الهامة (Security Best Practices)](#7-إرشادات-الأمان-الهامة)

---

## 1. نظرة عامة على المتغيرات البيئية

يحتاج نظام العيادات إلى مجموعة من المفاتيح السرية والروابط لكي يتصل بقاعدة البيانات ويؤمن جلسات الموظفين:
- **متغيرات عامة (Public):** تبدأ بـ `NEXT_PUBLIC_` ويراها المتصفح (مثل رابط قاعدة البيانات ومفتاح القراءة العام).
- **متغيرات سرية (Server-Only Secrets):** تعمل حصرياً داخل خوادم Next.js ولا تظهر أبداً في كود المتصفح (مثل مفتاح مدير النظام المشفر وكلمات سر تشفير الجلسات).

الملف المرجعي المرفق في المشروع هو [`.env.example`](file:///.env.example)، وهو يحتوي على هيكل كافة المتغيرات بدون أي بيانات حقيقية.

---

## 2. استخراج المفاتيح من لوحة تحكم Supabase

قم بتسجيل الدخول إلى حسابك في [Supabase Dashboard](https://supabase.com/dashboard) ثم اختر مشروع المستشفى واتبع الخطوات التالية:

### أ. استخراج رابط المشروع والمفتاح العام (Project URL & Anon Key)
1. من القائمة الجانبية في أقصى اليسار، اضغط على أيقونة الترس **Project Settings** (إعدادات المشروع).
2. اختر من القائمة الفرعية **API**.
3. ستجد قسمين رئيسيين:
   - **Project URL:** انسخ الرابط كاملاً، وسيكون بقيمة مثل: `https://xyzcompany.supabase.co` (هذا هو `NEXT_PUBLIC_SUPABASE_URL`).
   - **Project API keys:** ابحث عن المفتاح المسمى **`anon` / `public`** واضغط زر **Copy** (هذا هو `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

### ب. استخراج المفتاح الإداري السري (Service Role Secret Key)
> ⚠️ **تحذير أمني شديد الأهمية:** هذا المفتاح يملك صلاحيات إدارية كاملة لتخطي قيود الأمان RLS وتسجيل الحجوزات، إياك ومشاركته أو نشره في أي مكان عام.

1. في نفس صفحة **Project Settings -> API**.
2. تحت قسم **Project API keys**، ابحث عن المفتاح المسمى **`service_role` / `secret`**.
3. اضغط على أيقونة العين **Reveal** لإظهاره ثم اضغط **Copy**.
4. هذا المفتاح يمثل قيمة كل من `SUPABASE_SERVICE_ROLE_KEY` و `SUPABASE_SECRET_KEY`.

### ج. استخراج رابط الاتصال المباشر بقاعدة البيانات (Database Connection URL)
1. من نفس القائمة الجانبية، اذهب إلى **Project Settings -> Database**.
2. انزل للأسفل حتى تجد قسم **Connection string**.
3. اختر تبويب **URI**.
4. اختر وضع **Transaction pooler** (يعمل على المنفذ `6543` وهو الأنسب لخوادم Vercel السحابية).
5. انسخ الرابط وضع كلمة مرور قاعدة البيانات بدلاً من `[YOUR-PASSWORD]` (هذا هو `DATABASE_URL`).

---

## 3. الإعداد للتشغيل المحلي (Local Development)

إذا كنت ترغب في تشغيل النظام وتجربته على جهاز الكمبيوتر الخاص بك:

### الخطوة 1: إنشاء ملف الإعدادات المحلي
قم بعمل نسخة من ملف `.env.example` وقم بتسميتها `.env.local` عبر سطر الأوامر (Terminal):

```bash
# على أنظمة Windows (PowerShell) أو Mac / Linux:
cp .env.example .env.local
```

### الخطوة 2: فتح الملف ولصق القيم
افتح ملف `.env.local` الجديد باستخدام أي محرر نصوص (مثل VS Code أو Notepad) وضع المفاتيح التي نسختها من Supabase:

```env
# رابط المشروع
NEXT_PUBLIC_SUPABASE_URL="https://your-project-id.supabase.co"

# المفتاح العام
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# المفتاح الإداري السري
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SECRET_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# مفاتيح التشفير العشوائية (انظر القسم 5 لتوليدها)
STAFF_SESSION_SECRET="ضع_هنا_نص_عشوائي_طويل_مكون_من_32_حرف_أو_أكثر"
OTP_HASH_SECRET="ضع_هنا_نص_عشوائي_آخر_مكون_من_32_حرف"

# رابط التطبيق المحلي
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
APP_URL="http://localhost:3000"
```

### الخطوة 3: تشغيل خادم التطوير
```bash
npm run dev
```
افتح المتصفح وتوجه إلى `http://localhost:3000`. ستجد الموقع يعمل ويتصل بقاعدة البيانات مباشرة.

---

## 4. الإعداد للنشر على Vercel (Production Deployment)

عند رفع المشروع على حسابك في [Vercel](https://vercel.com):

### الخطوة 1: التوجه لصفحة إعدادات المشروع
1. ادخل على لوحة تحكم Vercel Dashboard واختر مشروع العيادات (`bsch-clinics`).
2. اضغط على تبويب **Settings** في الشريط العلوي.
3. من القائمة الجانبية اليسرى، اضغط على **Environment Variables**.

### الخطوة 2: إضافة المتغيرات
لكل متغير من المتغيرات المطلوبة:
1. في حقل **Key**: اكتب اسم المتغير (مثلاً: `NEXT_PUBLIC_SUPABASE_URL`).
2. في حقل **Value**: الصق القيمة المقابلة له.
3. في خيارات البيئات **Environments**: تأكد من تحديد الثلاثة خيارات:
   - ✅ **Production**
   - ✅ **Preview**
   - ✅ **Development**
4. اضغط على زر **Save** لحفظ المتغير.

كرر نفس الخطوة مع باقي المتغيرات الأساسية:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SECRET_KEY`
- `STAFF_SESSION_SECRET`
- `OTP_HASH_SECRET`
- `NEXT_PUBLIC_SITE_URL` (ضعه برابط النطاق الفعلي للمستشفى مثل `https://bsch-clinics.vercel.app`)
- `APP_URL` (نفس الرابط السابق)

### الخطوة 3: إعادة بناء ونشر المشروع (Redeploy)
بعد حفظ جميع المتغيرات:
1. اذهب إلى تبويب **Deployments** في Vercel.
2. اضغط على القائمة ذات النقاط الثلاث `...` بجانب أحدث Deployment.
3. اختر **Redeploy**.
4. انتظر دقيقة واحدة حتى يكتمل البناء، وسيتم تفعيل كافة المتغيرات فوراً.

---

## 5. توليد المفاتيح المشفرة للأمان

يحتاج النظام إلى مفتاحين عشوائيين مشفرين لتأمين جلسات الأطباء والاستقبال (`STAFF_SESSION_SECRET`) وتأمين رموز التأكيد (`OTP_HASH_SECRET`).

يمكنك توليد نصوص عشوائية قوية جداً بنقرة واحدة عبر كتابة هذا الأمر في سطر الأوامر (Terminal):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

سينتج لك كود عشوائي قوي مثل:
`e8f4a13c9b7d52a8041c2f9d8a3b5c7e1f4a9b2d8c6e3f5a7b9c1d3e5f7a9b1c`

استخدم كوداً لـ `STAFF_SESSION_SECRET`، وشغّل الأمر مرة أخرى واستخدم الناتج الجديد لـ `OTP_HASH_SECRET`.

---

## 6. الجدول المرجعي لكافة المتغيرات

| اسم المتغير البيئي | النوع والسرية | الوصف ومكان الاستخدام | من أين تحصل عليه؟ |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | **عام (Public)** | رابط قاعدة بيانات Supabase الخاصة بالمستشفى | Supabase -> Settings -> API -> Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **عام (Public)** | مفتاح الاتصال العام المسموح به للمتصفحات | Supabase -> Settings -> API -> `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | **سري للغاية (Secret)** | مفتاح الإدارة الكاملة للعمليات الذرية وتأكيد الحجز | Supabase -> Settings -> API -> `service_role` |
| `SUPABASE_SECRET_KEY` | **سري للغاية (Secret)** | اسم بديل لنفس المفتاح الإداري السابق | نفس قيمة `SUPABASE_SERVICE_ROLE_KEY` |
| `DATABASE_URL` | **سري (Secret)** | نص الاتصال المباشر بقاعدة بيانات PostgreSQL | Supabase -> Settings -> Database -> URI |
| `STAFF_SESSION_SECRET` | **سري (Secret)** | مفتاح تشفير وتوقيع جلسات الدخول للموظفين | يتم توليده عشوائياً (قسم 5) |
| `OTP_HASH_SECRET` | **سري (Secret)** | مفتاح حساب الـ Hash لمنع هجمات التوقيت | يتم توليده عشوائياً (قسم 5) |
| `NEXT_PUBLIC_SITE_URL` | **عام (Public)** | النطاق الرسمي الفعلي للموقع بالإنتاج | رابط Vercel أو الدومين الخاص بالمستشفى |
| `APP_URL` | **عام (Public)** | رابط التطبيق الأساسي للخدمات الداخلية | نفس رابط النطاق الرسمي أعلاه |
| `STAFF_AUTH_DOMAIN` | **اختياري** | النطاق الافتراضي الداخلي لحسابات الموظفين | افتراضياً: `staff.bsch.local` |
| `TURNSTILE_SECRET_KEY` | **اختياري** | مفتاح الحماية من الروبوتات (Cloudflare Turnstile) | Cloudflare Dashboard (في حال تفعيله) |

---

## 7. إرشادات الأمان الهامة

1. ⛔ **لا ترفع ملف `.env.local` على Git مطلقاً:** ملف `.env.local` تم تضمينه مسبقاً في ملف التجاهل `.gitignore` لحمايتك من رفعه بالخطأ.
2. 🔄 **في حال تسريب أي مفتاح إداري:** توجه فوراً إلى Supabase Dashboard -> Project Settings -> API واضغط على **Roll API Keys** لإبطال المفتاح القديم وإنشاء مفتاح جديد وتحديثه على Vercel.
3. 🔒 **حسابات مديري النظام (Admins):** احرص على استخدام كلمات مرور معقدة لحسابات الموظفين، ولا تمنح صلاحية `ADMIN` إلا للمسؤولين المعتمدين في إدارة المستشفى.

---
**فريق التطوير الفني — مستشفى الأطفال التخصصي بالبحيرة**  
تاريخ الإصدار: نوفمبر 2026
