-- ========================================================================
-- BSCH Clinics — Provisioning REAL Initial Staff Accounts (Client Handover)
-- File: supabase/scripts/20261104_provision_initial_staff_accounts.sql
-- Run in: Supabase Dashboard -> SQL Editor (executes as postgres)
-- ========================================================================
--
-- WHAT THIS SCRIPT DOES:
--   1. Creates (or resets) REAL Supabase Auth users for the initial accounts
--      with cryptographically random TEMPORARY passwords.
--   2. Links every account to public.staff_profiles through the hardened
--      public.provision_staff_member(...) RPC (idempotent upsert).
--   3. Is IDEMPOTENT: safe to re-run. Existing auth users keep their UUID
--      and only get their temporary password reset.
--
-- TEMPORARY PASSWORDS (change them at FIRST login from the dashboard via
-- "تغيير كلمة المرور"):
--   admin          -> 1be5796184415ed3d9806889
--   reception      -> 965c371b110085943bf2687b
--   doctor.echo    -> 73221123e25c1f8921b8ecb8
--
-- PREREQUISITES (Supabase Dashboard -> Authentication):
--   1. DISABLE "Allow new users to sign up" (public sign-ups MUST be off).
--   2. DISABLE "Confirm email" for internal staff accounts.
--   3. STAFF_AUTH_DOMAIN on Vercel must match the domain used below
--      (default: hospital.internal).
--
-- IMPORTANT NOTES:
--   * If the admin changes their password later, update STAFF_DEFAULT_PASSWORD
--     on Vercel to the same value (it is used by the server-side system
--     session fallback when the service-role key is unavailable).
--   * Hardcoded demo credentials (admin2026 / bsch2026) were REMOVED from
--     the login flow. These accounts are now the ONLY way in.
-- ========================================================================

-- Required for password hashing (already enabled by default on Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_admin_id     UUID;
  v_reception_id UUID;
  v_doctor_id    UUID;
BEGIN
  ----------------------------------------------------------------------
  -- 1) ADMIN — إدارة نظم المعلومات والعيادات الخارجية
  ----------------------------------------------------------------------
  SELECT id INTO v_admin_id
  FROM auth.users
  WHERE lower(email) = lower('admin@hospital.internal')
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, is_sso_user, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id, 'authenticated', 'authenticated', 'admin@hospital.internal',
      crypt('1be5796184415ed3d9806889', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"إدارة نظم المعلومات والعيادات الخارجية"}'::jsonb,
      false, false, now(), now()
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_admin_id, v_admin_id,
      jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@hospital.internal', 'email_verified', true),
      'email', v_admin_id, now(), now(), now()
    );
  ELSE
    -- Account already exists: only reset to the temporary password
    UPDATE auth.users
       SET encrypted_password   = crypt('1be5796184415ed3d9806889', gen_salt('bf')),
           email_confirmed_at   = now(),
           raw_app_meta_data    = '{"provider":"email","providers":["email"]}'::jsonb,
           is_sso_user          = false,
           banned_until         = NULL,
           deleted_at           = NULL,
           updated_at           = now()
     WHERE id = v_admin_id;
  END IF;

  PERFORM public.provision_staff_member(
    p_user_id   := v_admin_id,
    p_username  := 'admin',
    p_full_name := 'إدارة نظم المعلومات والعيادات الخارجية',
    p_role      := 'ADMIN'::public.staff_role,
    p_clinic_id := NULL
  );

  ----------------------------------------------------------------------
  -- 2) RECEPTIONIST — موظف الحجز والاستقبال
  ----------------------------------------------------------------------
  SELECT id INTO v_reception_id
  FROM auth.users
  WHERE lower(email) = lower('reception@hospital.internal')
  LIMIT 1;

  IF v_reception_id IS NULL THEN
    v_reception_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, is_sso_user, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_reception_id, 'authenticated', 'authenticated', 'reception@hospital.internal',
      crypt('965c371b110085943bf2687b', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"أ/ منى عبد الرحيم (موظف الحجز والاستقبال)"}'::jsonb,
      false, false, now(), now()
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_reception_id, v_reception_id,
      jsonb_build_object('sub', v_reception_id::text, 'email', 'reception@hospital.internal', 'email_verified', true),
      'email', v_reception_id, now(), now(), now()
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password   = crypt('965c371b110085943bf2687b', gen_salt('bf')),
           email_confirmed_at   = now(),
           raw_app_meta_data    = '{"provider":"email","providers":["email"]}'::jsonb,
           is_sso_user          = false,
           banned_until         = NULL,
           deleted_at           = NULL,
           updated_at           = now()
     WHERE id = v_reception_id;
  END IF;

  PERFORM public.provision_staff_member(
    p_user_id   := v_reception_id,
    p_username  := 'reception',
    p_full_name := 'أ/ منى عبد الرحيم (موظف الحجز والاستقبال)',
    p_role      := 'RECEPTIONIST'::public.staff_role,
    p_clinic_id := NULL
  );

  ----------------------------------------------------------------------
  -- 3) DOCTOR — طبيب عيادة الإيكو (echo)
  ----------------------------------------------------------------------
  SELECT id INTO v_doctor_id
  FROM auth.users
  WHERE lower(email) = lower('doctor.echo@hospital.internal')
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    v_doctor_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, is_sso_user, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_doctor_id, 'authenticated', 'authenticated', 'doctor.echo@hospital.internal',
      crypt('73221123e25c1f8921b8ecb8', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"د/ شريف عبد الغني (استشاري قلب وإيكو الأطفال)"}'::jsonb,
      false, false, now(), now()
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_doctor_id, v_doctor_id,
      jsonb_build_object('sub', v_doctor_id::text, 'email', 'doctor.echo@hospital.internal', 'email_verified', true),
      'email', v_doctor_id, now(), now(), now()
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password   = crypt('73221123e25c1f8921b8ecb8', gen_salt('bf')),
           email_confirmed_at   = now(),
           raw_app_meta_data    = '{"provider":"email","providers":["email"]}'::jsonb,
           is_sso_user          = false,
           banned_until         = NULL,
           deleted_at           = NULL,
           updated_at           = now()
     WHERE id = v_doctor_id;
  END IF;

  PERFORM public.provision_staff_member(
    p_user_id   := v_doctor_id,
    p_username  := 'doctor.echo',
    p_full_name := 'د/ شريف عبد الغني (استشاري قلب وإيكو الأطفال)',
    p_role      := 'DOCTOR'::public.staff_role,
    p_clinic_id := 'echo'
  );

  RAISE NOTICE 'Staff accounts provisioned: admin=% / reception=% / doctor.echo=%',
    v_admin_id, v_reception_id, v_doctor_id;
END $$;

-- ------------------------------------------------------------------------
-- VERIFICATION QUERIES (optional, read-only):
-- ------------------------------------------------------------------------
-- SELECT id, email, email_confirmed_at, created_at
--   FROM auth.users
--  WHERE email LIKE '%@hospital.internal'
--  ORDER BY email;
--
-- SELECT id, username, full_name, role, clinic_id, is_active, updated_at
--   FROM public.staff_profiles
--  ORDER BY username;
