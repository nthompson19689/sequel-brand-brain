import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/chat/messages?session_id=xxx — Get messages for a session.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ messages: [] });
  }

  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return Response.json({ error: "Missing session_id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ messages: data || [] });
}

/**
 * POST /api/chat/messages — Save a message to a session.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = await request.json();

  if (!body.session_id || !body.role || !body.content) {
    return Response.json(
      { error: "session_id, role, and content are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      session_id: body.session_id,
      role: body.role,
      content: body.content,
      sources: body.sources || null,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Update session's updated_at and title (use first user message)
  if (body.role === "user") {
    const title = body.content.slice(0, 100);
    await supabase
      .from("chat_sessions")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", body.session_id);
  }

  return Response.json({ message: data });
}
