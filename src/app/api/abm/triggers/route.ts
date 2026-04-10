import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ triggers: [] });

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");
  const minRelevance = parseInt(searchParams.get("min_relevance") || "1", 10);

  let query = supabase
    .from("account_triggers")
    .select("*, target_accounts(company_name, domain)")
    .gte("relevance_score", minRelevance)
    .order("detected_at", { ascending: false })
    .limit(100);

  if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ triggers: data || [] });
}
