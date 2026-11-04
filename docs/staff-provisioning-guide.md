# BSCH Clinics — Staff Account Provisioning Guide

This guide details the procedure for creating and provisioning internal hospital staff accounts (`ADMIN`, `RECEPTIONIST`, `DOCTOR`) in the BSCH Clinics platform.

---

## 1. Supabase Auth Configuration Requirements

Before creating any staff accounts, verify the following settings in the **Supabase Dashboard**:

1. **Disable Public Sign-Ups:**
   - Go to **Authentication** -> **Providers** -> **Email**.
   - Ensure **"Allow new users to sign up"** (or "Enable Email Signup") is toggled **OFF**.
   - Public self-registration for staff is strictly forbidden.

2. **Disable Email Confirmation Requirement:**
   - In **Authentication** -> **Providers** -> **Email**, toggle **"Confirm email"** to **OFF** (or auto-confirm created accounts).
   - Staff accounts use internal usernames mapped to email aliases, not public mailboxes.

3. **Domain Mapping Environment Variable:**
   - The application uses `process.env.STAFF_AUTH_DOMAIN` (defaulting to `hospital.internal`).
   - Every staff user in Supabase Auth **must** be created with:
     ```
     email = <username>@STAFF_AUTH_DOMAIN
     ```
     *(Example: if `STAFF_AUTH_DOMAIN=hospital.internal`, the username `reception` becomes `reception@hospital.internal`)*.

---

## 2. Step-by-Step Account Creation Procedure

### Step 1: Create User in Supabase Auth
1. Open **Supabase Dashboard** -> **Authentication** -> **Users**.
2. Click **"Add user"** -> **"Create user"**.
3. Fill in:
   - **Email:** `<username>@<STAFF_AUTH_DOMAIN>` (e.g., `doctor.echo@hospital.internal`)
   - **Password:** A strong, temporary password meeting institutional complexity requirements.
   - **Auto-Confirm User:** Checked (Yes).
4. Copy the generated **User UID** (UUID).

### Step 2: Link Staff Profile via SQL Editor
Run the security-hardened `provision_staff_member` function in **Supabase SQL Editor** (executes as `postgres`):

```sql
SELECT public.provision_staff_member(
  p_user_id := 'PASTE-USER-UUID-HERE'::uuid,
  p_username := 'doctor.echo',
  p_full_name := 'د/ شريف عبد الغني',
  p_role := 'DOCTOR'::public.staff_role,
  p_clinic_id := 'echo' -- NULL for Receptionist or Admin
);
```

### Supported Roles:
- `'ADMIN'`: Full system control (CMS management, system audits, all clinics).
- `'RECEPTIONIST'`: Front-desk check-in, walk-in ticketing, queue management across all clinics. Cannot complete medical consultations.
- `'DOCTOR'`: Outpatient physician. Strictly isolated to their assigned `clinic_id`.

---

## 3. One-Shot Handover Script (Recommended)

Instead of creating accounts manually, run the ready-to-use idempotent script:

- **File:** `supabase/scripts/20261104_provision_initial_staff_accounts.sql`

It creates the real `admin`, `reception`, and `doctor.echo` Supabase Auth users
with random temporary passwords, links them to `staff_profiles` via
`provision_staff_member`, and is safe to re-run (existing users only get their
temporary password reset).

After first login, each staff member must change their temporary password
immediately from the dashboard via **"تغيير كلمة المرور"** (Change Password).


