export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type StaffRole = 'ADMIN' | 'RECEPTIONIST' | 'DOCTOR';

export type AppointmentStatus =
  | 'PENDING_REVIEW'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'SKIPPED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Database {
  public: {
    Tables: {
      clinics: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          location: string;
          working_hours: string;
          days_of_week: number[];
          max_daily_slots: number;
          slot_duration_minutes: number;
          instructions: string | null;
          is_active: boolean;
          is_hospital_confirmed: boolean;
          display_order: number;
          is_featured_on_homepage: boolean;
          english_title: string | null;
          accent_color: string | null;
          icon_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          description?: string | null;
          location: string;
          working_hours?: string;
          days_of_week?: number[];
          max_daily_slots?: number;
          slot_duration_minutes?: number;
          instructions?: string | null;
          is_active?: boolean;
          is_hospital_confirmed?: boolean;
          display_order?: number;
          is_featured_on_homepage?: boolean;
          english_title?: string | null;
          accent_color?: string | null;
          icon_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          location?: string;
          working_hours?: string;
          days_of_week?: number[];
          max_daily_slots?: number;
          slot_duration_minutes?: number;
          instructions?: string | null;
          is_active?: boolean;
          is_hospital_confirmed?: boolean;
          display_order?: number;
          is_featured_on_homepage?: boolean;
          english_title?: string | null;
          accent_color?: string | null;
          icon_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_profiles: {
        Row: {
          id: string;
          username: string;
          full_name: string;
          role: StaffRole;
          clinic_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name: string;
          role?: StaffRole;
          clinic_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          username?: string;
          full_name?: string;
          role?: StaffRole;
          clinic_id?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      clinic_schedules: {
        Row: {
          id: string;
          clinic_id: string;
          schedule_date: string;
          max_capacity: number;
          is_closed: boolean;
          closure_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          schedule_date: string;
          max_capacity?: number;
          is_closed?: boolean;
          closure_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          schedule_date?: string;
          max_capacity?: number;
          is_closed?: boolean;
          closure_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          reference_number: string;
          clinic_id: string;
          clinic_name: string;
          service_id: string | null;
          service_name: string | null;
          patient_name: string;
          phone_number: string;
          patient_age: string | null;
          date_of_birth: string | null;
          patient_address: string | null;
          guardian_national_id: string | null;
          booking_code_hash: string | null;
          appointment_date: string;
          appointment_time: string;
          status: AppointmentStatus;
          queue_number: number | null;
          last_called_at: string | null;
          called_count: number;
          notes: string | null;
          fee_paid: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference_number: string;
          clinic_id: string;
          clinic_name: string;
          service_id?: string | null;
          service_name?: string | null;
          patient_name: string;
          phone_number: string;
          patient_age?: string | null;
          date_of_birth?: string | null;
          patient_address?: string | null;
          guardian_national_id?: string | null;
          booking_code_hash?: string | null;
          appointment_date: string;
          appointment_time?: string;
          status?: AppointmentStatus;
          queue_number?: number | null;
          last_called_at?: string | null;
          called_count?: number;
          notes?: string | null;
          fee_paid?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          reference_number?: string;
          clinic_id?: string;
          clinic_name?: string;
          service_id?: string | null;
          service_name?: string | null;
          patient_name?: string;
          phone_number?: string;
          patient_age?: string | null;
          date_of_birth?: string | null;
          patient_address?: string | null;
          guardian_national_id?: string | null;
          booking_code_hash?: string | null;
          appointment_date?: string;
          appointment_time?: string;
          status?: AppointmentStatus;
          queue_number?: number | null;
          last_called_at?: string | null;
          called_count?: number;
          notes?: string | null;
          fee_paid?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      appointment_status_history: {
        Row: {
          id: string;
          appointment_id: string;
          status: AppointmentStatus;
          note: string | null;
          updated_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          appointment_id: string;
          status: AppointmentStatus;
          note?: string | null;
          updated_by?: string | null;
          created_at?: string;
        };
        Update: {
          status?: AppointmentStatus;
          note?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          details: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          details?: Json | null;
        };
        Relationships: [];
      };
      website_settings: {
        Row: {
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
          canonical_url: string | null;
          social_links: Json;
          notice_bar: Json;
          footer_summary: string;
          footer_copyright: string;
          footer_status_badge: string;
          is_published: boolean;
          published_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          site_name?: string;
          site_tagline?: string;
          header_logo_url?: string;
          footer_logo_url?: string;
          favicon_url?: string;
          contact_phone?: string;
          emergency_hotline?: string;
          contact_email?: string;
          hospital_address?: string;
          working_hours?: string;
          meta_title?: string;
          meta_description?: string;
          og_image_url?: string;
          canonical_url?: string | null;
          social_links?: Json;
          notice_bar?: Json;
          footer_summary?: string;
          footer_copyright?: string;
          footer_status_badge?: string;
          is_published?: boolean;
          published_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          site_name?: string;
          site_tagline?: string;
          header_logo_url?: string;
          footer_logo_url?: string;
          favicon_url?: string;
          contact_phone?: string;
          emergency_hotline?: string;
          contact_email?: string;
          hospital_address?: string;
          working_hours?: string;
          meta_title?: string;
          meta_description?: string;
          og_image_url?: string;
          canonical_url?: string | null;
          social_links?: Json;
          notice_bar?: Json;
          footer_summary?: string;
          footer_copyright?: string;
          footer_status_badge?: string;
          is_published?: boolean;
          published_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      homepage_sections: {
        Row: {
          id: string;
          display_order: number;
          is_visible: boolean;
          title: string | null;
          subtitle: string | null;
          badge_text: string | null;
          content: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id: string;
          display_order?: number;
          is_visible?: boolean;
          title?: string | null;
          subtitle?: string | null;
          badge_text?: string | null;
          content?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          display_order?: number;
          is_visible?: boolean;
          title?: string | null;
          subtitle?: string | null;
          badge_text?: string | null;
          content?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      navigation_items: {
        Row: {
          id: string;
          label: string;
          href: string;
          display_order: number;
          is_visible: boolean;
          is_external: boolean;
          location: string;
          icon_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          label: string;
          href: string;
          display_order?: number;
          is_visible?: boolean;
          is_external?: boolean;
          location?: string;
          icon_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          label?: string;
          href?: string;
          display_order?: number;
          is_visible?: boolean;
          is_external?: boolean;
          location?: string;
          icon_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      media_assets: {
        Row: {
          id: string;
          name: string;
          url: string;
          mime_type: string;
          size_bytes: number;
          alt_text: string | null;
          storage_path: string | null;
          bucket_id: string | null;
          is_custom: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id: string;
          name: string;
          url: string;
          mime_type?: string;
          size_bytes?: number;
          alt_text?: string | null;
          storage_path?: string | null;
          bucket_id?: string | null;
          is_custom?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          url?: string;
          mime_type?: string;
          size_bytes?: number;
          alt_text?: string | null;
          storage_path?: string | null;
          bucket_id?: string | null;
          is_custom?: boolean;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      web_push_subscriptions: {
        Row: {
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      otp_verifications: {
        Row: {
          phone: string;
          code_hash: string;
          attempts: number;
          expires_at: string;
          last_requested_at: string;
          hourly_request_count: number;
          window_start: string;
          created_at: string;
        };
        Insert: {
          phone: string;
          code_hash: string;
          attempts?: number;
          expires_at: string;
          last_requested_at?: string;
          hourly_request_count?: number;
          window_start?: string;
          created_at?: string;
        };
        Update: {
          phone?: string;
          code_hash?: string;
          attempts?: number;
          expires_at?: string;
          last_requested_at?: string;
          hourly_request_count?: number;
          window_start?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      book_appointment_atomic: {
        Args: {
          p_clinic_id: string;
          p_patient_name: string;
          p_phone_number: string;
          p_patient_age?: string | null;
          p_patient_address?: string | null;
          p_appointment_date?: string | null;
          p_appointment_time?: string;
          p_reference_number?: string | null;
          p_service_id?: string | null;
          p_guardian_national_id?: string | null;
          p_staff_user_id?: string | null;
          p_date_of_birth?: string | null;
        };
        Returns: Json;
      };
      transfer_appointment_clinic_atomic: {
        Args: {
          p_appointment_id: string;
          p_target_clinic_id: string;
          p_target_service_id: string;
          p_staff_user_id?: string | null;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      normalize_patient_name: {
        Args: { p_name: string };
        Returns: string;
      };
      format_patient_age: {
        Args: { p_dob: string; p_on_date: string };
        Returns: string | null;
      };
      track_appointment_secure: {
        Args: {
          p_reference_number: string;
          p_phone_number: string;
        };
        Returns: {
          reference_number: string;
          clinic_id: string;
          clinic_name: string;
          patient_name: string;
          appointment_date: string;
          appointment_time: string;
          status: AppointmentStatus;
          queue_number: number | null;
        }[];
      };
      is_active_staff: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_current_staff_role: {
        Args: Record<string, never>;
        Returns: StaffRole;
      };
      get_doctor_clinic_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
    };
    Enums: {
      staff_role: StaffRole;
      appointment_status: AppointmentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
