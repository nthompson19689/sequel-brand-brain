import { createBrowserClient } from "@supabase/ssr";

/**
 * Cookie-based Supabase client for client components.
 */
export function createSupabaseBrowserAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
