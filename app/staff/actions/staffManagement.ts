'use server';

import { cookies } from 'next/headers';
import { AuthService } from '@/services/authService';
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { appointmentStore } from '@/services/appointmentService';
import { STAFF_SESSION_COOKIE } from '@/lib/staffSessionCookie';
import { staffFormSchema } from '@/lib/staffManagementSchema';

export interface StaffActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * BSCH Clinics — Secure Staff Management Server Action (ADMIN only)
 *
 * Security chain on every call:
 * 1. Session token is read from the httpOnly STAFF_SESSION_COOKIE.
 * 2. AuthService.verifySession decodes/validates the token against Supabase
 *    Auth and re-reads the role from public.staff_profiles (never trusts the
 *    client) with an is_active check.
 * 3. Strict assertion: role === 'ADMIN', otherwise the call throws.
 * 4. Zod validation of every input field.
 */
export async function createOrUpdateStaff(
  input: unknown
): Promise<StaffActionResult> {
  // 1. Session from the server-issued httpOnly cookie
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  const staffUser = token ? await AuthService.verifySession(token) : null;
  if (!staffUser) {
    throw new Error('غير مصرح: انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى.');
  }

  // 2. Strict ADMIN-only assertion (role comes from staff_profiles in the DB)
  if (staffUser.role !== 'ADMIN') {
    throw new Error('غير مصرح: إدارة الموظفين متاحة لمدير النظام فقط.');
  }

  // 3. Zod validation
  const parsed = staffFormSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'بيانات النموذج غير صالحة.' };
  }
  const data = parsed.data;

  // 4. Database availability (fail closed)
  if (!isSupabaseConfigured()) {
    throw new Error('قاعدة البيانات غير مهيأة حالياً، يرجى المحاولة لاحقاً.');
  }

  // Clinic assignment must reference a real clinic for DOCTOR accounts
  if (data.role === 'DOCTOR' && data.clinicId) {
    const knownClinics = appointmentStore.getAllClinicsIncludingInactive();
    const clinicExists = knownClinics.some((c) => c.id === data.clinicId);
    if (!clinicExists) {
      return { success: false, error: 'العيادة المحددة غير موجودة في النظام.' };
    }
  }

  const adminClient = createAdminClient();
  const staffDomain = process.env.STAFF_AUTH_DOMAIN || 'hospital.internal';

  // ---------------------------------------------------------------
  // 5. CREATE — new account
  // ---------------------------------------------------------------
  if (!data.id) {
    const email = `${data.username.toLowerCase()}@${staffDomain}`;

    // Username uniqueness (staff_profiles has a unique username)
    const { data: existingProfile } = await (adminClient as any)
      .from('staff_profiles')
      .select('id')
      .eq('username', data.username)
      .maybeSingle();
    if (existingProfile) {
      return { success: false, error: 'اسم الدخول مستخدم بالفعل لحساب آخر.' };
    }

    // Create the real Supabase Auth user via the service-role client
    const { data: authData, error: createErr } =
      await adminClient.auth.admin.createUser({
        email,
        password: data.password!.trim(),
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
    if (createErr || !authData?.user) {
      return {
        success: false,
        error: createErr?.message || 'تعذر إنشاء حساب الدخول. تأكد من عدم استخدام البريد مسبقاً.',
      };
    }
    const userId = authData.user.id;

    // Link the auth user to staff_profiles via the hardened provisioning RPC
    const { error: rpcErr } = await (adminClient as any).rpc(
      'provision_staff_member',
      {
        p_user_id: userId,
        p_username: data.username,
        p_full_name: data.fullName,
        p_role: data.role,
        p_clinic_id: data.role === 'DOCTOR' ? data.clinicId : null,
      }
    );
    if (rpcErr) {
      // Rollback the auth user so no orphan login credential remains
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      return {
        success: false,
        error: `تعذر ربط الحساب بملف الموظف: ${rpcErr.message || 'خطأ غير معروف'}`,
      };
    }

    return {
      success: true,
      message: `تم إنشاء حساب الموظف "${data.fullName}" بنجاح.`,
    };
  }

  // ---------------------------------------------------------------
  // 6. UPDATE — existing account
  // ---------------------------------------------------------------

  // Prevent an admin from demoting their own account (lockout protection)
  if (data.id === staffUser.id && data.role !== 'ADMIN') {
    return {
      success: false,
      error: 'لا يمكن تخفيض صلاحيات حسابك الحالي (مدير النظام).',
    };
  }

  const { error: updateErr } = await (adminClient as any)
    .from('staff_profiles')
    .update({
      full_name: data.fullName,
      role: data.role,
      clinic_id: data.role === 'DOCTOR' ? data.clinicId : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.id);
  if (updateErr) {
    return {
      success: false,
      error: `تعذر تحديث بيانات الموظف: ${updateErr.message || 'خطأ غير معروف'}`,
    };
  }

  // Optional password reset (only when the admin provided a new one)
  const newPassword = data.password?.trim();
  if (newPassword && newPassword.length > 0) {
    const { error: pwdErr } = await adminClient.auth.admin.updateUserById(
      data.id,
      { password: newPassword }
    );
    if (pwdErr) {
      return {
        success: false,
        error: 'تم تحديث بيانات الموظف لكن تعذر تغيير كلمة المرور.',
      };
    }
  }

  return { success: true, message: 'تم تحديث بيانات الموظف بنجاح.' };
}
