import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/competitors/results — fetch scan results history
 *
 * Query params:
 *   ?competitor_id=X   — filter by competitor
 *   ?significance=high — filter by significance level
 *   ?scan_type=hiring  — filter by scan type
 *   ?limit=50          — limit results (default 50)
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { searchParams } = request.nextUrl;
  const competitorId = searchParams.get("competitor_id");
  const significance = searchParams.get("significance");
  const scanType = searchParams.get("scan_type");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  let query = supabase
    .from("competitor_scan_results")
    .select("*, competitor_watch(name, domain)")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200));

  if (competitorId) {
    query = query.eq("competitor_id", competitorId);
  }

  if (significance) {
    query = query.eq("significance", significance);
  }

  if (scanType) {
    query = query.eq("scan_type", scanType);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ results: data, count: data?.length || 0 });
}
