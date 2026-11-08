-- ============================================================================
-- BSCH Clinics — Specialized Children's Hospital in Beheira
-- PRODUCTION DEPLOYMENT BUNDLE 4: CMS, Media Storage, OTP & Staff Provisioning
-- ============================================================================
-- Description:
--   Deploys Website Content Management System (CMS), Supabase Storage configuration,
--   serverless OTP verification state store, and admin staff provisioning RPC.
--
-- Security Controls Included:
--   1. XSS Prevention in Storage: Allowed MIME types explicitly exclude 'image/svg+xml'
--      to eliminate stored Cross-Site Scripting (XSS) vectors via vector images.
--   2. Storage RLS: Public read access for 'public-cms-assets', upload/update/delete
--      strictly restricted to authenticated users with role = 'ADMIN'.
--   3. CMS Table RLS: Public (anon + authenticated) can view published content;
--      only authenticated users with role = 'ADMIN' can mutate settings, sections,
--      navigation items, and media records.
--   4. Serverless OTP Store: 'otp_verifications' table secured with RLS and revoked
--      from PUBLIC, anon, and authenticated. Accessible exclusively via 'service_role'.
--   5. Defense-in-depth Staff Provisioning: 'provision_staff_member' RPC is REVOKED
--      from PUBLIC, anon, and authenticated. Granted solely to 'service_role' (and
--      executable by 'postgres' in the Supabase Dashboard SQL Editor).
--
-- Prerequisite Dependencies:
--   - SUPABASE_PRODUCTION_BUNDLE_1.sql (Base schema, sequence, rate limiting)
--   - SUPABASE_PRODUCTION_BUNDLE_2.sql (Staff profiles, roles, get_current_staff_role)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. EXTEND CLINICS TABLE WITH PRESENTATION & INSTRUCTION ATTRIBUTES
-- ============================================================================

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_featured_on_homepage BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS english_title TEXT,
  ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) DEFAULT '#087F78',
  ADD COLUMN IF NOT EXISTS icon_name VARCHAR(50) DEFAULT 'Stethoscope',
  ADD COLUMN IF NOT EXISTS instructions TEXT;

COMMENT ON COLUMN public.clinics.instructions IS 
  'Medical preparation instructions, fasting guidelines, and required documents shown to patients upon booking.';

-- ============================================================================
-- 2. WEBSITE SETTINGS TABLE (إعدادات وهوية الموقع العامة)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.website_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  site_name TEXT NOT NULL DEFAULT 'BSCH Clinics',
  site_tagline TEXT NOT NULL DEFAULT 'مستشفى الأطفال التخصصي بالبحيرة',
  header_logo_url TEXT NOT NULL DEFAULT '/logo-outpatient.png',
  footer_logo_url TEXT NOT NULL DEFAULT '/logo-main.png',
  favicon_url TEXT NOT NULL DEFAULT '/favicon.ico',
  contact_phone TEXT NOT NULL DEFAULT '',
  emergency_hotline TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  hospital_address TEXT NOT NULL DEFAULT 'أبو حمص – دمسنا – محافظة البحيرة',
  working_hours TEXT NOT NULL DEFAULT '',
  meta_title TEXT NOT NULL DEFAULT 'BSCH Clinics — العيادات الخارجية لمستشفى الأطفال التخصصي بالبحيرة',
  meta_description TEXT NOT NULL DEFAULT 'منصة حجز المواعيد والاستعلام للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة — احجز موعدك بالاسم ورقم الهاتف فقط وتابع حالة حجزك وتعليمات الحضور.',
  og_image_url TEXT NOT NULL DEFAULT '/logo-main.png',
  canonical_url TEXT DEFAULT 'https://bsch-clinics.gov.eg',
  social_links JSONB NOT NULL DEFAULT '[
    {"platform": "facebook", "label": "فيسبوك", "url": "https://facebook.com", "is_active": false},
    {"platform": "youtube", "label": "يوتيوب", "url": "https://youtube.com", "is_active": false},
    {"platform": "mohp", "label": "وزارة الصحة", "url": "https://mohp.gov.eg", "is_active": false}
  ]'::jsonb,
  notice_bar JSONB NOT NULL DEFAULT '{
    "is_enabled": true,
    "title": "تنظيم العيادات الخارجية:",
    "message": "الحجز الإلكتروني متاح بنظام تذاكر الدور وأسبقية الحضور اليومي بالعيادات التخصصية.",
    "hotline_label": "مستشفى الأطفال التخصصي — دمسنا"
  }'::jsonb,
  footer_summary TEXT NOT NULL DEFAULT 'خدمة حكومية متخصصة لتقديم الرعاية الطبية الفائقة لأطفال محافظة البحيرة، من خلال نخبة من أطباء واستشاريي الأطفال في شتى التخصصات الدقيقة.',
  footer_copyright TEXT NOT NULL DEFAULT 'مستشفى الأطفال التخصصي بالبحيرة. جميع الحقوق محفوظة.',
  footer_status_badge TEXT NOT NULL DEFAULT 'المنظومة الإلكترونية للعيادات الخارجية — مستشفى الأطفال التخصصي',
  is_published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by TEXT DEFAULT 'admin'
);

-- Updated_at Trigger
DROP TRIGGER IF EXISTS trigger_website_settings_updated_at ON public.website_settings;
CREATE TRIGGER trigger_website_settings_updated_at
  BEFORE UPDATE ON public.website_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published website settings" ON public.website_settings;
CREATE POLICY "Public can view published website settings"
  ON public.website_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin can manage website settings" ON public.website_settings;
CREATE POLICY "Admin can manage website settings"
  ON public.website_settings FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- ============================================================================
-- 3. HOMEPAGE SECTIONS TABLE (أقسام ومحتوى الصفحة الرئيسية)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id VARCHAR(50) PRIMARY KEY,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  title TEXT,
  subtitle TEXT,
  badge_text TEXT,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by TEXT DEFAULT 'admin'
);

-- Updated_at Trigger
DROP TRIGGER IF EXISTS trigger_homepage_sections_updated_at ON public.homepage_sections;
CREATE TRIGGER trigger_homepage_sections_updated_at
  BEFORE UPDATE ON public.homepage_sections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view homepage sections" ON public.homepage_sections;
CREATE POLICY "Public can view homepage sections"
  ON public.homepage_sections FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin can manage homepage sections" ON public.homepage_sections;
CREATE POLICY "Admin can manage homepage sections"
  ON public.homepage_sections FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- ============================================================================
-- 4. NAVIGATION ITEMS TABLE (عناصر القوائم والروابط العامة)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.navigation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  is_external BOOLEAN NOT NULL DEFAULT false,
  location VARCHAR(30) NOT NULL DEFAULT 'HEADER', -- 'HEADER', 'FOOTER_QUICK', 'FOOTER_LEGAL'
  icon_name VARCHAR(50) DEFAULT 'Link',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_navigation_location_href'
  ) THEN
    ALTER TABLE public.navigation_items
      ADD CONSTRAINT uq_navigation_location_href UNIQUE (location, href);
  END IF;
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN null;
END $$;

-- Updated_at Trigger
DROP TRIGGER IF EXISTS trigger_navigation_items_updated_at ON public.navigation_items;
CREATE TRIGGER trigger_navigation_items_updated_at
  BEFORE UPDATE ON public.navigation_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.navigation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view navigation items" ON public.navigation_items;
CREATE POLICY "Public can view navigation items"
  ON public.navigation_items FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin can manage navigation items" ON public.navigation_items;
CREATE POLICY "Admin can manage navigation items"
  ON public.navigation_items FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- ============================================================================
-- 5. MEDIA ASSETS TABLE (مكتبة وسائط وإعلام الموقع)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.media_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'image/png',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  alt_text TEXT,
  storage_path TEXT,
  bucket_id TEXT DEFAULT 'public-cms-assets',
  is_custom BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by TEXT DEFAULT 'admin'
);

CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON public.media_assets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_is_custom ON public.media_assets (is_custom);

-- Updated_at Trigger
DROP TRIGGER IF EXISTS trigger_media_assets_updated_at ON public.media_assets;
CREATE TRIGGER trigger_media_assets_updated_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view media assets" ON public.media_assets;
CREATE POLICY "Public can view media assets"
  ON public.media_assets FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin can manage media assets" ON public.media_assets;
CREATE POLICY "Admin can manage media assets"
  ON public.media_assets FOR ALL
  TO authenticated
  USING (public.get_current_staff_role() = 'ADMIN')
  WITH CHECK (public.get_current_staff_role() = 'ADMIN');

-- ============================================================================
-- 6. OTP VERIFICATIONS TABLE (مخزن حالات التحقق لبيئات Serverless)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.otp_verifications (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  last_requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  hourly_request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- Strictly REVOKE access from public, anon, and authenticated
REVOKE ALL ON TABLE public.otp_verifications FROM PUBLIC, anon, authenticated;

-- GRANT exclusively to service_role (accessed solely by Next.js API server routes)
GRANT ALL ON TABLE public.otp_verifications TO service_role;

-- ============================================================================
-- 7. SUPABASE STORAGE BUCKET FOR CMS ASSETS (SVG REMOVED FOR XSS MITIGATION)
-- ============================================================================
-- Note: 'image/svg+xml' is intentionally EXCLUDED from allowed_mime_types
-- to eliminate stored Cross-Site Scripting (XSS) vectors.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-cms-assets',
  'public-cms-assets',
  true,
  5242880, -- 5 MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];

-- Storage RLS: Public can view assets
DROP POLICY IF EXISTS "Public Access to CMS Assets" ON storage.objects;
CREATE POLICY "Public Access to CMS Assets"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'public-cms-assets');

-- Storage RLS: Only authenticated Admin can upload / update / delete assets
DROP POLICY IF EXISTS "Admin can upload CMS Assets" ON storage.objects;
CREATE POLICY "Admin can upload CMS Assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'public-cms-assets' AND
    public.get_current_staff_role() = 'ADMIN'
  );

DROP POLICY IF EXISTS "Admin can update CMS Assets" ON storage.objects;
CREATE POLICY "Admin can update CMS Assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'public-cms-assets' AND
    public.get_current_staff_role() = 'ADMIN'
  );

DROP POLICY IF EXISTS "Admin can delete CMS Assets" ON storage.objects;
CREATE POLICY "Admin can delete CMS Assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'public-cms-assets' AND
    public.get_current_staff_role() = 'ADMIN'
  );

-- ============================================================================
-- 8. STAFF AUTH PROVISIONING RPC (دالة ربط وتأهيل حسابات الموظفين)
-- ============================================================================
DROP FUNCTION IF EXISTS public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT);

CREATE OR REPLACE FUNCTION public.provision_staff_member(
  p_user_id UUID,
  p_username TEXT,
  p_full_name TEXT,
  p_role staff_role,
  p_clinic_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role TEXT;
BEGIN
  -- Defense in depth:
  -- When invoked via SQL Editor, session_user is 'postgres'.
  -- When invoked via PostgREST with service_role key, auth.role() is 'service_role'.
  -- When invoked by an authenticated admin user, get_current_staff_role() is 'ADMIN'.
  BEGIN
    v_jwt_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND COALESCE(auth.role(), '') != 'service_role'
     AND COALESCE(v_jwt_role, '') != 'service_role'
     AND COALESCE(public.get_current_staff_role(), 'RECEPTIONIST'::staff_role) != 'ADMIN' THEN
    RAISE EXCEPTION 'Access denied: Only administrators or service_role can provision staff members.';
  END IF;

  INSERT INTO public.staff_profiles (id, username, full_name, role, clinic_id, is_active)
  VALUES (p_user_id, p_username, p_full_name, p_role, p_clinic_id, true)
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    clinic_id = EXCLUDED.clinic_id,
    is_active = true,
    updated_at = timezone('utc'::text, now());
END;
$$;

-- Strictly REVOKE execute privileges from anon, authenticated, and public
REVOKE ALL ON FUNCTION public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT) FROM authenticated;

-- GRANT execute privilege exclusively to service_role (and postgres in SQL Editor)
GRANT EXECUTE ON FUNCTION public.provision_staff_member(UUID, TEXT, TEXT, staff_role, TEXT) TO service_role;

-- ============================================================================
-- 9. SEED INITIAL CMS CONTENT IDEMPOTENTLY
-- ============================================================================

-- 9.1 Default Website Settings
INSERT INTO public.website_settings (
  id,
  site_name,
  site_tagline,
  header_logo_url,
  footer_logo_url,
  contact_phone,
  emergency_hotline,
  contact_email,
  hospital_address,
  working_hours,
  meta_title,
  meta_description,
  footer_summary,
  footer_copyright,
  footer_status_badge
)
VALUES (
  'default',
  'BSCH Clinics',
  'مستشفى الأطفال التخصصي بالبحيرة',
  '/logo-outpatient.png',
  '/logo-main.png',
  '',
  '',
  '',
  'أبو حمص – دمسنا – محافظة البحيرة',
  '',
  'BSCH Clinics — العيادات الخارجية لمستشفى الأطفال التخصصي بالبحيرة',
  'منصة حجز المواعيد والاستعلام للعيادات الخارجية بمستشفى الأطفال التخصصي بالبحيرة — احجز موعدك بالاسم ورقم الهاتف فقط وتابع حالة حجزك وتعليمات الحضور.',
  'خدمة حكومية متخصصة لتقديم الرعاية الطبية الفائقة لأطفال محافظة البحيرة، من خلال نخبة من أطباء واستشاريي الأطفال في شتى التخصصات الدقيقة.',
  'مستشفى الأطفال التخصصي بالبحيرة. جميع الحقوق محفوظة.',
  'المنظومة الإلكترونية للعيادات الخارجية — مستشفى الأطفال التخصصي'
)
ON CONFLICT (id) DO NOTHING;

-- 9.2 Navigation Items
INSERT INTO public.navigation_items (label, href, display_order, is_visible, is_external, location, icon_name)
VALUES
  ('الرئيسية', '/', 1, true, false, 'HEADER', 'Home'),
  ('حجز موعد', '/appointments/new', 2, true, false, 'HEADER', 'CalendarPlus'),
  ('متابعة حجز', '/appointments/track', 3, true, false, 'HEADER', 'Search'),
  ('حجز موعد جديد بالعيادات', '/appointments/new', 1, true, false, 'FOOTER_QUICK', 'CalendarPlus'),
  ('متابعة حالة الحجز وتعليمات الحضور', '/appointments/track', 2, true, false, 'FOOTER_QUICK', 'Search'),
  ('موقع وزارة الصحة والسكان', 'https://mohp.gov.eg', 3, true, true, 'FOOTER_QUICK', 'ExternalLink')
ON CONFLICT (location, href) DO NOTHING;

-- 9.3 Homepage Sections
INSERT INTO public.homepage_sections (id, display_order, is_visible, title, subtitle, badge_text, content)
VALUES
  (
    'hero',
    1,
    true,
    'العيادات الخارجية',
    'مستشفى الأطفال التخصصي بالبحيرة',
    'الحجز الإلكتروني متاح الآن لجميع عيادات الأسبوع',
    '{
      "description": "منظومة حجز رقمية متكاملة لتقديم رعاية طبية فائقة لأطفال محافظة البحيرة. احجز موعدك بالاسم ورقم الهاتف بدون تسجيل حساب، وتجنب طوابير الانتظار.",
      "primary_cta_label": "احجز موعدك الآن",
      "primary_cta_url": "/appointments/new",
      "primary_cta_visible": true,
      "secondary_cta_label": "متابعة حجز قائم",
      "secondary_cta_url": "/appointments/track",
      "secondary_cta_visible": true,
      "feature_card_title": "مميزات الحجز الإلكتروني",
      "feature_card_badge": "خدمة معتمدة",
      "feature_card_bullets": [
        {"icon": "Clock", "title": "زمن الحجز: دقيقة واحدة", "desc": "خطوات مبسطة وسلسة تناسب كافة الهواتف الذكية."},
        {"icon": "Smartphone", "title": "المتطلبات: الاسم ورقم الهاتف فقط", "desc": "بدون الحاجة لإنشاء حساب أو تذكر كلمات مرور معقدة."},
        {"icon": "Ticket", "title": "إيصال فوري برقم الدور", "desc": "تحديد موعد وتوقيت الحضور مع إمكانية طباعة الإيصال وحفظه."}
      ],
      "feature_card_footer": "مستشفى الأطفال التخصصي — أبو حمص – دمسنا – محافظة البحيرة"
    }'::jsonb
  ),
  (
    'trust_stats',
    2,
    true,
    'مؤشرات وإحصائيات المستشفى',
    'أرقام موثقة تعكس حجم الخدمة الطبية المتطورة',
    NULL,
    '{
      "items": [
        {"value": "٨ عيادات", "label": "عيادات تخصصية دقيقة", "desc": "قلب، أعصاب، أسنان، جراحة، وغيرها", "icon": "Stethoscope", "accent_color": "#087F78", "bg_color": "bg-emerald-50 text-emerald-700 border-emerald-100"},
        {"value": "١٠٠٪ رقمي", "label": "حجز إلكتروني منظم", "desc": "بدون طوابير شباك وبأرقام دور متتابعة", "icon": "CalendarCheck2", "accent_color": "#0D5F5A", "bg_color": "bg-teal-50 text-teal-700 border-teal-100"},
        {"value": "نخبة طبية", "label": "أطباء واستشاريون", "desc": "كوادر مؤهلة في طب وجراحة الأطفال", "icon": "Award", "accent_color": "#0284C7", "bg_color": "bg-sky-50 text-sky-700 border-sky-100"},
        {"value": "رعاية فائقة", "label": "أحدث التجهيزات الطبية", "desc": "عيادات تخصصية متكاملة لخدمة أطفال البحيرة", "icon": "ShieldCheck", "accent_color": "#087F78", "bg_color": "bg-emerald-50/70 text-emerald-800 border-emerald-200/60"}
      ]
    }'::jsonb
  ),
  (
    'primary_actions',
    3,
    true,
    'الإجراءات الرئيسية',
    'اختر مسارك السريع للوصول إلى الخدمة',
    NULL,
    '{
      "card1_title": "حجز موعد جديد",
      "card1_desc": "بدون تسجيل حساب – الاسم ورقم الهاتف فقط لاختيار العيادة والموعد المناسب.",
      "card1_btn": "ابدأ الحجز الآن",
      "card1_url": "/appointments/new",
      "card2_title": "متابعة حجزي",
      "card2_desc": "معرفة حالة الحجز، تأكيد الموعد، ورقم الدور وتعليمات الحضور برقم هاتفك.",
      "card2_btn": "استعلم عن حجزك",
      "card2_url": "/appointments/track"
    }'::jsonb
  ),
  (
    'clinics',
    4,
    true,
    'دليل العيادات التخصصية المتاحة',
    'استعرض التخصصات الدقيقة بمستشفى الأطفال التخصصي بالبحيرة واحجز موعد طفلك مباشرة في العيادة المناسبة.',
    'العيادات الخارجية التخصصية',
    '{
      "link_text": "عرض جدول كافة العيادات",
      "link_url": "/appointments/new"
    }'::jsonb
  ),
  (
    'how_it_works',
    5,
    true,
    'كيف يعمل النظام؟',
    'خطوات بسيطة وواضحة لتنظيم زيارة طفلك للعيادات الخارجية بكل سهولة',
    NULL,
    '{
      "steps": [
        {"num": "١. احجز", "title": "احجز موعدك", "desc": "اختر العيادة واليوم والموعد المناسب — يصل طلبك لموظف الحجز للمراجعة والتأكيد.", "icon": "Calendar"},
        {"num": "٢. تأكيد الحجز", "title": "تأكيد الحجز", "desc": "عند التأكيد يصبح حجزك مؤكدًا، وتظهر لك تعليمات الحضور والأوراق المطلوبة مع إمكانية طباعة الإيصال.", "icon": "ShieldCheck"},
        {"num": "٣. الحضور والكشف", "title": "الحضور والكشف بالعيادة", "desc": "حضور المريض في الموعد المحدد وتنظيم الكشف بالعيادة، مع إمكانية التحويل بين العيادات بنفس حجزك.", "icon": "UserCheck"}
      ]
    }'::jsonb
  ),
  (
    'hospital_banner',
    6,
    true,
    'مستشفى الأطفال التخصصي بالبحيرة',
    'زر موقع المستشفى الرسمي لمعرفة المزيد عن الخدمات والأقسام الطبية',
    NULL,
    '{
      "btn_label": "زيارة الموقع",
      "btn_url": "https://mohp.gov.eg",
      "icon": "Clock"
    }'::jsonb
  ),
  (
    'patient_guidelines',
    7,
    true,
    'تعليمات هامة لأولياء الأمور',
    'كل ما يهمك معرفته لضمان كشف ميسر وتجربة علاجية متكاملة لطفلك',
    NULL,
    '{
      "cards": [
        {
          "title": "ما يجب إحضاره عند الحضور",
          "icon": "FileText",
          "color": "#087F78",
          "items": [
            "شهادة ميلاد الطفل أو بطاقة التأمين الصحي (إن وجدت)",
            "أي تقارير طبية، فحوصات، تحاليل، أو أشعات سابقة تخص الحالة",
            "كتابة اسم الأدوية التي يتناولها الطفل بانتظام"
          ]
        },
        {
          "title": "إرشادات وتنظيم الحضور",
          "icon": "AlertCircle",
          "color": "#D97706",
          "items": [
            "يرجى الحضور قبل الموعد بـ 15 إلى 30 دقيقة لإنهاء إجراءات التأكيد",
            "يُسمح بمرافق واحد فقط مع الطفل لتجنب الزحام وحرصاً على سلامة الأطفال",
            "في حال التعذر عن الحضور يرجى إلغاء الموعد لإتاحة الفرصة لطفل آخر"
          ]
        },
        {
          "title": "التواصل والاستفسارات",
          "icon": "PhoneCall",
          "color": "#2563EB",
          "items": [
            "مقر المستشفى: أبو حمص – دمسنا – محافظة البحيرة",
            "تنظيم الدخول: بأسبقية الحضور وتذاكر الانتظار اليومية",
            "الاستعلام وتأكيد الحجز إلكترونياً بالاسم ورقم الهاتف فقط"
          ]
        }
      ]
    }'::jsonb
  ),
  (
    'faq',
    8,
    true,
    'الأسئلة الشائعة لأولياء الأمور',
    'إجابات واضحة ومباشرة عن كافة الاستفسارات المتعلقة بنظام الحجز الإلكتروني ومواعيد الزيارة.',
    'مركز المساعدة والإرشادات',
    '{
      "items": [
        {
          "question": "هل أحتاج لإنشاء حساب أو إدخال كلمة مرور لحجز موعد لطفلي؟",
          "answer": "لا، إطلاقاً. حرصاً على التيسير وسرعة الخدمة لأولياء الأمور، لا يتطلب النظام إنشاء أي حساب أو كلمة مرور. يمكنك حجز الموعد مباشرة بإدخال اسم الطفل ورقم هاتف ولي الأمر لاختيار العيادة والموعد المناسب في أقل من دقيقة.",
          "category": "إجراءات الحجز"
        },
        {
          "question": "ما هي الخطوات الواجب اتباعها عند الوصول إلى المستشفى في يوم الموعد؟",
          "answer": "يرجى التوجه إلى مكتب الاستقبال بالدور الأرضي بمبنى العيادات الخارجية قبل موعدك بـ 15 إلى 30 دقيقة، مع إبراز رقم الهاتف المسجل لتأكيد الحضور واستلام تذكرة الدخول للعيادة وتنسيق النداء الآلي.",
          "category": "يوم الكشف"
        },
        {
          "question": "هل يمكنني إلغاء الموعد إذا طرأ ظرف حال دون الحضور؟",
          "answer": "نعم، يمكنك تقديم طلب إلغاء للموعد في أي وقت عبر الدخول إلى صفحة متابعة حجز وإدخال رقم الهاتف المسجل، ثم الضغط على زر طلب إلغاء الموعد لمراجعة الطلب بواسطة فريق الاستقبال.",
          "category": "التعديل والإلغاء"
        },
        {
          "question": "ما هي المستندات والتحاليل الواجب إحضارها عند الكشف بالعيادة؟",
          "answer": "يرجى إحضار أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي، بالإضافة إلى أي تقارير طبية، فحوصات، تحاليل، رسم قلب، أو أشعات سابقة تتعلق بالحالة، مع تدوين قائمة الأدوية التي يتناولها الطفل بانتظام لمناظرتها مع الاستشاري المعالج.",
          "category": "المستندات والفحوصات"
        },
        {
          "question": "كيف يتم تنظيم الحضور واستقبال الأطفال في العيادات الخارجية؟",
          "answer": "يتم استقبال الأطفال المسجلين مسبقاً عبر المنصة وتنظيم الدخول بنظام تذاكر الدور وأسبقية الحضور اليومي، وفق جدول تشغيل العيادات التخصصية المعتمد بالمستشفى.",
          "category": "المواعيد والتنظيم"
        }
      ]
    }'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- 9.4 Media Assets Initial Seed
INSERT INTO public.media_assets (id, name, url, mime_type, size_bytes, is_custom)
VALUES
  ('asset-1', 'شعار العيادات الخارجية', '/logo-outpatient.png', 'image/png', 12040, false),
  ('asset-2', 'شعار المستشفى الرئيسي', '/logo-main.png', 'image/png', 24500, false),
  ('asset-3', 'أيقونة المتصفح الافتراضية', '/favicon.ico', 'image/x-icon', 4286, false)
ON CONFLICT (id) DO NOTHING;

-- 9.5 Clinic Presentation Attributes
UPDATE public.clinics SET english_title = 'Pediatric Cardiology', accent_color = '#DC2626', icon_name = 'HeartPulse', display_order = 1 WHERE id = 'cardio';
UPDATE public.clinics SET english_title = 'Echocardiography Unit', accent_color = '#0284C7', icon_name = 'Activity', display_order = 2 WHERE id = 'echo';
UPDATE public.clinics SET english_title = 'Pediatric Dentistry', accent_color = '#0D9488', icon_name = 'Smile', display_order = 3 WHERE id = 'dentistry';
UPDATE public.clinics SET english_title = 'Pediatric Neurology', accent_color = '#7C3AED', icon_name = 'Brain', display_order = 4 WHERE id = 'neuro';
UPDATE public.clinics SET english_title = 'Gastroenterology & Hepatology', accent_color = '#D97706', icon_name = 'Pill', display_order = 5 WHERE id = 'gi';
UPDATE public.clinics SET english_title = 'Clinical Nutrition', accent_color = '#16A34A', icon_name = 'Baby', display_order = 6 WHERE id = 'nutrition';
UPDATE public.clinics SET english_title = 'Audiology Clinic', accent_color = '#2563EB', icon_name = 'Ear', display_order = 7 WHERE id = 'audiology';
UPDATE public.clinics SET english_title = 'Pediatric Surgery', accent_color = '#E11D48', icon_name = 'Scissors', display_order = 8 WHERE id = 'surgery';

COMMIT;

-- Verification notice
DO $$
BEGIN
  RAISE NOTICE 'BSCH Clinics Production Bundle 4 deployed successfully: CMS, Storage, OTP & Staff Provisioning.';
END $$;

