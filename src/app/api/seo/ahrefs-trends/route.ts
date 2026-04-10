import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/seo/ahrefs-trends
 * Returns latest + previous Ahrefs domain metrics for trend arrows.
 */
export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ current: null, previous: null });
  }

  try {
    const { data } = await supabase
      .from("ahrefs_domain_metrics")
      .select("domain_rating, total_backlinks, referring_domains, ahrefs_rank, synced_at")
      .order("synced_at", { ascending: false })
      .limit(2);

    const rows = data || [];
    return Response.json({
      current: rows[0] || null,
      previous: rows[1] || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[ahrefs-trends] error:", msg);
    return Response.json({ current: null, previous: null });
  }
}
