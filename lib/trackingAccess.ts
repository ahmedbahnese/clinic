/**
 * BSCH Clinics — Modular Tracking Access Verification & Booking Code Service
 *
 * Design Invariants:
 * 1. Tracking verification uses Phone number + CSPRNG Booking Code printed on the
 *    receipt ticket (BOOKING_CODE). The SMS/OTP verification mode (OTP_SMS) has been
 *    permanently disabled by hospital decision (no SMS gateway contracted), so the
 *    mode can no longer be switched through environment variables.
 * 2. Booking Code Security:
 *    - Generated via CSPRNG with 12 characters from an unambiguous alphabet (no 0/O, 1/I/L).
 *    - Only its HMAC-SHA256 hash is persisted in the database (`booking_code_hash`).
 *    - The unhashed code is returned ONCE to the user upon initial booking confirmation, and never again.
 *    - Verification uses constant-time hash comparison to prevent timing attacks.
 */

import { randomInt, createHmac } from 'crypto';
import { constantTimeHashCompare } from './otp.ts';

// Unambiguous alphabet (omits 0, O, 1, I, L)
const UNAMBIGUOUS_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export type TrackingAccessMode = 'BOOKING_CODE';

export const TRACKING_ACCESS_MODE: TrackingAccessMode = 'BOOKING_CODE';

/**
 * Generates a cryptographically secure 12-character booking code.
 */
export function generateBookingCode(): string {
  let result = '';
  const len = UNAMBIGUOUS_ALPHABET.length;
  for (let i = 0; i < 12; i++) {
    result += UNAMBIGUOUS_ALPHABET[randomInt(0, len)];
  }
  // Formatted in 3 groups of 4 for readability: e.g. ABCD-EFGH-JKLM
  return `${result.slice(0, 4)}-${result.slice(4, 8)}-${result.slice(8, 12)}`;
}

/**
 * Keyed HMAC-SHA256 of the booking code.
 */
export function hashBookingCode(code: string): string {
  const clean = code.trim().toUpperCase().replace(/[^23456789A-Z]/g, '');
  const secret =
    process.env.OTP_HASH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'bsch_booking_code_hmac_secret_2026';

  return createHmac('sha256', secret).update(clean).digest('hex');
}

export interface VerifyTrackingAccessParams {
  phone: string;
  bookingCode?: string;
  expectedBookingCodeHash?: string;
  validBookingCodeHashes?: string[];
}

export interface TrackingAccessResult {
  valid: boolean;
  error?: string;
  modeUsed: TrackingAccessMode;
}

/**
 * Centralized tracking access verifier.
 */
export async function verifyTrackingAccess(
  params: VerifyTrackingAccessParams
): Promise<TrackingAccessResult> {
  // Phone + CSPRNG Booking Code from printed receipt
  if (!params.bookingCode || params.bookingCode.trim() === '') {
    return {
      valid: false,
      error: 'يرجى إدخال كود الحجز المطبوع على إيصال التذكرة.',
      modeUsed: 'BOOKING_CODE',
    };
  }

  const inputHash = hashBookingCode(params.bookingCode);
  const targetHashes =
    params.validBookingCodeHashes && params.validBookingCodeHashes.length > 0
      ? params.validBookingCodeHashes
      : params.expectedBookingCodeHash
      ? [params.expectedBookingCodeHash]
      : [];

  let isMatch = false;
  if (targetHashes.length > 0) {
    for (const h of targetHashes) {
      if (constantTimeHashCompare(h, inputHash)) {
        isMatch = true;
      }
    }
  } else {
    // Constant-time dummy comparison to equalize timing when phone has no bookings
    const dummyHash = '0000000000000000000000000000000000000000000000000000000000000000';
    constantTimeHashCompare(dummyHash, inputHash);
  }

  if (!isMatch) {
    // Uniform error prevents phone-number enumeration
    return {
      valid: false,
      error: 'بيانات الاستعلام غير متطابقة، يرجى التأكد من رقم الهاتف وكود الحجز المطبوع على الإيصال.',
      modeUsed: 'BOOKING_CODE',
    };
  }

  return {
    valid: true,
    modeUsed: 'BOOKING_CODE',
  };
}
