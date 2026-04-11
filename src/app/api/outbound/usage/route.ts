import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/outbound/usage — API usage stats for the current month
 */
export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ usage: null });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data } = await supabase
    .from("api_usage_log")
    .select("service, cost_estimate, tokens_used")
    .gte("created_at", monthStart);

  if (!data || data.length === 0) {
    return NextResponse.json({
      usage: {
        total_calls: 0,
        total_cost: 0,
        by_service: {},
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      },
    });
  }

  const byService: Record<string, { calls: number; cost: number; tokens: number }> = {};
  let totalCost = 0;

  for (const row of data) {
    if (!byService[row.service]) byService[row.service] = { calls: 0, cost: 0, tokens: 0 };
    byService[row.service].calls++;
    byService[row.service].cost += Number(row.cost_estimate) || 0;
    byService[row.service].tokens += row.tokens_used || 0;
    totalCost += Number(row.cost_estimate) || 0;
  }

  return NextResponse.json({
    usage: {
      total_calls: data.length,
      total_cost: Math.round(totalCost * 1000) / 1000,
      by_service: byService,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    },
  });
}
