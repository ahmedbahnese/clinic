-- Additive PWA support. No existing patient, staff, or content rows are changed or removed.

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT web_push_endpoint_length CHECK (char_length(endpoint) BETWEEN 1 AND 4096),
  CONSTRAINT web_push_p256dh_length CHECK (char_length(p256dh) BETWEEN 40 AND 512),
  CONSTRAINT web_push_auth_length CHECK (char_length(auth) BETWEEN 8 AND 512)
);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.web_push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.web_push_subscriptions TO service_role;

-- CMS assets are intentionally public and may contain only non-sensitive hospital material.
-- Add PDF support without changing bucket visibility, file limit, or existing MIME types.
UPDATE storage.buckets
SET allowed_mime_types = CASE
  WHEN allowed_mime_types IS NULL THEN ARRAY['application/pdf']::text[]
  WHEN 'application/pdf' = ANY(allowed_mime_types) THEN allowed_mime_types
  ELSE array_append(allowed_mime_types, 'application/pdf')
END
WHERE id = 'public-cms-assets';
