begin;

create table if not exists public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  requester_phone text not null,
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.staff_profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists cancellation_requests_status_idx on public.cancellation_requests(status, created_at desc);

create table if not exists public.data_backups (
  id uuid primary key default gen_random_uuid(),
  backup_name text not null check (length(btrim(backup_name)) between 1 and 160),
  created_by uuid references public.staff_profiles(id) on delete set null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id boolean primary key default true check (id),
  site_name text not null default 'مستشفى الأطفال التخصصي بالبحيرة',
  tagline text not null default 'العيادات الخارجية',
  header_title text not null default 'BSCH CLINICS',
  logo_url text not null default '/images/hospital-logo.png',
  hospital_website text not null default 'https://albahira.elyoser.cloud/',
  hotline text not null default '',
  contact_phone text not null default '',
  inquiry_phone text not null default '',
  official_email text not null default '',
  address text not null default 'أبو حمص – دمسنا – محافظة البحيرة',
  notice_title text not null default '',
  notice_body text not null default '',
  notice_enabled boolean not null default false,
  meta_title text not null default 'BSCH Clinics | العيادات الخارجية',
  meta_description text not null default 'بوابة الحجز والمتابعة للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة. احجز موعدك وتابع حالته بسهولة.',
  canonical_url text not null default 'https://clinic-six-wheat.vercel.app/',
  og_image_url text not null default '/images/hospital-logo.png',
  updated_by uuid references public.staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.site_settings(id) values (true) on conflict (id) do nothing;

create table if not exists public.site_sections (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique check (length(btrim(section_key)) between 1 and 80),
  title text not null default '',
  subtitle text not null default '',
  body text not null default '',
  image_url text not null default '',
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  updated_by uuid references public.staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_nav_links (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(btrim(label)) between 1 and 120),
  href text not null check (length(btrim(href)) between 1 and 500),
  open_mode text not null default 'same_tab' check (open_mode in ('same_tab','new_tab')),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  updated_by uuid references public.staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  file_url text not null,
  storage_path text not null default '',
  mime_type text not null default '',
  alt_text text not null default '',
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

insert into public.site_sections(section_key,title,subtitle,body,sort_order)
values
 ('hero','رعاية تبدأ بخطوة واضحة.','العيادات الخارجية','بوابتك الإلكترونية لخدمات العيادات الخارجية. قدّم طلب الحجز، وتابع حالته، واطّلع على الخطوة التالية بكل سهولة.',10),
 ('services','كيف يمكننا مساعدتك؟','خدمات إلكترونية','اختر الخدمة المناسبة للانتقال مباشرة إلى وجهتك.',20),
 ('journey','من الطلب إلى المتابعة، ببساطة','رحلتك معنا','تابع خطواتك معنا من تقديم الطلب حتى الحضور.',30)
on conflict (section_key) do nothing;
insert into public.site_nav_links(label,href,open_mode,sort_order)
select * from (values ('الرئيسية','/','same_tab',10),('حجز موعد','/booking','same_tab',20),('متابعة الحجز','/track','same_tab',30)) v(label,href,open_mode,sort_order)
where not exists (select 1 from public.site_nav_links);

-- Public catalog reads; all writes and private backup/request data remain protected.
alter table public.site_settings enable row level security;
alter table public.site_sections enable row level security;
alter table public.site_nav_links enable row level security;
alter table public.media_assets enable row level security;
alter table public.cancellation_requests enable row level security;
alter table public.data_backups enable row level security;
grant select on public.site_settings, public.site_sections, public.site_nav_links, public.media_assets to anon, authenticated;
grant select,insert on public.cancellation_requests to anon, authenticated;
grant select,insert on public.data_backups to authenticated;

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings for select to anon,authenticated using (true);
drop policy if exists site_sections_public_read on public.site_sections;
create policy site_sections_public_read on public.site_sections for select to anon,authenticated using (is_visible);
drop policy if exists site_nav_public_read on public.site_nav_links;
create policy site_nav_public_read on public.site_nav_links for select to anon,authenticated using (is_visible);
drop policy if exists media_public_read on public.media_assets;
create policy media_public_read on public.media_assets for select to anon,authenticated using (true);
drop policy if exists cancellation_staff_read on public.cancellation_requests;
create policy cancellation_staff_read on public.cancellation_requests for select to authenticated using (private.has_role(array['admin','booking']));
drop policy if exists backup_admin_read on public.data_backups;
create policy backup_admin_read on public.data_backups for select to authenticated using (private.has_role(array['admin']));
drop policy if exists backup_admin_insert on public.data_backups;
create policy backup_admin_insert on public.data_backups for insert to authenticated with check (private.has_role(array['admin']) and created_by=auth.uid());

-- Public form submits a cancellation request only for a matching future booking.
create or replace function public.request_booking_cancellation(p_booking_id uuid,p_phone text,p_reason text)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth
as $$
declare v_id uuid; v_booking public.bookings%rowtype;
begin
 select * into v_booking from public.bookings where id=p_booking_id and phone_normalized=private.normalize_phone(p_phone)
   and appointment_date >= (now() at time zone 'Africa/Cairo')::date and status in ('pending','confirmed');
 if not found then raise exception 'booking not found' using errcode='P0002'; end if;
 if exists(select 1 from public.cancellation_requests where booking_id=p_booking_id and status='pending') then raise exception 'cancellation already requested' using errcode='23505'; end if;
 insert into public.cancellation_requests(booking_id,requester_phone,reason) values(v_booking.id,btrim(p_phone),left(btrim(p_reason),1000)) returning id into v_id;
 perform private.write_audit(v_booking.clinic_id,'request_cancellation','booking',v_booking.id::text,null,jsonb_build_object('reason',left(btrim(p_reason),500)));
 return v_id;
end; $$;

create or replace function public.review_cancellation_request(p_request_id uuid,p_decision text,p_review_reason text default '')
returns void language plpgsql security definer
set search_path=pg_catalog,public,private,auth
as $$
declare r public.cancellation_requests%rowtype; b public.bookings%rowtype;
begin
 if not private.has_role(array['admin','booking']) then raise exception 'not authorized' using errcode='42501'; end if;
 if p_decision not in ('approved','rejected') then raise exception 'invalid decision' using errcode='22023'; end if;
 select * into r from public.cancellation_requests where id=p_request_id for update;
 if not found then raise exception 'request not found' using errcode='P0002'; end if;
 if r.status <> 'pending' then raise exception 'request already reviewed' using errcode='22023'; end if;
 select * into b from public.bookings where id=r.booking_id for update;
 update public.cancellation_requests set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=left(btrim(coalesce(p_review_reason,'')),1000) where id=r.id;
 if p_decision='approved' and b.status in ('pending','confirmed') then
   update public.bookings set status='cancelled',updated_at=now() where id=b.id;
   update public.queue_entries set state='cancelled',is_current=false where booking_id=b.id and state not in ('completed','cancelled');
   insert into public.booking_status_history(booking_id,old_status,new_status,actor_id,reason) values(b.id,b.status,'cancelled',auth.uid(),left(coalesce(p_review_reason,'طلب اعتذار من ولي الأمر'),500));
 end if;
 perform private.write_audit(b.clinic_id,'review_cancellation','booking',b.id::text,jsonb_build_object('request_status','pending'),jsonb_build_object('request_status',p_decision,'booking_status',case when p_decision='approved' then 'cancelled' else b.status end));
end; $$;
revoke all on function public.request_booking_cancellation(uuid,text,text) from public,authenticated;
grant execute on function public.request_booking_cancellation(uuid,text,text) to anon,authenticated;
revoke all on function public.review_cancellation_request(uuid,text,text) from public,anon;
grant execute on function public.review_cancellation_request(uuid,text,text) to authenticated;

-- CMS writes are restricted to administrators.
drop policy if exists site_settings_admin_write on public.site_settings;
create policy site_settings_admin_write on public.site_settings for all to authenticated using (private.has_role(array['admin'])) with check (private.has_role(array['admin']));
drop policy if exists site_sections_admin_write on public.site_sections;
create policy site_sections_admin_write on public.site_sections for all to authenticated using (private.has_role(array['admin'])) with check (private.has_role(array['admin']));
drop policy if exists site_nav_admin_write on public.site_nav_links;
create policy site_nav_admin_write on public.site_nav_links for all to authenticated using (private.has_role(array['admin'])) with check (private.has_role(array['admin']));
drop policy if exists media_admin_write on public.media_assets;
create policy media_admin_write on public.media_assets for all to authenticated using (private.has_role(array['admin'])) with check (private.has_role(array['admin']));

insert into storage.buckets(id,name,public) values('site-media','site-media',true) on conflict(id) do update set public=true;
drop policy if exists site_media_public_read on storage.objects;
create policy site_media_public_read on storage.objects for select using(bucket_id='site-media');
drop policy if exists site_media_admin_insert on storage.objects;
create policy site_media_admin_insert on storage.objects for insert to authenticated with check(bucket_id='site-media' and private.has_role(array['admin']));
drop policy if exists site_media_admin_update on storage.objects;
create policy site_media_admin_update on storage.objects for update to authenticated using(bucket_id='site-media' and private.has_role(array['admin'])) with check(bucket_id='site-media' and private.has_role(array['admin']));

commit;
