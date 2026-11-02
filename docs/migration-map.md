# خريطة ترحيل وظائف BSCH إلى Next.js وSupabase

هذه خريطة تغطية داخلية مستخرجة من فحص جميع مجموعات ملفات المشروع الأصلي. الحالة الافتراضية «مفتوح» إلى أن يوجد تنفيذ واختبار موثق؛ ذكر وجهة التنفيذ هنا لا يعني أن الوظيفة اكتملت.

| الوظيفة القديمة / مصدرها | النقل المقصود في المشروع الجديد | قيود التكافؤ أو الحالة |
|---|---|---|
| واجهة HTML أحادية الصفحة، RTL، الرئيسية والحجز والمتابعة والموظفين؛ `templates/index.html`, `static/app.js` | صفحات App Router: `/`, `/book`, `/track`, `/staff/*`، مكونات مشتركة في `src/components` | حفظ الاسم «العيادات الخارجية»، المستشفى والهوية الأصلية، تجاوب الهاتف والكمبيوتر والتابلت. |
| ملفات الهوية والأنماط والطباعة، `static/app.css`, `static/hospital-logo.png`, `static/hero.png`, الأيقونات | CSS/Tailwind منظم مع الأصول المنسوخة إلى `public/images`; نمط RTL؛ print CSS للإيصال والتقرير | ألوان الأصل: `#0f948b`, `#087b74`, `#173c45`, `#f7fafb`; الحفاظ على تعليمات الطباعة A4. |
| `home`, `manus-routes` ومحتوى PWA (`static/manifest.json`, `static/sw.js`) | `src/app/page.tsx`, `public/manus-routes.json`, إعداد manifest/metadata؛ Service Worker يقتصر على shell والأصول العامة | لا تُخزّن استجابات API أو بيانات مرضى/موظفين في Cache. |
| تسجيل الدخول والخروج، `/api/login`, `/api/logout`, `/api/me`; أدوار `founder/booking/doctor/nurse` | Supabase Auth، `staff_profiles`, `clinic_staff_assignments`, middleware/server guards | الدور الجديد `admin` للمدير؛ لا حسابات أو كلمات مرور افتراضية؛ نطاق الطبيب/التمريض بالعيادة. |
| إعدادات النظام ونمط التشغيل، `/api/runtime`, `/api/settings`, `/api/settings/password` | `system_settings` وسياسات/Route Handlers إدارية تحت `/staff/settings` | لا يسمح تعطيل الحجز العام من الواجهة فقط؛ يفرض قرار الحجز العام في RPC. |
| إدارة الحسابات، `/api/users` (GET/POST/PATCH/DELETE) | دعوات Supabase Auth من عملية server-only؛ `staff_profiles` وأدوار وربط العيادات | ممنوع self-signup للموظفين أو self-promotion؛ `service_role` على الخادم فقط. |
| قوائم العيادات والخدمات، `Clinics`, `services_json`, `/api/clinics` | `clinics`, `clinic_services`, `/staff/clinics`، CRUD Server Actions/RPCs | كل الحقول قابلة للتحرير بدون نشر؛ الخدمات المباشرة متاحة داخليًا فقط. |
| أيام العمل الأسبوعية، `work_days`, الجداول والمواعيد، `/api/clinics/:id/schedule` | `clinic_workdays` بمعيار ISO الاثنين=1 إلى الأحد=7؛ إدارة أيام العمل/الساعات | تعارض ترقيم المصدر لا ينتقل؛ يعتمد الجدول المحدد بأسماء الأيام في المواصفات. لا يضاف حقل ساعة موعد للمريض. |
| العطلات والإغلاقات والأيام الاستثنائية بسعة، `ClinicClosures`, `ClinicSpecialDays`, `/special-days`, `/closures` | `clinic_holidays` و/أو `clinic_special_days`, إدارة أحداث اليوم | اليوم الخاص يسمح العمل خارج الجدول عند تعريفه؛ الإغلاق يمنع حجوزات جديدة ولا يمحو الحجوزات القائمة. |
| التوافر والسعة وساعات الخدمة والأطباء، `/availability`, `service-schedules`, `doctors` | حساب server-side/RPC من العيادة واليوم والخدمة واليوم الخاص؛ `clinic_service_schedules`, `clinic_staff_assignments` حسب الحاجة | حد العيادة إجمالي مشترك؛ حد الخدمة فرعي؛ Pending وConfirmed يستهلكان السعة؛ قيود/قفل ذري ضد السباق. |
| الحجوزات العامة دون حساب، `/api/bookings` | صفحة `/book` + RPC `create_public_booking`/Route Handler خادمي | الاسم/العمر/العنوان/الهاتف/العيادة/الخدمة/اليوم؛ الحالة الأولية في انتظار التأكيد؛ لا حجز بساعة ولا تسريب PII؛ منع التكرار والسعة. |
| الحجز الداخلي، `/api/bookings/internal` وواجهة الموظفين | `/staff/bookings/new` + RPC بامتيازات موظف الحجز/المدير | حجز مؤكد حسب سياسة المصدر وبلا استخدام بيانات حقيقية في الاختبار. |
| التحقق من التكرار، `similar_bookings`, `validate_booking` | تحقق قابل للاختبار في `src/lib/booking` بالإضافة إلى RPC/قيود PostgreSQL | تجاهل Cancelled/NoShow، وتطبيع الهاتف/الاسم؛ المعيار الذي يطلبه المستخدم يطبّق في قاعدة البيانات أيضًا. |
| التأكيد والإلغاء وإعادة الجدولة، `/confirm`, `/cancel`, `/reschedule` | عمليات خادمية/RPC مع `booking_status_history` و`audit_logs` | مخول فقط، تحقق من الحالة والسعة الجديدة؛ الإلغاء يبقي تاريخ الحجز والسجل الداخلي. |
| متابعة الحجز برقم الهاتف، `/track?phone=...` | `/track` برمز متابعة عشوائي عالي العشوائية أو OTP؛ لا بحث عام بالهاتف وحده | لا تعرض إلا حجوزات حامل الرمز، وتخفي الملغاة من قائمة المريض إن طابق سلوك المصدر؛ لا تعرض رقم الطابور. |
| إيصال تأكيد الحجز، `/confirmation`, `booking_json`, print | `/receipt/[token]` مع تحقق من ملكية/سر الرمز، print CSS A4 | المستشفى والنظام والبيانات الضرورية والعيادة والخدمة واليوم والحالة والأوراق والتعليمات؛ لا ساعة أو رقم انتظار أو PII غير لازم. |
| رقم الطابور، `assign_queue`, QueueEntries | `queue_counters` بقفل/تسلسل ذري دائم لكل عيادة/يوم، `queue_events` للتاريخ | لا تصادم تزامني ولا إعادة استخدام رقم ملغى/مُتخطّى؛ الرقم يظل داخليًا ولا يظهر للمريض. |
| إدارة الطابور وإجراءاته، `/api/queue`, `/queue/:id/action`, `/transfer` | `/staff/queue`; RPCs `call/start/next/skip/resume/complete/no_show/transfer` | نطاق الطبيب/التمريض حسب العيادة؛ كل انتقال يسجل حدثًا وتدقيقًا. |
| شاشة TV العامة، `tv()` و`/api/tv`, `static/app.js` | لا شاشة عامة منفصلة في الإصدار الحالي؛ تُحفظ قائمة العمل الداخلية في `/staff/queue` | المصدر يحتوي دالة غير موصولة بتوجيه الصفحة؛ مواصفات المستخدم تمنع إعادة شاشة النداء/الصوت إلا إذا ثبتت الحاجة. |
| قوالب الرسائل ومعاينتها واختبارها، `/api/templates` | `message_templates`, `/staff/messages/templates`, معاينة server-side آمنة | قوالب Demo فقط؛ المتغيرات معروفة ومهربة؛ لا إرسال حقيقي دون مزود مصادق وموافقة. |
| رسائل واردة وصادرة واستخراج/إنشاء حجز، `/api/messages`, `/incoming`, `/create-booking`, `retry/result` | `incoming_messages`, `outgoing_messages`, `/staff/messages` وتسجيل النتائج | المصدر لا يثبت ناقلًا فعليًا إلى WhatsApp/Telegram؛ AI/المزود اختياري، لا أسرار/شبكات خارجية افتراضية. |
| التقارير والإحصاءات والتصدير، `/api/reports/bookings`, `/api/reports/export` | `/staff/reports`; استعلامات scoped حسب الدور؛ CSV/صفحة طباعة قابلة لـPDF | التصفية باليوم/العيادة/الحالة والمصدر؛ لا بيانات أكثر من حاجة التقرير؛ طباعة عربية. |
| سجل التدقيق، `audit`, `/api/audit-logs` | `audit_logs` append-only من عمليات خادمية، صفحة `/staff/audit` | تسجيل الفاعل/الوقت/الفعل/الكيان والتغيير؛ RLS يمنع التعديل/الحذف المباشر للمستخدم العادي. |
| المزامنة المركزية، `/api/sync/pull`, `/push`, `db_compat.py` | لا نقل رمز مزامنة مشترك؛ Supabase مركزية مباشرة؛ أي مزامنة مستقبلية بمعرفات/تحقق/تدقيق | المصدر الحالي يفتح CORS ويقبل دفعًا يتجاوز التحقق، لذلك لا يُنسخ كما هو. |
| Android WebView والعمل Offline والـoutbox المحلي | تجربة ويب متجاوبة/PWA؛ يمكن إضافة مسودات محلية معلقة فقط بعد قبول Supabase | لا قاعدة بيانات محلية مشتركة أو تأكيد محلي للحجز؛ العميل لا يستطيع أن يقرر حجوزات مركزية دون الخادم. |
| Windows 7 Electron + Flask محلي | التوجيه إلى تطبيق الويب المركزي عبر المتصفح؛ لا يُعاد تضمين خادم Flask/Python | هذا مشروع Next.js فقط؛ ملفات native القديمة تبقى في المستودع الأصلي ولا تنسخ إلى `clinic`. |
| قواعد البيانات والنسخ/الاستعادة و`db_compat.py` | Migrations SQL في `supabase/migrations`, seed للعيادات Demo، README للنسخ | لا SQLite أو Python runtime في المشروع الجديد؛ لا migration تمسح هدفًا قائمًا؛ لا نقل Users/PHI من Demo. |
| CI/build للمثبتات، `.github/workflows/build-installers.yml` و`package.json` الأصلي | GitHub Actions لتدقيق TypeScript/اختبارات/production build؛ Vercel preview/production من main | Android/Windows installers لا تدخل build Next.js ما لم يطلبها المستخدم كمنتجات منفصلة. |
| اختبارات المصدر المحدودة `tests/test_api.py`, `tests/test_sync.py` | Vitest لوحدات التحقق + SQL/pgTAP/RLS integration tests وsmoke test | يجب توسيع التغطية للحجز المتزامن، الصلاحيات، RLS، تسرب البيانات، التصدير والبناء؛ اختبارات ببيانات وهمية فقط. |

## اختلافات بيانات المصدر التي تتطلب قرارًا

- المصدر يحتوي 4 مستخدمين افتراضيين بكلمات مرور ثابتة؛ لا تنتقل إلى `clinic`.
- قاعدة Demo تحتوي 6 عيادات ولا تحتوي حجوزات أو سجلات تشغيل مرضى؛ هي مصدر seed الوحيد المسموح الآن.
- أسماء أيام العمل الرقمية لا تتفق مع جميع الأساليب البرمجية في المشروع. تُستخدم أسماء الأيام الصريحة في متطلبات المستخدم، وتحويل ISO فقط.
- السعة في عيادة الجهاز الهضمي (75) والأسنان (4) والسمعيات (8 إجماليًا، ABR=3 واختبار السمع=5) لا تتكرر بجمع سعة كل خدمة فوق سقف العيادة.
- تعليمات الإيكو والسمعيات نص طبي قائم؛ تنقل حرفيًا ولا تعاد صياغتها دون اعتماد مختص.
- شاشة TV العامة في المصدر غير موصولة بالتوجيه. تؤجل إعادة بنائها؛ تبقى إدارة الطابور الداخلية محفوظة.
