import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/chat/sessions — List recent chat sessions.
 */
export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ sessions: [], source: "local" });
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, agent_id, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ sessions: data || [] });
}

/**
 * POST /api/chat/sessions — Create a new session.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = await request.json();

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      title: body.title || "New Chat",
      agent_id: body.agent_id || null,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ session: data });
}
