-- BSCH Clinics Demo catalog seed only. No users, bookings, queue records, or PHI.
-- Clinic names follow the requested Arabic specification; service descriptions,
-- documents and medical instructions are copied from bsch_clinics_demo.sqlite3.
-- Workdays follow the
-- explicit requested weekday names, encoded ISO Monday=1 ... Sunday=7.
begin;

insert into public.clinics
  (slug,name,location,opening_time,closing_time,visit_minutes,daily_capacity,documents_text,instructions,is_active)
values
  ('digestive','عيادة الجهاز الهضمي','الدور الرابع','09:00','14:00',15,75,
   'صورة بطاقة الأب والأم + شهادة ميلاد كمبيوتر + تقارير الطفل.',
   'الحضور قبل الموعد بربع ساعة وإحضار الأوراق المطلوبة.',true),
  ('nutrition','عيادة التغذية','الدور الرابع','09:00','14:00',15,50,
   'صورة بطاقة الأب والأم + شهادة ميلاد كمبيوتر + تقارير الطفل.',
   'الحضور قبل الموعد بربع ساعة وإحضار الأوراق المطلوبة.',true),
  ('psychiatry-neurology','الطب النفسي والمخ والأعصاب','الدور الرابع','09:00','14:00',20,15,
   'لا توجد أوراق محددة حاليًا.',
   'الحضور في الموعد ومعرفة اسم الطبيب إن وُجد.',true),
  ('dentistry','عيادة الأسنان','الدور الرابع','09:00','14:00',20,4,
   'صورة بطاقة الأب أو الأم.',
   'الحضور مبكرًا لأن العدد اليومي محدود.',true),
  ('echo','عيادة الإيكو','أمام عيادة القلب بالدور الرابع','08:30','13:00',30,5,
   'أي تقارير أو أشعات سابقة إن وجدت.',
   $echo$الحضور الساعة 8:30 صباحًا أمام عيادة القلب بالدور الرابع.
للأطفال من 6 شهور حتى 3 سنوات: قد يُطلب تجهيز الطفل بمادة كلورال هيدرات تحت إشراف طبيب عيادة القلب حسب الحالة.
يجب أن يكون الطفل خاليًا من أعراض البرد.
إيقاظ الطفل مبكرًا وعدم السماح له بالنوم في الطريق حتى يمكنه النوم أثناء الفحص عند الحاجة.$echo$,true),
  ('audiology','عيادة السمعيات','الدور الرابع','08:30','13:00',30,8,
   'تقارير السمع أو التحويل إن وجدت.',
   'شروط رسم السمع: العمر أقل من 5 سنوات وأكبر من 3 شهور، مع استثناء حالات التأخر العقلي أو تأخر الكلام. يجب عدم وجود كحة أو رشح أو ارتفاع درجة الحرارة.',true)
on conflict (slug) do nothing;

-- Workdays are explicitly requested and ISO encoded.
insert into public.clinic_workdays(clinic_id,iso_weekday,is_active)
select c.id,w.iso_weekday,true
from (values
  ('digestive',6),('digestive',2),
  ('nutrition',7),('nutrition',3),('nutrition',4),
  ('psychiatry-neurology',6),
  ('dentistry',1),('dentistry',2),('dentistry',3),('dentistry',4),('dentistry',6),('dentistry',7),
  ('echo',1),('echo',2),('echo',3),('echo',4),('echo',6),('echo',7),
  ('audiology',1),('audiology',2),('audiology',3),('audiology',4),('audiology',6),('audiology',7)
) as w(slug,iso_weekday)
join public.clinics c on c.slug=w.slug
on conflict (clinic_id,iso_weekday) do nothing;

-- Service limits are sub-caps; clinic.daily_capacity remains the shared total.
-- Direct-only audiology services remain available internally but are hidden from
-- anon catalog reads and rejected by create_public_booking.
with svc(clinic_slug,service_slug,name,daily_capacity,direct_only,instructions) as (values
  ('digestive','first-visit','كشف أول مرة',75,false,''),
  ('digestive','follow-up','متابعة',75,false,''),
  ('nutrition','first-visit','كشف أول مرة',50,false,''),
  ('nutrition','follow-up','متابعة',50,false,''),
  ('psychiatry-neurology','first-visit','كشف أول مرة',15,false,''),
  ('psychiatry-neurology','follow-up','متابعة',15,false,''),
  ('dentistry','extraction','خلع',4,false,''),
  ('dentistry','filling','حشو',4,false,''),
  ('echo','first-visit','كشف أول مرة',5,false,''),
  ('echo','follow-up','متابعة',5,false,''),
  ('audiology','abr-computer','رسم سمع كمبيوتر (جذع المخ)',3,false,
    $audio$شروط رسم السمع الكمبيوتر:
- العمر أقل من 5 سنوات وأكبر من 3 شهور.
- حالات التأخر العقلي أو تأخر الكلام مستثناة من شرط العمر ويمكن أن تكون أكبر من 5 سنوات.
- يجب التأكد من عدم وجود كحة أو رشح/نزلة برد أو ارتفاع درجة الحرارة.
تعليمات رسم السمع الإلكتروني:
- ليلة الاختبار: نوم الطفل الساعة 12 مساءً وإيقاظه الساعة 4 فجرًا وعدم السماح له بالنوم حتى الوصول للمستشفى وتهيئته للاختبار.
- في اليوم السابق للاختبار: غسل الرأس جيدًا بالماء والصابون.
- عدم وضع كريم على الشعر أو البشرة يوم الاختبار.
- الحضور للمستشفى مبكرًا وبحد أقصى الساعة 8:30 صباحًا.
- إحضار كلورال هيدرات إذا قرر الطبيب استخدامه، ويُعطى فقط تحت إشراف طبي.$audio$),
  ('audiology','hearing-test-age-5-plus','رسم سمع (5 سنوات فأكثر)',5,false,
    $audio$شروط رسم السمع الكمبيوتر:
- العمر أقل من 5 سنوات وأكبر من 3 شهور.
- حالات التأخر العقلي أو تأخر الكلام مستثناة من شرط العمر ويمكن أن تكون أكبر من 5 سنوات.
- يجب التأكد من عدم وجود كحة أو رشح/نزلة برد أو ارتفاع درجة الحرارة.
تعليمات رسم السمع الإلكتروني:
- ليلة الاختبار: نوم الطفل الساعة 12 مساءً وإيقاظه الساعة 4 فجرًا وعدم السماح له بالنوم حتى الوصول للمستشفى وتهيئته للاختبار.
- في اليوم السابق للاختبار: غسل الرأس جيدًا بالماء والصابون.
- عدم وضع كريم على الشعر أو البشرة يوم الاختبار.
- الحضور للمستشفى مبكرًا وبحد أقصى الساعة 8:30 صباحًا.
- إحضار كلورال هيدرات إذا قرر الطبيب استخدامه، ويُعطى فقط تحت إشراف طبي.$audio$),
  ('audiology','ear-pressure-direct','حالات ضغط الأذن',0,true,''),
  ('audiology','referred-newborn-direct','حالات محولة (مبادرة السمع)',0,true,'')
)
insert into public.clinic_services(clinic_id,slug,name,daily_capacity,direct_only,is_active,instructions)
select c.id,svc.service_slug,svc.name,svc.daily_capacity,svc.direct_only,true,svc.instructions
from svc join public.clinics c on c.slug=svc.clinic_slug
on conflict (clinic_id,slug) do nothing;

-- Copy each clinic's original documents text to its service-scoped checklist.
insert into public.service_documents(clinic_id,service_id,document_text,sort_order,is_active)
select c.id,s.id,c.documents_text,1,true
from public.clinics c
join public.clinic_services s on s.clinic_id=c.id
where c.documents_text<>''
  and c.slug in ('digestive','nutrition','psychiatry-neurology','dentistry','echo','audiology')
  and not exists (
    select 1 from public.service_documents d
    where d.service_id=s.id and d.document_text=c.documents_text
  );

commit;
