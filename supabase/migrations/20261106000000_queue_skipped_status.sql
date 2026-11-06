-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- Migration: 20261106000000_queue_skipped_status.sql
-- Purpose:
--   Add the 'SKIPPED' queue lifecycle status to the appointment_status enum.
--   SKIPPED = تم التخطي (patient temporarily absent/stepped out; their turn
--   is preserved and they remain eligible for a manual "إدخال الآن" call).
--
--   NOTE: This migration intentionally contains ONLY the enum value addition.
--   PostgreSQL forbids using a newly added enum value within the same
--   transaction, so the RPC that references 'SKIPPED' is recreated in the
--   follow-up migration (20261106010000_*).
-- ========================================================================

ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'SKIPPED' AFTER 'CHECKED_IN';
