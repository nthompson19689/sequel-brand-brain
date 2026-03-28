import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/health — Test Supabase connection and report status.
 */
export async function GET() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    console.log("[Health] ❌ Supabase not configured — missing env vars");
    return Response.json({
      supabase: false,
      error: "Missing SUPABASE env vars",
    });
  }

  try {
    // Test connection by querying a table
    const { error } = await supabase.from("agents").select("id").limit(1);

    if (error) {
      console.log(`[Health] ❌ Supabase connection failed: ${error.message}`);
      return Response.json({
        supabase: false,
        error: error.message,
      });
    }

    console.log("[Health] ✅ Supabase connected successfully");
    return Response.json({
      supabase: true,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.log(`[Health] ❌ Supabase connection error: ${msg}`);
    return Response.json({ supabase: false, error: msg });
  }
}
