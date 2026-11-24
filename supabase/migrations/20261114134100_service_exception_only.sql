ALTER TABLE public.clinic_services
  ADD COLUMN IF NOT EXISTS exception_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clinic_services.exception_only IS
  'When true, the service is bookable only on exception_date; otherwise regular clinic days remain available.';
