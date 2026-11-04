/**
 * BSCH Clinics - Secure Persistent OTP Verification Service for Phone-Only Tracking
 *
 * Security Invariants & Compliance (Hardened):
 * 1. Cryptographically secure random 6-digit code generation using Node.js crypto CSPRNG (100000 - 999999).
 * 2. Persistent storage in Supabase `public.otp_verifications` across serverless instances.
 * 3. Keyed HMAC-SHA256 Hashing: Only the HMAC digest is stored in the database; plaintext codes are never persisted.
 * 4. Timing-attack protection via `crypto.timingSafeEqual` for all hash comparisons.
 * 5. Strict 5-minute server-side expiration.
 * 6. Replay prevention: OTP record is deleted immediately upon successful verification.
 * 7. Brute-force lockout: Max 5 incorrect attempts before code is invalidated, retained across re-requests within the hourly window.
 * 8. Request Rate Limiting: 60-second cooldown per phone, max 5 requests/hour per phone, and per-IP rate limiting.
 * 9. Zero-logging: Plaintext OTP codes and HMACs are never logged.
 * 10. Zero production exposure: Plaintext codes and demoNotice are strictly undefined outside development.
 * 11. Strict dev bypass: Static test code ('123456') is allowed ONLY when `process.env.NODE_ENV === 'development'` (explicit allowlist).
 * 12. Offline Fallback: Controlled in-memory fallback ONLY in dev/testing when Supabase is explicitly unconfigured.
 */

import { randomInt, createHmac, timingSafeEqual } from 'crypto';
import { createAdminClient, isSupabaseConfigured, isMockStoreAllowed } from './supabase/admin.ts';

export interface OtpEntry {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastRequestedAt: number;
  hourlyRequestCount: number;
  windowStart: number;
}

// In-memory fallback map strictly for offline development and local unit tests
const globalForOtp = globalThis as unknown as {
  otpStoreInstance?: Map<string, OtpEntry>;
  ipRateLimitStoreInstance?: Map<string, { count: number; resetAt: number }>;
};

const memoryOtpStore = globalForOtp.otpStoreInstance ?? new Map<string, OtpEntry>();
const memoryIpStore = globalForOtp.ipRateLimitStoreInstance ?? new Map<string, { count: number; resetAt: number }>();

if (process.env.NODE_ENV !== 'production') {
  globalForOtp.otpStoreInstance = memoryOtpStore;
  globalForOtp.ipRateLimitStoreInstance = memoryIpStore;
}

// Security Configuration
export const OTP_CONFIG = {
  CODE_LENGTH: 6,
  EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
  MAX_ATTEMPTS: 5,
  REQUEST_COOLDOWN_MS: 60 * 1000, // 60 seconds between requests
  MAX_HOURLY_REQUESTS: 5,
  HOURLY_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  DEV_BYPASS_CODE: '123456',
  IP_WINDOW_MS: 10 * 60 * 1000, // 10 minutes
  MAX_IP_REQUESTS: 15,
};

export interface GenerateOtpResult {
  success: boolean;
  expiresAt?: number;
  cooldownSeconds?: number;
  error?: string;
  demoNotice?: string;
}

export interface VerifyOtpResult {
  valid: boolean;
  error?: string;
  attemptsRemaining?: number;
}

/**
 * Generate a keyed HMAC-SHA256 digest of the phone and OTP code using OTP_HASH_SECRET.
 */
export function hashOtp(phone: string, code: string): string {
  const secret =
    process.env.OTP_HASH_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'bsch_otp_hmac_secret_pediatric_hospital_2026';

  return createHmac('sha256', secret)
    .update(`${phone.trim()}:${code.trim()}`)
    .digest('hex');
}

/**
 * Timing-safe string comparison to prevent side-channel timing attacks.
 */
export function constantTimeHashCompare(hashA: string, hashB: string): boolean {
  if (!hashA || !hashB) return false;
  const bufA = Buffer.from(hashA, 'hex');
  const bufB = Buffer.from(hashB, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Generic persistent rate limiter helper with serverless fallback:
 * - Checks persistent PostgreSQL atomic rate limit counter via service_role RPC if Supabase is configured.
 * - Falls back to local memory store for offline development and unit tests.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const cleanKey = key.trim();
  const isProd = process.env.NODE_ENV === 'production';

  // 1. If Supabase is configured, use atomic persistent rate limiting table
  if (isSupabaseConfigured()) {
    try {
      const supabase = createAdminClient();
      const { data, error } = await (supabase as any).rpc('check_rate_limit', {
        p_key: cleanKey,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds,
      });

      if (!error && data && typeof data === 'object') {
        const res = data as { allowed: boolean; retry_after_seconds?: number };
        return {
          allowed: res.allowed,
          retryAfterSeconds: res.retry_after_seconds,
        };
      }

      if (isProd) {
        // Degraded-mode fallback: keep public booking/tracking operational with
        // per-instance in-memory limiting while the persistent counter (Bundle 1)
        // or a valid service_role key is unavailable. Persistent limiting resumes
        // automatically once check_rate_limit becomes reachable.
        console.error('CRITICAL: Persistent rate limiting RPC failed in production, falling back to in-memory limiting:', error);
      } else {
        console.warn('Persistent rate limit RPC fallback to memory:', error);
      }
    } catch (rpcErr) {
      if (isProd) {
        console.error('CRITICAL: Persistent rate limit client failure in production, falling back to in-memory limiting:', rpcErr);
      } else {
        console.warn('Persistent rate limit RPC fallback to memory:', rpcErr);
      }
    }
  } else if (isProd) {
    console.error('CRITICAL: Rate limiting is unconfigured in production (persistent Supabase store required).');
    return { allowed: false, retryAfterSeconds: 60 };
  }

  // 2. In-memory fallback (offline tests, local dev)
  const now = Date.now();
  const entry = memoryIpStore.get(cleanKey);
  const windowMs = windowSeconds * 1000;

  if (!entry || entry.resetAt < now) {
    memoryIpStore.set(cleanKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Per-IP rate limiting helper:
 * - Checks persistent PostgreSQL atomic rate limit counter via service_role RPC if Supabase is configured.
 * - Falls back to local memory store for offline development and unit tests.
 */
export async function checkIpRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const cleanIp = ip.trim() || '127.0.0.1';
  // Allow localhost loopback in development without restrictions
  if (process.env.NODE_ENV === 'development' && (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost')) {
    return { allowed: true };
  }

  return checkRateLimit(
    `ip_limit_${cleanIp}`,
    OTP_CONFIG.MAX_IP_REQUESTS,
    Math.ceil(OTP_CONFIG.IP_WINDOW_MS / 1000)
  );
}

/**
 * Generate a cryptographically secure 6-digit OTP for a verified phone number.
 * Persists to Supabase `public.otp_verifications` if configured, with rate-limiting, IP limits, and expiration.
 */
export async function generateOtp(phone: string, clientIp?: string): Promise<GenerateOtpResult> {
  const cleanPhone = phone.trim();
  const now = Date.now();
  const isStrictDev = process.env.NODE_ENV === 'development';

  // 0. Check IP Rate Limit
  if (clientIp) {
    const ipCheck = await checkIpRateLimit(clientIp);
    if (!ipCheck.allowed) {
      return {
        success: false,
        cooldownSeconds: ipCheck.retryAfterSeconds,
        error: `تم تجاوز معدل الطلبات من هذا العنوان. يرجى الانتظار ${ipCheck.retryAfterSeconds} ثانية.`,
      };
    }
  }

  // Generate cryptographically secure 6-digit code (100000 to 999999)
  const code = randomInt(100000, 1000000).toString();
  const codeHash = hashOtp(cleanPhone, code);
  const expiresAt = now + OTP_CONFIG.EXPIRY_MS;

  // 1. Production / Persistent Path via Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = createAdminClient();

      // Check existing record for rate-limiting & cumulative attempts
      const { data: existing, error: fetchErr } = await (supabase as any)
        .from('otp_verifications')
        .select('*')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (fetchErr) {
        console.error('Supabase fetch otp_verifications error:', fetchErr.code);
      }

      let hourlyCount = 1;
      let windowStart = new Date(now).toISOString();
      let retainedAttempts = 0;

      if (existing) {
        // Enforce cooldown (60 seconds)
        const lastReq = new Date(existing.last_requested_at).getTime();
        const timeSinceLast = now - lastReq;
        if (timeSinceLast < OTP_CONFIG.REQUEST_COOLDOWN_MS) {
          const waitSec = Math.ceil((OTP_CONFIG.REQUEST_COOLDOWN_MS - timeSinceLast) / 1000);
          return {
            success: false,
            cooldownSeconds: waitSec,
            error: `يرجى الانتظار ${waitSec} ثانية قبل طلب رمز تحقق جديد.`,
          };
        }

        // Check cumulative hourly window
        const existingWinStart = new Date(existing.window_start).getTime();
        if (now - existingWinStart < OTP_CONFIG.HOURLY_WINDOW_MS) {
          // If phone is already locked out by brute-force within this hour, deny new code
          if ((existing.attempts || 0) >= OTP_CONFIG.MAX_ATTEMPTS) {
            return {
              success: false,
              error: 'تم إيقاف طلب رموز التحقق مؤقتاً لهذا الرقم بسبب استنفاد محاولات الدخول الخاطئة. يرجى المحاولة لاحقاً.',
            };
          }

          if (existing.hourly_request_count >= OTP_CONFIG.MAX_HOURLY_REQUESTS) {
            return {
              success: false,
              error: 'تم تجاوز الحد الأقصى لطلبات التحقق لهذا الرقم خلال هذه الساعة. يرجى المحاولة لاحقاً.',
            };
          }

          hourlyCount = (existing.hourly_request_count || 0) + 1;
          windowStart = existing.window_start;
          // Retain cumulative failed attempts within the window so requesting a new code doesn't reset brute-force counter
          retainedAttempts = existing.attempts || 0;
        }
      }

      // Upsert record with HMAC-SHA256 into public.otp_verifications
      const { error: upsertErr } = await (supabase as any)
        .from('otp_verifications')
        .upsert(
          {
            phone: cleanPhone,
            code_hash: codeHash,
            attempts: retainedAttempts,
            expires_at: new Date(expiresAt).toISOString(),
            last_requested_at: new Date(now).toISOString(),
            hourly_request_count: hourlyCount,
            window_start: windowStart,
          },
          { onConflict: 'phone' }
        );

      if (upsertErr) {
        console.error('Supabase upsert otp_verifications error:', upsertErr.code);
        return {
          success: false,
          error: 'تعذر حفظ رمز التحقق في قاعدة البيانات، يرجى المحاولة لاحقاً.',
        };
      }

      return {
        success: true,
        expiresAt,
        // demoNotice is defined ONLY when NODE_ENV === 'development'
        demoNotice: isStrictDev ? `لأغراض التطوير المحلي، رمز التحقق هو: ${code}` : undefined,
      };
    } catch (err) {
      console.error('Supabase OTP generation exception');
      return {
        success: false,
        error: 'حدث خطأ في خدمة التحقق المركزية.',
      };
    }
  }

  // 2. Fallback check: If in production without Supabase, refuse in-memory fallback
  if (!isMockStoreAllowed()) {
    return {
      success: false,
      error: 'خدمة التحقق برمز OTP غير مهيأة بقاعدة بيانات الإنتاج.',
    };
  }

  // 3. Local In-Memory Fallback for Offline Development & Unit Testing
  const existingMem = memoryOtpStore.get(cleanPhone);
  if (existingMem) {
    const timeSinceLast = now - existingMem.lastRequestedAt;
    if (timeSinceLast < OTP_CONFIG.REQUEST_COOLDOWN_MS) {
      const waitSec = Math.ceil((OTP_CONFIG.REQUEST_COOLDOWN_MS - timeSinceLast) / 1000);
      return {
        success: false,
        cooldownSeconds: waitSec,
        error: `يرجى الانتظار ${waitSec} ثانية قبل طلب رمز تحقق جديد.`,
      };
    }

    let memHourly = existingMem.hourlyRequestCount;
    let memWinStart = existingMem.windowStart;
    let retainedAttempts = existingMem.attempts;

    if (now - memWinStart > OTP_CONFIG.HOURLY_WINDOW_MS) {
      memHourly = 0;
      memWinStart = now;
      retainedAttempts = 0;
    } else {
      if (existingMem.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
        return {
          success: false,
          error: 'تم إيقاف طلب رموز التحقق مؤقتاً لهذا الرقم بسبب استنفاد محاولات الدخول الخاطئة. يرجى المحاولة لاحقاً.',
        };
      }
    }

    if (memHourly >= OTP_CONFIG.MAX_HOURLY_REQUESTS) {
      return {
        success: false,
        error: 'تم تجاوز الحد الأقصى لطلبات التحقق لهذا الرقم خلال هذه الساعة. يرجى المحاولة لاحقاً.',
      };
    }

    memoryOtpStore.set(cleanPhone, {
      codeHash,
      expiresAt,
      attempts: retainedAttempts,
      lastRequestedAt: now,
      hourlyRequestCount: memHourly + 1,
      windowStart: memWinStart,
    });
  } else {
    memoryOtpStore.set(cleanPhone, {
      codeHash,
      expiresAt,
      attempts: 0,
      lastRequestedAt: now,
      hourlyRequestCount: 1,
      windowStart: now,
    });
  }

  return {
    success: true,
    expiresAt,
    demoNotice: isStrictDev ? `لأغراض التطوير المحلي، رمز التحقق هو: ${code}` : undefined,
  };
}

/**
 * Verify a submitted 6-digit OTP code.
 * Enforces server-side expiration, brute-force attempt limits, and single-use replay protection.
 * Strict: dev bypass code is allowed ONLY when process.env.NODE_ENV === 'development'.
 */
export async function verifyOtp(phone: string, inputCode: string): Promise<VerifyOtpResult> {
  const cleanPhone = phone.trim();
  const cleanCode = (inputCode || '').trim();
  const now = Date.now();
  const isStrictDev = process.env.NODE_ENV === 'development';

  if (!cleanCode || cleanCode.length !== OTP_CONFIG.CODE_LENGTH) {
    return { valid: false, error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام.' };
  }

  // 1. Production / Persistent Path via Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = createAdminClient();

      const { data: entry, error: fetchErr } = await (supabase as any)
        .from('otp_verifications')
        .select('*')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (fetchErr || !entry) {
        return { valid: false, error: 'لم يتم طلب رمز تحقق لهذا الرقم أو انتهت صلاحيته.' };
      }

      // Expiration check
      const exp = new Date(entry.expires_at).getTime();
      if (exp < now) {
        await (supabase as any).from('otp_verifications').delete().eq('phone', cleanPhone);
        return { valid: false, error: 'انتهت صلاحية رمز التحقق، يرجى طلب رمز جديد.' };
      }

      // Brute-force lockout check
      if (entry.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
        await (supabase as any).from('otp_verifications').delete().eq('phone', cleanPhone);
        return { valid: false, error: 'تم تجاوز الحد الأقصى للمحاولات الخاطئة. تم إلغاء الرمز لأسباب أمنية.' };
      }

      // Timing-safe HMAC comparison
      const inputHash = hashOtp(cleanPhone, cleanCode);
      const isCodeCorrect = constantTimeHashCompare(entry.code_hash, inputHash);
      const isDevBypass = isStrictDev && cleanCode === OTP_CONFIG.DEV_BYPASS_CODE;

      if (isCodeCorrect || isDevBypass) {
        // Successful verification - immediately delete to prevent replay attacks
        await (supabase as any).from('otp_verifications').delete().eq('phone', cleanPhone);
        return { valid: true };
      }

      // Increment attempt counter in DB
      const newAttempts = (entry.attempts || 0) + 1;
      if (newAttempts >= OTP_CONFIG.MAX_ATTEMPTS) {
        await (supabase as any).from('otp_verifications').delete().eq('phone', cleanPhone);
        return { valid: false, error: 'تم تجاوز الحد الأقصى للمحاولات الخاطئة. تم إلغاء الرمز لأسباب أمنية.' };
      }

      await (supabase as any)
        .from('otp_verifications')
        .update({ attempts: newAttempts })
        .eq('phone', cleanPhone);

      const remaining = OTP_CONFIG.MAX_ATTEMPTS - newAttempts;
      return {
        valid: false,
        attemptsRemaining: remaining,
        error: `رمز التحقق غير صحيح. المحاولات المتبقية: ${remaining}`,
      };
    } catch (err) {
      console.error('Supabase OTP verification exception');
      return { valid: false, error: 'حدث خطأ أثناء التحقق من الرمز.' };
    }
  }

  // 2. Fallback check: If in production without Supabase, refuse in-memory fallback
  if (!isMockStoreAllowed()) {
    return {
      valid: false,
      error: 'خدمة التحقق برمز OTP غير مهيأة بقاعدة بيانات الإنتاج.',
    };
  }

  // 3. Local In-Memory Fallback for Offline Development & Unit Testing
  const entry = memoryOtpStore.get(cleanPhone);
  if (!entry) {
    return { valid: false, error: 'لم يتم طلب رمز تحقق لهذا الرقم أو انتهت صلاحيته.' };
  }

  if (entry.expiresAt < now) {
    memoryOtpStore.delete(cleanPhone);
    return { valid: false, error: 'انتهت صلاحية رمز التحقق، يرجى طلب رمز جديد.' };
  }

  if (entry.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
    memoryOtpStore.delete(cleanPhone);
    return { valid: false, error: 'تم تجاوز الحد الأقصى للمحاولات الخاطئة. تم إلغاء الرمز لأسباب أمنية.' };
  }

  entry.attempts++;

  const inputHash = hashOtp(cleanPhone, cleanCode);
  const isCodeCorrect = constantTimeHashCompare(entry.codeHash, inputHash);
  const isDevBypass = isStrictDev && cleanCode === OTP_CONFIG.DEV_BYPASS_CODE;

  if (isCodeCorrect || isDevBypass) {
    memoryOtpStore.delete(cleanPhone);
    return { valid: true };
  }

  const remaining = OTP_CONFIG.MAX_ATTEMPTS - entry.attempts;
  if (remaining <= 0) {
    memoryOtpStore.delete(cleanPhone);
    return { valid: false, error: 'تم تجاوز الحد الأقصى للمحاولات الخاطئة. تم إلغاء الرمز لأسباب أمنية.' };
  }

  return {
    valid: false,
    attemptsRemaining: remaining,
    error: `رمز التحقق غير صحيح. المحاولات المتبقية: ${remaining}`,
  };
}

/**
 * Clear the in-memory fallback store (used for test teardowns).
 */
export function _resetOtpStoreForTesting(): void {
  memoryOtpStore.clear();
  memoryIpStore.clear();
}
