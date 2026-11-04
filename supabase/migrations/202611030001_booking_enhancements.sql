-- Booking enhancements: child DOB, guardian identity, notes, eligibility checks,
-- phone-based future booking lookup, and service eligibility configuration.
begin;

alter table public.bookings
  add column if not exists child_birth_date date,
  add column if not exists guardian_national_id text,
  add column if not exists notes text not null default '',
  add column if not exists developmental_delay boolean not null default false,
  add column if not exists cold_symptoms boolean not null default false;

alter table public.clinic_services
  add column if not exists min_age_months integer,
  add column if not exists max_age_months integer,
  add column if not exists allow_age_exception boolean not null default false,
  add column if not exists reject_cold_symptoms boolean not null default false,
  add column if not exists eligibility_text text not null default '';

alter table public.bookings
  drop constraint if exists bookings_guardian_national_id_length;
alter table public.bookings
  add constraint bookings_guardian_national_id_length
  check (guardian_national_id is null or length(btrim(guardian_national_id)) between 4 and 30);

alter table public.clinic_services
  drop constraint if exists clinic_services_age_range_valid;
alter table public.clinic_services
  add constraint clinic_services_age_range_valid
  check (min_age_months is null or min_age_months >= 0)
  , add constraint clinic_services_max_age_range_valid
  check (max_age_months is null or max_age_months >= 0)
  , add constraint clinic_services_age_order_valid
  check (min_age_months is null or max_age_months is null or min_age_months <= max_age_months);

-- Replace the old seven-argument public booking RPC with the enhanced contract.
drop function if exists public.create_public_booking(uuid,uuid,text,text,text,text,date);
create or replace function public.create_public_booking(
  p_clinic_id uuid,
  p_service_id uuid,
  p_patient_name text,
  p_child_birth_date date,
  p_address text,
  p_phone text,
  p_guardian_national_id text,
  p_appointment_date date,
  p_notes text default '',
  p_developmental_delay boolean default false,
  p_cold_symptoms boolean default false
) returns table(booking_id uuid, tracking_token text)
language plpgsql security definer
set search_path = pg_catalog, public, private, extensions, auth
as $$
declare
  v_token text;
  v_hash bytea;
  v_booking_id uuid;
  v_docs jsonb;
  v_instructions text;
  v_service public.clinic_services%rowtype;
  v_age_months integer;
begin
  if length(btrim(coalesce(p_patient_name,''))) not between 2 and 160
     or p_child_birth_date is null
     or p_child_birth_date > (now() at time zone 'Africa/Cairo')::date
     or length(btrim(coalesce(p_address,''))) not between 1 and 500
     or length(btrim(coalesce(p_phone,''))) not between 7 and 40
     or coalesce(p_phone,'') !~ '^[+0-9٠-٩۰-۹[:space:]().-]+$'
     or length(private.normalize_phone(p_phone)) not between 7 and 15
     or (p_guardian_national_id is not null and length(btrim(p_guardian_national_id)) not between 4 and 30)
  then
    raise exception 'invalid booking details' using errcode = '22023';
  end if;

  select * into v_service from public.clinic_services
  where id=p_service_id and clinic_id=p_clinic_id and is_active;
  if not found then raise exception 'service unavailable' using errcode = '22023'; end if;

  v_age_months := extract(year from age((now() at time zone 'Africa/Cairo')::date,p_child_birth_date))::integer * 12
    + extract(month from age((now() at time zone 'Africa/Cairo')::date,p_child_birth_date))::integer;
  if v_service.min_age_months is not null
     and v_age_months < v_service.min_age_months
     and not (p_developmental_delay and v_service.allow_age_exception) then
    raise exception 'age requirement not met' using errcode = '22023';
  end if;
  if v_service.max_age_months is not null
     and v_age_months > v_service.max_age_months
     and not (p_developmental_delay and v_service.allow_age_exception) then
    raise exception 'age requirement not met' using errcode = '22023';
  end if;
  if v_service.reject_cold_symptoms and p_cold_symptoms then
    raise exception 'cold symptoms are not allowed' using errcode = '22023';
  end if;

  perform 1 from public.clinics where id=p_clinic_id for update;
  perform private.assert_booking_capacity(p_clinic_id,p_service_id,p_appointment_date,null,false);
  if exists (select 1 from public.bookings b
    where b.clinic_id=p_clinic_id and b.appointment_date=p_appointment_date
      and b.phone_normalized=private.normalize_phone(p_phone)
      and b.patient_name_normalized=private.normalize_patient_name(p_patient_name)
      and b.status in ('pending','confirmed')) then
    raise exception 'duplicate active booking' using errcode = '23505';
  end if;
  select coalesce(jsonb_agg(d.document_text order by d.sort_order), '[]'::jsonb)
    into v_docs from public.service_documents d where d.service_id=p_service_id and d.is_active;
  select coalesce(nullif(s.instructions,''),nullif(s.eligibility_text,''),c.instructions,'') into v_instructions
    from public.clinic_services s join public.clinics c on c.id=s.clinic_id
    where s.id=p_service_id and c.id=p_clinic_id;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=');
  v_hash := extensions.digest(convert_to(v_token,'UTF8'),'sha256');
  insert into public.bookings(
    clinic_id,service_id,patient_name,child_birth_date,patient_age,address,phone,
    guardian_national_id,appointment_date,status,booking_source,tracking_token_hash,
    instructions_snapshot,documents_snapshot,notes,developmental_delay,cold_symptoms
  ) values (
    p_clinic_id,p_service_id,btrim(p_patient_name),p_child_birth_date,
    extract(year from age((now() at time zone 'Africa/Cairo')::date,p_child_birth_date))::text,
    btrim(p_address),btrim(p_phone),nullif(btrim(p_guardian_national_id),''),p_appointment_date,
    'pending','public',v_hash,coalesce(v_instructions,''),coalesce(v_docs,'[]'::jsonb),
    left(btrim(coalesce(p_notes,'')),1000),coalesce(p_developmental_delay,false),coalesce(p_cold_symptoms,false)
  ) returning id into v_booking_id;
  insert into public.booking_status_history(booking_id,old_status,new_status,actor_id,reason)
    values (v_booking_id,null,'pending',null,'public reservation');
  perform private.write_audit(p_clinic_id,'create_public_booking','booking',v_booking_id::text,null,
    jsonb_build_object('status','pending','appointment_date',p_appointment_date,'service_id',p_service_id));
  booking_id := v_booking_id; tracking_token := v_token; return next;
end;
$$;

-- Public lookup intentionally returns only today/future active reservations.
create or replace function public.track_bookings_by_phone(p_phone text)
returns table(
  booking_id uuid,
  patient_name text,
  child_birth_date date,
  patient_age text,
  phone text,
  address text,
  clinic_name text,
  service_name text,
  appointment_date date,
  status text,
  instructions text,
  required_documents text[],
  notes text
)
language sql security definer
set search_path = pg_catalog, public, private, extensions, auth
as $$
  select b.id,b.patient_name,b.child_birth_date,b.patient_age,b.phone,b.address,
    c.name,s.name,b.appointment_date,b.status,b.instructions_snapshot,
    coalesce(array(select jsonb_array_elements_text(b.documents_snapshot)), '{}'::text[]),b.notes
  from public.bookings b
  join public.clinics c on c.id=b.clinic_id
  join public.clinic_services s on s.id=b.service_id
  where b.phone_normalized=private.normalize_phone(p_phone)
    and b.appointment_date >= (now() at time zone 'Africa/Cairo')::date
    and b.status in ('pending','confirmed')
  order by b.appointment_date asc, b.created_at asc;
$$;

revoke all on function public.create_public_booking(uuid,uuid,text,date,text,text,text,date,text,boolean,boolean) from public,authenticated;
grant execute on function public.create_public_booking(uuid,uuid,text,date,text,text,text,date,text,boolean,boolean) to anon,authenticated;
revoke all on function public.track_bookings_by_phone(text) from public,authenticated;
grant execute on function public.track_bookings_by_phone(text) to anon,authenticated;

-- Encode the requested audiology rules in server-side configuration.
update public.clinic_services
set min_age_months = 4,
    max_age_months = 59,
    allow_age_exception = true,
    reject_cold_symptoms = true,
    eligibility_text = 'العمر من 4 شهور حتى أقل من 5 سنوات. حالات التأخر العقلي أو تأخر الكلام مستثناة من شرط العمر. لا يقبل الحجز مع الكحة أو الرشح أو ارتفاع الحرارة.'
where slug in ('abr-computer','hearing-test-age-5-plus');

grant select on public.service_documents to anon, authenticated;
drop policy if exists service_documents_public_active_read on public.service_documents;
create policy service_documents_public_active_read on public.service_documents
  for select to anon, authenticated using (
    is_active and exists (
      select 1 from public.clinic_services s
      join public.clinics c on c.id=s.clinic_id
      where s.id=service_id and s.is_active and c.is_active
    )
  );

commit;

-- Staff account settings.
alter table public.staff_profiles add column if not exists avatar_url text not null default '';
grant update (display_name, avatar_url) on public.staff_profiles to authenticated;
drop policy if exists staff_profiles_self_update on public.staff_profiles;
create policy staff_profiles_self_update on public.staff_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Public avatar bucket; users can write only inside their own folder.
insert into storage.buckets (id, name, public) values ('avatars','avatars',true)
on conflict (id) do update set public=true;
drop policy if exists avatar_public_read on storage.objects;
create policy avatar_public_read on storage.objects for select using (bucket_id='avatars');
drop policy if exists avatar_owner_insert on storage.objects;
create policy avatar_owner_insert on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatar_owner_update on storage.objects;
create policy avatar_owner_update on storage.objects for update to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);


-- Correct the dedicated 5-years-and-older hearing service range.
update public.clinic_services
set min_age_months = 60,
    max_age_months = null,
    allow_age_exception = true,
    reject_cold_symptoms = true,
    eligibility_text = 'العمر من 5 سنوات فأكثر. حالات التأخر العقلي أو تأخر الكلام تستثنى من شرط العمر عند تقييم الموظف. لا يقبل الحجز مع الكحة أو الرشح أو ارتفاع الحرارة.'
where slug = 'hearing-test-age-5-plus';
