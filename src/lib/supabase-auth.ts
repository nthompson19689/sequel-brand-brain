import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Cookie-based Supabase client for client components.
 */
export function createSupabaseBrowserAuthClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
