import { z } from 'zod';

export const STAFF_ROLES = ['ADMIN', 'RECEPTIONIST', 'DOCTOR'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: 'مدير النظام',
  RECEPTIONIST: 'الاستقبال',
  DOCTOR: 'طبيب',
};

/**
 * Shared staff management form schema (Zod v4).
 * Enforced server-side inside app/staff/actions/staffManagement.ts and reused
 * client-side by the React Hook Form modal for instant field-level errors.
 */
export const staffFormSchema = z
  .object({
    id: z.string().optional(),
    fullName: z
      .string()
      .trim()
      .min(3, 'الاسم الكامل مطلوب (3 أحرف على الأقل).')
      .max(150, 'الاسم طويل جداً.'),
    username: z
      .string()
      .trim()
      .min(3, 'اسم الدخول مطلوب (3 أحرف على الأقل).')
      .max(40, 'اسم الدخول طويل جداً.')
      .regex(/^[a-zA-Z0-9._-]+$/, 'اسم الدخول: أحرف إنجليزية وأرقام ونقاط فقط.'),
    role: z.enum(STAFF_ROLES, { message: 'الدور المحدد غير صالح.' }),
    clinicId: z.string().trim().optional(),
    password: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const pwd = values.password?.trim() ?? '';
    if (!values.id && pwd.length < 8) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'كلمة المرور مطلوبة للحساب الجديد (8 أحرف على الأقل).',
      });
    } else if (values.id && pwd.length > 0 && pwd.length < 8) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.',
      });
    }
    if (values.role === 'DOCTOR' && !values.clinicId) {
      ctx.addIssue({
        code: 'custom',
        path: ['clinicId'],
        message: 'يجب اختيار العيادة المخصصة لحساب الطبيب.',
      });
    }
  });

export type StaffFormValues = z.infer<typeof staffFormSchema>;

export interface StaffMemberRecord {
  id: string;
  username: string;
  full_name: string;
  role: StaffRole;
  clinic_id: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}
