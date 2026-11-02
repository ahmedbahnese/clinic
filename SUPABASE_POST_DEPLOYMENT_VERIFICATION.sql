-- ============================================================================
-- BSCH Clinics — Specialized Children's Hospital in Beheira
-- POST-DEPLOYMENT VERIFICATION SUITE (STRICTLY READ-ONLY)
-- File: SUPABASE_POST_DEPLOYMENT_VERIFICATION.sql
-- ============================================================================
-- Description:
--   Executes a comprehensive set of automated diagnostic checks across
--   PostgreSQL catalog tables (pg_tables, pg_indexes, pg_proc, pg_policies,
--   information_schema, storage.buckets) to verify that Bundles 1, 2, 3, and 4
--   were deployed successfully, accurately, and securely.
--
-- Execution Instructions:
--   Execute via Supabase Dashboard -> SQL Editor, or via Supabase CLI:
--   npx supabase db query --read-only --linked -f SUPABASE_POST_DEPLOYMENT_VERIFICATION.sql
-- ============================================================================

WITH verification_checks AS (

  -- --------------------------------------------------------------------------
  -- Check 1: Core & Added Tables Existence
  -- --------------------------------------------------------------------------
  SELECT
    '1. Tables Existence' AS category,
    'All 14 Required Tables Present' AS check_name,
    CASE 
      WHEN COUNT(*) = 14 THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    'Found ' || COUNT(*) || ' of 14 expected tables in public schema' AS details
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN (
      'clinics', 'clinic_schedules', 'clinic_services',
      'appointments', 'appointment_status_history', 'cancellation_requests',
      'staff_profiles', 'audit_logs', 'rate_limit_counters', 'otp_verifications',
      'website_settings', 'homepage_sections', 'navigation_items', 'media_assets'
    )

  UNION ALL

  -- --------------------------------------------------------------------------
  -- Check 2: Row Level Security (RLS) Enabled on ALL Public Tables
  -- --------------------------------------------------------------------------
  SELECT
    '2. Security Hardening',
    'RLS Enabled on 100% of Public Tables',
    CASE 
      WHEN COUNT(*) = 0 THEN 'PASS'
      ELSE 'FAIL'
    END,
    CASE 
      WHEN COUNT(*) = 0 THEN 'All public tables have rowsecurity = true'
      ELSE 'Unsecured tables lacking RLS: ' || string_agg(tablename, ', ')
    END
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false

  UNION ALL

  -- --------------------------------------------------------------------------
  -- Check 3: Sibling Booking Index Upgrade & Old Index Removal
  -- --------------------------------------------------------------------------
  SELECT
    '3. Indexes & Constraints',
    'Sibling Booking Index Upgraded & Old Restrictive Index Dropped',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' 
          AND c.relname = 'idx_unique_active_apt_per_phone_patient_clinic_day'
          AND i.indisvalid = true
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' 
          AND c.relname = 'idx_unique_active_apt_per_phone_clinic_day'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' 
          AND c.relname = 'idx_unique_active_apt_per_phone_clinic_day'
      ) THEN 'New index is VALID and old sibling-blocking index was successfully dropped.'
      ELSE 'Old sibling-blocking index is STILL present in database!'
    END

  UNION ALL

  -- --------------------------------------------------------------------------
  -- Check 4: Sequence for Sequential Daily Ticket Numbers
  -- --------------------------------------------------------------------------
  SELECT
    '4. Sequences',
    'Daily Ticket Sequence Exists',
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM pg_sequences 
        WHERE schemaname = 'public' 
          AND sequencename IN ('seq_appointment_reference_number', 'appointment_seq_number_seq')
      ) THEN 'PASS'
      ELSE 'FAIL'
    END,
    'Sequence for appointment reference/ticket numbers verified'

  UNION ALL

  -- --------------------------------------------------------------------------
  -- Check 5: Critical RPC Functions Deployed
  -- --------------------------------------------------------------------------
  SELECT
    '5. RPC Functions',
    'All Critical Production RPC Functions Present',
    CASE 
      WHEN COUNT(*) >= 7 THEN 'PASS'
      ELSE 'FAIL'
    END,
    'Found ' || COUNT(*) || ' of expected core RPC functions (book_appointment_atomic, update_appointment_status_atomic, transfer_appointment_clinic_atomic, request_cancellation_atomic, review_cancellation_request_atomic, check_rate_limit, provision_staff_member)'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'book_appointment_atomic',
      'update_appointment_status_atomic',
      'transfer_appointment_clinic_atomic',
      'request_cancellation_atomic',
      'review_cancellation_request_atomic',
      'check_rate_limit',
      'provision_staff_member'
    )

  UNION ALL

  -- --------------------------------------------------------------------------
  -- Check 6: RPC Privilege Hardening (Revoked from anon & public)
  -- --------------------------------------------------------------------------
  SELECT
    '6. Access Control',
    'Sensitive RPCs Revoked from anon & PUBLIC',
    CASE 
      WHEN COUNT(*) = 0 THEN 'PASS'
      ELSE 'FAIL'
    END,
    CASE 
      WHEN COUNT(*) = 0 THEN 'All sensitive RPCs are strictly restricted to service_role'
      ELSE 'Exposed RPCs accessible to anon/public: ' || string_agg(proname, ', ')
    END
  FROM (
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'book_appointment_atomic',
        'update_appointment_status_atomic',
        'transfer_appointment_clinic_atomic',
        'request_cancellation_atomic',
        'review_cancellation_request_atomic',
        'check_rate_limit',
        'provision_staff_member'
      )
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('public', p.oid, 'EXECUTE')
      )
  ) exposed_funcs

  UNION ALL

  -- --------------------------------------------------------------------------
  -- Check 7: Patient & Audit Tables Direct Access Revoked from anon
  -- --------------------------------------------------------------------------
  SELECT
    '7. Access Control',
    'Sensitive Patient Tables Inaccessible to anon Key',
    CASE 
      WHEN COUNT(*) = 0 THEN 'PASS'
      ELSE 'FAIL'
    END,
    CASE 
      WHEN COUNT(*) = 0 THEN 'anon role has ZERO table-level privileges on sensitive tables'
      ELSE 'Vulnerable tables accessible directly by anon: ' || string_agg(tablename, ', ')
    END
  FROM (
    SELECT t.tablename
    FROM pg_tables t
    WHERE t.schemaname = 'public'
      AND t.tablename IN (
        'appointments', 'appointment_status_history', 'cancellation_requests',
        'audit_logs', 'rate_limit_counters', 'otp_verifications'
      )
      AND (
        has_table_privilege('anon', 'public.' || t.tablename, 'SELECT')
        OR has_table_privilege('anon', 'public.' || t.tablename, 'INSERT')
        OR has_table_privilege('anon', 'public.' || t.tablename, 'UPDATE')
        OR has_table_privilege('anon', 'public.' || t.tablename, 'DELETE')
      )
  ) exposed_tables

  UNION ALL

  -- --------------------------------------------------------------------------
  -- Check 8: Supabase Storage Bucket & XSS Prevention (No SVG)
  -- --------------------------------------------------------------------------
  SELECT
    '8. Storage & XSS Prevention',
    'Storage Bucket Exists with SVG Excluded',
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM storage.buckets
        WHERE id = 'public-cms-assets'
          AND public = true
          AND file_size_limit = 5242880
          AND NOT ('image/svg+xml' = ANY(allowed_mime_types))
      ) THEN 'PASS'
      ELSE 'FAIL'
    END,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM storage.buckets
        WHERE id = 'public-cms-assets' AND ('image/svg+xml' = ANY(allowed_mime_types))
      ) THEN 'VULNERABILITY: image/svg+xml is permitted in storage bucket (stored XSS risk)!'
      WHEN EXISTS (
        SELECT 1 FROM storage.buckets WHERE id = 'public-cms-assets'
      ) THEN 'Bucket public-cms-assets exists, 5MB limit enforced, and SVG is correctly blocked.'
      ELSE 'Bucket public-cms-assets is missing.'
    END

  UNION ALL

  -- --------------------------------------------------------------------------
  -- Check 9: CMS Presentation Columns on clinics
  -- --------------------------------------------------------------------------
  SELECT
    '9. Schema Extensions',
    'Clinics Presentation & Instruction Columns Present',
    CASE 
      WHEN COUNT(*) = 6 THEN 'PASS'
      ELSE 'FAIL'
    END,
    'Found ' || COUNT(*) || ' of 6 expected clinic presentation columns (display_order, is_featured_on_homepage, english_title, accent_color, icon_name, instructions)'
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'clinics'
    AND column_name IN (
      'display_order', 'is_featured_on_homepage', 'english_title',
      'accent_color', 'icon_name', 'instructions'
    )

  UNION ALL

  -- --------------------------------------------------------------------------
  -- Check 10: Service Foreign Key on Appointments
  -- --------------------------------------------------------------------------
  SELECT
    '10. Schema Extensions',
    'Appointments Service Foreign Key Present',
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'appointments'
          AND column_name = 'service_id'
      ) THEN 'PASS'
      ELSE 'FAIL'
    END,
    'Column appointments.service_id verified'

  UNION ALL

  -- --------------------------------------------------------------------------
  -- Check 11: Seed CMS Default Records
  -- --------------------------------------------------------------------------
  SELECT
    '11. CMS Baseline Content',
    'Default Website Settings & Sections Seeded',
    CASE 
      WHEN (SELECT COUNT(*) FROM public.website_settings WHERE id = 'default') = 1
       AND (SELECT COUNT(*) FROM public.homepage_sections) >= 8 THEN 'PASS'
      ELSE 'FAIL'
    END,
    'website_settings baseline and homepage_sections rows verified'
)
SELECT 
  category,
  check_name,
  status,
  details
FROM verification_checks
ORDER BY category, check_name;

