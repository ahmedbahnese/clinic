import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const secureBrowserOrigin =
    typeof window !== "undefined" && window.location.protocol === "https:";

  return createBrowserClient(url, anonKey, {
    cookieOptions: {
      path: "/",
      sameSite: secureBrowserOrigin ? "none" : "lax",
      secure: secureBrowserOrigin,
    },
  });
}
