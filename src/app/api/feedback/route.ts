import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TABLE = "agent_feedback";

/**
 * GET /api/feedback?agent_id=xxx — List feedback for an agent
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ feedback: [] });

  const agentId = request.nextUrl.searchParams.get("agent_id");
  const pending = request.nextUrl.searchParams.get("pending"); // "true" = only unapplied

  let query = supabase.from(TABLE).select("*").order("created_at", { ascending: false });

  if (agentId) query = query.eq("agent_id", agentId);
  if (pending === "true") query = query.eq("applied_to_prompt", false);

  const { data, error } = await query.limit(100);
  if (error) {
    console.error("[Feedback] Fetch error:", error);
    return NextResponse.json({ feedback: [], error: error.message });
  }

  return NextResponse.json({ feedback: data || [] });
}

/**
 * POST /api/feedback — Save feedback (edit_diff, explicit, thumbs_up, thumbs_down)
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json();

  const row: Record<string, unknown> = {
    agent_id: body.agent_id,
    user_id: body.user_id || null,
    feedback_type: body.feedback_type,
    original_output: body.original_output || null,
    edited_output: body.edited_output || null,
    explicit_feedback: body.explicit_feedback || null,
    patterns_detected: body.patterns_detected || null,
    applied_to_prompt: false,
  };

  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) {
    console.error("[Feedback] Insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ feedback: data });
}

/**
 * DELETE /api/feedback?id=xxx
 */
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await supabase.from(TABLE).delete().eq("id", id);
  return NextResponse.json({ success: true });
}
