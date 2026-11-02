-- BSCH Clinics / PostgreSQL core schema.
-- Re-runnable by design: no DROP TABLE, no data-clearing operations.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- Stable normalization is shared by generated columns, duplicate checks, and RPCs.
create or replace function private.normalize_phone(p_text text)
returns text language sql immutable
set search_path = pg_catalog
as $$
  select regexp_replace(
    translate(coalesce(p_text,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),
    '[^0-9]','','g'
  );
$$;

create or replace function private.normalize_patient_name(p_text text)
returns text language sql immutable
set search_path = pg_catalog
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p_text,'')),'أإآٱىًٌٍَُِّْٰـ','ااااي'),
    '[[:space:]]+',' ','g'
  ));
$$;

-- Text checks are used instead of enums so adding a status/role later does not
-- require unsafe enum replacement migrations.
create table if not exists public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'booking' check (role in ('booking','doctor','nurse','admin')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  location text not null default '',
  opening_time time,
  closing_time time,
  visit_minutes integer not null default 15 check (visit_minutes > 0),
  daily_capacity integer not null check (daily_capacity >= 0),
  documents_text text not null default '',
  instructions text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opening_time is null or closing_time is null or opening_time < closing_time)
);

-- ISO weekday: Monday=1 ... Sunday=7. The UI must not convert via JS Sunday=0.
create table if not exists public.clinic_workdays (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  iso_weekday smallint not null check (iso_weekday between 1 and 7),
  is_active boolean not null default true,
  opening_time time,
  closing_time time,
  unique (clinic_id, iso_weekday),
  check (opening_time is null or closing_time is null or opening_time < closing_time)
);

create table if not exists public.clinic_holidays (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  holiday_date date not null,
  reason text not null default '',
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (clinic_id, holiday_date)
);

-- A special day can open an otherwise closed weekday or override clinic capacity.
-- A holiday takes precedence over a special day.
create table if not exists public.clinic_special_days (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  special_date date not null,
  is_open boolean not null default true,
  daily_capacity_override integer check (daily_capacity_override is null or daily_capacity_override >= 0),
  reason text not null default '',
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (clinic_id, special_date)
);

create table if not exists public.clinic_services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  slug text not null,
  name text not null,
  daily_capacity integer check (daily_capacity is null or daily_capacity >= 0),
  direct_only boolean not null default false,
  is_active boolean not null default true,
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, slug),
  unique (clinic_id, id)
);

-- Optional service-specific weekday restrictions. Empty means clinic workdays apply.
create table if not exists public.service_workdays (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  service_id uuid not null,
  iso_weekday smallint not null check (iso_weekday between 1 and 7),
  is_active boolean not null default true,
  unique (service_id, iso_weekday),
  foreign key (clinic_id, service_id)
    references public.clinic_services(clinic_id, id) on delete cascade
);

create table if not exists public.service_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  service_id uuid not null,
  document_text text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (clinic_id, service_id)
    references public.clinic_services(clinic_id, id) on delete cascade
);

create table if not exists public.clinic_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  assigned_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (staff_id, clinic_id)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  service_id uuid not null,
  patient_name text not null check (length(btrim(patient_name)) between 2 and 160),
  patient_age text not null check (length(btrim(patient_age)) between 1 and 40),
  address text not null check (length(btrim(address)) between 1 and 500),
  phone text not null check (length(phone) between 7 and 40),
  phone_normalized text generated always as (private.normalize_phone(phone)) stored,
  patient_name_normalized text generated always as (private.normalize_patient_name(patient_name)) stored,
  appointment_date date not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','cancelled','completed','no_show')),
  booking_source text not null default 'public'
    check (booking_source in ('public','staff')),
  tracking_token_hash bytea not null unique,
  instructions_snapshot text not null default '',
  documents_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(documents_snapshot) = 'array'),
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (clinic_id, service_id)
    references public.clinic_services(clinic_id, id) on delete restrict,
  check (length(phone_normalized) between 7 and 15)
);

create table if not exists public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  old_status text,
  new_status text not null check (new_status in ('pending','confirmed','cancelled','completed','no_show')),
  actor_id uuid references public.staff_profiles(id) on delete set null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.queue_counters (
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  queue_date date not null,
  last_number bigint not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, queue_date)
);

create table if not exists public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  queue_date date not null,
  queue_number bigint not null check (queue_number > 0),
  state text not null default 'waiting'
    check (state in ('waiting','called','in_progress','skipped','completed','no_show','cancelled','transferred','rescheduled')),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (clinic_id, queue_date, queue_number)
);

create table if not exists public.queue_events (
  id uuid primary key default gen_random_uuid(),
  queue_entry_id uuid not null references public.queue_entries(id) on delete restrict,
  event_type text not null check (event_type in ('call','start','next','skip','resume','complete','no_show','cancel','transfer','reschedule')),
  actor_id uuid references public.staff_profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_transfers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  from_clinic_id uuid not null references public.clinics(id) on delete restrict,
  from_service_id uuid not null,
  to_clinic_id uuid not null references public.clinics(id) on delete restrict,
  to_service_id uuid not null,
  from_queue_entry_id uuid references public.queue_entries(id) on delete set null,
  to_queue_entry_id uuid references public.queue_entries(id) on delete set null,
  actor_id uuid references public.staff_profiles(id) on delete set null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  foreign key (from_clinic_id, from_service_id)
    references public.clinic_services(clinic_id, id) on delete restrict,
  foreign key (to_clinic_id, to_service_id)
    references public.clinic_services(clinic_id, id) on delete restrict
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  -- Intentionally no foreign keys: audit entries remain immutable after deletion.
  actor_id uuid,
  clinic_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  setting_key text primary key check (length(setting_key) between 1 and 120),
  setting_value jsonb not null,
  updated_by uuid references public.staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  body text not null,
  is_active boolean not null default true,
  updated_by uuid references public.staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.incoming_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  external_id text,
  sender text not null default '',
  message_text text not null,
  parsed_data jsonb not null default '{}'::jsonb,
  missing_fields jsonb not null default '[]'::jsonb,
  status text not null default 'received',
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outgoing_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  recipient text not null default '',
  message_text text not null,
  template_key text,
  booking_id uuid references public.bookings(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued','sent','failed','cancelled')),
  error_text text not null default '',
  attempts integer not null default 0 check (attempts >= 0),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Reject same patient/phone for the same clinic-day while an existing booking
-- still consumes capacity. Cancelled/completed/no-show records are not blockers.
create unique index if not exists bookings_no_active_duplicate_idx
  on public.bookings (clinic_id, appointment_date, phone_normalized, patient_name_normalized)
  where status in ('pending','confirmed');
create index if not exists bookings_clinic_day_status_idx
  on public.bookings (clinic_id, appointment_date, status);
create index if not exists bookings_service_day_status_idx
  on public.bookings (service_id, appointment_date, status);
create index if not exists bookings_tracking_hash_idx on public.bookings (tracking_token_hash);
create index if not exists queue_entries_clinic_day_state_idx
  on public.queue_entries (clinic_id, queue_date, state, queue_number);
create index if not exists queue_entries_booking_idx on public.queue_entries (booking_id, created_at desc);
create unique index if not exists queue_entries_one_current_per_day_idx
  on public.queue_entries (clinic_id, queue_date) where is_current;
create index if not exists booking_status_history_booking_idx
  on public.booking_status_history (booking_id, created_at desc);
create index if not exists audit_logs_clinic_created_idx
  on public.audit_logs (clinic_id, created_at desc);
create index if not exists service_documents_service_idx
  on public.service_documents (service_id, is_active, sort_order);
create index if not exists incoming_messages_created_idx on public.incoming_messages (created_at desc);
create index if not exists outgoing_messages_status_idx on public.outgoing_messages (status, created_at);

-- Staff Auth users are provisioned inactive; an administrator must explicitly
-- activate/assign them. This trigger never trusts user-editable metadata for role.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.staff_profiles (id, display_name, role, is_active)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), ''), 'booking', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_staff_profile on auth.users;
create trigger on_auth_user_created_staff_profile
after insert on auth.users
for each row execute function private.handle_new_auth_user();
