alter table public.staff_profiles add column if not exists phone text not null default '';
grant select (phone) on public.staff_profiles to authenticated;

create or replace function public.resolve_staff_login_identifier(p_identifier text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  join public.staff_profiles sp on sp.id = u.id
  where sp.is_active
    and (lower(coalesce(u.email, '')) = lower(btrim(p_identifier))
      or regexp_replace(coalesce(sp.phone, ''), '[^0-9]+', '', 'g') = regexp_replace(btrim(p_identifier), '[^0-9]+', '', 'g')
      or lower(sp.display_name) = lower(btrim(p_identifier)))
  limit 1;
$$;
revoke all on function public.resolve_staff_login_identifier(text) from public;
grant execute on function public.resolve_staff_login_identifier(text) to anon, authenticated;
