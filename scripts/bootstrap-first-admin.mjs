import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const staffId = process.env.STAFF_AUTH_USER_ID;
const displayName = process.env.STAFF_DISPLAY_NAME?.trim();

if (!url || !serviceRoleKey || !staffId || !displayName) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STAFF_AUTH_USER_ID, and STAFF_DISPLAY_NAME in a private environment file.",
  );
  process.exit(1);
}

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(staffId)) {
  console.error("STAFF_AUTH_USER_ID must be a valid UUID from the Supabase Auth dashboard.");
  process.exit(1);
}

const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const { error } = await client.rpc("bootstrap_first_admin", {
  p_staff_id: staffId,
  p_display_name: displayName,
});

if (error) {
  console.error(`Admin bootstrap failed: ${error.message}`);
  process.exit(1);
}

console.log("The first administrator profile was activated successfully.");
