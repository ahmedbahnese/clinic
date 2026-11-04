begin;

alter table public.site_settings
  add column if not exists intro_enabled boolean not null default true,
  add column if not exists intro_image_url text not null default '/images/hero.png',
  add column if not exists intro_duration_seconds integer not null default 10 check (intro_duration_seconds between 3 and 60),
  add column if not exists whatsapp_url text not null default '',
  add column if not exists facebook_url text not null default '',
  add column if not exists twitter_url text not null default '';

create table if not exists public.site_promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 180),
  subtitle text not null default '',
  body text not null default '',
  image_url text not null default '',
  action_label text not null default '',
  action_url text not null default '',
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  updated_by uuid references public.staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

grant select on public.site_promotions to anon, authenticated;
alter table public.site_promotions enable row level security;
drop policy if exists site_promotions_public_read on public.site_promotions;
create policy site_promotions_public_read on public.site_promotions for select to anon,authenticated using (is_visible);
drop policy if exists site_promotions_admin_write on public.site_promotions;
create policy site_promotions_admin_write on public.site_promotions for all to authenticated using (private.has_role(array['admin'])) with check (private.has_role(array['admin']));

insert into public.site_promotions(title,subtitle,body,image_url,action_label,action_url,sort_order)
select 'خدمات العيادات الخارجية','احجز موعدك بسهولة','اختر العيادة والخدمة المناسبة وتابع حالة طلبك من هاتفك.','/images/hero.png','ابدأ الحجز','/booking',10
where not exists (select 1 from public.site_promotions);

commit;
