import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types.ts';

/**
 * Creates an administrative Supabase client using the server-side Service Role Key.
 *
 * Security Invariants:
 * 1. NEVER falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY or Publishable key.
 * 2. In production (NODE_ENV === 'production'), strictly fails closed by throwing an Error
 *    if the Service Role key is unconfigured, preventing silent privilege degradation.
 * 3. Never exposed or shipped to the browser or client components.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL: Supabase admin client cannot be created in production without valid service role key (SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY).'
      );
    }
    // Safe offline placeholder strictly for local development and unit test harness
    return createClient<Database>(
      supabaseUrl || 'https://placeholder-project.supabase.co',
      'placeholder-service-role-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates an authenticated Supabase client scoped to a verified user JWT.
 *
 * Security Invariants:
 * 1. Attaches the user's verified Bearer JWT to all outgoing requests.
 * 2. Executes in PostgreSQL under the `authenticated` role with `auth.uid()` set to the user ID.
 * 3. Enforces PostgreSQL Row Level Security (RLS) policies and triggers natively.
 */
export function createUserClient(userJwtToken: string) {
  if (!userJwtToken || !userJwtToken.trim()) {
    throw new Error('User JWT token is required to create an authenticated Supabase user client.');
  }

  const cleanToken = userJwtToken.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    'placeholder-anon-key';

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return Boolean(
    url &&
    !url.includes('placeholder') &&
    anonKey &&
    !anonKey.includes('placeholder')
  );
}

/**
 * Validates if Supabase server-side service-role key is provided for administrative writes.
 */
export function isSupabaseAdminConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(
    url &&
    !url.includes('placeholder') &&
    serviceKey &&
    !serviceKey.includes('placeholder')
  );
}

/**
 * Determines whether in-memory mock fallback operations are permitted.
 * Rules:
 * 1. If Supabase is configured, all operations MUST target Supabase; mock fallback is FORBIDDEN.
 * 2. In production (NODE_ENV === 'production'), mock fallback is STRICTLY FORBIDDEN.
 * 3. In development/testing, mock fallback is only allowed when Supabase is explicitly unconfigured.
 */
export function isMockStoreAllowed(): boolean {
  if (isSupabaseConfigured()) {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return true;
}
