import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/outbound/today — Daily action center
 * Returns 4 lists: send, research, follow_up, review
 */
export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ send: [], research: [], follow_up: [], review: [] });

  const today = new Date().toISOString().split("T")[0];

  const [sendRes, researchRes, followUpRes, reviewRes] = await Promise.all([
    // Messages due today or overdue (approved + next_touch_due <= today)
    supabase
      .from("prospect_messages")
      .select("*, prospects(id, first_name, last_name, company_name, next_touch_due)")
      .eq("status", "approved")
      .order("step_number")
      .limit(50),

    // Prospects needing research (status=researching, no research record)
    supabase
      .from("prospects")
      .select("id, first_name, last_name, company_name, company_domain, title, linkedin_url")
      .eq("prospect_status", "researching")
      .order("lead_score", { ascending: false })
      .limit(20),

    // Prospects who replied (need human follow-up)
    supabase
      .from("prospects")
      .select("id, first_name, last_name, company_name, title, prospect_status")
      .in("prospect_status", ["replied", "interested"])
      .order("updated_at", { ascending: false })
      .limit(20),

    // Messages in draft awaiting review/approval
    supabase
      .from("prospect_messages")
      .select("*, prospects(id, first_name, last_name, company_name)")
      .in("status", ["draft", "edited"])
      .order("generated_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    send: sendRes.data || [],
    research: researchRes.data || [],
    follow_up: followUpRes.data || [],
    review: reviewRes.data || [],
    date: today,
  });
}
