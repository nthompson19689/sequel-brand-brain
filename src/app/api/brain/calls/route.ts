import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/brain/calls
 *
 * Returns all imported calls in call_insights, newest first.
 * Excludes the heavy fields (full_content, embedding) for list display.
 */
export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data, error } = await supabase
    .from("call_insights")
    .select(
      "id, fathom_call_id, call_type, company_name, contact_name, call_date, summary, sentiment, churn_risk, needs_review, created_at",
    )
    .order("call_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ calls: data || [] });
}
