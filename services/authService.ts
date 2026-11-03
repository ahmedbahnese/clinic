import type { StaffUser } from '../types/index.ts';
import { createClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  isSupabaseConfigured,
  isSupabaseAdminConfigured,
  isMockStoreAllowed,
} from '../lib/supabase/admin.ts';

export interface AuthSession {
  user: StaffUser;
  token: string;
  expiresAt: number;
}

// Offline test fixtures strictly utilized in local development / unit testing when Supabase is unconfigured
const TEST_STAFF_FIXTURES: (StaffUser & { passwordHash: string })[] = [
  {
    id: 'user-rec-1',
    username: 'reception',
    name: 'أ/ منى عبد الرحيم (موظف الحجز والاستقبال)',
    role: 'RECEPTIONIST',
    passwordHash: 'bsch2026',
    active: true,
  },
  {
    id: 'user-doc-1',
    username: 'doctor.echo',
    name: 'د/ شريف عبد الغني (استشاري قلب وإيكو الأطفال)',
    role: 'DOCTOR',
    clinicId: 'echo',
    passwordHash: 'bsch2026',
    active: true,
  },
  {
    id: 'user-admin-1',
    username: 'admin',
    name: 'إدارة نظم المعلومات والعيادات الخارجية',
    role: 'ADMIN',
    passwordHash: 'admin2026',
    active: true,
  },
];

// In-memory sessions map strictly for offline unit tests / development
const globalForAuth = globalThis as unknown as {
  activeSessions?: Map<string, AuthSession>;
};

const memoryActiveSessions = globalForAuth.activeSessions ?? new Map<string, AuthSession>();
if (process.env.NODE_ENV !== 'production') {
  globalForAuth.activeSessions = memoryActiveSessions;
}

export class AuthService {
  /**
   * Validate staff credentials using Supabase Auth in production or mock fallback in dev tests.
   */
  public static async validateCredentials(
    usernameInput: string,
    passwordInput: string
  ): Promise<AuthSession | null> {
    if (!usernameInput || !passwordInput) return null;
    const cleanUser = usernameInput.trim();
    const cleanPass = passwordInput.trim();

    // 1. Supabase Auth Path
    if (isSupabaseConfigured()) {
      try {
        let authClient: any = null;
        if (isSupabaseAdminConfigured()) {
          try {
            authClient = createAdminClient();
          } catch {
            authClient = null;
          }
        }
        if (!authClient) {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
          const supabaseAnonKey =
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
            process.env.SUPABASE_ANON_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
            '';
          authClient = createClient(supabaseUrl, supabaseAnonKey);
        }

        const staffDomain = process.env.STAFF_AUTH_DOMAIN || 'hospital.internal';
        const email = cleanUser.includes('@') ? cleanUser : `${cleanUser.toLowerCase()}@${staffDomain}`;

        const { data, error } = await authClient.auth.signInWithPassword({
          email,
          password: cleanPass,
        });

        if (error || !data.user || !data.session) {
          return null;
        }

        // Map auth.users record to verified public.staff_profiles
        let profile = null;
        if (isSupabaseAdminConfigured()) {
          try {
            const adminClient = createAdminClient();
            const { data: adminProf, error: profileErr } = await (adminClient as any)
              .from('staff_profiles')
              .select('id, username, full_name, role, clinic_id, is_active')
              .eq('id', data.user.id)
              .maybeSingle();

            if (!profileErr && adminProf) {
              profile = adminProf;
            }
          } catch {
            profile = null;
          }
        }

        if (!profile && data.session?.access_token) {
          // Fallback to verified authenticated user client under RLS
          const userClient = createUserClient(data.session.access_token);
          const { data: userProf } = await (userClient as any)
            .from('staff_profiles')
            .select('id, username, full_name, role, clinic_id, is_active')
            .eq('id', data.user.id)
            .maybeSingle();
          profile = userProf;
        }

        if (!profile || profile.is_active !== true) {
          return null; // Fail closed: reject inactive, suspended, or unlinked user
        }

        const safeUser: StaffUser = {
          id: profile.id,
          username: profile.username,
          name: profile.full_name,
          role: profile.role,
          clinicId: profile.clinic_id || undefined,
          active: profile.is_active,
        };

        return {
          user: safeUser,
          token: data.session.access_token,
          expiresAt: Date.now() + (data.session.expires_in || 28800) * 1000,
        };
      } catch (err) {
        console.error('Supabase signInWithPassword exception:', err);
        return null;
      }
    }

    // 2. Production safety check: In-memory authentication is strictly forbidden in production
    if (!isMockStoreAllowed()) {
      throw new Error('تسجيل الدخول غير متاح: قاعدة بيانات المصادقة غير مهيأة في بيئة الإنتاج.');
    }

    // 3. Offline Dev / Unit Test Fallback
    const user = TEST_STAFF_FIXTURES.find(
      (u) => u.username.toLowerCase() === cleanUser.toLowerCase() && u.active
    );
    if (!user) return null;
    if (user.passwordHash !== cleanPass) return null;

    const { passwordHash: _, ...safeUser } = user;
    const token = `bsch_token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const session: AuthSession = {
      user: safeUser,
      token,
      expiresAt: Date.now() + 1000 * 60 * 60 * 8, // 8 hours
    };
    memoryActiveSessions.set(token, session);
    return session;
  }

  /**
   * Verify an authentication token against Supabase Auth and staff_profiles.
   * Never trusts client-supplied roles.
   */
  public static async verifySession(token: string | null | undefined): Promise<StaffUser | null> {
    if (!token) return null;
    const cleanToken = token.trim();

    // 1. Supabase Auth Verification
    if (isSupabaseConfigured()) {
      try {
        let userRecord = null;
        if (isSupabaseAdminConfigured()) {
          try {
            const adminClient = createAdminClient();
            const { data, error } = await adminClient.auth.getUser(cleanToken);
            if (!error && data?.user) {
              userRecord = data.user;
            }
          } catch {
            userRecord = null;
          }
        }
        if (!userRecord) {
          try {
            const userClient = createUserClient(cleanToken);
            const { data, error } = await userClient.auth.getUser();
            if (error || !data?.user) {
              return null;
            }
            userRecord = data.user;
          } catch {
            return null;
          }
        }

        // Query server-enforced role and clinic assignment from staff_profiles
        let profile = null;
        if (isSupabaseAdminConfigured()) {
          try {
            const adminClient = createAdminClient();
            const { data: adminProf, error: adminErr } = await (adminClient as any)
              .from('staff_profiles')
              .select('id, username, full_name, role, clinic_id, is_active')
              .eq('id', userRecord.id)
              .maybeSingle();

            if (!adminErr && adminProf) {
              profile = adminProf;
            }
          } catch {
            profile = null;
          }
        }

        if (!profile) {
          const userClient = createUserClient(cleanToken);
          const { data: userProf } = await (userClient as any)
            .from('staff_profiles')
            .select('id, username, full_name, role, clinic_id, is_active')
            .eq('id', userRecord.id)
            .maybeSingle();
          profile = userProf;
        }

        if (!profile || profile.is_active !== true) {
          return null; // Fail closed: reject inactive or missing staff profile
        }

        return {
          id: profile.id,
          username: profile.username,
          name: profile.full_name,
          role: profile.role,
          clinicId: profile.clinic_id || undefined,
          active: profile.is_active,
        };
      } catch (err) {
        console.error('Supabase verifySession exception:', err);
        return null;
      }
    }

    // 2. Production Safety: In-memory verification forbidden in production
    if (!isMockStoreAllowed()) {
      return null;
    }

    // 3. Offline Dev / Unit Test Fallback
    const session = memoryActiveSessions.get(cleanToken);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      memoryActiveSessions.delete(cleanToken);
      return null;
    }
    return session.user;
  }

  /**
   * Revoke an active session.
   */
  public static async revokeSession(token: string): Promise<boolean> {
    if (!token) return false;
    const cleanToken = token.trim();

    if (isSupabaseConfigured()) {
      try {
        const adminClient = createAdminClient();
        await adminClient.auth.admin.signOut(cleanToken).catch(() => {});
        return true;
      } catch {
        return false;
      }
    }

    return memoryActiveSessions.delete(cleanToken);
  }

  /**
   * Helper for offline test teardowns
   */
  public static _resetMockSessionsForTesting(): void {
    memoryActiveSessions.clear();
  }
}
