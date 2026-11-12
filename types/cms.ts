export interface SocialLinkItem {
  platform: 'facebook' | 'youtube' | 'whatsapp' | 'mohp' | 'twitter' | 'instagram' | string;
  label: string;
  url: string;
  is_active: boolean;
}

export interface NoticeAnnouncement {
  id: string;
  title: string;
  summary: string;
  message?: string;
  details?: string;
  image_url?: string;
  link_url?: string;
  starts_at?: string;
  ends_at?: string;
  is_enabled?: boolean;
  show_on_site?: boolean;
  send_push?: boolean;
  display?: NoticeBarDisplayConfig;
}

export interface NoticeBarDisplayConfig {
  placement?: 'top' | 'below_header' | 'after_hero' | 'after_primary_actions' | 'after_clinics' | 'after_how_it_works' | 'before_footer' | 'floating';
  width?: 'full' | 'contained';
  height?: 'compact' | 'standard';
  autoplay_enabled?: boolean;
  autoplay_seconds?: number;
}

export interface NoticeBarConfig {
  is_enabled: boolean;
  urgent_enabled?: boolean;
  title: string;
  message: string;
  hotline_label: string;
  announcements?: NoticeAnnouncement[];
  display?: NoticeBarDisplayConfig;
}

export interface WebsiteSettings {
  id: string;
  site_name: string;
  site_tagline: string;
  header_logo_url: string;
  footer_logo_url: string;
  favicon_url: string;
  contact_phone: string;
  emergency_hotline: string;
  contact_email: string;
  hospital_address: string;
  working_hours: string;
  meta_title: string;
  meta_description: string;
  og_image_url: string;
  canonical_url?: string;
  hospital_website_url?: string;
  social_links: SocialLinkItem[];
  notice_bar: NoticeBarConfig;
  footer_summary: string;
  footer_copyright: string;
  footer_status_badge: string;
  is_published: boolean;
  published_at?: string;
  updated_at?: string;
  updated_by?: string;
}

export interface HeroFeatureBullet {
  icon: string;
  title: string;
  desc: string;
}

export interface HeroSectionContent {
  description: string;
  primary_cta_label: string;
  primary_cta_url: string;
  primary_cta_visible: boolean;
  secondary_cta_label: string;
  secondary_cta_url: string;
  secondary_cta_visible: boolean;
  feature_card_title: string;
  feature_card_badge: string;
  feature_card_bullets: HeroFeatureBullet[];
  feature_card_footer: string;
}

export interface TrustStatItem {
  value: string;
  label: string;
  desc: string;
  icon: string;
  accent_color: string;
  bg_color: string;
}

export interface TrustStatsSectionContent {
  items: TrustStatItem[];
}

export interface PrimaryActionsSectionContent {
  card1_title: string;
  card1_desc: string;
  card1_btn: string;
  card1_url: string;
  card2_title: string;
  card2_desc: string;
  card2_btn: string;
  card2_url: string;
}

export interface HowItWorksStep {
  num: string;
  title: string;
  desc: string;
  icon: string;
}

export interface HowItWorksSectionContent {
  steps: HowItWorksStep[];
}

export interface HospitalBannerSectionContent {
  btn_label: string;
  btn_url: string;
  icon: string;
}

export interface GuidelineCardItem {
  title: string;
  icon: string;
  color: string;
  items: string[];
}

export interface PatientGuidelinesSectionContent {
  cards: GuidelineCardItem[];
}

export interface TrustPillarItem {
  title: string;
  desc: string;
  icon?: string;
  color?: string;
}

export interface TrustInfoSectionContent {
  pillars: TrustPillarItem[];
}

export interface FaqQuestionItem {
  q?: string;
  a?: string;
  question?: string;
  answer?: string;
  category?: string;
  is_active?: boolean;
}

export interface FaqSectionContent {
  items: FaqQuestionItem[];
}

export type SectionType =
  | 'hero'
  | 'trust_stats'
  | 'primary_actions'
  | 'clinics'
  | 'how_it_works'
  | 'hospital_banner'
  | 'trust_info'
  | 'patient_guidelines'
  | 'faq';

export interface HomepageSection<T = any> {
  id: SectionType | string;
  display_order: number;
  is_visible: boolean;
  title: string;
  subtitle?: string;
  badge_text?: string;
  content: T;
  updated_at?: string;
  updated_by?: string;
}

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  display_order: number;
  is_visible?: boolean;
  is_active?: boolean;
  is_external?: boolean;
  target?: '_self' | '_blank' | string;
  location?: 'HEADER' | 'FOOTER_QUICK' | 'FOOTER_LEGAL' | string;
  icon_name?: string;
}

export interface ClinicPresentation {
  id: string;
  name: string;
  description?: string;
  location?: string;
  working_hours?: string;
  working_days?: string[];
  display_order: number;
  is_featured_on_homepage: boolean;
  english_title?: string;
  accent_color?: string;
  icon_name?: string;
  code?: string;
  instructions?: string;
  is_hospital_confirmed: boolean;
  is_active: boolean;
}

export interface MediaAsset {
  id: string;
  name: string;
  url: string;
  mime_type: string;
  size_bytes?: number;
  size?: number;
  alt_text?: string;
  created_at?: string;
  is_custom?: boolean;
}

export interface CmsFullPayload {
  settings: WebsiteSettings;
  sections: HomepageSection[];
  navigation: NavigationItem[];
  clinics: ClinicPresentation[];
}
