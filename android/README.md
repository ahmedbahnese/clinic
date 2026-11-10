# تطبيق عيادات مستشفى الأطفال التخصصي لنظام Android

هذا المجلد يضيف غلاف Android أصليًا خفيفًا يفتح `https://bsch-clinic.com` في WebView. يسمح برفع الصور وملفات PDF عبر منتقي الملفات، ويحترم الرجوع داخل الصفحات، ويفتح الروابط خارج موقع المستشفى في التطبيق المناسب. لا يمسح ملفات تعريف الارتباط أو التخزين عند الإغلاق أو التحديث.

## بناء APK من GitHub

يُنشئ GitHub Actions ملف APK تجريبيًا قابلًا للتثبيت عند تغيير مجلد `android/`، أو عند تشغيل الإجراء يدويًا من **Actions → Android APK and Google Play AAB → Run workflow**. ملف APK التجريبي موقّع بمفتاح debug لأغراض التثبيت والتجربة، وليس مفتاح نشر Play.

لإصدار APK/AAB موقّعين للنشر، أضف الأسرار التالية في إعدادات مستودع GitHub تحت **Settings → Secrets and variables → Actions**:

- `ANDROID_KEYSTORE_BASE64`: ملف keystore المشفّر بصيغة Base64.
- `ANDROID_KEYSTORE_PASSWORD`: كلمة مرور keystore.
- `ANDROID_KEY_ALIAS`: اسم المفتاح داخل keystore.
- `ANDROID_KEY_PASSWORD`: كلمة مرور المفتاح.

لإنشاء مفتاح رفع جديد على جهاز آمن، شغّل `keytool -genkeypair -v -keystore upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias bsch-upload`، ثم أنشئ قيمة Secret بصيغة Base64 دون فواصل أسطر: على Linux `base64 -w 0 upload-key.jks`، وعلى macOS `base64 < upload-key.jks | tr -d '\n'`. أدخل الناتج في `ANDROID_KEYSTORE_BASE64`، واستخدم كلمات المرور والاسم الذي اخترته في الأسرار الأخرى. لا ترفع ملف `.jks` أو ملف Base64 إلى Git.

عند وجود الأسرار الأربعة، ينتج الإجراء APK إصدارًا وAAB للنشر على Google Play. لا تضع keystore أو كلمات المرور في المستودع. احتفظ بنسخة احتياطية آمنة من keystore؛ فقدان مفتاح التوقيع قد يمنع تحديث التطبيق المنشور.

لتغيير الاسم قبل البناء، عدّل `APP_NAME` في `gradle.properties` أو استخدم مدخل الاسم في تشغيل GitHub Actions اليدوي. معرّف الحزمة الحالي هو `com.bschclinic.app`؛ ثبّته واختبر توفره قبل أول نشر على Google Play، لأن تغييره بعد نشر التطبيق ينشئ تطبيقًا مختلفًا.

عند كل رفع تحديث إلى Google Play، استخدم `version_code` أكبر من رقم الإصدار السابق؛ يوفر تشغيل GitHub Actions اليدوي مدخلي `version_code` و`version_name` لهذا الغرض.

لتغيير أيقونة Android الأصلية، استبدل صورة الشعار ثم شغّل `python3 scripts/generate_app_icons.py path/to/logo.png` (يتطلب Pillow) وراجع الصور الناتجة قبل commit. أيقونة PWA على الويب تتبع قيمة favicon في CMS وتُحدّث مع manifest؛ تغيير أيقونة الحزمة الأصلية يحتاج إصدار APK جديد. استخدم أصولًا تملك المستشفى حق استخدامها فقط.

## ملاحظات النشر

يستهدف المشروع Android 16 / API 36، وهو المستوى المطلوب للتطبيقات الجديدة والتحديثات المرسلة إلى Google Play بدءًا من 31 أغسطس 2026 وفق [متطلبات Google Play الرسمية](https://developer.android.com/google/play/requirements/target-sdk). يلزم أيضًا إكمال إعدادات صفحة المتجر وإقرار البيانات وسلامة المحتوى داخل Play Console؛ هذا المستودع يجهز الملفات ولا يرسلها إلى حساب Play تلقائيًا.

تطبيق الويب القابل للتثبيت PWA منفصل عن هذا الغلاف: على Android يمكن تثبيته من Chrome، وعلى iPhone تتم الإضافة من Safari عبر **مشاركة → إضافة إلى الشاشة الرئيسية**. لا تتطلب نسخة PWA الرفع إلى متجر.
