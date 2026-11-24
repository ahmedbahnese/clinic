-- Per-service exceptional booking day and capacity.
ALTER TABLE public.clinic_services
  ADD COLUMN IF NOT EXISTS exception_date DATE NULL,
  ADD COLUMN IF NOT EXISTS exception_capacity INTEGER NULL;

ALTER TABLE public.clinic_services
  DROP CONSTRAINT IF EXISTS chk_service_exception_capacity;

ALTER TABLE public.clinic_services
  ADD CONSTRAINT chk_service_exception_capacity
  CHECK (exception_capacity IS NULL OR exception_capacity > 0);

COMMENT ON COLUMN public.clinic_services.exception_date IS
  'Optional exceptional date on which this specific service is available.';
COMMENT ON COLUMN public.clinic_services.exception_capacity IS
  'Capacity for exception_date for this specific service.';
