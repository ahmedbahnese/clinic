-- Security policies and atomic server-side workflows for BSCH Clinics.
-- RPCs are SECURITY DEFINER with an explicit search_path and validate role/scope.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Reusable authorization predicates. They never trust user metadata.
create or replace function private.has_role(p_roles text[])
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private, auth
as $$
  select exists (
    select 1 from public.staff_profiles p
    where p.id = auth.uid() and p.is_active and p.role = any(p_roles)
  );
$$;

create or replace function private.can_access_clinic(p_clinic_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private, auth
as $$
  select exists (
    select 1 from public.staff_profiles p
    where p.id = auth.uid() and p.is_active and (
      p.role = 'admin' or exists (
        select 1 from public.clinic_staff_assignments a
        where a.staff_id = p.id and a.clinic_id = p_clinic_id
      )
    )
  );
$$;

create or replace function private.can_manage_clinic(p_clinic_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, private, auth
as $$
  select exists (
    select 1 from public.staff_profiles p
    where p.id = auth.uid() and p.is_active and (
      p.role = 'admin' or (p.role = 'booking' and exists (
        select 1 from public.clinic_staff_assignments a
        where a.staff_id = p.id and a.clinic_id = p_clinic_id
      ))
    )
  );
$$;

create or replace function private.require_clinic_role(p_clinic_id uuid, p_roles text[])
returns void
language plpgsql stable security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if not private.has_role(p_roles) or not private.can_access_clinic(p_clinic_id) then
    raise exception 'not authorized for clinic' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.has_role(text[]) from public, anon, authenticated;
revoke all on function private.can_access_clinic(uuid) from public, anon, authenticated;
revoke all on function private.can_manage_clinic(uuid) from public, anon, authenticated;
revoke all on function private.require_clinic_role(uuid,text[]) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.has_role(text[]) to authenticated;
grant execute on function private.can_access_clinic(uuid) to authenticated;
grant execute on function private.can_manage_clinic(uuid) to authenticated;

-- Every application-facing relation uses RLS. Direct public reads are limited
-- to active clinic/service catalog and active ISO workdays. All patient writes
-- and reads go through narrow RPCs or scoped staff policies.
do $$
declare t text;
begin
  foreach t in array array[
    'staff_profiles','clinics','clinic_workdays','clinic_holidays','clinic_special_days',
    'clinic_services','service_workdays','service_documents','clinic_staff_assignments',
    'bookings','booking_status_history','queue_counters','queue_entries','queue_events',
    'booking_transfers','audit_logs','system_settings','message_templates',
    'incoming_messages','outgoing_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Remove ambient table access; re-grant only operations with policies below.
revoke all on public.staff_profiles, public.clinics, public.clinic_workdays,
  public.clinic_holidays, public.clinic_special_days, public.clinic_services,
  public.service_workdays, public.service_documents, public.clinic_staff_assignments,
  public.bookings, public.booking_status_history, public.queue_counters,
  public.queue_entries, public.queue_events, public.booking_transfers,
  public.audit_logs, public.system_settings, public.message_templates,
  public.incoming_messages, public.outgoing_messages from anon, authenticated;
grant select on public.clinics, public.clinic_services, public.clinic_workdays to anon, authenticated;
grant select on public.staff_profiles, public.clinic_staff_assignments to authenticated;
grant select on public.clinic_holidays, public.clinic_special_days, public.service_workdays,
  public.service_documents, public.bookings, public.booking_status_history,
  public.queue_counters, public.queue_entries, public.queue_events, public.booking_transfers,
  public.audit_logs, public.system_settings, public.message_templates,
  public.incoming_messages, public.outgoing_messages to authenticated;
-- Never expose token digests or contact details through direct table SELECT.
-- Booking/admin staff retrieve contact details through get_booking_contact().
revoke select on public.bookings from authenticated;
grant select (id,clinic_id,service_id,patient_name,patient_age,appointment_date,status,
  booking_source,instructions_snapshot,documents_snapshot,created_at,updated_at)
  on public.bookings to authenticated;
grant update, insert, delete on public.clinics, public.clinic_workdays,
  public.clinic_holidays, public.clinic_special_days, public.clinic_services,
  public.service_workdays, public.service_documents to authenticated;
grant insert, update, delete on public.system_settings, public.message_templates to authenticated;

-- Staff profile and clinic assignment visibility; no direct role/assignment writes.
drop policy if exists staff_profiles_read_self_or_admin on public.staff_profiles;
create policy staff_profiles_read_self_or_admin on public.staff_profiles
  for select to authenticated using (id = auth.uid() or private.has_role(array['admin']));
drop policy if exists assignments_read_self_or_admin on public.clinic_staff_assignments;
create policy assignments_read_self_or_admin on public.clinic_staff_assignments
  for select to authenticated using (staff_id = auth.uid() or private.has_role(array['admin']));

-- Public-safe catalog read rules.
drop policy if exists clinics_public_active_read on public.clinics;
create policy clinics_public_active_read on public.clinics
  for select to anon, authenticated using (is_active);
drop policy if exists services_public_active_read on public.clinic_services;
create policy services_public_active_read on public.clinic_services
  for select to anon, authenticated using (
    is_active and not direct_only and exists (select 1 from public.clinics c where c.id = clinic_id and c.is_active)
  );
drop policy if exists workdays_public_active_read on public.clinic_workdays;
create policy workdays_public_active_read on public.clinic_workdays
  for select to anon, authenticated using (
    is_active and exists (select 1 from public.clinics c where c.id = clinic_id and c.is_active)
  );

-- Booking staff can edit operational catalogs only in assigned clinics; admin is global.
drop policy if exists clinics_manager_write on public.clinics;
create policy clinics_manager_write on public.clinics
  for all to authenticated using (private.can_manage_clinic(id))
  with check (private.can_manage_clinic(id));
do $$
declare t text;
begin
  foreach t in array array['clinic_workdays','clinic_holidays','clinic_special_days',
                            'clinic_services','service_workdays','service_documents'] loop
    execute format('drop policy if exists %I on public.%I', t || '_manager_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.can_manage_clinic(clinic_id)) with check (private.can_manage_clinic(clinic_id))',
      t || '_manager_write', t
    );
  end loop;
end $$;

-- Scoped staff reads. Mutations to bookings/queue/audit are RPC-only.
drop policy if exists bookings_scoped_staff_read on public.bookings;
create policy bookings_scoped_staff_read on public.bookings
  for select to authenticated using (private.can_access_clinic(clinic_id));
drop policy if exists booking_history_scoped_read on public.booking_status_history;
create policy booking_history_scoped_read on public.booking_status_history
  for select to authenticated using (exists (
    select 1 from public.bookings b where b.id = booking_id and private.can_access_clinic(b.clinic_id)
  ));
drop policy if exists queue_counters_scoped_read on public.queue_counters;
create policy queue_counters_scoped_read on public.queue_counters
  for select to authenticated using (private.can_access_clinic(clinic_id));
drop policy if exists queue_entries_scoped_read on public.queue_entries;
create policy queue_entries_scoped_read on public.queue_entries
  for select to authenticated using (private.can_access_clinic(clinic_id));
drop policy if exists queue_events_scoped_read on public.queue_events;
create policy queue_events_scoped_read on public.queue_events
  for select to authenticated using (exists (
    select 1 from public.queue_entries q where q.id = queue_entry_id and private.can_access_clinic(q.clinic_id)
  ));
drop policy if exists transfers_scoped_read on public.booking_transfers;
create policy transfers_scoped_read on public.booking_transfers
  for select to authenticated using (
    private.can_access_clinic(from_clinic_id) or private.can_access_clinic(to_clinic_id)
  );
drop policy if exists audit_scoped_read on public.audit_logs;
create policy audit_scoped_read on public.audit_logs
  for select to authenticated using (
    private.has_role(array['admin']) or
    (private.has_role(array['booking']) and clinic_id is not null and private.can_access_clinic(clinic_id))
  );

-- Settings are admin-only. Templates and message logs are restricted to booking/admin.
drop policy if exists system_settings_admin_all on public.system_settings;
create policy system_settings_admin_all on public.system_settings
  for all to authenticated using (private.has_role(array['admin']))
  with check (private.has_role(array['admin']));
drop policy if exists message_templates_staff_read on public.message_templates;
create policy message_templates_staff_read on public.message_templates
  for select to authenticated using (private.has_role(array['admin','booking']));
drop policy if exists message_templates_manager_write on public.message_templates;
create policy message_templates_manager_write on public.message_templates
  for all to authenticated using (private.has_role(array['admin','booking']))
  with check (private.has_role(array['admin','booking']));
drop policy if exists incoming_messages_staff_read on public.incoming_messages;
create policy incoming_messages_staff_read on public.incoming_messages
  for select to authenticated using (private.has_role(array['admin','booking']));
drop policy if exists outgoing_messages_staff_read on public.outgoing_messages;
create policy outgoing_messages_staff_read on public.outgoing_messages
  for select to authenticated using (private.has_role(array['admin','booking']));

-- Immutable audit trail: even table owners cannot UPDATE/DELETE through SQL DML.
create or replace function private.reject_audit_mutation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
begin
  raise exception 'audit log is append-only' using errcode = '42501';
end;
$$;
drop trigger if exists audit_logs_no_update_delete on public.audit_logs;
create trigger audit_logs_no_update_delete before update or delete on public.audit_logs
for each row execute function private.reject_audit_mutation();

create or replace function private.audit_catalog_change()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_row jsonb;
  v_clinic_id uuid;
  v_entity_id text;
  v_before jsonb;
  v_after jsonb;
begin
  if TG_OP='DELETE' then v_row:=to_jsonb(OLD); else v_row:=to_jsonb(NEW); end if;
  if TG_OP<>'INSERT' then v_before:=to_jsonb(OLD); end if;
  if TG_OP<>'DELETE' then v_after:=to_jsonb(NEW); end if;
  v_clinic_id:=coalesce((v_row->>'clinic_id')::uuid,
    case when TG_TABLE_NAME='clinics' then (v_row->>'id')::uuid else null end);
  v_entity_id:=coalesce(v_row->>'id',v_row->>'slug',v_row->>'setting_key',v_row->>'template_key');
  -- Avoid copying arbitrary setting values (which could later contain secrets)
  -- into the immutable audit record.
  if TG_TABLE_NAME='system_settings' then
    v_before:=case when v_before is null then null else jsonb_build_object('setting_key',v_before->'setting_key') end;
    v_after:=case when v_after is null then null else jsonb_build_object('setting_key',v_after->'setting_key') end;
  end if;
  insert into public.audit_logs(actor_id,clinic_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),v_clinic_id,lower(TG_OP),TG_TABLE_NAME,v_entity_id,v_before,v_after);
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['clinics','clinic_workdays','clinic_holidays','clinic_special_days',
    'clinic_services','service_workdays','service_documents','system_settings','message_templates'] loop
    execute format('drop trigger if exists %I on public.%I',t||'_audit_change',t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_catalog_change()',t||'_audit_change',t);
  end loop;
end $$;

create or replace function private.write_audit(
  p_clinic_id uuid, p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb default null, p_after jsonb default null
) returns void language sql security definer
set search_path = pg_catalog, public, private, auth
as $$
  insert into public.audit_logs(actor_id,clinic_id,action,entity_type,entity_id,before_data,after_data)
  values (auth.uid(),p_clinic_id,p_action,p_entity_type,p_entity_id,p_before,p_after);
$$;

-- Verify schedule/holiday/service and both layers of capacity. Callers lock the
-- clinic row FOR UPDATE first, serializing all reservations against shared cap.
create or replace function private.assert_booking_capacity(
  p_clinic_id uuid, p_service_id uuid, p_date date,
  p_exclude_booking uuid default null, p_allow_direct_only boolean default false
) returns void language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_clinic public.clinics%rowtype;
  v_service public.clinic_services%rowtype;
  v_special public.clinic_special_days%rowtype;
  v_weekday integer;
  v_day_capacity integer;
  v_used integer;
  v_service_used integer;
  v_has_service_schedule boolean;
begin
  if p_date is null or p_date < (now() at time zone 'Africa/Cairo')::date then
    raise exception 'booking date must not be in the past' using errcode = '22023';
  end if;
  select * into v_clinic from public.clinics where id = p_clinic_id and is_active;
  if not found then raise exception 'clinic unavailable' using errcode = '22023'; end if;
  select * into v_service from public.clinic_services
    where id = p_service_id and clinic_id = p_clinic_id and is_active;
  if not found then raise exception 'service unavailable' using errcode = '22023'; end if;
  if v_service.direct_only and not p_allow_direct_only then
    raise exception 'service requires direct attendance' using errcode = '22023';
  end if;
  if exists (select 1 from public.clinic_holidays h where h.clinic_id=p_clinic_id and h.holiday_date=p_date) then
    raise exception 'clinic is closed on this date' using errcode = '22023';
  end if;
  v_weekday := extract(isodow from p_date)::integer;
  select * into v_special from public.clinic_special_days
    where clinic_id=p_clinic_id and special_date=p_date;
  if found then
    if not v_special.is_open then raise exception 'clinic is closed on this date' using errcode = '22023'; end if;
    v_day_capacity := coalesce(v_special.daily_capacity_override, v_clinic.daily_capacity);
  else
    if not exists (select 1 from public.clinic_workdays w
      where w.clinic_id=p_clinic_id and w.iso_weekday=v_weekday and w.is_active) then
      raise exception 'clinic does not work on this date' using errcode = '22023';
    end if;
    v_day_capacity := v_clinic.daily_capacity;
  end if;
  select exists (select 1 from public.service_workdays sw where sw.service_id=p_service_id)
    into v_has_service_schedule;
  if v_has_service_schedule and not exists (
    select 1 from public.service_workdays sw
    where sw.service_id=p_service_id and sw.iso_weekday=v_weekday and sw.is_active
  ) then
    raise exception 'service is unavailable on this weekday' using errcode = '22023';
  end if;
  select count(*) into v_used from public.bookings b
    where b.clinic_id=p_clinic_id and b.appointment_date=p_date
      and b.status in ('pending','confirmed') and (p_exclude_booking is null or b.id<>p_exclude_booking);
  if v_used >= v_day_capacity then raise exception 'clinic daily capacity reached' using errcode = '22023'; end if;
  if v_service.daily_capacity is not null
     and not (v_service.direct_only and p_allow_direct_only) then
    select count(*) into v_service_used from public.bookings b
      where b.service_id=p_service_id and b.appointment_date=p_date
        and b.status in ('pending','confirmed') and (p_exclude_booking is null or b.id<>p_exclude_booking);
    if v_service_used >= v_service.daily_capacity then raise exception 'service daily capacity reached' using errcode = '22023'; end if;
  end if;
end;
$$;

create or replace function private.allocate_queue_number(p_clinic_id uuid, p_date date, p_booking_id uuid)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_number bigint; v_entry uuid;
begin
  insert into public.queue_counters(clinic_id,queue_date,last_number)
  values (p_clinic_id,p_date,1)
  on conflict (clinic_id,queue_date) do update
    set last_number=queue_counters.last_number+1, updated_at=now()
  returning last_number into v_number;
  insert into public.queue_entries(booking_id,clinic_id,queue_date,queue_number,state,is_current)
  values (p_booking_id,p_clinic_id,p_date,v_number,'waiting',false)
  returning id into v_entry;
  return v_entry;
end;
$$;

revoke all on function private.write_audit(uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.assert_booking_capacity(uuid,uuid,date,uuid,boolean) from public,anon,authenticated;
revoke all on function private.allocate_queue_number(uuid,date,uuid) from public,anon,authenticated;
revoke all on function private.reject_audit_mutation() from public,anon,authenticated;
revoke all on function private.audit_catalog_change() from public,anon,authenticated;

-- Public reservation: token is 256-bit random and only SHA-256(token) is stored.
-- Return the plaintext token exactly once. It is a bearer secret; keep it private.
create or replace function public.create_public_booking(
  p_clinic_id uuid, p_service_id uuid, p_patient_name text, p_patient_age text,
  p_address text, p_phone text, p_appointment_date date
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
begin
  if length(btrim(coalesce(p_patient_name,''))) not between 2 and 160
     or length(btrim(coalesce(p_patient_age,''))) not between 1 and 40
     or length(btrim(coalesce(p_address,''))) not between 1 and 500
     or length(btrim(coalesce(p_phone,''))) not between 7 and 40
     or coalesce(p_phone,'') !~ '^[+0-9٠-٩۰-۹[:space:]().-]+$'
     or length(private.normalize_phone(p_phone)) not between 7 and 15 then
    raise exception 'invalid booking details' using errcode = '22023';
  end if;
  perform 1 from public.clinics where id=p_clinic_id for update;
  if not found then raise exception 'clinic unavailable' using errcode = '22023'; end if;
  perform private.assert_booking_capacity(p_clinic_id,p_service_id,p_appointment_date,null,false);
  if exists (select 1 from public.bookings b
    where b.clinic_id=p_clinic_id and b.appointment_date=p_appointment_date
      and b.phone_normalized=private.normalize_phone(p_phone)
      and b.patient_name_normalized=private.normalize_patient_name(p_patient_name)
      and b.status in ('pending','confirmed')) then
    raise exception 'duplicate active booking' using errcode = '23505';
  end if;
  select coalesce(jsonb_agg(d.document_text order by d.sort_order), '[]'::jsonb)
    into v_docs from public.service_documents d
    where d.service_id=p_service_id and d.is_active;
  select coalesce(nullif(s.instructions,''),c.instructions,'') into v_instructions
    from public.clinic_services s join public.clinics c on c.id=s.clinic_id
    where s.id=p_service_id and c.id=p_clinic_id;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=');
  v_hash := extensions.digest(convert_to(v_token,'UTF8'),'sha256');
  insert into public.bookings(
    clinic_id,service_id,patient_name,patient_age,address,phone,appointment_date,
    status,booking_source,tracking_token_hash,instructions_snapshot,documents_snapshot
  ) values (
    p_clinic_id,p_service_id,btrim(p_patient_name),btrim(coalesce(p_patient_age,'')),
    btrim(coalesce(p_address,'')),btrim(p_phone),p_appointment_date,'pending','public',v_hash,
    coalesce(v_instructions,''),coalesce(v_docs,'[]'::jsonb)
  ) returning id into v_booking_id;
  insert into public.booking_status_history(booking_id,old_status,new_status,actor_id,reason)
    values (v_booking_id,null,'pending',null,'public reservation');
  perform private.write_audit(p_clinic_id,'create_public_booking','booking',v_booking_id::text,null,
    jsonb_build_object('status','pending','appointment_date',p_appointment_date,'service_id',p_service_id));
  booking_id := v_booking_id; tracking_token := v_token;
  return next;
end;
$$;

-- Safe bearer-token tracking. It deliberately omits address, phone, age and queue.
-- Cancelled bookings return no row.
create or replace function public.track_booking(p_tracking_token text)
returns table(patient_name text, appointment_date date, clinic_name text, service_name text,
              status text, instructions text, required_documents jsonb)
language sql stable security definer
set search_path = pg_catalog, public, private, extensions
as $$
  select b.patient_name,b.appointment_date,c.name,s.name,b.status,
         b.instructions_snapshot,b.documents_snapshot
  from public.bookings b
  join public.clinics c on c.id=b.clinic_id
  join public.clinic_services s on s.id=b.service_id
  where b.tracking_token_hash=extensions.digest(convert_to(p_tracking_token,'UTF8'),'sha256')
    and b.status in ('pending','confirmed');
$$;

-- Contact fields are available only to booking/admin staff within their scope.
create or replace function public.get_booking_contact(p_booking_id uuid)
returns table(patient_name text,phone text,address text)
language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_b public.bookings%rowtype;
begin
  select * into v_b from public.bookings where id=p_booking_id;
  if not found then raise exception 'booking not found' using errcode='P0002'; end if;
  perform private.require_clinic_role(v_b.clinic_id,array['admin','booking']);
  return query select v_b.patient_name,v_b.phone,v_b.address;
end;
$$;

-- Staff creation is internal-only; confirmed reservations receive a queue number
-- within the same transaction. A direct-only service is allowed here.
create or replace function public.create_internal_booking(
  p_clinic_id uuid,p_service_id uuid,p_patient_name text,p_patient_age text,
  p_address text,p_phone text,p_appointment_date date
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private, extensions, auth
as $$
declare v_token text; v_id uuid; v_docs jsonb; v_instructions text;
begin
  perform private.require_clinic_role(p_clinic_id,array['admin','booking']);
  if length(btrim(coalesce(p_patient_name,''))) not between 2 and 160
     or length(btrim(coalesce(p_patient_age,''))) not between 1 and 40
     or length(btrim(coalesce(p_address,''))) not between 1 and 500
     or length(btrim(coalesce(p_phone,''))) not between 7 and 40
     or coalesce(p_phone,'') !~ '^[+0-9٠-٩۰-۹[:space:]().-]+$'
     or length(private.normalize_phone(p_phone)) not between 7 and 15 then
    raise exception 'invalid booking details' using errcode='22023';
  end if;
  perform 1 from public.clinics where id=p_clinic_id for update;
  perform private.assert_booking_capacity(p_clinic_id,p_service_id,p_appointment_date,null,true);
  if exists (select 1 from public.bookings b where b.clinic_id=p_clinic_id
    and b.appointment_date=p_appointment_date
    and b.phone_normalized=private.normalize_phone(p_phone)
    and b.patient_name_normalized=private.normalize_patient_name(p_patient_name)
    and b.status in ('pending','confirmed')) then
    raise exception 'duplicate active booking' using errcode='23505';
  end if;
  select coalesce(jsonb_agg(d.document_text order by d.sort_order), '[]'::jsonb)
    into v_docs from public.service_documents d
    where d.service_id=p_service_id and d.is_active;
  select coalesce(nullif(s.instructions,''),c.instructions,'') into v_instructions
    from public.clinic_services s join public.clinics c on c.id=s.clinic_id
    where s.id=p_service_id and c.id=p_clinic_id;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=');
  insert into public.bookings(clinic_id,service_id,patient_name,patient_age,address,phone,
    appointment_date,status,booking_source,tracking_token_hash,created_by,
    instructions_snapshot,documents_snapshot)
  values(p_clinic_id,p_service_id,btrim(p_patient_name),coalesce(p_patient_age,''),
    coalesce(p_address,''),btrim(p_phone),p_appointment_date,'confirmed','staff',
    extensions.digest(convert_to(v_token,'UTF8'),'sha256'),auth.uid(),
    coalesce(v_instructions,''),coalesce(v_docs,'[]'::jsonb)) returning id into v_id;
  insert into public.booking_status_history(booking_id,old_status,new_status,actor_id,reason)
    values(v_id,null,'confirmed',auth.uid(),'internal booking');
  perform private.allocate_queue_number(p_clinic_id,p_appointment_date,v_id);
  perform private.write_audit(p_clinic_id,'create_internal_booking','booking',v_id::text,null,
    jsonb_build_object('status','confirmed','appointment_date',p_appointment_date,'service_id',p_service_id));
  return v_id;
end;
$$;

create or replace function public.confirm_booking(p_booking_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_b public.bookings%rowtype;
begin
  select * into v_b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode='P0002'; end if;
  perform private.require_clinic_role(v_b.clinic_id,array['admin','booking']);
  if v_b.status <> 'pending' then raise exception 'booking is not pending' using errcode='22023'; end if;
  perform 1 from public.clinics where id=v_b.clinic_id for update;
  -- pending already consumes capacity; recheck the schedule and caps while excluding self.
  perform private.assert_booking_capacity(v_b.clinic_id,v_b.service_id,v_b.appointment_date,v_b.id,true);
  update public.bookings set status='confirmed',updated_at=now() where id=v_b.id;
  insert into public.booking_status_history(booking_id,old_status,new_status,actor_id)
    values(v_b.id,'pending','confirmed',auth.uid());
  perform private.allocate_queue_number(v_b.clinic_id,v_b.appointment_date,v_b.id);
  perform private.write_audit(v_b.clinic_id,'confirm','booking',v_b.id::text,
    jsonb_build_object('status','pending'),jsonb_build_object('status','confirmed'));
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid,p_reason text default '')
returns void language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_b public.bookings%rowtype;
begin
  select * into v_b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode='P0002'; end if;
  perform private.require_clinic_role(v_b.clinic_id,array['admin','booking']);
  if v_b.status not in ('pending','confirmed') then raise exception 'booking cannot be cancelled' using errcode='22023'; end if;
  if exists(select 1 from public.queue_entries where booking_id=v_b.id and state='in_progress') then
    raise exception 'cannot cancel a booking already in progress' using errcode='22023';
  end if;
  update public.bookings set status='cancelled',updated_at=now() where id=v_b.id;
  update public.queue_entries set state='cancelled',is_current=false
    where booking_id=v_b.id and state in ('waiting','called','skipped');
  insert into public.booking_status_history(booking_id,old_status,new_status,actor_id,reason)
    values(v_b.id,v_b.status,'cancelled',auth.uid(),left(coalesce(p_reason,''),500));
  perform private.write_audit(v_b.clinic_id,'cancel','booking',v_b.id::text,
    jsonb_build_object('status',v_b.status),jsonb_build_object('status','cancelled','reason',left(coalesce(p_reason,''),500)));
end;
$$;

create or replace function public.reschedule_booking(p_booking_id uuid,p_new_date date,p_reason text default '')
returns void language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_b public.bookings%rowtype; v_old_queue uuid;
begin
  select * into v_b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode='P0002'; end if;
  perform private.require_clinic_role(v_b.clinic_id,array['admin','booking']);
  if v_b.status not in ('pending','confirmed') then raise exception 'booking cannot be rescheduled' using errcode='22023'; end if;
  if exists(select 1 from public.queue_entries where booking_id=v_b.id and state='in_progress') then
    raise exception 'cannot reschedule a booking already in progress' using errcode='22023';
  end if;
  perform 1 from public.clinics where id=v_b.clinic_id for update;
  perform private.assert_booking_capacity(v_b.clinic_id,v_b.service_id,p_new_date,v_b.id,true);
  if exists(select 1 from public.bookings b where b.id<>v_b.id and b.clinic_id=v_b.clinic_id
    and b.appointment_date=p_new_date and b.phone_normalized=v_b.phone_normalized
    and b.patient_name_normalized=v_b.patient_name_normalized and b.status in ('pending','confirmed')) then
    raise exception 'duplicate active booking' using errcode='23505';
  end if;
  select id into v_old_queue from public.queue_entries where booking_id=v_b.id
    and state in ('waiting','called','skipped') order by created_at desc limit 1 for update;
  if v_old_queue is not null then
    update public.queue_entries set state='rescheduled',is_current=false where id=v_old_queue;
    insert into public.queue_events(queue_entry_id,event_type,actor_id,details)
      values(v_old_queue,'reschedule',auth.uid(),jsonb_build_object('new_date',p_new_date));
  end if;
  update public.bookings set appointment_date=p_new_date,updated_at=now() where id=v_b.id;
  if v_b.status='confirmed' then perform private.allocate_queue_number(v_b.clinic_id,p_new_date,v_b.id); end if;
  perform private.write_audit(v_b.clinic_id,'reschedule','booking',v_b.id::text,
    jsonb_build_object('appointment_date',v_b.appointment_date),jsonb_build_object('appointment_date',p_new_date,'reason',left(coalesce(p_reason,''),500)));
end;
$$;

create or replace function public.transfer_booking(
  p_booking_id uuid,p_target_clinic_id uuid,p_target_service_id uuid,p_reason text default ''
) returns void language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_b public.bookings%rowtype; v_old_queue uuid; v_new_queue uuid;
  v_docs jsonb; v_instructions text;
begin
  select * into v_b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'booking not found' using errcode='P0002'; end if;
  perform private.require_clinic_role(v_b.clinic_id,array['admin','booking']);
  perform private.require_clinic_role(p_target_clinic_id,array['admin','booking']);
  if v_b.status not in ('pending','confirmed') or p_target_clinic_id=v_b.clinic_id then
    raise exception 'invalid transfer' using errcode='22023';
  end if;
  if exists(select 1 from public.queue_entries where booking_id=v_b.id and state='in_progress') then
    raise exception 'cannot transfer a booking already in progress' using errcode='22023';
  end if;
  -- Stable lock order avoids deadlocks between opposite transfers.
  perform id from public.clinics where id in (v_b.clinic_id,p_target_clinic_id) order by id for update;
  perform private.assert_booking_capacity(p_target_clinic_id,p_target_service_id,v_b.appointment_date,null,true);
  select coalesce(jsonb_agg(d.document_text order by d.sort_order), '[]'::jsonb)
    into v_docs from public.service_documents d
    where d.service_id=p_target_service_id and d.is_active;
  select coalesce(nullif(s.instructions,''),c.instructions,'') into v_instructions
    from public.clinic_services s join public.clinics c on c.id=s.clinic_id
    where s.id=p_target_service_id and c.id=p_target_clinic_id;
  if exists(select 1 from public.bookings b where b.clinic_id=p_target_clinic_id
    and b.appointment_date=v_b.appointment_date and b.phone_normalized=v_b.phone_normalized
    and b.patient_name_normalized=v_b.patient_name_normalized and b.status in ('pending','confirmed')) then
    raise exception 'duplicate active booking' using errcode='23505';
  end if;
  select id into v_old_queue from public.queue_entries where booking_id=v_b.id
    and state in ('waiting','called','skipped') order by created_at desc limit 1 for update;
  if v_old_queue is not null then
    update public.queue_entries set state='transferred',is_current=false where id=v_old_queue;
    insert into public.queue_events(queue_entry_id,event_type,actor_id,details)
      values(v_old_queue,'transfer',auth.uid(),jsonb_build_object('target_clinic_id',p_target_clinic_id));
  end if;
  update public.bookings set clinic_id=p_target_clinic_id,service_id=p_target_service_id,
    instructions_snapshot=coalesce(v_instructions,''),documents_snapshot=coalesce(v_docs,'[]'::jsonb),updated_at=now()
    where id=v_b.id;
  if v_b.status='confirmed' then
    v_new_queue := private.allocate_queue_number(p_target_clinic_id,v_b.appointment_date,v_b.id);
  end if;
  insert into public.booking_transfers(booking_id,from_clinic_id,from_service_id,to_clinic_id,to_service_id,
    from_queue_entry_id,to_queue_entry_id,actor_id,reason)
  values(v_b.id,v_b.clinic_id,v_b.service_id,p_target_clinic_id,p_target_service_id,
    v_old_queue,v_new_queue,auth.uid(),left(coalesce(p_reason,''),500));
  perform private.write_audit(p_target_clinic_id,'transfer','booking',v_b.id::text,
    jsonb_build_object('clinic_id',v_b.clinic_id,'service_id',v_b.service_id),
    jsonb_build_object('clinic_id',p_target_clinic_id,'service_id',p_target_service_id,'reason',left(coalesce(p_reason,''),500)));
end;
$$;

-- Queue lifecycle. `next` atomically calls the next waiting entry for a clinic/day;
-- existing entries keep their number forever, including skipped/transferred entries.
create or replace function public.manage_queue(
  p_clinic_id uuid,p_queue_date date,p_action text,p_queue_entry_id uuid default null,p_details jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_entry public.queue_entries%rowtype; v_id uuid; v_new_state text;
begin
  perform private.require_clinic_role(p_clinic_id,array['admin','booking','doctor','nurse']);
  if p_action not in ('call','start','next','skip','resume','complete','no_show') then
    raise exception 'unsupported queue action' using errcode='22023';
  end if;
  -- The counter row is a per-clinic/day mutex, also serializing concurrent `next` actions.
  perform 1 from public.queue_counters where clinic_id=p_clinic_id and queue_date=p_queue_date for update;
  if not found then raise exception 'queue not found for date' using errcode='P0002'; end if;
  if p_action='next' then
    select * into v_entry from public.queue_entries q
      where q.clinic_id=p_clinic_id and q.queue_date=p_queue_date and q.state='waiting'
      order by q.queue_number limit 1 for update skip locked;
    if not found then raise exception 'no waiting entry' using errcode='P0002'; end if;
    v_new_state := 'called';
  else
    if p_queue_entry_id is null then raise exception 'queue entry is required' using errcode='22023'; end if;
    select * into v_entry from public.queue_entries q
      where q.id=p_queue_entry_id and q.clinic_id=p_clinic_id and q.queue_date=p_queue_date for update;
    if not found then raise exception 'queue entry not found' using errcode='P0002'; end if;
    case p_action
      when 'call' then if v_entry.state<>'waiting' then raise exception 'entry is not waiting'; end if; v_new_state:='called';
      when 'start' then if v_entry.state<>'called' then raise exception 'entry has not been called'; end if; v_new_state:='in_progress';
      when 'skip' then if v_entry.state not in ('waiting','called') then raise exception 'entry cannot be skipped'; end if; v_new_state:='skipped';
      when 'resume' then if v_entry.state<>'skipped' then raise exception 'entry is not skipped'; end if; v_new_state:='waiting';
      when 'complete' then if v_entry.state<>'in_progress' then raise exception 'entry is not in progress'; end if; v_new_state:='completed';
      when 'no_show' then if v_entry.state not in ('waiting','called') then raise exception 'entry cannot be marked no-show'; end if; v_new_state:='no_show';
    end case;
  end if;
  -- Clear any previous current marker before assigning the unique current slot.
  if v_new_state in ('called','in_progress') then
    update public.queue_entries set is_current=false
      where clinic_id=p_clinic_id and queue_date=p_queue_date and is_current and id<>v_entry.id;
  end if;
  update public.queue_entries set state=v_new_state,is_current=(v_new_state in ('called','in_progress')) where id=v_entry.id;
  insert into public.queue_events(queue_entry_id,event_type,actor_id,details)
    values(v_entry.id,p_action,auth.uid(),coalesce(p_details,'{}'::jsonb));
  if p_action in ('complete','no_show') then
    update public.bookings set status=case when p_action='complete' then 'completed' else 'no_show' end,
      updated_at=now() where id=v_entry.booking_id and status='confirmed';
    if found then
      insert into public.booking_status_history(booking_id,old_status,new_status,actor_id,reason)
      values(v_entry.booking_id,'confirmed',case when p_action='complete' then 'completed' else 'no_show' end,
        auth.uid(),'queue action: '||p_action);
    end if;
  end if;
  perform private.write_audit(p_clinic_id,'queue_'||p_action,'queue_entry',v_entry.id::text,
    jsonb_build_object('state',v_entry.state),jsonb_build_object('state',v_new_state));
  return v_entry.id;
end;
$$;

-- Admin may activate/change an existing Auth user, but never their own role.
-- This deliberately does not create Auth credentials or set passwords.
create or replace function public.admin_set_staff(
  p_staff_id uuid,p_role text,p_is_active boolean,p_clinic_ids uuid[] default '{}'
) returns void language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_old public.staff_profiles%rowtype; v_clinic uuid;
begin
  if not private.has_role(array['admin']) then raise exception 'admin required' using errcode='42501'; end if;
  if p_staff_id=auth.uid() then raise exception 'cannot change own role or activation' using errcode='42501'; end if;
  if p_role not in ('booking','doctor','nurse','admin') then raise exception 'invalid role' using errcode='22023'; end if;
  select * into v_old from public.staff_profiles where id=p_staff_id for update;
  if not found then raise exception 'staff profile not found; authenticate the staff user first' using errcode='P0002'; end if;
  if exists(select 1 from unnest(coalesce(p_clinic_ids,'{}'::uuid[])) x(id)
            where not exists(select 1 from public.clinics c where c.id=x.id)) then
    raise exception 'unknown clinic in assignment list' using errcode='22023';
  end if;
  update public.staff_profiles set role=p_role,is_active=p_is_active,updated_at=now() where id=p_staff_id;
  delete from public.clinic_staff_assignments where staff_id=p_staff_id;
  foreach v_clinic in array coalesce(p_clinic_ids,'{}'::uuid[]) loop
    insert into public.clinic_staff_assignments(staff_id,clinic_id,assigned_by)
      values(p_staff_id,v_clinic,auth.uid());
  end loop;
  perform private.write_audit(null,'set_staff','staff_profile',p_staff_id::text,
    jsonb_build_object('role',v_old.role,'is_active',v_old.is_active),
    jsonb_build_object('role',p_role,'is_active',p_is_active,'clinic_ids',to_jsonb(p_clinic_ids)));
end;
$$;

-- One-time bootstrap after creating/inviting the first Auth user through a
-- trusted administrative channel. The service-role secret stays server-side.
create or replace function public.bootstrap_first_admin(p_staff_id uuid,p_display_name text)
returns void language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'trusted service role required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(29001028,1);
  if exists(select 1 from public.staff_profiles where role='admin' and is_active) then
    raise exception 'an active administrator already exists' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=p_staff_id) then
    raise exception 'Auth user must be created or invited first' using errcode='P0002';
  end if;
  insert into public.staff_profiles(id,display_name,role,is_active)
    values(p_staff_id,left(btrim(coalesce(p_display_name,'')),160),'admin',true)
  on conflict (id) do update set display_name=excluded.display_name,role='admin',is_active=true,updated_at=now();
  perform private.write_audit(null,'bootstrap_first_admin','staff_profile',p_staff_id::text,null,
    jsonb_build_object('role','admin','is_active',true));
end;
$$;

-- RPC execution is allow-listed; default PUBLIC EXECUTE is explicitly removed.
revoke all on function public.create_public_booking(uuid,uuid,text,text,text,text,date) from public,authenticated;
grant execute on function public.create_public_booking(uuid,uuid,text,text,text,text,date) to anon,authenticated;
revoke all on function public.track_booking(text) from public,authenticated;
grant execute on function public.track_booking(text) to anon,authenticated;
revoke all on function public.get_booking_contact(uuid) from public,anon;
grant execute on function public.get_booking_contact(uuid) to authenticated;
revoke all on function public.create_internal_booking(uuid,uuid,text,text,text,text,date) from public,anon;
grant execute on function public.create_internal_booking(uuid,uuid,text,text,text,text,date) to authenticated;
revoke all on function public.confirm_booking(uuid) from public,anon;
grant execute on function public.confirm_booking(uuid) to authenticated;
revoke all on function public.cancel_booking(uuid,text) from public,anon;
grant execute on function public.cancel_booking(uuid,text) to authenticated;
revoke all on function public.reschedule_booking(uuid,date,text) from public,anon;
grant execute on function public.reschedule_booking(uuid,date,text) to authenticated;
revoke all on function public.transfer_booking(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.transfer_booking(uuid,uuid,uuid,text) to authenticated;
revoke all on function public.manage_queue(uuid,date,text,uuid,jsonb) from public,anon;
grant execute on function public.manage_queue(uuid,date,text,uuid,jsonb) to authenticated;
revoke all on function public.admin_set_staff(uuid,text,boolean,uuid[]) from public,anon;
grant execute on function public.admin_set_staff(uuid,text,boolean,uuid[]) to authenticated;
revoke all on function public.bootstrap_first_admin(uuid,text) from public,anon,authenticated;
grant execute on function public.bootstrap_first_admin(uuid,text) to service_role;

-- Narrow direct catalog/settings grants already have matching RLS policies.
-- No booking, queue, transfer, history, audit, or staff-role DML is granted.
